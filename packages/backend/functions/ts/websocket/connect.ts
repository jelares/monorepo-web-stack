import type { APIGatewayProxyHandler } from "aws-lambda";
import { success } from "../../../lib/response.js";

export const handler: APIGatewayProxyHandler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  console.log(`Client connected: ${connectionId}`);

  // Store connectionId in DynamoDB or your preferred storage

  return success({ message: "Connected" });
};
