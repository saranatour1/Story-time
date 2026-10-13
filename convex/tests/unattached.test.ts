/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeAll, describe, expect, test } from "vitest";
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
  const [ownerId, helperId, viewerId] = [await make(), await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.api.events.createDraft, {});
  await t.run((ctx) => ctx.db.insert("sessions", { eventId, userId: helperId, grantedBy: ownerId, role: "contributor" }));
  await t.run((ctx) => ctx.db.insert("sessions", { eventId, userId: viewerId, grantedBy: ownerId, role: "viewer" }));
  return { t, eventId, owner, helper: as(helperId), viewer: as(viewerId) };
};

type Caller = Awaited<ReturnType<typeof setup>>["owner"];

const ready = async (who: Caller, eventId: Id<"events">, mime = "image/jpeg") => {
  const { mediaId } = await who.mutation(api.api.media.reserveUpload, { eventId, size: 100, mime });
  await who.mutation(api.api.media.confirmUpload, { mediaId });
  return mediaId;
};

describe("media.unattached", () => {
  test("a contributor sees their own loose photos, newest first, and not a sticker or a photo already on a moment", async () => {
    const { t, owner, helper, eventId } = await setup();
    const older = await ready(owner, eventId);
    const newer = await ready(owner, eventId, "image/png");
    const clip = await ready(owner, eventId, "video/mp4");
    const used = await ready(owner, eventId);
    const sticker = await ready(owner, eventId);
    await t.run(async (ctx) => {
      await ctx.db.patch("media", sticker, { purpose: "sticker" });
    });
    await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: Date.UTC(2026, 5, 1),
      blocks: [{ type: "photo", mediaId: used }],
    });
    const theirs = await ready(helper, eventId);

    const shelf = await owner.query(api.api.media.unattached, { eventId });
    expect(shelf.map((item) => item.mediaId)).toEqual([clip, newer, older]);
    expect(shelf.map((item) => item.mime)).toEqual(["video/mp4", "image/png", "image/jpeg"]);

    expect(await helper.query(api.api.media.unattached, { eventId })).toEqual([{ mediaId: theirs, mime: "image/jpeg" }]);
  });

  test("a reserved upload is not on the shelf, and taking a photo off a moment puts it back", async () => {
    const { owner, eventId } = await setup();
    const { mediaId: reserved } = await owner.mutation(api.api.media.reserveUpload, { eventId, size: 100, mime: "image/jpeg" });
    const loose = await ready(owner, eventId);
    expect((await owner.query(api.api.media.unattached, { eventId })).map((item) => item.mediaId)).toEqual([loose]);

    const momentId = await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: Date.UTC(2026, 5, 2),
      blocks: [{ type: "photo", mediaId: loose }],
    });
    expect(await owner.query(api.api.media.unattached, { eventId })).toEqual([]);
    await owner.mutation(api.api.moments.remove, { momentId });
    expect((await owner.query(api.api.media.unattached, { eventId })).map((item) => item.mediaId)).toEqual([loose]);
    expect(reserved).toBeTruthy();
  });

  test("a viewer cannot list them", async () => {
    const { viewer, eventId } = await setup();
    await expect(viewer.query(api.api.media.unattached, { eventId })).rejects.toThrow();
  });
});
