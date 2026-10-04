import { deleteMedia } from "@/lib/upload";

// Deletes an experience through the Worker, which clears its photos from R2
// before removing the data.
export async function deleteExperience(eventId: string, token: string): Promise<void> {
  const res = await fetch(`/api/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Couldn't delete this experience");
  }
}

// Removes photos a moment no longer uses. Failures are ignored: nothing
// references these photos any more either way.
export async function deletePhotos(mediaIds: string[], token: string): Promise<void> {
  await Promise.all(mediaIds.map((id) => deleteMedia(id, token)));
}
