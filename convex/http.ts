import { httpRouter } from "convex/server";
import { mcp } from "./model/mcp";

// Sign-in and OAuth are mounted by the auth components in convex.config.ts
// (their httpPrefix). The MCP server adds /mcp, /mcp/oauth/* and the two
// /.well-known/oauth-* documents at the root.
const http = httpRouter();
mcp.registerRoutes(http);

export default http;
