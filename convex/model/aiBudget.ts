import { internalMutation, internalQuery } from "../_generated/server";
import { aiBudget } from "../lib/ai/budget";

// Run once per deployment (pnpm exec convex run model/aiBudget:configure).
// Our calls already pass no prompt and no response text; this makes the
// component keep none either way, and sanitize provider errors, which can
// echo a request's photos and places.
export const configure = internalMutation({
  args: {},
  handler: async (ctx) => {
    await aiBudget.global.setPolicy(ctx, { storeContent: false, storeRawErrors: false });
    return null;
  },
});

// What AI has cost, overall and by feature: for the CLI
// (pnpm exec convex run model/aiBudget:spend), when the dashboard isn't open.
export const spend = internalQuery({
  args: {},
  handler: async (ctx) => {
    return {
      global: await aiBudget.global.status(ctx),
      features: await aiBudget.tag("feature").list(ctx),
    };
  },
});
