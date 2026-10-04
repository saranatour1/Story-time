import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { PlainBlock } from "../moments";
import { encryptText, placeKeyFor, type Encrypted } from "./crypto";
import { MAX_BLOCKS_PER_MOMENT, MAX_TEXT_LENGTH } from "./limits";

export function invalid(field: string, message: string): never {
  throw new ConvexError({ code: "INVALID", field, message });
}

export function checkText(field: string, text: string, max = MAX_TEXT_LENGTH) {
  const t = text.trim();
  if (t.length === 0) invalid(field, "Can't be empty");
  if (t.length > max) invalid(field, `Must be ${max} characters or fewer`);
  return t;
}

// Day and month in the author's local time, for itinerary grouping.
export function localKeys(startsAt: number, tzOffsetMinutes: number) {
  const tz = Math.max(-840, Math.min(840, tzOffsetMinutes));
  const iso = new Date(startsAt + tz * 60_000).toISOString();
  return { dayKey: iso.slice(0, 10), monthKey: iso.slice(0, 7) };
}

// An empty place means "no place". The key groups equal places without
// storing the place itself.
export async function encodePlace(
  event: Doc<"events">,
  raw: string | undefined,
): Promise<{ place: Encrypted | undefined; placeKey: string | undefined }> {
  if (raw === undefined || raw.trim() === "") {
    return { place: undefined, placeKey: undefined };
  }
  const text = checkText("place", raw, 200);
  return {
    place: await encryptText(event._id, event.keyVersion, text),
    placeKey: await placeKeyFor(event._id, event.keyVersion, text),
  };
}

// Validates and encrypts a moment's blocks. When editing, `momentId` is set
// and photos already on that moment stay allowed, whoever uploaded them.
export async function encodeBlocks(
  ctx: MutationCtx,
  args: {
    event: Doc<"events">;
    userId: Id<"users">;
    blocks: PlainBlock[];
    momentId?: Id<"moments">;
  },
): Promise<{ blocks: Doc<"moments">["blocks"]; mediaIds: Id<"media">[] }> {
  const { event, userId, momentId } = args;
  if (args.blocks.length === 0) invalid("blocks", "Add something to share");
  if (args.blocks.length > MAX_BLOCKS_PER_MOMENT) {
    invalid("blocks", `At most ${MAX_BLOCKS_PER_MOMENT} items per moment`);
  }

  const blocks: Doc<"moments">["blocks"] = [];
  const mediaIds: Id<"media">[] = [];
  for (const [i, b] of args.blocks.entries()) {
    const field = `blocks.${i}`;
    if (b.type === "photo") {
      const media = await ctx.db.get("media", b.mediaId);
      const onThisMoment =
        momentId !== undefined && media?.momentId === momentId;
      const freshUpload =
        media?.momentId === undefined && media?.uploaderId === userId;
      if (
        media === null ||
        media.eventId !== event._id ||
        media.status !== "ready" ||
        !(onThisMoment || freshUpload)
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
        url: await encryptText(event._id, event.keyVersion, url.href),
        title:
          b.title === undefined || b.title.trim() === ""
            ? undefined
            : await encryptText(
                event._id,
                event.keyVersion,
                checkText(field, b.title, 200),
              ),
      });
    } else if (b.type === "note") {
      blocks.push({
        type: "note",
        text: await encryptText(event._id, event.keyVersion, checkText(field, b.text)),
      });
    } else {
      if (b.mood !== undefined && b.mood.length > 24) {
        invalid(field, "Mood is too long");
      }
      blocks.push({
        type: "feeling",
        text: await encryptText(event._id, event.keyVersion, checkText(field, b.text)),
        mood: b.mood,
      });
    }
  }
  return { blocks, mediaIds };
}
