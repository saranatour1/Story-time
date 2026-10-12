/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});

async function setup() {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert("users", {}));
  const otherId = await t.run((ctx) => ctx.db.insert("users", {}));
  const owner = t.withIdentity({ subject: ownerId });
  const other = t.withIdentity({ subject: otherId });
  const eventId = await owner.mutation(api.api.events.createDraft, {});
  const { mediaId, r2Key } = await owner.mutation(api.api.media.reserveUpload, {
    eventId,
    size: 1000,
    mime: "image/jpeg",
  });
  await owner.mutation(api.api.media.confirmUpload, { mediaId });
  return { t, owner, other, eventId, mediaId, r2Key };
}

describe("thumbnails", () => {
  test("a list asks for the thumb and an old photo falls back to the original", async () => {
    const { owner, mediaId, r2Key } = await setup();
    const full = await owner.query(api.api.media.getForDownload, { mediaId });
    const missing = await owner.query(api.api.media.getForDownload, { mediaId, variant: "thumb" });
    expect(full?.r2Key).toBe(r2Key);
    expect(missing?.r2Key).toBe(r2Key);
    expect(missing?.mime).toBe("image/jpeg");

    const reserved = await owner.mutation(api.api.media.reserveThumb, { mediaId, size: 2000 });
    await owner.mutation(api.api.media.attachThumb, {
      mediaId,
      thumbR2Key: reserved.r2Key,
      thumbSize: 2000,
      width: 2000,
      height: 1500,
    });
    const thumb = await owner.query(api.api.media.getForDownload, { mediaId, variant: "thumb" });
    const stillFull = await owner.query(api.api.media.getForDownload, { mediaId, variant: "full" });
    expect(thumb?.r2Key).toBe(reserved.r2Key);
    expect(thumb?.mime).toBe("image/jpeg");
    expect(stillFull?.r2Key).toBe(r2Key);
    expect(stillFull?.mime).toBe("image/jpeg");
  });

  test("someone else cannot attach a thumb, and the key has to belong to this photo", async () => {
    const { owner, other, mediaId } = await setup();
    await expect(other.mutation(api.api.media.reserveThumb, { mediaId, size: 100 })).rejects.toThrow(/not found/i);
    await expect(
      owner.mutation(api.api.media.attachThumb, {
        mediaId,
        thumbR2Key: "thumbs/other/nope",
        thumbSize: 100,
        width: 10,
        height: 10,
      }),
    ).rejects.toThrow(/not found/i);
  });

  test("deleting the photo names the thumb, and so does removing the trip", async () => {
    const { owner, eventId, mediaId } = await setup();
    const reserved = await owner.mutation(api.api.media.reserveThumb, { mediaId, size: 500 });
    await owner.mutation(api.api.media.attachThumb, {
      mediaId,
      thumbR2Key: reserved.r2Key,
      thumbSize: 500,
      width: 800,
      height: 600,
    });
    expect(await owner.query(api.api.media.getForDelete, { mediaId })).toMatchObject({
      thumbR2Key: reserved.r2Key,
    });
    const keys = await owner.query(api.api.media.listKeysForEvent, { eventId });
    expect(keys).toContain(reserved.r2Key);
  });
});
