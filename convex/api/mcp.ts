import { mcpApi } from "../model/mcp";

export const { getAuthRequest, authorize, listConnections, revokeConnection, createApiKey } =
  mcpApi;
