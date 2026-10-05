import { endOfDay, startOfDay } from "date-fns";
import type { MomentView } from "@/components/event/types";

export type BlockType = "photo" | "video" | "note" | "link" | "feeling";

export type MomentFilters = {
  search: string;
  // Places to keep; NO_PLACE stands for moments without one.
  places: string[];
  // Keep moments that contain every one of these.
  contains: BlockType[];
  // Author ids to keep.
  authors: string[];
  // Keep moments with any of these labels.
  labels: string[];
  from?: Date;
  to?: Date;
};

export const NO_PLACE = "";
export const noFilters: MomentFilters = { search: "", places: [], contains: [], authors: [], labels: [] };

export const isFiltering = (f: MomentFilters) =>
  f.search.trim() !== "" ||
  f.places.length > 0 ||
  f.contains.length > 0 ||
  f.authors.length > 0 ||
  f.labels.length > 0 ||
  f.from !== undefined;

// ponytail: filters in the browser because places and notes are encrypted at
// rest, so Convex can't index them. Fine for the 500 moments a query returns;
// past that, page the itinerary and search a server-side index instead.
export function matches(m: MomentView, f: MomentFilters): boolean {
  const q = f.search.trim().toLowerCase();
  if (q !== "" && !searchText(m).includes(q)) return false;
  if (f.places.length > 0 && !f.places.includes(m.place ?? NO_PLACE)) return false;
  const blocks = allBlocks(m);
  if (f.contains.some((t) => !blocks.some((b) => b.type === t))) return false;
  if (f.labels.length > 0 && !f.labels.some((l) => m.labels.includes(l))) return false;
  if (f.authors.length > 0 && !f.authors.includes(m.authorId)) return false;
  if (f.from !== undefined) {
    if (m.startsAt < startOfDay(f.from).getTime()) return false;
    if (m.startsAt > endOfDay(f.to ?? f.from).getTime()) return false;
  }
  return true;
}

// Content from every stop of the journey.
export const allBlocks = (m: MomentView) => [m.blocks, ...m.stops.map((s) => s.blocks)].flat();

function searchText(m: MomentView) {
  const parts = [m.place, m.authorName, ...m.labels, ...m.stops.map((s) => s.place)];
  for (const b of allBlocks(m)) {
    if (b.type === "note" || b.type === "feeling") parts.push(b.text);
    else if (b.type === "link") parts.push(b.title, b.url);
  }
  return parts.filter(Boolean).join("\n").toLowerCase();
}
