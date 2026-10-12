// How many pictures a page fetches. Lists use a stored thumbnail and skip
// anything that has not scrolled into view. The open page fetches the original
// for the pictures that are on screen.

export const SHELF_LIMIT = 24;
// The shelf tile is size-14 (3.5rem) with gap-1.5.
export const SHELF_TILE_PX = 56;
export const SHELF_GAP_PX = 6;
// Stand-in sizes from a noisy JPEG: a photo the upload cap allows, and the
// 480px list thumbnail of the same picture. Used to turn fetch counts into bytes.
export const ORIGINAL_BYTES = 1_725_503;
export const THUMB_BYTES = 28_172;

export type MountedImage = { id: string; role: "list" | "page"; visible: boolean };

export const visibleTiles = (viewportPx: number): number => {
  if (viewportPx <= 0) return 0;
  return Math.min(SHELF_LIMIT, Math.max(0, Math.floor((viewportPx + SHELF_GAP_PX) / (SHELF_TILE_PX + SHELF_GAP_PX))));
};

export type ImageWork = { fetches: number; decodes: number; full: number; thumbs: number; bytes: number };

const work = (images: MountedImage[], thumbs: boolean): ImageWork => {
  const full = images.filter((image) => !thumbs || image.role === "page").length;
  const thumbCount = images.length - full;
  return {
    fetches: images.length,
    decodes: images.length,
    full,
    thumbs: thumbCount,
    bytes: full * ORIGINAL_BYTES + thumbCount * THUMB_BYTES,
  };
};

// Before: every mounted picture fetches and decodes the original.
export const imageWorkBefore = (images: MountedImage[]): ImageWork => {
  return work(images, false);
};

// After: only a picture that intersects the viewport is fetched, and a list
// uses the thumbnail.
export const imageWorkAfter = (images: MountedImage[]): ImageWork => {
  return work(
    images.filter((image) => image.visible),
    true,
  );
};

// Drops the oldest idle entries until the cache is within `max`. `drop` revokes
// the blob URL. Entries still on screen stay.
export const evictUnused = <T>(cache: Map<string, T>, max: number, idle: (entry: T) => boolean, drop: (entry: T) => void): void => {
  for (const [id, entry] of cache) {
    if (cache.size <= max) return;
    if (!idle(entry)) continue;
    drop(entry);
    cache.delete(id);
  }
};
