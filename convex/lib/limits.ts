export const DEFAULT_MOMENT_LIMIT = 100;
// Moment list and itinerary reads take at most this many rows.
export const MAX_MOMENT_LIMIT = 500;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_BLOCKS_PER_MOMENT = 20;
// A moment is a journey: its own place and time are the first stop.
export const MAX_STOPS_PER_MOMENT = 10;
export const MAX_LABELS_PER_MOMENT = 10;
export const MAX_LABEL_LENGTH = 40;
export const MAX_TEXT_LENGTH = 5000;
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
// Experiences one person may own. Checked when one is created.
export const MAX_EVENTS_PER_USER = 20;
// Bytes one person may hold in live uploads (reserved or ready) across all
// their experiences. Deleted uploads don't count.
export const MAX_LIVE_UPLOAD_BYTES = 2 * 1024 ** 3;
// What one typed request may do: how long it is, and how many things it may change.
export const MAX_COMMAND_CHARS = 600;
export const MAX_COMMAND_OPS = 8;
// A spoken request: at most this long, and (at the recorder's 32 kbit/s) well
// inside the 1 MiB a Convex value may hold.
export const MAX_VOICE_SECONDS = 60;
export const MAX_VOICE_BYTES = 900_000;
// A canvas: how many things it holds, and how many one request may add or move.
export const MAX_CANVAS_NODES = 400;
export const MAX_CANVAS_BATCH = 100;
// How many moments one fill of a canvas puts on it, so the pages fit one request.
export const MAX_CANVAS_FILL = 30;
