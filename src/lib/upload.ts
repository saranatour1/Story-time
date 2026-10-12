import { MAX_THUMB_BYTES } from "../../convex/lib/limits";
import { displayThumbnail } from "./thumbs";
import { stripExif } from "./strip-exif";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MEDIA_ACCEPT = `image/*,${VIDEO_TYPES.join(",")}`;

export const isVideoFile = (file: File) => VIDEO_TYPES.includes(file.type);

// Streams a photo or video through our server route, which encrypts it into R2.
// A JPEG goes up without its camera details (where and when it was taken),
// since a share link can reach it; the file the caller holds is untouched.
export async function uploadMedia(
  file: File,
  eventId: string,
  token: string,
): Promise<string> {
  if (isVideoFile(file)) {
    if (file.size > MAX_VIDEO_BYTES) throw new Error("Videos can be at most 50 MB");
  } else if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Photos can be at most 5 MB");
  }
  const upload = await stripExif(file);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": file.type,
      "X-Event-Id": eventId,
      // The server streams exactly this many bytes, so it must be the stripped size.
      "X-File-Size": String(upload.size),
    },
    body: upload,
  });
  const body = (await res.json().catch(() => null)) as {
    mediaId?: string;
    error?: string;
  } | null;
  if (!res.ok || !body?.mediaId) {
    throw new Error(body?.error ?? "Upload failed");
  }
  if (!isVideoFile(file)) await uploadThumb(file, body.mediaId, token, eventId);
  return body.mediaId;
}

// Best effort: a list can still show the original when this does not land.
async function uploadThumb(file: File, mediaId: string, token: string, eventId?: string) {
  const thumb = await displayThumbnail(file).catch(() => undefined);
  if (!thumb || thumb.blob.size > MAX_THUMB_BYTES) return;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "image/jpeg",
    "X-Purpose": "thumb",
    "X-Media-Id": mediaId,
    "X-File-Size": String(thumb.blob.size),
    "X-Image-Width": String(thumb.width),
    "X-Image-Height": String(thumb.height),
  };
  if (eventId) headers["X-Event-Id"] = eventId;
  await fetch("/api/upload", { method: "POST", headers, body: thumb.blob }).catch(() => undefined);
}

// The journal printed to a locked PDF, through the same route, which
// encrypts it into R2 like a photo. Only the experience's owner may.
export async function uploadJournalPdf(pdf: Uint8Array, eventId: string, token: string): Promise<string> {
  const body = new Blob([pdf.slice().buffer], { type: "application/pdf" });
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/pdf",
      "X-Event-Id": eventId,
      "X-Purpose": "journal-pdf",
      "X-File-Size": String(body.size),
    },
    body,
  });
  const reply = (await res.json().catch(() => null)) as { mediaId?: string; error?: string } | null;
  if (!res.ok || !reply?.mediaId) throw new Error(reply?.error ?? "Upload failed");
  return reply.mediaId;
}

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

// Profile images go through the same server route, with an avatar purpose.
export async function uploadAvatar(file: File, token: string): Promise<string> {
  if (!AVATAR_TYPES.includes(file.type)) throw new Error("Use a JPEG, PNG, WebP or AVIF image");
  if (file.size > MAX_AVATAR_BYTES) throw new Error("Profile images can be at most 2 MB");
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": file.type,
      "X-Purpose": "avatar",
      "X-File-Size": String(file.size),
    },
    body: file,
  });
  const body = (await res.json().catch(() => null)) as {
    mediaId?: string;
    error?: string;
  } | null;
  if (!res.ok || !body?.mediaId) throw new Error(body?.error ?? "Upload failed");
  await uploadThumb(file, body.mediaId, token);
  return body.mediaId;
}

// Removes a replaced or cleared image from storage; failures are not fatal
// because the image is no longer referenced either way.
export async function deleteMedia(mediaId: string, token: string): Promise<void> {
  await fetch(`/api/media/${mediaId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}
