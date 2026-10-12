import type { MomentView } from "@/components/event/types";

// Searching the moments of an experience, in the browser: places and notes
// are encrypted at rest, so the server can't index them. Fine for the few
// hundred moments an experience holds.

// Content from every stop of the journey.
export const allBlocks = (m: MomentView) => [m.blocks, ...m.stops.map((s) => s.blocks)].flat();

// Everything a search can find: places, people, labels, words and links.
export const searchText = (m: MomentView): string => {
  const parts = [m.place, m.authorName, m.authorAgent, ...m.labels, ...m.stops.map((s) => s.place)];
  for (const b of allBlocks(m)) {
    if (b.type === "note" || b.type === "feeling") parts.push(b.text);
    else if (b.type === "link") parts.push(b.title, b.url);
  }
  return parts.filter(Boolean).join("\n").toLowerCase();
};

// Whether a moment matches what was typed. Blank matches everything.
export const matchesSearch = (m: MomentView, query: string): boolean => {
  const q = query.trim().toLowerCase();
  return q === "" || searchText(m).includes(q);
};
