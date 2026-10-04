import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireEventAccess } from "./lib/access";
import { recordChange } from "./lib/changes";

const vStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("denied"),
);

// Ask for a higher moment limit ("credits"). Only an operator can grant it.
export const request = mutation({
  args: {
    eventId: v.id("events"),
    extra: v.number(),
    reason: v.optional(v.string()),
  },
  returns: v.id("quotaRequests"),
  handler: async (ctx, args) => {
    const { userId } = await requireEventAccess(ctx, args.eventId, "contributor");
    if (!Number.isInteger(args.extra) || args.extra < 1 || args.extra > 100) {
      throw new ConvexError({
        code: "INVALID",
        field: "extra",
        message: "Ask for between 1 and 100 more moments",
      });
    }
    if (args.reason !== undefined && args.reason.length > 500) {
      throw new ConvexError({
        code: "INVALID",
        field: "reason",
        message: "Keep the reason under 500 characters",
      });
    }
    const pending = await ctx.db
      .query("quotaRequests")
      .withIndex("by_event_and_status", (q) =>
        q.eq("eventId", args.eventId).eq("status", "pending"),
      )
      .first();
    if (pending !== null) {
      throw new ConvexError({
        code: "ALREADY_PENDING",
        message: "You already have a pending request for this experience",
      });
    }
    const id = await ctx.db.insert("quotaRequests", {
      eventId: args.eventId,
      requestedBy: userId,
      extra: args.extra,
      reason: args.reason,
      status: "pending",
    });
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "quota",
      entityId: id,
      actorId: userId,
      action: "create",
      fields: ["extra", "reason", "status"],
      after: { extra: args.extra, status: "pending" },
    });
    return id;
  },
});

export const listForEvent = query({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({
      _id: v.id("quotaRequests"),
      _creationTime: v.number(),
      extra: v.number(),
      status: vStatus,
    }),
  ),
  handler: async (ctx, args) => {
    await requireEventAccess(ctx, args.eventId, "owner");
    const rows = await ctx.db
      .query("quotaRequests")
      .withIndex("by_event_and_status", (q) => q.eq("eventId", args.eventId))
      .take(50);
    rows.sort((a, b) => b._creationTime - a._creationTime);
    return rows.map((r) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      extra: r.extra,
      status: r.status,
    }));
  },
});

// Operator action: `npx convex run quota:resolve '{"requestId":"...","approve":true}'`
export const resolve = internalMutation({
  args: { requestId: v.id("quotaRequests"), approve: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get("quotaRequests", args.requestId);
    if (request === null || request.status !== "pending") {
      throw new Error("No pending request");
    }
    const event = await ctx.db.get("events", request.eventId);
    if (event === null) throw new Error("Event not found");
    await ctx.db.patch("quotaRequests", args.requestId, {
      status: args.approve ? "approved" : "denied",
    });
    if (args.approve) {
      await ctx.db.patch("events", event._id, {
        momentLimit: event.momentLimit + request.extra,
      });
    }
    await recordChange(ctx, {
      eventId: event._id,
      entity: "quota",
      entityId: args.requestId,
      action: "update",
      fields: args.approve ? ["status", "momentLimit"] : ["status"],
      before: { status: "pending", momentLimit: event.momentLimit },
      after: {
        status: args.approve ? "approved" : "denied",
        momentLimit: args.approve
          ? event.momentLimit + request.extra
          : event.momentLimit,
      },
    });
    return null;
  },
});
