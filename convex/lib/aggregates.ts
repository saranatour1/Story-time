import { TableAggregate } from "@convex-dev/aggregate";
import type { WithoutSystemFields } from "convex/server";
import { components } from "../_generated/api";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { VIDEO_MIME_TYPES } from "./limits";

export const AGGREGATES = ["uploadBytes", "eventMedia", "changeCounts"] as const;

const live = (media: Doc<"media">) => media.status !== "deleted";

export const uploadBytes = new TableAggregate<{
  Namespace: Id<"users">;
  Key: null;
  DataModel: DataModel;
  TableName: "media";
}>(components.uploadBytes, {
  namespace: (media) => media.uploaderId,
  sortKey: () => null,
  sumValue: (media) => (live(media) ? media.size + (media.thumbSize ?? 0) : 0),
});

// An experience's live photos and videos, for their caps. Deleted uploads and
// anything with a purpose are "other". Profile images have no experience.
export const eventMedia = new TableAggregate<{
  Namespace: Id<"events"> | null;
  Key: "photo" | "video" | "other";
  DataModel: DataModel;
  TableName: "media";
}>(components.eventMedia, {
  namespace: (media) => media.eventId ?? null,
  sortKey: (media) => {
    if (!live(media) || media.purpose !== undefined) return "other";
    return VIDEO_MIME_TYPES.includes(media.mime) ? "video" : "photo";
  },
});

export const changeCounts = new TableAggregate<{
  Namespace: Id<"events">;
  Key: "people" | "agents" | "system";
  DataModel: DataModel;
  TableName: "changes";
}>(components.changeCounts, {
  namespace: (change) => change.eventId,
  sortKey: (change) => {
    if (change.agent !== undefined) return "agents";
    return change.actorId === undefined ? "system" : "people";
  },
});

export const insertMedia = async (
  ctx: MutationCtx,
  fields: WithoutSystemFields<Doc<"media">>,
): Promise<Id<"media">> => {
  const id = await ctx.db.insert("media", fields);
  const media = await ctx.db.get("media", id);
  if (media !== null) {
    await uploadBytes.insertIfDoesNotExist(ctx, media);
    await eventMedia.insertIfDoesNotExist(ctx, media);
  }
  return id;
};

export const patchMedia = async (
  ctx: MutationCtx,
  id: Id<"media">,
  patch: Partial<WithoutSystemFields<Doc<"media">>>,
): Promise<void> => {
  const before = await ctx.db.get("media", id);
  await ctx.db.patch("media", id, patch);
  const after = await ctx.db.get("media", id);
  if (before === null || after === null) return;
  await uploadBytes.replaceOrInsert(ctx, before, after);
  await eventMedia.replaceOrInsert(ctx, before, after);
};
