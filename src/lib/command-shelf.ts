import type { Id } from "../../convex/_generated/dataModel";

export type ShelfItem = { mediaId: Id<"media">; mime: string };

type ShelfBlock =
  | { type: "photo"; mediaId: Id<"media"> }
  | { type: "video"; mediaId: Id<"media"> }
  | { type: "note"; text: string };

// One moment's blocks for photos already in the trip: each picked file, then
// the words as a note when there are any. A video stays a video.
export const blocksForShelf = (picked: readonly ShelfItem[], note: string): ShelfBlock[] => {
  const media: ShelfBlock[] = picked.map((item) => ({
    type: item.mime.startsWith("video/") ? "video" : "photo",
    mediaId: item.mediaId,
  }));
  const text = note.trim();
  return text === "" ? media : [...media, { type: "note", text }];
};
