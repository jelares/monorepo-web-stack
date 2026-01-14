#!/usr/bin/env tsx
import {
  S3Client,
  PutObjectCommand,
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
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import mime from 'mime-types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const stage = process.env.STAGE || 'dev';
const appName = process.env.APP_NAME;
const versionsToKeep = parseInt(process.env.VERSIONS_TO_KEEP || '5');

if (!appName) {
  console.error('Error: APP_NAME is required in .env');
  process.exit(1);
}

const s3 = new S3Client({});
const cloudfront = new CloudFrontClient({});
const ssm = new SSMClient({});
const cfn = new CloudFormationClient({});

const frontendDistPath = path.join(__dirname, '../packages/frontend/dist');

async function getStackOutputs(): Promise<Record<string, string>> {
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

async function getCurrentVersion(paramName: string): Promise<number> {
  try {
    const response = await ssm.send(new GetParameterCommand({ Name: paramName }));
    return parseInt(response.Parameter?.Value || '0');
  } catch {
    return 0;
  }
}

async function setCurrentVersion(paramName: string, version: number): Promise<void> {
  await ssm.send(new PutParameterCommand({
    Name: paramName,
    Value: version.toString(),
    Overwrite: true,
  }));
}

async function uploadDirectory(bucketName: string, localDir: string, s3Prefix: string): Promise<void> {
  const files = getAllFiles(localDir);

  console.log(`Uploading ${files.length} files to s3://${bucketName}/${s3Prefix}/`);

  for (const filePath of files) {
    const relativePath = path.relative(localDir, filePath);
    const s3Key = `${s3Prefix}/${relativePath}`.replace(/\\/g, '/');
    const contentType = mime.lookup(filePath) || 'application/octet-stream';

    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: fs.readFileSync(filePath),
      ContentType: contentType,
    }));
  }
}

function getAllFiles(dir: string): string[] {
  const files: string[] = [];

  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function updateCloudFrontOrigin(distributionId: string, newOriginPath: string): Promise<void> {
  // Get current config
  const getResponse = await cloudfront.send(new GetDistributionConfigCommand({
    Id: distributionId,
  }));

  const config = getResponse.DistributionConfig!;
  const etag = getResponse.ETag!;

  // Update origin path
  if (config.Origins?.Items?.[0]) {
    config.Origins.Items[0].OriginPath = newOriginPath;
  }

  // Update distribution
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

async function listDeployVersions(bucketName: string): Promise<number[]> {
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

  return versions.sort((a, b) => b - a); // Sort descending
}

async function deleteVersion(bucketName: string, version: number): Promise<void> {
  const prefix = `deploys/v${version}/`;

  // List all objects with this prefix
  let continuationToken: string | undefined;
  const objectsToDelete: { Key: string }[] = [];

  do {
    const response = await s3.send(new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));

    for (const obj of response.Contents || []) {
      if (obj.Key) {
        objectsToDelete.push({ Key: obj.Key });
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  // Delete in batches of 1000 (S3 limit)
  while (objectsToDelete.length > 0) {
    const batch = objectsToDelete.splice(0, 1000);
    await s3.send(new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: { Objects: batch },
    }));
  }
}

async function cleanupOldVersions(bucketName: string, currentVersion: number): Promise<void> {
  const versions = await listDeployVersions(bucketName);

  // Keep the last N versions
  const versionsToDelete = versions.slice(versionsToKeep);

  if (versionsToDelete.length === 0) {
    console.log(`Keeping ${versions.length} versions (limit: ${versionsToKeep})`);
    return;
  }

  console.log(`Cleaning up ${versionsToDelete.length} old versions...`);

  for (const version of versionsToDelete) {
    console.log(`  Deleting v${version}`);
    await deleteVersion(bucketName, version);
  }
}

async function main() {
  console.log(`\n🚀 Deploying frontend to ${stage}\n`);

  // Check if dist folder exists
  if (!fs.existsSync(frontendDistPath)) {
    console.error(`Error: Build folder not found at ${frontendDistPath}`);
    console.error('Run "pnpm build" first.');
    process.exit(1);
  }

  // Get stack outputs
  console.log('Getting stack info...');
  const outputs = await getStackOutputs();
  const bucketName = outputs['BucketName'];
  const distributionId = outputs['DistributionId'];
  const versionParamName = outputs['VersionParameterName'];

  if (!bucketName || !distributionId || !versionParamName) {
    console.error('Error: Could not get stack outputs. Make sure infrastructure is deployed.');
    process.exit(1);
  }

  // Get current version and increment
  const currentVersion = await getCurrentVersion(versionParamName);
  const newVersion = currentVersion + 1;
  const newOriginPath = `/deploys/v${newVersion}`;

  console.log(`Current version: v${currentVersion}`);
  console.log(`New version: v${newVersion}`);

  // Upload files
  await uploadDirectory(bucketName, frontendDistPath, `deploys/v${newVersion}`);
  console.log('✅ Files uploaded');

  // Update CloudFront origin path
  console.log('Updating CloudFront origin...');
  await updateCloudFrontOrigin(distributionId, newOriginPath);
  console.log('✅ CloudFront origin updated');

  // Invalidate cache
  console.log('Invalidating cache...');
  await invalidateCache(distributionId);
  console.log('✅ Cache invalidated');

  // Update version parameter
  await setCurrentVersion(versionParamName, newVersion);
  console.log('✅ Version updated');

  // Cleanup old versions
  await cleanupOldVersions(bucketName, newVersion);

  console.log(`\n✅ Deployed frontend v${newVersion} to ${stage}`);
  console.log(`   URL: ${outputs['DistributionUrl']}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
