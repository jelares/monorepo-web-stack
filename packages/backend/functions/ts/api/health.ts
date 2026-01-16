import type { APIGatewayProxyHandler } from "aws-lambda";
import { success } from "../../../lib/response.js";

export const handler: APIGatewayProxyHandler = async () => {
  return success({ status: "healthy", timestamp: new Date().toISOString() });
};
