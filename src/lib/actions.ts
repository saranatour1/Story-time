import { deleteMedia } from "@/lib/upload";

// Deletes an experience through the Worker, which clears its photos from R2
// before removing the data.
export const deleteExperience = async (eventId: string, token: string): Promise<void> => {
  const res = await fetch(`/api/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Couldn't delete this experience");
  }
};

// Removes photos a moment no longer uses. Failures are ignored: nothing
// references these photos any more either way.
export const deletePhotos = async (mediaIds: string[], token: string): Promise<void> => {
  await Promise.all(mediaIds.map((id) => deleteMedia(id, token)));
};
