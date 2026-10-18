import type { FunctionArgs } from "convex/server";
import { toast } from "sonner";
import type { api } from "@/lib/api";
import type { Id } from "../../convex/_generated/dataModel";
import { IMAGE_MIME_TYPES } from "../../convex/lib/limits";
import type { Geo, PhotoPoint } from "./photo-groups";
import { type PhotoMeta, readPhotoMeta } from "./photo-meta";
import { thumbnail } from "./thumbs";
import { isVideoFile, MAX_VIDEO_BYTES, uploadMedia } from "./upload";
import { trackAi } from "@/lib/analytics";

// The steps that adding moments from picked files shares: the review sheet and
// the one-tap add both read, upload, plan and create the same way.

const UPLOADS_AT_ONCE = 3;
// Thumbnails sent per moment: as many as the server reads (MAX_THUMBS in
// convex/model/ai/scribe.ts), so keep the two in step.
export const THUMBS_PER_MOMENT = 4;

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const dayLabel = (day: string) => {
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// A picked photo or video, read on this device. `guessed` marks a time taken
// from the file's date, not the camera's.
export type Picked = { file: File; kind: "photo" | "video"; guessed: boolean; point: PhotoPoint };

// Checks each file (type, size, and that it isn't already in `seen`, which it
// updates) and reads when and where it was taken. Files left out are returned
// as problems to show.
export const readPicked = async (
  files: File[],
  seen: Set<string>,
  nextId: () => string,
): Promise<{ picked: Picked[]; problems: string[] }> => {
  const problems: string[] = [];
  const read = await Promise.all(
    files.map(async (file): Promise<Picked | null> => {
      const video = isVideoFile(file);
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      if (!video && !IMAGE_MIME_TYPES.includes(file.type)) {
        const heic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
        problems.push(
          `${file.name}: ${heic ? "HEIC photos aren't supported yet; export them as JPEG" : "not a photo or video that can be added"}`,
        );
        return null;
      }
      // A photo over the cap is made smaller when it uploads.
      if (video && file.size > MAX_VIDEO_BYTES) {
        problems.push(`${file.name}: videos can be at most 50 MB`);
        return null;
      }
      if (seen.has(key)) return null;
      seen.add(key);
      const meta: PhotoMeta = video ? {} : await readPhotoMeta(file).catch((): PhotoMeta => ({}));
      return {
        file,
        kind: video ? "video" : "photo",
        guessed: meta.takenAt === undefined,
        point: {
          id: nextId(),
          takenAt: meta.takenAt ?? file.lastModified,
          offsetMinutes: meta.offsetMinutes,
          geo: meta.geo,
        },
      };
    }),
  );
  return { picked: read.flatMap((p) => (p ? [p] : [])), problems };
};

// Uploads a few at a time, reporting progress. Stops early when `stopped` says
// so, and when the experience is out of upload room, which every later upload
// would hit as well.
export const uploadAll = async (
  items: Array<{ id: string; file: File }>,
  eventId: string,
  token: () => string,
  onProgress: (done: number, total: number) => void,
  stopped: () => boolean = () => false,
): Promise<{ uploaded: Map<string, string>; failures: string[]; full: boolean }> => {
  // Item id → uploaded media id.
  const uploaded = new Map<string, string>();
  const failures: string[] = [];
  let done = 0;
  let next = 0;
  let full = false;
  let eventFull = false;

  onProgress(0, items.length);
  const worker = async () => {
    while (next < items.length && !stopped() && !full) {
      const item = items[next++]!;
      try {
        // Read at each upload: tokens are short-lived and a batch can run for minutes.
        uploaded.set(item.id, await uploadMedia(item.file, eventId, token()));
      } catch (e) {
        const message = e instanceof Error ? e.message : "Upload failed";
        failures.push(`${item.file.name}: ${message}`);
        // Every later upload would fail the same way: the person's bytes, or
        // the experience's photo or video cap.
        if (/holds up to/i.test(message)) eventFull = true;
        if (/upload limit/i.test(message) || eventFull) full = true;
      }
      done++;
      onProgress(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: UPLOADS_AT_ONCE }, worker));
  if (full && done < items.length) {
    failures.push(
      `${plural(items.length - done, "more file")} weren't uploaded: ${eventFull ? "this experience is full" : "the upload limit has been reached"}`,
    );
  }
  return { uploaded, failures, full };
};

// A stop as planned. `place` is only set once someone named it.
export type PlannedStop = { startsAt: number; photos: PhotoPoint[]; place?: string; geo?: Geo };
export type PlannedDay = { day: string; moments: PlannedStop[][] };

type CreateArgs = FunctionArgs<typeof api.moments.create>;
// A photo or video a planned moment uses: the plan's photo id and the media it
// became.
export type PlannedUse = { photoId: string; mediaId: Id<"media">; kind: "photo" | "video" };
// `create` is the moment as `api.moments.create` takes it, without the event.
// It's undefined when none of the moment's photos uploaded.
export type PlannedMoment = {
  label: string;
  create?: Omit<CreateArgs, "eventId">;
  uses: PlannedUse[];
};

// The moments a plan creates. A stop keeps only the photos that uploaded, and
// is left out when none did. Coordinates go only with a place. The moment's
// zone is the first photo's, when its camera recorded one.
export const momentsFromPlan = (
  days: PlannedDay[],
  uploaded: ReadonlyMap<string, string>,
  kindOf: (photoId: string) => "photo" | "video" | undefined,
): PlannedMoment[] => {
  return days.flatMap((d) =>
    d.moments.map((stops, i): PlannedMoment => {
      const label = dayLabel(d.day) + (d.moments.length > 1 ? `, part ${i + 1}` : "");
      const uses: PlannedUse[] = [];
      const kept = stops.flatMap((s) => {
        const blocks = s.photos.flatMap((p) => {
          const mediaId = uploaded.get(p.id);
          const kind = kindOf(p.id);
          if (!mediaId || !kind) return [];
          uses.push({ photoId: p.id, mediaId: mediaId as Id<"media">, kind });
          return [{ type: kind, mediaId: mediaId as Id<"media"> }];
        });
        return blocks.length > 0 ? [{ s, blocks }] : [];
      });
      const [first, ...rest] = kept;
      if (!first) return { label, uses };
      const where = (s: PlannedStop) => {
        const place = s.place?.trim() || undefined;
        return { place, geo: place ? s.geo : undefined };
      };
      return {
        label,
        uses,
        create: {
          startsAt: first.s.startsAt,
          // The camera's zone when it said, so the day is the trip's.
          tzOffsetMinutes:
            first.s.photos[0]?.offsetMinutes ?? -new Date(first.s.startsAt).getTimezoneOffset(),
          ...where(first.s),
          blocks: first.blocks,
          stops: rest.map(({ s, blocks }) => ({ startsAt: s.startsAt, ...where(s), blocks })),
        },
      };
    }),
  );
};

export type Thumb = { mediaId: Id<"media">; jpeg: string };

// The photos the AI looks at: the first few that are pictures.
export const samplePhotos = <T extends { file: File }>(photos: T[]): T[] => {
  return photos.filter((p) => p.file.type.startsWith("image/")).slice(0, THUMBS_PER_MOMENT);
};

export type Enrich = (args: {
  momentId: Id<"moments">;
  thumbs: Thumb[];
  hint?: string;
}) => Promise<unknown>;

// Once the server says the day's AI uses are spent, new moments skip the
// thumbnails and the request, from any form on the page: the allowance is the
// person's. It comes back at midnight UTC; asking again after an hour costs
// one cheap refusal at most.
const PAUSE_MS = 60 * 60_000;
let pausedUntil = 0;

// Asks the server to draft a saved moment's note, labels, transport and link
// titles, from small copies of its photos. The moment is already saved, so a
// failure here is only logged.
export const enrichMoment = (
  enrich: Enrich,
  momentId: Id<"moments">,
  photos: Array<{ mediaId: Id<"media">; file: File }>,
  // What the person said the photos are, to guide the note.
  hint?: string,
): void => {
  if (Date.now() < pausedUntil) return;
  void Promise.all(
    samplePhotos(photos).map(async ({ mediaId, file }) => {
      const jpeg = await thumbnail(file);
      return jpeg ? [{ mediaId, jpeg }] : [];
    }),
  )
    .then((made) =>
      trackAi("note", enrich({ momentId, thumbs: made.flat(), hint }), (admitted) =>
        admitted === false ? "limit" : "ok",
      ),
    )
    .then((admitted) => {
      if (admitted !== false || Date.now() < pausedUntil) return;
      pausedUntil = Date.now() + PAUSE_MS;
      toast.info("No more AI notes today", {
        description:
          "You've used today's 10 AI uses. New moments still save, without a drafted note. They come back at midnight UTC.",
      });
    })
    .catch((error: unknown) => console.warn("Couldn't draft the moment's notes:", error));
};
