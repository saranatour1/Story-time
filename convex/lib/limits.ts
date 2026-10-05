export const DEFAULT_MOMENT_LIMIT = 10;
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
