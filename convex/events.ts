import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  getEventAccess,
  getUserId,
  requireEventAccess,
  requireUserId,
  type EventRole,
} from "./lib/access";
import { recordChange } from "./lib/changes";
import { DEFAULT_MOMENT_LIMIT } from "./lib/limits";
import { vRegion } from "./schema";

const vStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived"),
);
const vVisibility = v.union(v.literal("private"), v.literal("invite"));
const vRoleOut = v.union(
  v.literal("owner"),
  v.literal("contributor"),
  v.literal("viewer"),
);

const vEventView = v.object({
  _id: v.id("events"),
  _creationTime: v.number(),
  title: v.string(),
  description: v.optional(v.string()),
  startsAt: v.optional(v.number()),
  endsAt: v.optional(v.number()),
  status: vStatus,
  visibility: vVisibility,
  region: vRegion,
  momentLimit: v.number(),
  momentCount: v.number(),
  role: vRoleOut,
});

function toView(event: Doc<"events">, role: EventRole) {
  return {
    _id: event._id,
    _creationTime: event._creationTime,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    status: event.status,
    visibility: event.visibility,
    region: event.region,
    momentLimit: event.momentLimit,
    momentCount: event.momentCount,
    role,
  };
}

function invalid(field: string, message: string): never {
  throw new ConvexError({ code: "INVALID", field, message });
}

export const createDraft = mutation({
  args: {},
  returns: v.id("events"),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get("users", userId);
    const eventId = await ctx.db.insert("events", {
      ownerId: userId,
      title: "Untitled experience",
      status: "draft",
      visibility: "private",
      region: user?.region ?? "us",
      momentLimit: DEFAULT_MOMENT_LIMIT,
      momentCount: 0,
      keyVersion: 1,
    });
    await recordChange(ctx, {
      eventId,
      entity: "event",
      entityId: eventId,
      actorId: userId,
      action: "create",
      fields: ["title", "status", "visibility", "region"],
      after: {
        title: "Untitled experience",
        status: "draft",
        visibility: "private",
        region: user?.region ?? "us",
      },
    });
    return eventId;
  },
});

export const update = mutation({
  args: {
    eventId: v.id("events"),
    title: v.optional(v.string()),
    description: v.optional(v.string()), // "" clears it
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    visibility: v.optional(vVisibility),
    status: v.optional(vStatus),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(
      ctx,
      args.eventId,
      "owner",
    );

    const title = args.title?.trim();
    if (title !== undefined && (title.length < 3 || title.length > 80)) {
      invalid("title", "Title must be 3 to 80 characters");
    }
    if (args.description !== undefined && args.description.length > 2000) {
      invalid("description", "Description must be 2000 characters or fewer");
    }
    const startsAt = args.startsAt ?? event.startsAt;
    const endsAt = args.endsAt ?? event.endsAt;
    if (startsAt !== undefined && endsAt !== undefined && endsAt < startsAt) {
      invalid("endsAt", "End must be after the start");
    }

    const patch: Partial<Doc<"events">> = {};
    const before: Record<string, string | number | boolean | null> = {};
    const after: Record<string, string | number | boolean | null> = {};
    const fields: string[] = [];

    const note = (
      key: "title" | "startsAt" | "endsAt" | "visibility" | "status",
      next: string | number | undefined,
    ) => {
      if (next === undefined || next === event[key]) return;
      (patch as Record<string, unknown>)[key] = next;
      fields.push(key);
      before[key] = event[key] ?? null;
      after[key] = next;
    };
    note("title", title);
    note("startsAt", args.startsAt);
    note("endsAt", args.endsAt);
    note("visibility", args.visibility);
    note("status", args.status);

    // Free text is user content: log that it changed, never its value.
    if (args.description !== undefined) {
      const next = args.description.trim() === "" ? undefined : args.description;
      if (next !== event.description) {
        patch.description = next;
        fields.push("description");
      }
    }

    if (fields.length === 0) return null;
    await ctx.db.patch("events", args.eventId, patch);
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "event",
      entityId: args.eventId,
      actorId: userId,
      action: "update",
      fields,
      before,
      after,
    });
    return null;
  },
});

export const get = query({
  args: { eventId: v.id("events") },
  returns: v.union(v.null(), vEventView),
  handler: async (ctx, args) => {
    const access = await getEventAccess(ctx, args.eventId);
    return access === null ? null : toView(access.event, access.role);
  },
});

export const listMine = query({
  args: {},
  returns: v.array(vEventView),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (userId === null) return [];
    const owned = await ctx.db
      .query("events")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(100);
    const grants = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(100);
    const shared: Array<ReturnType<typeof toView>> = [];
    for (const grant of grants) {
      if (grant.revokedAt !== undefined) continue;
      const event = await ctx.db.get("events", grant.eventId);
      if (event !== null) shared.push(toView(event, grant.role));
    }
    return [...owned.map((e) => toView(e, "owner")), ...shared];
  },
});
