import { TableAggregate } from "@convex-dev/aggregate";
import type { WithoutSystemFields } from "convex/server";
import { components } from "../_generated/api";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { VIDEO_MIME_TYPES } from "./limits";

// Running counts and sums, kept by the aggregate component so nothing has to
// scan a table to know them. Each is written in the same mutation as the row
// it counts: media through the three helpers below, changes in lib/changes.ts.
//
// shortcut: writes use the forgiving forms (insertIfDoesNotExist,
// replaceOrInsert, deleteIfExists) so rows from before the backfill
// (model/migrations.ts, backfillAggregates) don't throw; switch to the strict
// forms if a silent miss ever needs to be loud.

// The names these are installed under in convex.config.ts. Tests register each.
export const AGGREGATES = ["uploadBytes", "eventMedia", "changeCounts"] as const;

const live = (media: Doc<"media">) => media.status !== "deleted";

// One person's live bytes across every experience, thumbnails and profile
// images included. A deleted upload stays in as zero, so deleting frees room.
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

// An experience's live photos and videos, for their caps. Stickers, a locked
// PDF and deleted uploads are "other". Profile images have no experience.
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

// An experience's changes by who made them, for Activity's filters.
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

// Every insert of an upload goes through here.
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

// Every patch that touches status, size, thumbSize or purpose goes through
// here: those are what the counts read. A patch of anything else (a moment's
// id, a hash) may use ctx.db.patch.
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
