import { internalMutation, internalQuery } from "../_generated/server";
import { aiBudget } from "../lib/ai/budget";

export const configure = internalMutation({
  args: {},
  handler: async (ctx) => {
    await aiBudget.global.setPolicy(ctx, { storeContent: false, storeRawErrors: false });
    return null;
  },
});

export const spend = internalQuery({
  args: {},
  handler: async (ctx) => {
    return {
      global: await aiBudget.global.status(ctx),
      features: await aiBudget.tag("feature").list(ctx),
    };
  },
});
