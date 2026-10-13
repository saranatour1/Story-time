import { httpRouter } from "convex/server";
import { aiBudget } from "./lib/ai/budget";

// Sign-in and OAuth are mounted by the auth components in convex.config.ts
// (their httpPrefix).
const http = httpRouter();

// AI Budget's dashboard, at <deployment>.convex.site/aibudget: cost and usage
// by person, feature and day. Every route answers 401 until the deployment has
// AI_BUDGET_DASHBOARD_TOKEN; open it once with ?token=<that value>.
aiBudget.registerRoutes(http);

export default http;
