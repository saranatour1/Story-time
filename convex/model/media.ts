import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import {
  assertNotArchived,
  getEventAccess,
  getUserId,
  requireEventAccess,
  requireUserId,
  sharesExperience,
  withheld,
} from "../lib/access";
import { eventMedia, insertMedia, patchMedia, uploadBytes } from "../lib/aggregates";
import { recordChange } from "../lib/changes";
import {
  AVATAR_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MAX_AVATAR_BYTES,
  MAX_LIVE_UPLOAD_BYTES,
  MAX_PHOTOS_PER_EVENT,
  MAX_VIDEOS_PER_EVENT,
  MAX_THUMB_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_MIME_TYPES,
} from "../lib/limits";

export const liveUploadBytes = async (ctx: QueryCtx, userId: Id<"users">) => {
  return { bytes: await uploadBytes.sum(ctx, { namespace: userId }) };
};

export const assertUploadBudget = async (ctx: MutationCtx, userId: Id<"users">, size: number) => {
  const { bytes } = await liveUploadBytes(ctx, userId);
  if (bytes + size > MAX_LIVE_UPLOAD_BYTES) {
    throw new ConvexError({
      code: "UPLOAD_BUDGET",
      message:
        "You've reached your upload limit across all experiences. Delete some photos or videos to make room.",
    });
  }
};

const reserveUpload = mutation({
  args: { eventId: v.id("events"), size: v.number(), mime: v.string() },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "contributor");
    assertNotArchived(event);
    if (!Number.isInteger(args.size) || args.size < 1) {
      throw new ConvexError({ code: "INVALID", field: "size", message: "Empty file" });
    }
    const isVideo = VIDEO_MIME_TYPES.includes(args.mime);
    if (!isVideo && !IMAGE_MIME_TYPES.includes(args.mime)) {
      throw new ConvexError({
        code: "INVALID",
        field: "mime",
        message: "Unsupported file type",
      });
    }
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_UPLOAD_BYTES;
    if (args.size > maxBytes) {
      throw new ConvexError({
        code: "TOO_LARGE",
        message: isVideo ? "Videos can be at most 50 MB" : "Photos can be at most 20 MB",
        maxBytes,
      });
    }
    // Photos and videos have their own caps. Deleted uploads don't count, so
    // removing one frees room.
    const held = await eventMedia.count(ctx, {
      namespace: args.eventId,
      bounds: { eq: isVideo ? "video" : "photo" },
    });
    if (held >= (isVideo ? MAX_VIDEOS_PER_EVENT : MAX_PHOTOS_PER_EVENT)) {
      throw new ConvexError({
        code: "MEDIA_LIMIT",
        message: isVideo
          ? `An experience holds up to ${MAX_VIDEOS_PER_EVENT} videos. Delete one to add another.`
          : `An experience holds up to ${MAX_PHOTOS_PER_EVENT} photos. Delete one to add another.`,
      });
    }
    await assertUploadBudget(ctx, userId, args.size);

    const r2Key = `events/${args.eventId}/${crypto.randomUUID()}`;
    const mediaId = await insertMedia(ctx, {
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

const confirmUpload = mutation({
  args: { mediaId: v.id("media"), sha256: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || media.uploaderId !== userId || media.status === "deleted") {
      throw new Error("Upload not found");
    }
    if (media.purpose === "avatar") {
      if (media.status === "reserved") {
        await patchMedia(ctx, args.mediaId, {
          status: "ready",
          sha256: args.sha256,
        });
      }
      return null;
    }
    if (media.eventId === undefined) throw new Error("Upload not found");
    const { event } = await requireEventAccess(ctx, media.eventId, "contributor");
    assertNotArchived(event);
    if (media.status === "ready") return null;
    await patchMedia(ctx, args.mediaId, {
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

const MAX_IMAGE_EDGE = 20_000;

const reserveThumb = mutation({
  args: { mediaId: v.id("media"), size: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || media.uploaderId !== userId || media.status === "deleted") {
      throw new Error("Upload not found");
    }
    if (!Number.isInteger(args.size) || args.size < 1 || args.size > MAX_THUMB_BYTES) {
      throw new ConvexError({
        code: "TOO_LARGE",
        message: "Thumbnails can be at most 400 KB",
        maxBytes: MAX_THUMB_BYTES,
      });
    }
    await assertUploadBudget(ctx, userId, args.size);
    const keyScope = media.purpose === "avatar" ? `avatar:${media.uploaderId}` : media.eventId;
    if (keyScope === undefined) throw new Error("Upload not found");
    return {
      r2Key: `thumbs/${args.mediaId}/${crypto.randomUUID()}`,
      keyVersion: media.keyVersion,
      keyScope,
    };
  },
});

const attachThumb = mutation({
  args: {
    mediaId: v.id("media"),
    thumbR2Key: v.string(),
    thumbSize: v.number(),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || media.uploaderId !== userId || media.status === "deleted") {
      throw new Error("Upload not found");
    }
    if (!args.thumbR2Key.startsWith(`thumbs/${args.mediaId}/`)) throw new Error("Upload not found");
    if (
      !Number.isInteger(args.thumbSize) ||
      args.thumbSize < 1 ||
      args.thumbSize > MAX_THUMB_BYTES
    ) {
      throw new Error("Upload not found");
    }
    if (
      !Number.isInteger(args.width) ||
      !Number.isInteger(args.height) ||
      args.width < 1 ||
      args.height < 1 ||
      args.width > MAX_IMAGE_EDGE ||
      args.height > MAX_IMAGE_EDGE
    ) {
      throw new Error("Upload not found");
    }
    const previous = media.thumbR2Key ?? null;
    await patchMedia(ctx, args.mediaId, {
      thumbR2Key: args.thumbR2Key,
      thumbSize: args.thumbSize,
      width: args.width,
      height: args.height,
    });
    return previous;
  },
});

const delivered = (
  media: Doc<"media">,
  variant: "full" | "thumb" | undefined,
  keyScope: string,
) => {
  const thumbKey = variant === "thumb" ? media.thumbR2Key : undefined;
  return {
    r2Key: thumbKey ?? media.r2Key,
    mime: thumbKey !== undefined ? "image/jpeg" : media.mime,
    keyVersion: media.keyVersion,
    keyScope,
  };
};

const getForDownload = query({
  args: {
    mediaId: v.id("media"),
    variant: v.optional(v.union(v.literal("full"), v.literal("thumb"))),
  },
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || media.status !== "ready") return null;

    if (media.purpose === "avatar") {
      const viewer = await getUserId(ctx);
      if (viewer === null) return null;
      if (viewer !== media.uploaderId && !(await sharesExperience(ctx, viewer, media.uploaderId))) {
        return null;
      }
      return delivered(media, args.variant, `avatar:${media.uploaderId}`);
    }

    if (media.eventId === undefined) return null;
    const access = await getEventAccess(ctx, media.eventId);
    if (access === null) return null;
    // Photos not yet attached to a moment are visible to their uploader only.
    if (media.momentId === undefined && media.uploaderId !== access.userId) return null;
    if (await withheld(ctx, media, access)) return null;
    return delivered(media, args.variant, media.eventId);
  },
});

const reserveAvatarUpload = mutation({
  args: { size: v.number(), mime: v.string() },
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
    await assertUploadBudget(ctx, userId, args.size);
    const r2Key = `avatars/${userId}/${crypto.randomUUID()}`;
    const mediaId = await insertMedia(ctx, {
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

const setAvatar = mutation({
  args: { mediaId: v.id("media") },
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

const clearAvatar = mutation({
  args: {},
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

const deletableBy = async (
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  media: Doc<"media">,
): Promise<boolean> => {
  if (media.status === "deleted") return false;
  if (media.purpose === "avatar") {
    if (media.uploaderId !== userId) return false;
    const user = await ctx.db.get("users", userId);
    return user?.imageMediaId !== media._id;
  }
  if (media.momentId !== undefined || media.eventId === undefined) return false;
  const access = await getEventAccess(ctx, media.eventId);
  if (access === null || access.role === "viewer") return false;
  if (access.role === "owner") return true;
  return media.uploaderId === userId || media.detachedBy === userId;
};

const getForDelete = query({
  args: { mediaId: v.id("media") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (userId === null) return null;
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || !(await deletableBy(ctx, userId, media))) return null;
    return { r2Key: media.r2Key, thumbR2Key: media.thumbR2Key };
  },
});

const markDeleted = mutation({
  args: { mediaId: v.id("media") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || !(await deletableBy(ctx, userId, media))) {
      throw new Error("Not found");
    }
    await patchMedia(ctx, args.mediaId, { status: "deleted" });
    return null;
  },
});

const RESERVATION_TTL_MS = 60 * 60_000;
const SWEEP_BATCH = 100;

export const sweepReservedUploads = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const stale = await ctx.db
      .query("media")
      .withIndex("by_status", (q) =>
        q.eq("status", "reserved").lt("_creationTime", Date.now() - RESERVATION_TTL_MS),
      )
      .take(SWEEP_BATCH);
    for (const media of stale) {
      await patchMedia(ctx, media._id, { status: "deleted" });
    }
    if (stale.length === SWEEP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.model.media.sweepReservedUploads, {});
    }
    return stale.length;
  },
});

const UNATTACHED_SCAN = 200;
const UNATTACHED_LIMIT = 24;

const showable = (mime: string) =>
  IMAGE_MIME_TYPES.some((kind) => kind === mime) || VIDEO_MIME_TYPES.some((kind) => kind === mime);

// first. Anything with a purpose, and anyone else's loose uploads, stay off the shelf.
const unattached = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { userId } = await requireEventAccess(ctx, args.eventId, "contributor");
    const rows = await ctx.db
      .query("media")
      .withIndex("by_event_and_status", (q) => q.eq("eventId", args.eventId).eq("status", "ready"))
      .order("desc")
      .take(UNATTACHED_SCAN);
    const mine = rows.filter(
      (row) =>
        row.momentId === undefined &&
        row.purpose === undefined &&
        row.uploaderId === userId &&
        showable(row.mime),
    );
    return mine.slice(0, UNATTACHED_LIMIT).map((row) => ({ mediaId: row._id, mime: row.mime }));
  },
});

const MAX_KEYS = 12_000;

const listKeysForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await requireEventAccess(ctx, args.eventId, "owner");
    const keys: string[] = [];
    for (const status of ["ready", "reserved", "deleted"] as const) {
      const rows = ctx.db
        .query("media")
        .withIndex("by_event_and_status", (q) =>
          q.eq("eventId", args.eventId).eq("status", status),
        );
      for await (const row of rows) {
        keys.push(row.r2Key);
        if (row.thumbR2Key !== undefined) keys.push(row.thumbR2Key);
        if (keys.length >= MAX_KEYS) return keys;
      }
    }
    return keys;
  },
});

export const mediaApi = {
  reserveUpload,
  confirmUpload,
  reserveThumb,
  attachThumb,
  getForDownload,
  reserveAvatarUpload,
  setAvatar,
  clearAvatar,
  getForDelete,
  markDeleted,
  unattached,
  listKeysForEvent,
};
