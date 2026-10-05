export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MEDIA_ACCEPT = `image/*,${VIDEO_TYPES.join(",")}`;

export const isVideoFile = (file: File) => VIDEO_TYPES.includes(file.type);

// Streams a photo or video through our server route, which encrypts it into R2.
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
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": file.type,
      "X-Event-Id": eventId,
      "X-File-Size": String(file.size),
    },
    body: file,
  });
  const body = (await res.json().catch(() => null)) as {
    mediaId?: string;
    error?: string;
  } | null;
  if (!res.ok || !body?.mediaId) {
    throw new Error(body?.error ?? "Upload failed");
  }
  return body.mediaId;
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
