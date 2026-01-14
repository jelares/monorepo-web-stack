#!/usr/bin/env tsx
import {
  LambdaClient,
  ListFunctionsCommand,
  ListVersionsByFunctionCommand,
  UpdateAliasCommand,
  GetAliasCommand,
  DeleteFunctionCommand,
} from '@aws-sdk/client-lambda';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import {
  CloudFrontClient,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';
import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from '@aws-sdk/client-ssm';
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import * as readline from 'readline';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const stage = process.env.STAGE || 'dev';
const appName = process.env.APP_NAME;
const versionsToKeep = parseInt(process.env.VERSIONS_TO_KEEP || '5');

if (!appName) {
  console.error('Error: APP_NAME is required in .env');
  process.exit(1);
}

if (stage === 'dev') {
  console.error('Error: Rollback is only available for staging and prod (dev has no versioning)');
  process.exit(1);
}

const lambda = new LambdaClient({});
const s3 = new S3Client({});
const cloudfront = new CloudFrontClient({});
const ssm = new SSMClient({});
const cfn = new CloudFormationClient({});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (q: string): Promise<string> =>
  new Promise((resolve) => rl.question(q, resolve));

// ============= FRONTEND ROLLBACK =============

async function getFrontendStackOutputs(): Promise<Record<string, string>> {
  const stackName = `FrontendStack-${stage}`;
  const response = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
  const outputs: Record<string, string> = {};

  for (const output of response.Stacks?.[0]?.Outputs || []) {
    if (output.OutputKey && output.OutputValue) {
      outputs[output.OutputKey] = output.OutputValue;
    }
  }

  return outputs;
}

async function listFrontendVersions(bucketName: string): Promise<number[]> {
  const response = await s3.send(new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: 'deploys/',
    Delimiter: '/',
  }));

  const versions: number[] = [];

  for (const prefix of response.CommonPrefixes || []) {
    const match = prefix.Prefix?.match(/deploys\/v(\d+)\//);
    if (match) {
      versions.push(parseInt(match[1]));
    }
  }

  return versions.sort((a, b) => b - a);
}

async function getCurrentFrontendVersion(paramName: string): Promise<number> {
  try {
    const response = await ssm.send(new GetParameterCommand({ Name: paramName }));
    return parseInt(response.Parameter?.Value || '0');
  } catch {
    return 0;
  }
}

async function updateCloudFrontOrigin(distributionId: string, newOriginPath: string): Promise<void> {
  const getResponse = await cloudfront.send(new GetDistributionConfigCommand({
    Id: distributionId,
  }));

  const config = getResponse.DistributionConfig!;
  const etag = getResponse.ETag!;

  if (config.Origins?.Items?.[0]) {
    config.Origins.Items[0].OriginPath = newOriginPath;
  }

  await cloudfront.send(new UpdateDistributionCommand({
    Id: distributionId,
    DistributionConfig: config,
    IfMatch: etag,
  }));
}

async function invalidateCache(distributionId: string): Promise<void> {
  await cloudfront.send(new CreateInvalidationCommand({
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: Date.now().toString(),
      Paths: {
        Quantity: 1,
        Items: ['/*'],
      },
    },
  }));
}

async function rollbackFrontend(): Promise<void> {
  console.log('\nFetching frontend info...');

  const outputs = await getFrontendStackOutputs();
  const bucketName = outputs['BucketName'];
  const distributionId = outputs['DistributionId'];
  const versionParamName = outputs['VersionParameterName'];

  if (!bucketName || !distributionId || !versionParamName) {
    console.log('Error: Could not get frontend stack outputs.');
    return;
  }

  const currentVersion = await getCurrentFrontendVersion(versionParamName);
  const versions = await listFrontendVersions(bucketName);

  if (versions.length === 0) {
    console.log('No frontend versions found.');
    return;
  }

  console.log('\nAvailable frontend versions:');
  versions.forEach((v, i) => {
    const current = v === currentVersion ? ' (current)' : '';
    console.log(`  ${i + 1}. v${v}${current}`);
  });

  const answer = await question(`\nSelect version to rollback to (1-${versions.length}): `);
  const index = parseInt(answer) - 1;

  if (index < 0 || index >= versions.length) {
    console.log('Invalid selection');
    return;
  }

  const selectedVersion = versions[index];

  if (selectedVersion === currentVersion) {
    console.log('\nThis version is already current. No changes made.');
    return;
  }

  const confirm = await question(`\nRollback frontend to v${selectedVersion}? (y/n): `);
  if (confirm.toLowerCase() !== 'y') {
    console.log('Cancelled.');
    return;
  }

  console.log('\nUpdating CloudFront origin...');
  await updateCloudFrontOrigin(distributionId, `/deploys/v${selectedVersion}`);

  console.log('Invalidating cache...');
  await invalidateCache(distributionId);

  console.log('Updating version parameter...');
  await ssm.send(new PutParameterCommand({
    Name: versionParamName,
    Value: selectedVersion.toString(),
    Overwrite: true,
  }));

  console.log(`\n✅ Rolled back frontend to v${selectedVersion}`);
}

// ============= LAMBDA ROLLBACK =============

async function listAppFunctions(): Promise<string[]> {
  const prefix = `${appName}-`;
  const functions: string[] = [];
  let marker: string | undefined;

  do {
    const response = await lambda.send(new ListFunctionsCommand({ Marker: marker }));
    const filtered = (response.Functions || [])
      .filter(f => f.FunctionName?.startsWith(prefix) && f.FunctionName?.includes(`-${stage}`))
      .map(f => f.FunctionName!);
    functions.push(...filtered);
    marker = response.NextMarker;
  } while (marker);

  return functions;
}

interface LambdaVersion {
  version: string;
  description: string;
  lastModified: string;
  isCurrent: boolean;
}

async function listLambdaVersions(functionName: string): Promise<LambdaVersion[]> {
  const versions: LambdaVersion[] = [];
  let marker: string | undefined;

  let currentVersion = '$LATEST';
  try {
    const alias = await lambda.send(new GetAliasCommand({
      FunctionName: functionName,
      Name: stage,
    }));
    currentVersion = alias.FunctionVersion || '$LATEST';
  } catch {
    // Alias might not exist
  }

  do {
    const response = await lambda.send(new ListVersionsByFunctionCommand({
      FunctionName: functionName,
      Marker: marker,
    }));

    for (const v of response.Versions || []) {
      if (v.Version !== '$LATEST') {
        versions.push({
          version: v.Version!,
          description: v.Description || '',
          lastModified: v.LastModified || '',
          isCurrent: v.Version === currentVersion,
        });
      }
    }
    marker = response.NextMarker;
  } while (marker);

  return versions.sort((a, b) => parseInt(b.version) - parseInt(a.version));
}

async function rollbackLambda(): Promise<void> {
  console.log('\nFetching Lambda functions...');
  const functions = await listAppFunctions();

  if (functions.length === 0) {
    console.log(`No Lambda functions found for ${appName} in ${stage}`);
    return;
  }

  console.log('\nAvailable functions:');
  functions.forEach((fn, i) => console.log(`  ${i + 1}. ${fn}`));

  const fnAnswer = await question(`\nSelect function (1-${functions.length}): `);
  const fnIndex = parseInt(fnAnswer) - 1;

  if (fnIndex < 0 || fnIndex >= functions.length) {
    console.log('Invalid selection');
    return;
  }

  const selectedFunction = functions[fnIndex];

  console.log(`\nFetching versions for ${selectedFunction}...`);
  const versions = await listLambdaVersions(selectedFunction);

  if (versions.length === 0) {
    console.log('No versions found (only $LATEST exists)');
    return;
  }

  console.log('\nAvailable versions:');
  versions.forEach((v, i) => {
    const current = v.isCurrent ? ' (current)' : '';
    const date = new Date(v.lastModified).toLocaleString();
    console.log(`  ${i + 1}. v${v.version}${current} - ${date}`);
    if (v.description) {
      console.log(`      ${v.description}`);
    }
  });

  const vAnswer = await question(`\nSelect version to rollback to (1-${versions.length}): `);
  const vIndex = parseInt(vAnswer) - 1;

  if (vIndex < 0 || vIndex >= versions.length) {
    console.log('Invalid selection');
    return;
  }

  const selectedVersion = versions[vIndex];

  if (selectedVersion.isCurrent) {
    console.log('\nThis version is already current. No changes made.');
    return;
  }

  const confirm = await question(`\nRollback ${selectedFunction} to v${selectedVersion.version}? (y/n): `);
  if (confirm.toLowerCase() !== 'y') {
    console.log('Cancelled.');
    return;
  }

  console.log('\nUpdating alias...');
  await lambda.send(new UpdateAliasCommand({
    FunctionName: selectedFunction,
    Name: stage,
    FunctionVersion: selectedVersion.version,
  }));

  console.log(`\n✅ Rolled back ${selectedFunction} to v${selectedVersion.version}`);
}

// ============= MAIN =============

async function main() {
  console.log(`\n🔄 Rollback (${stage})\n`);
  console.log('What do you want to rollback?');
  console.log('  1. Frontend (CloudFront/S3)');
  console.log('  2. Lambda function');

  const choice = await question('\nSelect (1-2): ');

  if (choice === '1') {
    await rollbackFrontend();
  } else if (choice === '2') {
    await rollbackLambda();
  } else {
    console.log('Invalid selection');
  }

  rl.close();
}

main().catch((err) => {
  console.error('Error:', err.message);
  rl.close();
  process.exit(1);
});
