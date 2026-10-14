import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { PlainBlock, PlainStop } from "../model/moments";
import { encryptGeo, encryptText, type Encrypted, type Geo } from "./crypto";
import {
  MAX_BLOCKS_PER_MOMENT,
  MAX_LABEL_LENGTH,
  MAX_LABELS_PER_MOMENT,
  MAX_STOPS_PER_MOMENT,
  MAX_TEXT_LENGTH,
} from "./limits";

// Typed as a whole: TypeScript only follows a `never` call through a declared type.
export const invalid: (field: string, message: string) => never = (field, message) => {
  throw new ConvexError({ code: "INVALID", field, message });
};

export const checkText = (field: string, text: string, max = MAX_TEXT_LENGTH) => {
  const t = text.trim();
  if (t.length === 0) invalid(field, "Can't be empty");
  if (t.length > max) invalid(field, `Must be ${max} characters or fewer`);
  return t;
};

// The offset a moment happened at, when one is sent. Real clocks run from
// UTC-12 to UTC+14, so anything outside that is a bad request.
export const checkOffset = (tzOffsetMinutes: number | undefined): number | undefined => {
  if (tzOffsetMinutes === undefined) return undefined;
  if (!Number.isFinite(tzOffsetMinutes) || tzOffsetMinutes < -720 || tzOffsetMinutes > 840) {
    invalid("tzOffsetMinutes", "That time zone isn't valid");
  }
  return tzOffsetMinutes;
};

// An empty place means "no place".
export const encodePlace = async (
  event: Doc<"events">,
  raw: string | undefined,
): Promise<Encrypted | undefined> => {
  if (raw === undefined || raw.trim() === "") return undefined;
  return encryptText(event._id, event.keyVersion, checkText("place", raw, 200));
};

// Coordinates pin a place on the map, so they're only valid with one. The
// caller passes whether the stop ended up with a place.
export const encodeGeo = async (
  event: Doc<"events">,
  geo: Geo | undefined,
  { field, hasPlace }: { field: string; hasPlace: boolean },
): Promise<Encrypted | undefined> => {
  if (geo === undefined) return undefined;
  if (!hasPlace) invalid(field, "Pick a place to pin on the map");
  const { lat, lng } = geo;
  const onMap =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;
  if (!onMap) invalid(field, "That location isn't on the map");
  return encryptGeo(event._id, event.keyVersion, geo);
};

// Validates and encrypts one stop's blocks. When editing, `momentId` is set
// and photos and videos already on that moment stay allowed, whoever
// uploaded them. Stops after the first may be empty (`allowEmpty`).
export const encodeBlocks = async (
  ctx: MutationCtx,
  args: {
    event: Doc<"events">;
    userId: Id<"users">;
    blocks: PlainBlock[];
    momentId?: Id<"moments">;
    allowEmpty?: boolean;
    fieldPrefix?: string;
  },
): Promise<{ blocks: Doc<"moments">["blocks"]; mediaIds: Id<"media">[] }> => {
  const { event, userId, momentId } = args;
  const prefix = args.fieldPrefix ?? "blocks";
  if (args.blocks.length === 0 && !args.allowEmpty) invalid(prefix, "Add something to share");
  if (args.blocks.length > MAX_BLOCKS_PER_MOMENT) {
    invalid(prefix, `At most ${MAX_BLOCKS_PER_MOMENT} items per stop`);
  }

  const blocks: Doc<"moments">["blocks"] = [];
  const mediaIds: Id<"media">[] = [];
  for (const [i, b] of args.blocks.entries()) {
    const field = `${prefix}.${i}`;
    if (b.type === "photo" || b.type === "video") {
      const media = await ctx.db.get("media", b.mediaId);
      const onThisMoment = momentId !== undefined && media?.momentId === momentId;
      const freshUpload = media?.momentId === undefined && media?.uploaderId === userId;
      // A photo block must point at an image, a video block at a video.
      const rightKind = media?.mime.startsWith(b.type === "photo" ? "image/" : "video/");
      if (
        media === null ||
        media.eventId !== event._id ||
        media.status !== "ready" ||
        !rightKind ||
        !(onThisMoment || freshUpload)
      ) {
        invalid(field, `That ${b.type} isn't available`);
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
            : await encryptText(event._id, event.keyVersion, checkText(field, b.title, 200)),
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
};

// Validates and encrypts the stops after the first. A stop needs a place or
// something to share.
export const encodeStops = async (
  ctx: MutationCtx,
  args: {
    event: Doc<"events">;
    userId: Id<"users">;
    stops: PlainStop[];
    momentId?: Id<"moments">;
  },
): Promise<{ stops: NonNullable<Doc<"moments">["stops"]>; mediaIds: Id<"media">[] }> => {
  if (args.stops.length > MAX_STOPS_PER_MOMENT - 1) {
    invalid("stops", `At most ${MAX_STOPS_PER_MOMENT} stops per moment`);
  }
  const stops: NonNullable<Doc<"moments">["stops"]> = [];
  const mediaIds: Id<"media">[] = [];
  for (const [i, s] of args.stops.entries()) {
    const field = `stops.${i}`;
    if (s.startsAt !== undefined && !Number.isFinite(s.startsAt)) {
      invalid(`${field}.startsAt`, "Pick a date");
    }
    const place = await encodePlace(args.event, s.place);
    const geo = await encodeGeo(args.event, s.geo, {
      field: `${field}.geo`,
      hasPlace: place !== undefined,
    });
    const encoded = await encodeBlocks(ctx, {
      event: args.event,
      userId: args.userId,
      blocks: s.blocks,
      momentId: args.momentId,
      allowEmpty: true,
      fieldPrefix: `${field}.blocks`,
    });
    if (place === undefined && encoded.blocks.length === 0) {
      invalid(field, "Add a place or something to share");
    }
    stops.push({
      startsAt: s.startsAt,
      place,
      geo,
      transport: s.transport,
      blocks: encoded.blocks,
    });
    mediaIds.push(...encoded.mediaIds);
  }
  return { stops, mediaIds };
};

// Free-text labels: trimmed, deduplicated, encrypted like other text.
export const encodeLabels = async (
  event: Doc<"events">,
  labels: string[],
): Promise<Encrypted[]> => {
  const clean = [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
  if (clean.length > MAX_LABELS_PER_MOMENT) {
    invalid("labels", `At most ${MAX_LABELS_PER_MOMENT} labels per moment`);
  }
  return Promise.all(
    clean.map((l) =>
      encryptText(event._id, event.keyVersion, checkText("labels", l, MAX_LABEL_LENGTH)),
    ),
  );
};

// Every photo and video on a moment, across all its stops.
export const mediaIdsOf = (moment: Pick<Doc<"moments">, "blocks" | "stops">): Id<"media">[] => {
  return [moment.blocks, ...(moment.stops ?? []).map((s) => s.blocks)].flatMap((blocks) =>
    blocks.flatMap((b) => (b.type === "photo" || b.type === "video" ? [b.mediaId] : [])),
  );
};
