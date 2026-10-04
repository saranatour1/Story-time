export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Streams a photo through our server route, which encrypts it into R2.
export async function uploadPhoto(
  file: File,
  eventId: string,
  token: string,
): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Photos can be at most 5 MB");
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
