#!/usr/bin/env tsx
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendPath = path.join(__dirname, "../packages/backend/functions");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (q: string): Promise<string> =>
  new Promise((resolve) => rl.question(q, resolve));

const select = async (prompt: string, options: string[]): Promise<string> => {
  console.log(`\n${prompt}`);
  options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));

  while (true) {
    const answer = await question(`Select (1-${options.length}): `);
    const index = parseInt(answer) - 1;
    if (index >= 0 && index < options.length) {
      return options[index];
    }
    console.log("Invalid selection, try again.");
  }
};

// Templates
const templates = {
  ts: {
    api: `import type { APIGatewayProxyHandler } from 'aws-lambda';
import { success, error } from '../../lib/response.js';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    // TODO: Implement your logic here
    return success({ message: 'Hello from {{name}}' });
  } catch (err) {
    return error((err as Error).message);
  }
};
`,
    websocket: `import type { APIGatewayProxyHandler } from 'aws-lambda';
import { success, error } from '../../lib/response.js';

export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  try {
    // TODO: Implement your logic here
    console.log('Connection:', connectionId);
    return success({ message: 'OK' });
  } catch (err) {
    return error((err as Error).message);
  }
};
`,
  },
  python: {
    api: `import json
from shared import success, error, get_logger

logger = get_logger(__name__)


def handler(event, context):
    try:
        # TODO: Implement your logic here
        logger.info("Processing request")
        return success({"message": "Hello from {{name}}"})
    except Exception as e:
        logger.error(f"Error: {e}")
        return error(str(e))
`,
    websocket: `import json
from shared import success, error, get_logger

logger = get_logger(__name__)


def handler(event, context):
    connection_id = event["requestContext"]["connectionId"]

    try:
        # TODO: Implement your logic here
        logger.info(f"Connection: {connection_id}")
        return success({"message": "OK"})
    except Exception as e:
        logger.error(f"Error: {e}")
        return error(str(e))
`,
  },
};

async function main() {
  console.log("\n🚀 Create Lambda Function\n");

  const language = await select("Select language:", ["TypeScript", "Python"]);
  const type = await select("Select type:", ["REST API", "WebSocket"]);
  const name = await question("\nFunction name (e.g., users, orders, chat): ");

  if (!name.trim()) {
    console.log("Error: Function name is required");
    rl.close();
    process.exit(1);
  }

  const lang = language === "TypeScript" ? "ts" : "python";
  const funcType = type === "REST API" ? "api" : "websocket";
  const ext = lang === "ts" ? "ts" : "py";

  const dir = path.join(backendPath, lang, funcType);
  const filePath = path.join(dir, `${name}.${ext}`);

  // Check if file already exists
  if (fs.existsSync(filePath)) {
    console.log(`\nError: ${filePath} already exists`);
    rl.close();
    process.exit(1);
  }

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Get template and replace placeholders
  const template = templates[lang][funcType].replace(/\{\{name\}\}/g, name);

  // Write file
  fs.writeFileSync(filePath, template);

  console.log(`\n✅ Created: ${filePath}`);
  console.log("\nNext steps:");
  console.log(`  1. Implement your logic in ${name}.${ext}`);
  console.log(
    `  2. Deploy with: pnpm deploy:backend:${funcType === "api" ? "api" : "ws"}:dev`,
  );

  rl.close();
}

main().catch((err) => {
  console.error("Error:", err);
  rl.close();
  process.exit(1);
});
