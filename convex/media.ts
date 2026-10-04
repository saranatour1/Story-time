import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertNotArchived,
  getEventAccess,
  requireEventAccess,
  requireUserId,
} from "./lib/access";
import { recordChange } from "./lib/changes";
import { IMAGE_MIME_TYPES, MAX_UPLOAD_BYTES } from "./lib/limits";

// Step 1 of an upload: the server route calls this before it streams bytes
// to R2, so size, type and per-event caps are enforced here.
export const reserveUpload = mutation({
  args: { eventId: v.id("events"), size: v.number(), mime: v.string() },
  returns: v.object({
    mediaId: v.id("media"),
    r2Key: v.string(),
    keyVersion: v.number(),
  }),
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(
      ctx,
      args.eventId,
      "contributor",
    );
    assertNotArchived(event);
    if (!Number.isInteger(args.size) || args.size < 1) {
      throw new ConvexError({ code: "INVALID", field: "size", message: "Empty file" });
    }
    if (args.size > MAX_UPLOAD_BYTES) {
      throw new ConvexError({
        code: "TOO_LARGE",
        message: "Photos can be at most 5 MB",
        maxBytes: MAX_UPLOAD_BYTES,
      });
    }
    if (!IMAGE_MIME_TYPES.includes(args.mime)) {
      throw new ConvexError({
        code: "INVALID",
        field: "mime",
        message: "Unsupported file type",
      });
    }
    // Stops one contributor reserving unlimited objects.
    const cap = event.momentLimit * 5;
    const existing = await ctx.db
      .query("media")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .take(cap + 1);
    if (existing.length >= cap) {
      throw new ConvexError({
        code: "MEDIA_LIMIT",
        message: "This experience has reached its upload limit",
      });
    }

    const r2Key = `events/${args.eventId}/${crypto.randomUUID()}`;
    const mediaId = await ctx.db.insert("media", {
      eventId: args.eventId,
      uploaderId: userId,
      r2Key,
      size: args.size,
      mime: args.mime,
      keyVersion: event.keyVersion,
      status: "reserved",
    });
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "media",
      entityId: mediaId,
      actorId: userId,
      action: "create",
      fields: ["size", "mime", "status"],
      after: { size: args.size, mime: args.mime, status: "reserved" },
    });
    return { mediaId, r2Key, keyVersion: event.keyVersion };
  },
});

// Step 3: the route confirms once R2 holds the object.
export const confirmUpload = mutation({
  args: { mediaId: v.id("media"), sha256: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || media.uploaderId !== userId) {
      throw new Error("Upload not found");
    }
    // Access can be revoked between reserve and confirm.
    const { event } = await requireEventAccess(ctx, media.eventId, "contributor");
    assertNotArchived(event);
    if (media.status === "ready") return null;
    await ctx.db.patch("media", args.mediaId, {
      status: "ready",
      sha256: args.sha256,
    });
    await recordChange(ctx, {
      eventId: media.eventId,
      entity: "media",
      entityId: args.mediaId,
      actorId: userId,
      action: "update",
      fields: ["status"],
      before: { status: "reserved" },
      after: { status: "ready" },
    });
    return null;
  },
});

// Used by the download route. Null for anyone without an active grant.
export const getForDownload = query({
  args: { mediaId: v.id("media") },
  returns: v.union(
    v.null(),
    v.object({
      r2Key: v.string(),
      mime: v.string(),
      keyVersion: v.number(),
      eventId: v.id("events"),
    }),
  ),
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || media.status !== "ready") return null;
    const access = await getEventAccess(ctx, media.eventId);
    if (access === null) return null;
    // Photos not yet attached to a moment are visible to their uploader only.
    if (media.momentId === undefined && media.uploaderId !== access.userId) {
      return null;
    }
    return {
      r2Key: media.r2Key,
      mime: media.mime,
      keyVersion: media.keyVersion,
      eventId: media.eventId,
    };
  },
});
