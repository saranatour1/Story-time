import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertNotArchived,
  getEventAccess,
  getUserId,
  requireEventAccess,
  requireUserId,
  sharesExperience,
} from "./lib/access";
import { recordChange } from "./lib/changes";
import {
  AVATAR_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MAX_AVATAR_BYTES,
  MAX_UPLOAD_BYTES,
} from "./lib/limits";

// Step 1 of an upload: the server route calls this before it streams bytes
// to R2, so size, type and per-event caps are enforced here.
export const reserveUpload = mutation({
  args: { eventId: v.id("events"), size: v.number(), mime: v.string() },
  returns: v.object({
    mediaId: v.id("media"),
    r2Key: v.string(),
    keyVersion: v.number(),
    keyScope: v.string(),
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
    return { mediaId, r2Key, keyVersion: event.keyVersion, keyScope: args.eventId };
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
    if (media.purpose === "avatar") {
      if (media.status === "reserved") {
        await ctx.db.patch("media", args.mediaId, {
          status: "ready",
          sha256: args.sha256,
        });
      }
      return null;
    }
    if (media.eventId === undefined) throw new Error("Upload not found");
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
      keyScope: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || media.status !== "ready") return null;

    if (media.purpose === "avatar") {
      // A profile image is visible to its owner and to people who share an
      // experience with them, and to nobody else.
      const viewer = await getUserId(ctx);
      if (viewer === null) return null;
      if (
        viewer !== media.uploaderId &&
        !(await sharesExperience(ctx, viewer, media.uploaderId))
      ) {
        return null;
      }
      return {
        r2Key: media.r2Key,
        mime: media.mime,
        keyVersion: media.keyVersion,
        keyScope: `avatar:${media.uploaderId}`,
      };
    }

    if (media.eventId === undefined) return null;
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
      keyScope: media.eventId,
    };
  },
});

// Profile images: not tied to an experience, smaller cap, own key scope.
export const reserveAvatarUpload = mutation({
  args: { size: v.number(), mime: v.string() },
  returns: v.object({
    mediaId: v.id("media"),
    r2Key: v.string(),
    keyVersion: v.number(),
    keyScope: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!Number.isInteger(args.size) || args.size < 1) {
      throw new ConvexError({ code: "INVALID", field: "size", message: "Empty file" });
    }
    if (args.size > MAX_AVATAR_BYTES) {
      throw new ConvexError({
        code: "TOO_LARGE",
        message: "Profile images can be at most 2 MB",
        maxBytes: MAX_AVATAR_BYTES,
      });
    }
    if (!AVATAR_MIME_TYPES.includes(args.mime)) {
      throw new ConvexError({
        code: "INVALID",
        field: "mime",
        message: "Use a JPEG, PNG, WebP or AVIF image",
      });
    }
    const r2Key = `avatars/${userId}/${crypto.randomUUID()}`;
    const mediaId = await ctx.db.insert("media", {
      purpose: "avatar",
      uploaderId: userId,
      r2Key,
      size: args.size,
      mime: args.mime,
      keyVersion: 1,
      status: "reserved",
    });
    return { mediaId, r2Key, keyVersion: 1, keyScope: `avatar:${userId}` };
  },
});

// Returns the image it replaced so the caller can delete that object from R2.
export const setAvatar = mutation({
  args: { mediaId: v.id("media") },
  returns: v.union(v.null(), v.id("media")),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const media = await ctx.db.get("media", args.mediaId);
    if (
      media === null ||
      media.purpose !== "avatar" ||
      media.uploaderId !== userId ||
      media.status !== "ready"
    ) {
      throw new ConvexError({
        code: "INVALID",
        message: "That image isn't available",
      });
    }
    const user = await ctx.db.get("users", userId);
    if (user === null) throw new Error("Not signed in");
    const previous = user.imageMediaId ?? null;
    await ctx.db.patch("users", userId, { imageMediaId: args.mediaId });
    return previous === args.mediaId ? null : previous;
  },
});

export const clearAvatar = mutation({
  args: {},
  returns: v.union(v.null(), v.id("media")),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get("users", userId);
    if (user === null) throw new Error("Not signed in");
    const previous = user.imageMediaId ?? null;
    if (previous !== null) {
      await ctx.db.patch("users", userId, { imageMediaId: undefined });
    }
    return previous;
  },
});

// For the delete route: the uploader only, and never an image still in use.
export const getForDelete = query({
  args: { mediaId: v.id("media") },
  returns: v.union(v.null(), v.object({ r2Key: v.string() })),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (userId === null) return null;
    const media = await ctx.db.get("media", args.mediaId);
    if (
      media === null ||
      media.purpose !== "avatar" ||
      media.uploaderId !== userId ||
      media.status === "deleted"
    ) {
      return null;
    }
    const user = await ctx.db.get("users", userId);
    if (user?.imageMediaId === args.mediaId) return null;
    return { r2Key: media.r2Key };
  },
});

// Called by the delete route once the R2 object is gone.
export const markDeleted = mutation({
  args: { mediaId: v.id("media") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const media = await ctx.db.get("media", args.mediaId);
    if (
      media === null ||
      media.purpose !== "avatar" ||
      media.uploaderId !== userId
    ) {
      throw new Error("Not found");
    }
    await ctx.db.patch("media", args.mediaId, { status: "deleted" });
    return null;
  },
});
