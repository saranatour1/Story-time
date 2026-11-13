/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import cloudflareEmailTest from "@sarant/cloudflare-email-component/test";
import { beforeAll, describe, expect, test } from "vite-plus/test";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { AGGREGATES } from "../lib/aggregates";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});

const JUNE_1 = Date.UTC(2026, 5, 1, 12);

// An owner, a contributor, a viewer, and a share link anyone can open.
const setup = async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  for (const name of AGGREGATES) aggregateTest.register(t, name);
  cloudflareEmailTest.register(t);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, helperId, viewerId] = [await make(), await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.api.events.createDraft, {});
  for (const [userId, role] of [
    [helperId, "contributor"],
    [viewerId, "viewer"],
  ] as const) {
    await t.run((ctx) => ctx.db.insert("sessions", { eventId, userId, grantedBy: ownerId, role }));
  }
  const link = await owner.mutation(api.api.share.enable, { eventId });
  const token = link.slice(link.indexOf("#") + 1);
  return { t, eventId, owner, helper: as(helperId), viewer: as(viewerId), token };
};

type Caller = Awaited<ReturnType<typeof setup>>["owner"];

const photo = async (who: Caller, eventId: Id<"events">) => {
  const { mediaId } = await who.mutation(api.api.media.reserveUpload, {
    eventId,
    size: 100,
    mime: "image/jpeg",
  });
  await who.mutation(api.api.media.confirmUpload, { mediaId });
  return mediaId;
};

// A moment with one photo anyone may see, one hidden, and a note.
const momentWithHidden = async (who: Caller, eventId: Id<"events">) => {
  const [open, hidden] = [await photo(who, eventId), await photo(who, eventId)];
  const momentId = await who.mutation(api.api.moments.create, {
    eventId,
    startsAt: JUNE_1,
    tzOffsetMinutes: 0,
    blocks: [
      { type: "photo", mediaId: open },
      { type: "photo", mediaId: hidden, hidden: true },
      { type: "note", text: "Tram 28" },
    ],
  });
  return { momentId, open, hidden };
};

const listed = (who: Caller, eventId: Id<"events">) => who.query(api.api.moments.list, { eventId });
const paged = async (who: Caller, eventId: Id<"events">) =>
  (
    await who.query(api.api.moments.page, {
      eventId,
      paginationOpts: { numItems: 10, cursor: null },
    })
  ).page;
const bytes = (who: Caller, mediaId: Id<"media">) =>
  who.query(api.api.media.getForDownload, { mediaId });

describe("hidden photos", () => {
  test("its owner sees a hidden photo, marked", async () => {
    const { owner, eventId } = await setup();
    const { open, hidden } = await momentWithHidden(owner, eventId);
    const [moment] = await listed(owner, eventId);
    expect(moment?.blocks.slice(0, 2)).toEqual([
      { type: "photo", mediaId: open },
      { type: "photo", mediaId: hidden, hidden: true },
    ]);
    expect(await bytes(owner, hidden)).not.toBeNull();
  });

  test("a viewer gets neither the photo's id nor its bytes", async () => {
    const { owner, viewer, eventId } = await setup();
    const { open, hidden } = await momentWithHidden(owner, eventId);
    for (const moments of [await listed(viewer, eventId), await paged(viewer, eventId)]) {
      expect(moments).toHaveLength(1);
      expect(JSON.stringify(moments)).toContain(open);
      expect(JSON.stringify(moments)).not.toContain(hidden);
    }
    expect(await bytes(viewer, open)).not.toBeNull();
    expect(await bytes(viewer, hidden)).toBeNull();
    // The thumbnail is the same picture.
    expect(
      await viewer.query(api.api.media.getForDownload, { mediaId: hidden, variant: "thumb" }),
    ).toBeNull();
  });

  test("a share link gets neither the photo's id nor its bytes", async () => {
    const { t, owner, eventId, token } = await setup();
    const { open, hidden } = await momentWithHidden(owner, eventId);
    const shared = await t.query(api.api.share.get, { token });
    expect(JSON.stringify(shared)).toContain(open);
    expect(JSON.stringify(shared)).not.toContain(hidden);
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: open })).not.toBeNull();
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: hidden })).toBeNull();
  });

  test("whoever wrote the moment still sees what they hid; another guest does not", async () => {
    const { owner, helper, viewer, eventId } = await setup();
    const { hidden } = await momentWithHidden(helper, eventId);
    expect(JSON.stringify(await listed(helper, eventId))).toContain(hidden);
    expect(JSON.stringify(await listed(owner, eventId))).toContain(hidden);
    expect(await bytes(helper, hidden)).not.toBeNull();
    expect(JSON.stringify(await listed(viewer, eventId))).not.toContain(hidden);
    expect(await bytes(viewer, hidden)).toBeNull();
  });

  test("a photo hidden later stops being served, and comes back when shown again", async () => {
    const { owner, viewer, eventId } = await setup();
    const mediaId = await photo(owner, eventId);
    const note = { type: "note" as const, text: "Tram 28" };
    const momentId = await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: JUNE_1,
      blocks: [{ type: "photo", mediaId }, note],
    });
    expect(await bytes(viewer, mediaId)).not.toBeNull();

    await owner.mutation(api.api.moments.update, {
      momentId,
      blocks: [{ type: "photo", mediaId, hidden: true }, note],
    });
    expect(await bytes(viewer, mediaId)).toBeNull();
    expect(JSON.stringify(await listed(viewer, eventId))).not.toContain(mediaId);

    await owner.mutation(api.api.moments.update, {
      momentId,
      blocks: [{ type: "photo", mediaId }, note],
    });
    expect(await bytes(viewer, mediaId)).not.toBeNull();
  });

  test("a moment with nothing left to show is left out for others", async () => {
    const { t, owner, viewer, eventId, token } = await setup();
    const mediaId = await photo(owner, eventId);
    await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: JUNE_1,
      blocks: [{ type: "photo", mediaId, hidden: true }],
    });
    expect(await listed(owner, eventId)).toHaveLength(1);
    expect(await listed(viewer, eventId)).toEqual([]);
    expect((await t.query(api.api.share.get, { token }))?.moments).toEqual([]);
  });

  test("the cover guests see is never a hidden photo", async () => {
    const { owner, viewer, eventId } = await setup();
    const [hidden, open] = [await photo(owner, eventId), await photo(owner, eventId)];
    await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: JUNE_1,
      blocks: [
        { type: "photo", mediaId: hidden, hidden: true },
        { type: "photo", mediaId: open },
      ],
    });
    const [card] = await viewer.query(api.api.events.listMine, {});
    expect(card?.coverMediaId).toBe(open);
  });
});

describe("archived moments", () => {
  test("an archived moment is kept from everyone else and out of the count", async () => {
    const { t, owner, viewer, eventId, token } = await setup();
    const { momentId, open } = await momentWithHidden(owner, eventId);
    await owner.mutation(api.api.moments.setArchived, { momentId, archived: true });

    const [mine] = await listed(owner, eventId);
    expect(mine?.archived).toBe(true);
    expect(await bytes(owner, open)).not.toBeNull();

    expect(await listed(viewer, eventId)).toEqual([]);
    expect(await paged(viewer, eventId)).toEqual([]);
    expect(await bytes(viewer, open)).toBeNull();
    const shared = await t.query(api.api.share.get, { token });
    expect(shared?.moments).toEqual([]);
    expect(shared?.event.momentCount).toBe(0);
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: open })).toBeNull();
    expect((await viewer.query(api.api.events.get, { eventId }))?.momentCount).toBe(0);
    const [card] = await viewer.query(api.api.events.listMine, {});
    expect(card?.coverMediaId).toBeUndefined();
  });

  test("restoring it brings it back for everyone", async () => {
    const { owner, viewer, eventId } = await setup();
    const { momentId, open } = await momentWithHidden(owner, eventId);
    await owner.mutation(api.api.moments.setArchived, { momentId, archived: true });
    await owner.mutation(api.api.moments.setArchived, { momentId, archived: false });

    const [moment] = await listed(viewer, eventId);
    expect(moment?.archived).toBeUndefined();
    expect(await bytes(viewer, open)).not.toBeNull();
    expect((await viewer.query(api.api.events.get, { eventId }))?.momentCount).toBe(1);
  });

  test("its author sees it; only they or an owner may archive it", async () => {
    const { owner, helper, viewer, eventId } = await setup();
    const { momentId } = await momentWithHidden(helper, eventId);
    await expect(
      viewer.mutation(api.api.moments.setArchived, { momentId, archived: true }),
    ).rejects.toThrow();
    const { momentId: owners } = await momentWithHidden(owner, eventId);
    await expect(
      helper.mutation(api.api.moments.setArchived, { momentId: owners, archived: true }),
    ).rejects.toThrow(/your own/);

    await helper.mutation(api.api.moments.setArchived, { momentId, archived: true });
    expect((await listed(helper, eventId)).map((m) => m._id)).toContain(momentId);
    expect((await listed(owner, eventId)).map((m) => m._id)).toContain(momentId);
    expect((await listed(viewer, eventId)).map((m) => m._id)).toEqual([owners]);
  });

  test("an archived experience takes no archiving", async () => {
    const { owner, eventId } = await setup();
    const { momentId } = await momentWithHidden(owner, eventId);
    await owner.mutation(api.api.events.update, { eventId, status: "archived" });
    await expect(
      owner.mutation(api.api.moments.setArchived, { momentId, archived: true }),
    ).rejects.toThrow(/archived/);
  });

  test("the count stays right when moments are deleted", async () => {
    const { owner, eventId } = await setup();
    const count = async () => (await owner.query(api.api.events.get, { eventId }))?.momentCount;
    const { momentId: kept } = await momentWithHidden(owner, eventId);
    const { momentId: archived } = await momentWithHidden(owner, eventId);
    const { momentId: gone } = await momentWithHidden(owner, eventId);
    await owner.mutation(api.api.moments.setArchived, { momentId: archived, archived: true });
    expect(await count()).toBe(2);

    // Deleting a live moment leaves the archived one out of the count still.
    await owner.mutation(api.api.moments.remove, { momentId: gone });
    expect(await count()).toBe(1);
    // Deleting the archived one changes nothing people see.
    await owner.mutation(api.api.moments.remove, { momentId: archived });
    expect(await count()).toBe(1);
    await owner.mutation(api.api.moments.remove, { momentId: kept });
    expect(await count()).toBe(0);
  });
});
