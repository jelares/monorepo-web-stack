#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { getConfig, stackName } from "../lib/config.js";
import { SharedStack } from "../lib/stacks/shared-stack.js";
import { ApiStack } from "../lib/stacks/api-stack.js";
import { WebSocketStack } from "../lib/stacks/websocket-stack.js";
import { FrontendStack } from "../lib/stacks/frontend-stack.js";

const app = new cdk.App();
const config = getConfig();

const env = {
  account: config.account,
  region: config.region,
};

// Shared resources (Lambda layers)
const sharedStack = new SharedStack(app, stackName(config, "SharedStack"), {
  env,
  config,
});

// REST API
const apiStack = new ApiStack(app, stackName(config, "ApiStack"), {
  env,
  config,
  layers: sharedStack.layers,
});
apiStack.addDependency(sharedStack);

// WebSocket API
const wsStack = new WebSocketStack(app, stackName(config, "WebSocketStack"), {
  env,
  config,
  layers: sharedStack.layers,
});
wsStack.addDependency(sharedStack);

// Frontend (S3 + CloudFront)
const frontendStack = new FrontendStack(
  app,
  stackName(config, "FrontendStack"),
  {
    env,
    config,
    apiUrl: apiStack.apiUrl,
    wsUrl: wsStack.wsUrl,
  },
);
frontendStack.addDependency(apiStack);
frontendStack.addDependency(wsStack);

app.synth();
