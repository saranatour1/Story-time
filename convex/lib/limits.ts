// AI uses one person gets a day, across every AI feature (see lib/rateLimit.ts).
export const AI_PER_DAY = 10;
// What one experience and one person may hold. Every cap lives here, the same
// for everyone; the server checks each one where the thing is made.

// Moments an experience holds.
export const MOMENT_LIMIT = 100;
// How many moments to read for an experience: all of them. One made before
// the limit came down can hold more than MOMENT_LIMIT (up to 500).
export const momentsToRead = (momentCount: number) => Math.max(MOMENT_LIMIT, momentCount);
// Photos and videos an experience holds live (reserved or ready), not counting
// journal stickers or a locked PDF. Deleting one frees its place.
export const MAX_PHOTOS_PER_EVENT = 50;
export const MAX_VIDEOS_PER_EVENT = 5;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
// A list thumbnail: longest side 480px, JPEG. The original stays for the open page.
export const MAX_THUMB_BYTES = 400 * 1024;
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
// A journal printed to a locked PDF, for its share link.
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
// Experiences one person may own. Checked when one is created.
export const MAX_EVENTS_PER_USER = 10;
// Bytes one person may hold in live uploads (reserved or ready) across all
// their experiences. Deleted uploads don't count.
export const MAX_LIVE_UPLOAD_BYTES = 1024 ** 3;
// What one typed request may do: how long it is, and how many things it may change.
export const MAX_COMMAND_CHARS = 600;
export const MAX_COMMAND_OPS = 8;
// A spoken request: at most this long, and (at the recorder's 32 kbit/s) well
// inside the 1 MiB a Convex value may hold.
export const MAX_VOICE_SECONDS = 60;
export const MAX_VOICE_BYTES = 900_000;
// Pages one journal holds: a page per moment, a cover, and room for more.
export const MAX_JOURNAL_PAGES = 150;
// Invites waiting to be opened, per experience.
export const MAX_WAITING_INVITES = 20;
// Emails one person may send a day: invites, and share links.
export const INVITE_EMAILS_PER_DAY = 10;
export const SHARE_EMAILS_PER_DAY = 10;
