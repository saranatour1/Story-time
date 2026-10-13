import { describe, expect, test } from "vitest";
import { evictUnused, imageWorkAfter, imageWorkBefore, ORIGINAL_BYTES, THUMB_BYTES, visibleTiles, type MountedImage } from "./image-load";

// A zoomed journal page has 8 photos and 3 of them are in the viewport.
// The moments shelf holds 24 photos (its cap). At 640px, 10 tiles fit.
const fixture = (): MountedImage[] => {
  const shown = visibleTiles(640);
  const page = Array.from({ length: 8 }, (_, i) => ({ id: `page-${i}`, role: "page" as const, visible: i < 3 }));
  const shelf = Array.from({ length: 24 }, (_, i) => ({ id: `shelf-${i}`, role: "list" as const, visible: i < shown }));
  return [...page, ...shelf];
};

describe("image fetches", () => {
  test("a 640px shelf shows 10 of 24 tiles", () => {
    expect(visibleTiles(640)).toBe(10);
  });

  test("before, every mounted picture fetches and decodes the original", () => {
    const before = imageWorkBefore(fixture());
    expect(before).toMatchObject({ fetches: 32, decodes: 32, full: 32, thumbs: 0 });
    expect(before.bytes).toBe(32 * ORIGINAL_BYTES);
  });

  test("after, only visible pictures fetch, and the shelf uses thumbnails", () => {
    const after = imageWorkAfter(fixture());
    expect(after).toMatchObject({ fetches: 13, decodes: 13, full: 3, thumbs: 10 });
    expect(after.bytes).toBe(3 * ORIGINAL_BYTES + 10 * THUMB_BYTES);
    expect(after.bytes).toBeLessThan(imageWorkBefore(fixture()).bytes / 10);
  });
});

test("an idle blob past the cap is revoked and dropped", () => {
  const revoked: string[] = [];
  const cache = new Map<string, { users: number; url: string }>();
  for (let i = 0; i < 5; i++) cache.set(`id-${i}`, { users: i === 4 ? 1 : 0, url: `blob:${i}` });
  evictUnused(
    cache,
    2,
    (entry) => entry.users === 0,
    (entry) => revoked.push(entry.url),
  );
  expect(revoked).toEqual(["blob:0", "blob:1", "blob:2"]);
  expect([...cache.keys()]).toEqual(["id-3", "id-4"]);
});
