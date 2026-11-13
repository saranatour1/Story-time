import { httpRouter } from "convex/server";

// No routes of our own. Sign-in and OAuth are mounted by the auth components
// in convex.config.ts (their httpPrefix).
const http = httpRouter();

export default http;
