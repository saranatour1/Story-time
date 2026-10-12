/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { MOMENT_LIMIT } from "../lib/limits";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(
    String.fromCharCode(...new Uint8Array(32).fill(7)),
  );
});

const JUNE_1 = Date.UTC(2026, 5, 1, 12);
const JUNE_3 = Date.UTC(2026, 5, 3, 12);

async function setup() {
  const t = convexTest(schema, modules);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, helperId, viewerId] = [await make(), await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.api.events.createDraft, {});
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: helperId, grantedBy: ownerId, role: "contributor" }),
  );
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: viewerId, grantedBy: ownerId, role: "viewer" }),
  );
  return { t, eventId, owner, ownerId, helper: as(helperId), helperId, viewer: as(viewerId) };
}

type Caller = Awaited<ReturnType<typeof setup>>["owner"];

function addMoment(who: Caller, eventId: Id<"events">, text = "first") {
  return who.mutation(api.api.moments.create, {
    eventId,
    startsAt: JUNE_1,
    tzOffsetMinutes: 0,
    place: "Lisbon",
    blocks: [{ type: "note", text }],
  });
}

async function readyPhoto(who: Caller, eventId: Id<"events">) {
  const { mediaId } = await who.mutation(api.api.media.reserveUpload, {
    eventId,
    size: 100,
    mime: "image/png",
  });
  await who.mutation(api.api.media.confirmUpload, { mediaId });
  return mediaId;
}

// The day a moment happened, in the zone it happened in.
const dayOf = (m: { startsAt: number; tzOffsetMinutes?: number }) =>
  new Date(m.startsAt + (m.tzOffsetMinutes ?? 0) * 60_000).toISOString().slice(0, 10);

describe("moments.update", () => {
  test("the author can change text, place and time", async () => {
    const { owner, eventId } = await setup();
    const momentId = await addMoment(owner, eventId);
    await owner.mutation(api.api.moments.update, {
      momentId,
      startsAt: JUNE_3,
      tzOffsetMinutes: 0,
      place: "Porto",
      blocks: [{ type: "note", text: "edited" }],
    });

    const [moment] = await owner.query(api.api.moments.list, { eventId });
    expect(moment).toMatchObject({
      startsAt: JUNE_3,
      place: "Porto",
      blocks: [{ type: "note", text: "edited" }],
    });
    expect(dayOf(moment!)).toBe("2026-06-03");
  });

  test("an empty place clears it", async () => {
    const { owner, eventId } = await setup();
    const momentId = await addMoment(owner, eventId);
    await owner.mutation(api.api.moments.update, { momentId, place: "" });
    const [moment] = await owner.query(api.api.moments.list, { eventId });
    expect(moment?.place).toBeUndefined();
  });

  test("edits are logged by field name, never by content", async () => {
    const { t, owner, eventId } = await setup();
    const momentId = await addMoment(owner, eventId);
    await owner.mutation(api.api.moments.update, {
      momentId,
      place: "Secret Cove",
      blocks: [{ type: "note", text: "secret words" }],
    });
    const rows = await t.run((ctx) => ctx.db.query("changes").collect());
    const edit = rows.find((r) => r.entity === "moment" && r.action === "update");
    expect([...(edit?.fields ?? [])].sort()).toEqual(["blocks", "place"]);
    expect(JSON.stringify(rows)).not.toMatch(/Secret Cove|secret words/);
  });

  test("viewers can't edit; contributors only their own; owners any", async () => {
    const { owner, helper, viewer, eventId } = await setup();
    const ownersMoment = await addMoment(owner, eventId);
    const helpersMoment = await addMoment(helper, eventId, "helper's");
    const edit = (who: Caller, momentId: Id<"moments">) =>
      who.mutation(api.api.moments.update, { momentId, blocks: [{ type: "note", text: "x" }] });

    await expect(edit(viewer, ownersMoment)).rejects.toThrow();
    await expect(edit(helper, ownersMoment)).rejects.toThrow(/own moments/);
    await edit(helper, helpersMoment);
    await edit(owner, helpersMoment);
  });

  test("archived experiences can't be edited", async () => {
    const { owner, eventId } = await setup();
    const momentId = await addMoment(owner, eventId);
    await owner.mutation(api.api.events.update, { eventId, status: "archived" });
    await expect(
      owner.mutation(api.api.moments.update, { momentId, place: "x" }),
    ).rejects.toThrow(/ARCHIVED/);
  });

  test("dropping a photo detaches it and reports it for deletion", async () => {
    const { t, owner, eventId } = await setup();
    const photo = await readyPhoto(owner, eventId);
    const momentId = await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: JUNE_1,
      blocks: [{ type: "photo", mediaId: photo }, { type: "note", text: "hi" }],
    });
    const result = await owner.mutation(api.api.moments.update, {
      momentId,
      blocks: [{ type: "note", text: "hi" }],
    });
    expect(result.removedMediaIds).toEqual([photo]);
    const media = await t.run((ctx) => ctx.db.get("media", photo));
    expect(media?.momentId).toBeUndefined();
  });

  test("an owner editing a contributor's moment keeps their photo", async () => {
    const { owner, helper, eventId } = await setup();
    const photo = await readyPhoto(helper, eventId);
    const momentId = await helper.mutation(api.api.moments.create, {
      eventId,
      startsAt: JUNE_1,
      blocks: [{ type: "photo", mediaId: photo }],
    });
    const result = await owner.mutation(api.api.moments.update, {
      momentId,
      blocks: [{ type: "photo", mediaId: photo }, { type: "note", text: "caption" }],
    });
    expect(result.removedMediaIds).toEqual([]);
  });
});

describe("moments.remove", () => {
  test("removes the moment and frees a slot", async () => {
    const { t, owner, eventId } = await setup();
    // Counted up to ten short of the limit, then ten added: adding one by one
    // up to the limit would make the test slow.
    await t.run((ctx) => ctx.db.patch("events", eventId, { momentCount: MOMENT_LIMIT - 10 }));
    for (let i = 0; i < 10; i++) await addMoment(owner, eventId, `m${i}`);
    await expect(addMoment(owner, eventId)).rejects.toThrow(/MOMENT_LIMIT/);

    const [first] = await owner.query(api.api.moments.list, { eventId });
    await owner.mutation(api.api.moments.remove, { momentId: first!._id });

    expect((await owner.query(api.api.events.get, { eventId }))?.momentCount).toBe(MOMENT_LIMIT - 1);
    await addMoment(owner, eventId, "fits again");
  });

  test("an experience holding more than the limit (from before it) lists every moment", async () => {
    const { t, owner, ownerId, eventId } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i <= MOMENT_LIMIT; i++) await ctx.db.insert("moments", { eventId, authorId: ownerId, startsAt: i, blocks: [] });
      await ctx.db.patch("events", eventId, { momentCount: MOMENT_LIMIT + 1 });
    });
    expect(await owner.query(api.api.moments.list, { eventId })).toHaveLength(MOMENT_LIMIT + 1);
    await expect(addMoment(owner, eventId)).rejects.toThrow(/MOMENT_LIMIT/);
  });

  test("returns the moment's photos and detaches them", async () => {
    const { t, owner, eventId } = await setup();
    const photo = await readyPhoto(owner, eventId);
    const momentId = await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: JUNE_1,
      blocks: [{ type: "photo", mediaId: photo }],
    });
    const result = await owner.mutation(api.api.moments.remove, { momentId });
    expect(result.removedMediaIds).toEqual([photo]);
    expect((await t.run((ctx) => ctx.db.get("media", photo)))?.momentId).toBeUndefined();
  });

  test("contributors remove only their own; viewers none", async () => {
    const { owner, helper, viewer, eventId } = await setup();
    const ownersMoment = await addMoment(owner, eventId);
    const helpersMoment = await addMoment(helper, eventId);
    await expect(viewer.mutation(api.api.moments.remove, { momentId: helpersMoment })).rejects.toThrow();
    await expect(helper.mutation(api.api.moments.remove, { momentId: ownersMoment })).rejects.toThrow(/own moments/);
    await helper.mutation(api.api.moments.remove, { momentId: helpersMoment });
  });

  test("removal is logged and blocked on archived experiences", async () => {
    const { t, owner, eventId } = await setup();
    const a = await addMoment(owner, eventId);
    const b = await addMoment(owner, eventId);
    await owner.mutation(api.api.moments.remove, { momentId: a });
    const rows = await t.run((ctx) => ctx.db.query("changes").collect());
    expect(rows.some((r) => r.entity === "moment" && r.action === "delete" && r.entityId === a)).toBe(true);

    await owner.mutation(api.api.events.update, { eventId, status: "archived" });
    await expect(owner.mutation(api.api.moments.remove, { momentId: b })).rejects.toThrow(/ARCHIVED/);
  });
});

describe("deleting experience photos", () => {
  test("an unattached photo can be deleted by its uploader or the owner", async () => {
    const { owner, helper, viewer, eventId } = await setup();
    const photo = await readyPhoto(helper, eventId);
    expect(await helper.query(api.api.media.getForDelete, { mediaId: photo })).not.toBeNull();
    expect(await owner.query(api.api.media.getForDelete, { mediaId: photo })).not.toBeNull();
    expect(await viewer.query(api.api.media.getForDelete, { mediaId: photo })).toBeNull();
  });

  test("a photo still on a moment can't be deleted", async () => {
    const { owner, eventId } = await setup();
    const photo = await readyPhoto(owner, eventId);
    await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: JUNE_1,
      blocks: [{ type: "photo", mediaId: photo }],
    });
    expect(await owner.query(api.api.media.getForDelete, { mediaId: photo })).toBeNull();
    await expect(owner.mutation(api.api.media.markDeleted, { mediaId: photo })).rejects.toThrow();
  });

  test("taking someone else's photo off a moment doesn't make it yours to delete", async () => {
    const { owner, helper, eventId } = await setup();
    const momentId = await addMoment(helper, eventId);
    const photo = await readyPhoto(owner, eventId);
    await owner.mutation(api.api.moments.update, {
      momentId,
      blocks: [{ type: "note", text: "first" }, { type: "photo", mediaId: photo }],
    });
    const { removedMediaIds } = await helper.mutation(api.api.moments.update, {
      momentId,
      blocks: [{ type: "note", text: "first" }],
    });
    expect(removedMediaIds).toEqual([photo]);
    // Only the uploader, or the experience owner, may delete it.
    expect(await helper.query(api.api.media.getForDelete, { mediaId: photo })).toBeNull();
    expect(await owner.query(api.api.media.getForDelete, { mediaId: photo })).not.toBeNull();
  });

  test("whoever uploaded a photo can delete it once it is off their moment", async () => {
    const { helper, eventId } = await setup();
    const momentId = await addMoment(helper, eventId);
    const photo = await readyPhoto(helper, eventId);
    await helper.mutation(api.api.moments.update, {
      momentId,
      blocks: [{ type: "note", text: "first" }, { type: "photo", mediaId: photo }],
    });
    await helper.mutation(api.api.moments.update, {
      momentId,
      blocks: [{ type: "note", text: "first" }],
    });
    expect(await helper.query(api.api.media.getForDelete, { mediaId: photo })).not.toBeNull();
  });

  test("losing contributor access ends the right to delete an unattached photo", async () => {
    const { t, owner, helper, helperId, eventId } = await setup();
    const photo = await readyPhoto(helper, eventId);
    const session = await t.run((ctx) =>
      ctx.db
        .query("sessions")
        .withIndex("by_event_and_user", (q) => q.eq("eventId", eventId).eq("userId", helperId))
        .unique(),
    );
    await owner.mutation(api.api.sessions.revoke, { sessionId: session!._id });
    expect(await helper.query(api.api.media.getForDelete, { mediaId: photo })).toBeNull();
    await expect(helper.mutation(api.api.media.markDeleted, { mediaId: photo })).rejects.toThrow();
  });

  test("after markDeleted the photo is gone for everyone", async () => {
    const { owner, helper, viewer, eventId } = await setup();
    const photo = await readyPhoto(helper, eventId);
    await expect(viewer.mutation(api.api.media.markDeleted, { mediaId: photo })).rejects.toThrow();
    await owner.mutation(api.api.media.markDeleted, { mediaId: photo });
    expect(await helper.query(api.api.media.getForDownload, { mediaId: photo })).toBeNull();
    expect(await owner.query(api.api.media.getForDelete, { mediaId: photo })).toBeNull();
  });
});

describe("journeys: stops, labels, transport and video", () => {
  test("stops, labels and transport round-trip, encrypted at rest", async () => {
    const { t, owner, eventId } = await setup();
    const momentId = await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: JUNE_1,
      place: "Lisbon",
      transport: "plane",
      blocks: [{ type: "note", text: "landed" }],
      stops: [{ place: "Sintra", transport: "train", startsAt: JUNE_3, blocks: [] }],
      labels: ["food", " food ", "museum"],
    });
    const [m] = await owner.query(api.api.moments.list, { eventId });
    expect(m?.transport).toBe("plane");
    expect(m?.stops).toEqual([{ place: "Sintra", transport: "train", startsAt: JUNE_3, blocks: [] }]);
    expect(m?.labels).toEqual(["food", "museum"]);
    const raw = await t.run((ctx) => ctx.db.get("moments", momentId));
    expect(JSON.stringify(raw)).not.toContain("Sintra");
    expect(JSON.stringify(raw)).not.toContain("museum");
  });

  test("a stop needs a place or content; a moment needs some content", async () => {
    const { owner, eventId } = await setup();
    await expect(
      owner.mutation(api.api.moments.create, {
        eventId,
        startsAt: JUNE_1,
        blocks: [{ type: "note", text: "hi" }],
        stops: [{ blocks: [] }],
      }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.api.moments.create, {
        eventId,
        startsAt: JUNE_1,
        blocks: [],
        stops: [{ place: "Sintra", blocks: [] }],
      }),
    ).rejects.toThrow();
  });

  test("media on later stops attaches, and dropping a stop detaches it", async () => {
    const { t, owner, eventId } = await setup();
    const photo = await readyPhoto(owner, eventId);
    const momentId = await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: JUNE_1,
      blocks: [{ type: "note", text: "start" }],
      stops: [{ place: "Sintra", blocks: [{ type: "photo", mediaId: photo }] }],
    });
    expect((await t.run((ctx) => ctx.db.get("media", photo)))?.momentId).toBe(momentId);
    const { removedMediaIds } = await owner.mutation(api.api.moments.update, { momentId, stops: [] });
    expect(removedMediaIds).toEqual([photo]);
    expect((await t.run((ctx) => ctx.db.get("media", photo)))?.momentId).toBeUndefined();
  });

  test("videos upload up to 50 MB and only fit video blocks", async () => {
    const { owner, eventId } = await setup();
    const { mediaId: video } = await owner.mutation(api.api.media.reserveUpload, {
      eventId,
      size: 40 * 1024 * 1024,
      mime: "video/mp4",
    });
    await owner.mutation(api.api.media.confirmUpload, { mediaId: video });
    await expect(
      owner.mutation(api.api.media.reserveUpload, { eventId, size: 60 * 1024 * 1024, mime: "video/mp4" }),
    ).rejects.toThrow("50 MB");
    await expect(
      owner.mutation(api.api.moments.create, {
        eventId,
        startsAt: JUNE_1,
        blocks: [{ type: "photo", mediaId: video }],
      }),
    ).rejects.toThrow();
    await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: JUNE_1,
      blocks: [{ type: "video", mediaId: video }],
    });
  });
});

describe("map coordinates", () => {
  const LISBON = { lat: 38.7223, lng: -9.1393 };
  const SINTRA = { lat: 38.8029, lng: -9.3817 };

  function addPinned(who: Caller, eventId: Id<"events">) {
    return who.mutation(api.api.moments.create, {
      eventId,
      startsAt: JUNE_1,
      place: "Lisbon",
      geo: LISBON,
      blocks: [{ type: "note", text: "landed" }],
      stops: [{ place: "Sintra", geo: SINTRA, blocks: [] }],
    });
  }

  test("each stop's coordinates round-trip, encrypted at rest and in the log", async () => {
    const { t, owner, eventId } = await setup();
    const momentId = await addPinned(owner, eventId);
    const [m] = await owner.query(api.api.moments.list, { eventId });
    expect(m?.geo).toEqual(LISBON);
    expect(m?.stops.map((s) => s.geo)).toEqual([SINTRA]);

    const raw = await t.run((ctx) => ctx.db.get("moments", momentId));
    expect(raw?.geo).toMatchObject({ iv: expect.any(String), ct: expect.any(String) });
    expect(raw?.stops?.[0]?.geo).toMatchObject({ ct: expect.any(String) });
    const changes = await t.run((ctx) => ctx.db.query("changes").collect());
    for (const dump of [JSON.stringify(raw), JSON.stringify(changes)]) {
      expect(dump).not.toMatch(/38\.7223|9\.1393|38\.8029|9\.3817/);
    }
    expect(changes.find((r) => r.entity === "moment")?.fields).toContain("geo");
  });

  test("a new place without coordinates clears them; other edits keep them", async () => {
    const { owner, eventId } = await setup();
    const momentId = await addPinned(owner, eventId);

    // `geo` without `place` is ignored.
    await owner.mutation(api.api.moments.update, { momentId, startsAt: JUNE_3, geo: SINTRA });
    let [m] = await owner.query(api.api.moments.list, { eventId });
    expect(m?.geo).toEqual(LISBON);

    await owner.mutation(api.api.moments.update, { momentId, place: "Porto", geo: SINTRA });
    [m] = await owner.query(api.api.moments.list, { eventId });
    expect(m?.geo).toEqual(SINTRA);

    await owner.mutation(api.api.moments.update, { momentId, place: "Somewhere else" });
    [m] = await owner.query(api.api.moments.list, { eventId });
    expect(m).toMatchObject({ place: "Somewhere else" });
    expect(m?.geo).toBeUndefined();
    expect(m?.stops[0]?.geo).toEqual(SINTRA);

    // Stops are replaced wholesale, coordinates and all.
    await owner.mutation(api.api.moments.update, { momentId, stops: [{ place: "Sintra", blocks: [] }] });
    [m] = await owner.query(api.api.moments.list, { eventId });
    expect(m?.stops[0]?.geo).toBeUndefined();
  });

  test("coordinates must be on the map and come with a place", async () => {
    const { owner, eventId } = await setup();
    const create = (geo: { lat: number; lng: number }, place?: string) =>
      owner.mutation(api.api.moments.create, {
        eventId,
        startsAt: JUNE_1,
        place,
        geo,
        blocks: [{ type: "note", text: "x" }],
      });
    await expect(create({ lat: 91, lng: 0 }, "Pole")).rejects.toThrow(/"field":"geo"/);
    await expect(create({ lat: 0, lng: -180.5 }, "Dateline")).rejects.toThrow(/"field":"geo"/);
    await expect(create({ lat: NaN, lng: 0 }, "Nowhere")).rejects.toThrow(/"field":"geo"/);
    await expect(create(LISBON)).rejects.toThrow(/"field":"geo"/);
    await expect(create(LISBON, "  ")).rejects.toThrow(/"field":"geo"/);
    await expect(
      owner.mutation(api.api.moments.create, {
        eventId,
        startsAt: JUNE_1,
        blocks: [{ type: "note", text: "x" }],
        stops: [{ place: "Sintra", geo: { lat: -90.01, lng: 0 }, blocks: [] }],
      }),
    ).rejects.toThrow(/"field":"stops\.0\.geo"/);

    const momentId = await create({ lat: -90, lng: 180 }, "Edge of the world");
    await expect(
      owner.mutation(api.api.moments.update, { momentId, place: "Porto", geo: { lat: 100, lng: 0 } }),
    ).rejects.toThrow(/"field":"geo"/);
    await expect(
      owner.mutation(api.api.moments.update, { momentId, place: "", geo: LISBON }),
    ).rejects.toThrow(/"field":"geo"/);
  });
});

describe("the zone a moment happened in", () => {
  // 22:15 UTC on 8 November is 07:15 on 9 November in Japan (UTC+9).
  const KYOTO_MORNING = Date.UTC(2025, 10, 8, 22, 15);

  test("is kept with the moment, and its day follows it", async () => {
    const { owner, eventId } = await setup();
    await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: KYOTO_MORNING,
      tzOffsetMinutes: 540,
      place: "Kyoto",
      blocks: [{ type: "note", text: "Fushimi Inari" }],
    });
    const [moment] = await owner.query(api.api.moments.list, { eventId });
    expect(moment?.tzOffsetMinutes).toBe(540);
    expect(dayOf(moment!)).toBe("2025-11-09");
  });

  test("an edit can set a new offset; the day follows", async () => {
    const { owner, eventId } = await setup();
    const momentId = await addMoment(owner, eventId);
    await owner.mutation(api.api.moments.update, {
      momentId,
      startsAt: KYOTO_MORNING,
      tzOffsetMinutes: 540,
    });
    const [moment] = await owner.query(api.api.moments.list, { eventId });
    expect(moment?.tzOffsetMinutes).toBe(540);
    expect(dayOf(moment!)).toBe("2025-11-09");
  });

  test("moving a time without an offset keeps the one the moment has", async () => {
    const { owner, eventId } = await setup();
    const momentId = await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: KYOTO_MORNING,
      tzOffsetMinutes: 540,
      blocks: [{ type: "note", text: "Fushimi Inari" }],
    });
    // An hour earlier is 21:15 UTC on the 8th, still the 9th in Japan.
    await owner.mutation(api.api.moments.update, { momentId, startsAt: KYOTO_MORNING - 3_600_000 });
    const [moment] = await owner.query(api.api.moments.list, { eventId });
    expect(moment?.tzOffsetMinutes).toBe(540);
    expect(dayOf(moment!)).toBe("2025-11-09");
  });

  test("an offset alone is stored with no edit mark and no change log row", async () => {
    const { t, owner, eventId } = await setup();
    const momentId = await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: KYOTO_MORNING,
      tzOffsetMinutes: 0,
      blocks: [{ type: "note", text: "Fushimi Inari" }],
    });
    // Pages are cut after the moment, and each one is its own activity row.
    await t.finishAllScheduledFunctions(() => undefined);
    const logBefore = (await t.run((ctx) => ctx.db.query("changes").take(500))).length;
    expect(dayOf((await owner.query(api.api.moments.list, { eventId }))[0]!)).toBe("2025-11-08");

    await owner.mutation(api.api.moments.update, { momentId, startsAt: KYOTO_MORNING, tzOffsetMinutes: 540 });
    const [moment] = await owner.query(api.api.moments.list, { eventId });
    expect(moment).toMatchObject({ startsAt: KYOTO_MORNING, tzOffsetMinutes: 540 });
    expect(moment?.editedAt).toBeUndefined();
    const logAfter = (await t.run((ctx) => ctx.db.query("changes").take(500))).length;
    expect(logAfter).toBe(logBefore);
    expect(dayOf(moment!)).toBe("2025-11-09");
  });

  test("an offset outside UTC-12 to UTC+14 is a bad request", async () => {
    const { owner, eventId } = await setup();
    const momentId = await addMoment(owner, eventId);
    for (const tzOffsetMinutes of [841, -721, NaN]) {
      await expect(
        owner.mutation(api.api.moments.create, {
          eventId,
          startsAt: JUNE_1,
          tzOffsetMinutes,
          blocks: [{ type: "note", text: "x" }],
        }),
      ).rejects.toThrow(/"field":"tzOffsetMinutes"/);
      await expect(
        owner.mutation(api.api.moments.update, { momentId, tzOffsetMinutes }),
      ).rejects.toThrow(/"field":"tzOffsetMinutes"/);
    }
    // Both ends of the range are real clocks.
    for (const tzOffsetMinutes of [840, -720]) {
      await owner.mutation(api.api.moments.create, {
        eventId,
        startsAt: JUNE_1,
        tzOffsetMinutes,
        blocks: [{ type: "note", text: "x" }],
      });
    }
  });
});
