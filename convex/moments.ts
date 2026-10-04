import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireEventAccess } from "./lib/access";
import { recordChange } from "./lib/changes";
import { decryptText, encryptText, placeKeyFor } from "./lib/crypto";
import { MAX_BLOCKS_PER_MOMENT, MAX_TEXT_LENGTH } from "./lib/limits";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// The decrypted shape clients send and receive.
export const vPlainBlock = v.union(
  v.object({ type: v.literal("photo"), mediaId: v.id("media") }),
  v.object({
    type: v.literal("link"),
    url: v.string(),
    title: v.optional(v.string()),
  }),
  v.object({ type: v.literal("note"), text: v.string() }),
  v.object({
    type: v.literal("feeling"),
    text: v.string(),
    mood: v.optional(v.string()),
  }),
);
export type PlainBlock = Infer<typeof vPlainBlock>;

export const vMomentView = v.object({
  _id: v.id("moments"),
  authorId: v.id("users"),
  startsAt: v.number(),
  place: v.optional(v.string()),
  blocks: v.array(vPlainBlock),
});

function invalid(field: string, message: string): never {
  throw new ConvexError({ code: "INVALID", field, message });
}

function checkText(field: string, text: string, max = MAX_TEXT_LENGTH) {
  const t = text.trim();
  if (t.length === 0) invalid(field, "Can't be empty");
  if (t.length > max) invalid(field, `Must be ${max} characters or fewer`);
  return t;
}

function localKeys(startsAt: number, tzOffsetMinutes: number) {
  const iso = new Date(startsAt + tzOffsetMinutes * 60_000).toISOString();
  return { dayKey: iso.slice(0, 10), monthKey: iso.slice(0, 7) };
}

export async function viewMoment(
  event: Doc<"events">,
  moment: Doc<"moments">,
): Promise<Infer<typeof vMomentView>> {
  const blocks: PlainBlock[] = [];
  for (const b of moment.blocks) {
    if (b.type === "photo") blocks.push(b);
    else if (b.type === "link") {
      blocks.push({
        type: "link",
        url: await decryptText(event._id, b.url),
        title: b.title ? await decryptText(event._id, b.title) : undefined,
      });
    } else if (b.type === "note") {
      blocks.push({ type: "note", text: await decryptText(event._id, b.text) });
    } else {
      blocks.push({
        type: "feeling",
        text: await decryptText(event._id, b.text),
        mood: b.mood,
      });
    }
  }
  return {
    _id: moment._id,
    authorId: moment.authorId,
    startsAt: moment.startsAt,
    place: moment.place ? await decryptText(event._id, moment.place) : undefined,
    blocks,
  };
}

export const create = mutation({
  args: {
    eventId: v.id("events"),
    startsAt: v.number(),
    // Minutes east of UTC for the author's local day/month grouping.
    tzOffsetMinutes: v.optional(v.number()),
    place: v.optional(v.string()),
    blocks: v.array(vPlainBlock),
  },
  returns: v.id("moments"),
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(
      ctx,
      args.eventId,
      "contributor",
    );

    if (event.momentCount >= event.momentLimit) {
      throw new ConvexError({
        code: "MOMENT_LIMIT",
        message: `This experience is limited to ${event.momentLimit} moments. Request more to add another.`,
        limit: event.momentLimit,
      });
    }
    if (!Number.isFinite(args.startsAt)) invalid("startsAt", "Pick a date");
    if (args.blocks.length === 0) invalid("blocks", "Add something to share");
    if (args.blocks.length > MAX_BLOCKS_PER_MOMENT) {
      invalid("blocks", `At most ${MAX_BLOCKS_PER_MOMENT} items per moment`);
    }

    const placeText =
      args.place === undefined || args.place.trim() === ""
        ? undefined
        : checkText("place", args.place, 200);
    const tz = Math.max(-840, Math.min(840, args.tzOffsetMinutes ?? 0));

    const blocks: Doc<"moments">["blocks"] = [];
    const mediaIds = [];
    for (const [i, b] of args.blocks.entries()) {
      const field = `blocks.${i}`;
      if (b.type === "photo") {
        const media = await ctx.db.get("media", b.mediaId);
        if (
          media === null ||
          media.eventId !== args.eventId ||
          media.uploaderId !== userId ||
          media.status !== "ready" ||
          media.momentId !== undefined
        ) {
          invalid(field, "That photo isn't available");
        }
        mediaIds.push(media._id);
        blocks.push(b);
      } else if (b.type === "link") {
        let url: URL;
        try {
          url = new URL(b.url.trim());
        } catch {
          invalid(field, "Enter a valid link");
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          invalid(field, "Links must start with http:// or https://");
        }
        if (url.href.length > 2048) invalid(field, "That link is too long");
        blocks.push({
          type: "link",
          url: await encryptText(args.eventId, event.keyVersion, url.href),
          title:
            b.title === undefined || b.title.trim() === ""
              ? undefined
              : await encryptText(
                  args.eventId,
                  event.keyVersion,
                  checkText(field, b.title, 200),
                ),
        });
      } else if (b.type === "note") {
        blocks.push({
          type: "note",
          text: await encryptText(
            args.eventId,
            event.keyVersion,
            checkText(field, b.text),
          ),
        });
      } else {
        if (b.mood !== undefined && b.mood.length > 24) {
          invalid(field, "Mood is too long");
        }
        blocks.push({
          type: "feeling",
          text: await encryptText(
            args.eventId,
            event.keyVersion,
            checkText(field, b.text),
          ),
          mood: b.mood,
        });
      }
    }

    const momentId = await ctx.db.insert("moments", {
      eventId: args.eventId,
      authorId: userId,
      startsAt: args.startsAt,
      place: placeText
        ? await encryptText(args.eventId, event.keyVersion, placeText)
        : undefined,
      blocks,
    });
    for (const mediaId of mediaIds) {
      await ctx.db.patch("media", mediaId, { momentId });
    }

    await ctx.db.insert("itinerary", {
      eventId: args.eventId,
      momentId,
      startsAt: args.startsAt,
      ...localKeys(args.startsAt, tz),
      placeKey: placeText
        ? await placeKeyFor(args.eventId, event.keyVersion, placeText)
        : undefined,
      position: event.momentCount,
    });
    await ctx.db.patch("events", args.eventId, {
      momentCount: event.momentCount + 1,
      status: event.status === "draft" ? "active" : event.status,
    });

    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "moment",
      entityId: momentId,
      actorId: userId,
      action: "create",
      fields: ["startsAt", "place", "blocks"],
      after: { startsAt: args.startsAt, blockCount: blocks.length },
    });
    return momentId;
  },
});

export async function listForEvent(
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<Array<Infer<typeof vMomentView>>> {
  const moments = await ctx.db
    .query("moments")
    .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
    .take(500);
  return Promise.all(moments.map((m) => viewMoment(event, m)));
}

export const list = query({
  args: { eventId: v.id("events") },
  returns: v.array(vMomentView),
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "viewer");
    return listForEvent(ctx, event);
  },
});
