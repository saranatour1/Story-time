import { MAX_THUMB_BYTES } from "../../convex/lib/limits";
import { displayThumbnail, fitPhoto } from "./thumbs";
import { stripExif } from "./strip-exif";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MEDIA_ACCEPT = `image/*,${VIDEO_TYPES.join(",")}`;

export const isVideoFile = (file: File) => VIDEO_TYPES.includes(file.type);

export const uploadMedia = async (file: File, eventId: string, token: string): Promise<string> => {
  let upload: Blob;
  if (isVideoFile(file)) {
    if (file.size > MAX_VIDEO_BYTES) throw new Error("Videos can be at most 50 MB");
    upload = file;
  } else if (file.size > MAX_UPLOAD_BYTES) {
    const fitted = await fitPhoto(file, MAX_UPLOAD_BYTES);
    if (!fitted) throw new Error("Photos can be at most 20 MB");
    upload = fitted;
  } else {
    upload = await stripExif(file);
  }
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": upload.type || file.type,
      "X-Event-Id": eventId,
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
};

const uploadThumb = async (file: File, mediaId: string, token: string, eventId?: string) => {
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
};

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export const uploadAvatar = async (file: File, token: string): Promise<string> => {
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
};

export const deleteMedia = async (mediaId: string, token: string): Promise<void> => {
  await fetch(`/api/media/${mediaId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
};
