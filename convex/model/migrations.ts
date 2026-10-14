import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { encryptText } from "../lib/crypto";

const BATCH = 100;

// One-off: encrypts descriptions saved as plain text before they were
// encrypted. It walks the table in batches, scheduling itself until done, and
// is safe to run again: `pnpm exec convex run model/migrations:encryptPlainText '{}'`
export const encryptPlainText = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    let encrypted = 0;
    const page = await ctx.db
      .query("events")
      .paginate({ numItems: BATCH, cursor: args.cursor ?? null });
    for (const event of page.page) {
      if (typeof event.description !== "string") continue;
      await ctx.db.patch("events", event._id, {
        description: await encryptText(event._id, event.keyVersion, event.description),
      });
      encrypted++;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.model.migrations.encryptPlainText, {
        cursor: page.continueCursor,
      });
    }
    return encrypted;
  },
});
