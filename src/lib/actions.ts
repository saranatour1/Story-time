import { deleteMedia } from "@/lib/upload";

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

export const deletePhotos = async (mediaIds: string[], token: string): Promise<void> => {
  await Promise.all(mediaIds.map((id) => deleteMedia(id, token)));
};
