export const MOMENT_LIMIT = 100;
export const momentsToRead = (momentCount: number) => Math.max(MOMENT_LIMIT, momentCount);
// Photos and videos an experience holds live (reserved or ready). Deleting
// one frees its place.
export const MAX_PHOTOS_PER_EVENT = 150;
export const MAX_VIDEOS_PER_EVENT = 5;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_THUMB_BYTES = 400 * 1024;
export const MAX_BLOCKS_PER_MOMENT = 20;
export const MAX_STOPS_PER_MOMENT = 10;
export const MAX_EXTRA_STOPS_PER_MOMENT = MAX_STOPS_PER_MOMENT - 1;
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
export const MAX_EVENTS_PER_USER = 10;
export const MAX_LIVE_UPLOAD_BYTES = 1024 ** 3;
export const MAX_COMMAND_CHARS = 600;
export const MAX_COMMAND_OPS = 8;
// A spoken request: at most this long, and (at the recorder's 32 kbit/s) well
// inside the 1 MiB a Convex value may hold.
export const MAX_VOICE_SECONDS = 60;
export const VOICE_BITS_PER_SECOND = 32_000;
export const MAX_VOICE_BYTES = 900_000;
export const MAX_WAITING_INVITES = 20;
export const MAX_INVITE_DAYS = 365;
export const INVITE_EMAILS_PER_DAY = 10;
export const SHARE_EMAILS_PER_DAY = 10;
export const EMAIL_CHECKS_PER_DAY = 5;
