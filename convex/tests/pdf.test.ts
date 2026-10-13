/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeAll, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});

const setup = async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, viewerId, otherId] = [await make(), await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.api.events.createDraft, {});
  await t.run((ctx) => ctx.db.insert("sessions", { eventId, userId: viewerId, grantedBy: ownerId, role: "viewer" }));
  const link = await owner.mutation(api.api.share.enable, { eventId });
  const token = link.slice(link.indexOf("#") + 1);
  // What the upload route does: reserve, put the bytes, confirm.
  const upload = async () => {
    const { mediaId } = await owner.mutation(api.api.pdf.reserve, { eventId, size: 2048 });
    await owner.mutation(api.api.media.confirmUpload, { mediaId });
    return mediaId;
  };
  return { t, owner, viewer: as(viewerId), other: as(otherId), eventId, token, upload };
};

test("the owner puts a locked PDF on the link; its password stays theirs", async () => {
  const { t, owner, viewer, eventId, token, upload } = await setup();
  const first = await upload();
  expect(await owner.mutation(api.api.pdf.set, { eventId, mediaId: first, password: "kq7m-3vtx-p9ra-w2hc", pages: 12 })).toBeNull();

  expect(await owner.query(api.api.pdf.get, { eventId })).toMatchObject({ mediaId: first, pages: 12, password: "kq7m-3vtx-p9ra-w2hc" });
  expect((await viewer.query(api.api.pdf.get, { eventId }))?.password).toBeUndefined();
  expect(await t.query(api.api.share.pdf, { token })).toEqual({ mediaId: first, pages: 12, at: expect.any(Number) });
  // The file comes through the link and to invited people; the password is
  // kept encrypted, never in the clear.
  expect(await t.query(api.api.share.mediaForShare, { token, mediaId: first })).toMatchObject({ mime: "application/pdf" });
  expect(await viewer.query(api.api.media.getForDownload, { mediaId: first })).not.toBeNull();
  const stored = await t.run(async (ctx) => (await ctx.db.query("journals").first())?.pdf?.password);
  expect(JSON.stringify(stored)).not.toContain("kq7m");
  // While it is on the link it can't be deleted from storage.
  expect(await owner.query(api.api.media.getForDelete, { mediaId: first })).toBeNull();

  // A new one replaces it and hands back the old one to delete.
  const second = await upload();
  expect(await owner.mutation(api.api.pdf.set, { eventId, mediaId: second, password: "another-password", pages: 13 })).toBe(first);
  expect(await t.query(api.api.share.mediaForShare, { token, mediaId: first })).toBeNull();
  expect(await owner.query(api.api.media.getForDelete, { mediaId: first })).not.toBeNull();

  // Taken off the link: nothing to download.
  expect(await owner.mutation(api.api.pdf.drop, { eventId })).toBe(second);
  expect(await t.query(api.api.share.pdf, { token })).toBeNull();
  expect(await t.query(api.api.share.mediaForShare, { token, mediaId: second })).toBeNull();
  expect(await viewer.query(api.api.media.getForDownload, { mediaId: second })).toBeNull();
});

test("a hidden share does not name the locked PDF", async () => {
  const { t, owner, eventId, token, upload } = await setup();
  const mediaId = await upload();
  await owner.mutation(api.api.pdf.set, { eventId, mediaId, password: "kq7m-3vtx-p9ra-w2hc", pages: 12 });
  expect(await t.query(api.api.share.pdf, { token })).toMatchObject({ mediaId });

  await owner.mutation(api.api.share.setHidePhotos, { eventId, hide: true });
  expect(await t.query(api.api.share.pdf, { token })).toBeNull();
  expect(await t.query(api.api.share.mediaForShare, { token, mediaId })).toBeNull();
  // The owner still has the file and its password.
  expect(await owner.query(api.api.pdf.get, { eventId })).toMatchObject({ mediaId, pages: 12, password: "kq7m-3vtx-p9ra-w2hc" });

  await owner.mutation(api.api.share.setHidePhotos, { eventId, hide: false });
  expect(await t.query(api.api.share.pdf, { token })).toMatchObject({ mediaId, pages: 12 });
  expect(await t.query(api.api.share.mediaForShare, { token, mediaId })).toMatchObject({ mime: "application/pdf" });
});

test("only the owner makes one, with a real password and a size that fits", async () => {
  const { owner, viewer, other, eventId, upload } = await setup();
  await expect(viewer.mutation(api.api.pdf.reserve, { eventId, size: 2048 })).rejects.toThrow();
  await expect(other.mutation(api.api.pdf.reserve, { eventId, size: 2048 })).rejects.toThrow();
  await expect(owner.mutation(api.api.pdf.reserve, { eventId, size: 51 * 1024 * 1024 })).rejects.toThrow(/50 MB/);
  const mediaId = await upload();
  await expect(owner.mutation(api.api.pdf.set, { eventId, mediaId, password: "short", pages: 3 })).rejects.toThrow(/8 to 128/);
  await expect(viewer.mutation(api.api.pdf.set, { eventId, mediaId, password: "long enough", pages: 3 })).rejects.toThrow();
  // A photo can't be passed off as the PDF.
  const { mediaId: photo } = await owner.mutation(api.api.media.reserveUpload, { eventId, size: 100, mime: "image/png" });
  await owner.mutation(api.api.media.confirmUpload, { mediaId: photo });
  await expect(owner.mutation(api.api.pdf.set, { eventId, mediaId: photo, password: "long enough", pages: 3 })).rejects.toThrow(/isn't ready/);
});
