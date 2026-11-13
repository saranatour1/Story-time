import type { MomentView } from "@/components/event/types";

export const allBlocks = (m: MomentView) => [m.blocks, ...m.stops.map((s) => s.blocks)].flat();

export const searchText = (m: MomentView): string => {
  const parts = [m.place, m.authorName, m.authorAgent, ...m.labels, ...m.stops.map((s) => s.place)];
  for (const b of allBlocks(m)) {
    if (b.type === "note" || b.type === "feeling") parts.push(b.text);
    else if (b.type === "link") parts.push(b.title, b.url);
  }
  return parts.filter(Boolean).join("\n").toLowerCase();
};

export const matchesSearch = (m: MomentView, query: string): boolean => {
  const q = query.trim().toLowerCase();
  return q === "" || searchText(m).includes(q);
};
