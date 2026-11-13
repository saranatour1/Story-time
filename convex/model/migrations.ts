import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { changeCounts, eventMedia, uploadBytes } from "../lib/aggregates";
import { encryptText } from "../lib/crypto";

const BATCH = 100;

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

export const backfillAggregates = internalMutation({
  args: {
    table: v.optional(v.union(v.literal("media"), v.literal("changes"))),
    cursor: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const table = args.table ?? "media";
    const opts = { numItems: BATCH, cursor: args.cursor ?? null };
    let page;
    if (table === "media") {
      page = await ctx.db.query("media").paginate(opts);
      for (const media of page.page) {
        await uploadBytes.insertIfDoesNotExist(ctx, media);
        await eventMedia.insertIfDoesNotExist(ctx, media);
      }
    } else {
      page = await ctx.db.query("changes").paginate(opts);
      for (const change of page.page) await changeCounts.insertIfDoesNotExist(ctx, change);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.model.migrations.backfillAggregates, {
        table,
        cursor: page.continueCursor,
      });
    } else if (table === "media") {
      await ctx.scheduler.runAfter(0, internal.model.migrations.backfillAggregates, {
        table: "changes",
      });
    }
    return page.page.length;
  },
});
