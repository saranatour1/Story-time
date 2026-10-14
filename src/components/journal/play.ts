import type { StoryMoment } from "@/components/event/types";

// Play opens the book. A moment with no page (the book was full, or the page
// was taken out) falls back to the story, so an older trip does not go blank.
export const playSurface = (
  pages: ReadonlyArray<{ momentId?: string }>,
  momentId: string | undefined,
): "book" | "story" => {
  if (pages.length === 0) return "story";
  if (momentId !== undefined && !pages.some((page) => page.momentId === momentId)) return "story";
  return "book";
};

// Where the book opens: that moment's page, or the cover.
export const pageForPlay = (
  pages: ReadonlyArray<{ momentId?: string }>,
  momentId: string | undefined,
): number => {
  if (momentId === undefined) return 0;
  const at = pages.findIndex((page) => page.momentId === momentId);
  return at < 0 ? 0 : at;
};

// The first words a page would print, from the moment.
export const firstNote = (
  moment: Pick<StoryMoment, "blocks" | "stops"> | undefined,
): string | undefined => {
  if (moment === undefined) return undefined;
  const blocks = [moment.blocks, ...moment.stops.map((stop) => stop.blocks)].flat();
  for (const block of blocks) {
    if ((block.type === "note" || block.type === "feeling") && block.text) return block.text;
  }
  return undefined;
};

// The layout keeps 400 characters and ends a longer note with an ellipsis.
// The page should still offer the whole moment.
export const noteWasCut = (printed: string | undefined, full: string | undefined): boolean => {
  if (printed === undefined || full === undefined || !printed.endsWith("…")) return false;
  return full.length > printed.length - 1;
};
