import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from repo root
dotenv.config({ path: path.join(__dirname, "../.env") });

if (!process.env.AWS_PROFILE) {
  console.error("Error: AWS_PROFILE is required in .env file.");
  console.error("Copy .env.example to .env and configure your AWS profile.");
  process.exit(1);
}

const profile = process.env.AWS_PROFILE;
const region = process.env.AWS_REGION || "us-east-1";

console.log(`Bootstrapping CDK with profile: ${profile}, region: ${region}`);

try {
  execSync(`cdk bootstrap --profile ${profile}`, {
    stdio: "inherit",
    cwd: path.join(__dirname, "../packages/infra"),
    env: {
      ...process.env,
      AWS_PROFILE: profile,
      AWS_REGION: region,
    },
  });
} catch {
  // Error already printed by execSync
  process.exit(1);
}
