import { ConvexError, v } from "convex/values";
import { WorkflowManager, start } from "@convex-dev/workflow";
import { components, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { action, internalQuery } from "../../_generated/server";
import { assertNotArchived, requireEventAccess } from "../../lib/access";
import { MAX_COMMAND_CHARS } from "../../lib/limits";
import { rateLimiter } from "../../lib/rateLimit";
import { captionMoment, vThumb } from "./scribe";

export const workflow = new WorkflowManager(components.workflow);

// Fills in what the first pass can't: transport per stop and link titles. Both
// go through `apply`, which never overwrites what a person wrote.
export const enrichMoment = workflow.define({
  args: { momentId: v.id("moments") },
  handler: async (step, args): Promise<void> => {
    await step.runAction(internal.model.ai.decide.decideTransport, args, { retry: true });
    await step.runAction(internal.model.ai.unfurl.unfurlLinks, args);
  },
});

// Only the moment's author (or the owner) may have it enriched, the same rule
// as editing it. Returns who asks, whose allowance it comes out of.
export const authorize = internalQuery({
  args: { momentId: v.id("moments") },
  returns: v.id("users"),
  handler: async (ctx, args): Promise<Id<"users">> => {
    const moment = await ctx.db.get("moments", args.momentId);
    if (moment === null) throw new Error("Moment not found");
    const { userId, event, role } = await requireEventAccess(ctx, moment.eventId, "contributor");
    if (role !== "owner" && moment.authorId !== userId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You can only enrich your own moments",
      });
    }
    assertNotArchived(event);
    return userId;
  },
});

// Called right after a moment is saved. Photos (as 512px JPEGs) go to Scribe
// first, when the caller sends them; then the workflow runs. False when this
// hour's fill-ins are used up: the moment stays as saved, and the client stops
// sending photos for a while.
const enrich = action({
  args: {
    momentId: v.id("moments"),
    thumbs: v.optional(v.array(vThumb)),
    // What the person said the photos are, to guide the note.
    hint: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const userId: Id<"users"> = await ctx.runQuery(internal.model.ai.enrich.authorize, { momentId: args.momentId });
    const { ok } = await rateLimiter.limit(ctx, "enrich", { key: userId });
    if (!ok) return false;
    if (args.thumbs !== undefined && args.thumbs.length > 0) {
      await captionMoment(ctx, {
        momentId: args.momentId,
        thumbs: args.thumbs,
        hint: args.hint?.trim().slice(0, MAX_COMMAND_CHARS) || undefined,
      });
    }
    await start(ctx, internal.model.ai.enrich.enrichMoment, { momentId: args.momentId });
    return true;
  },
});

// What the app calls. Registered once, by convex/api/ai/enrich.ts, which re-exports it.
export const enrichApi = { enrich };
