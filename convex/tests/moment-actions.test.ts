/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

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
  const eventId = await owner.mutation(api.events.createDraft, {});
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: helperId, grantedBy: ownerId, role: "contributor" }),
  );
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: viewerId, grantedBy: ownerId, role: "viewer" }),
  );
  return { t, eventId, owner, helper: as(helperId), viewer: as(viewerId) };
}

type Caller = Awaited<ReturnType<typeof setup>>["owner"];

function addMoment(who: Caller, eventId: Id<"events">, text = "first") {
  return who.mutation(api.moments.create, {
    eventId,
    startsAt: JUNE_1,
    tzOffsetMinutes: 0,
    place: "Lisbon",
    blocks: [{ type: "note", text }],
  });
}

async function readyPhoto(who: Caller, eventId: Id<"events">) {
  const { mediaId } = await who.mutation(api.media.reserveUpload, {
    eventId,
    size: 100,
    mime: "image/png",
  });
  await who.mutation(api.media.confirmUpload, { mediaId });
  return mediaId;
}

describe("moments.update", () => {
  test("the author can change text, place and time; the itinerary follows", async () => {
    const { owner, eventId } = await setup();
    const momentId = await addMoment(owner, eventId);
    await owner.mutation(api.moments.update, {
      momentId,
      startsAt: JUNE_3,
      tzOffsetMinutes: 0,
      place: "Porto",
      blocks: [{ type: "note", text: "edited" }],
    });

    const [moment] = await owner.query(api.moments.list, { eventId });
    expect(moment).toMatchObject({
      startsAt: JUNE_3,
      place: "Porto",
      blocks: [{ type: "note", text: "edited" }],
    });
    const days = await owner.query(api.itinerary.grouped, { eventId, groupBy: "day" });
    expect(days.map((g) => g.key)).toEqual(["2026-06-03"]);
    const places = await owner.query(api.itinerary.grouped, { eventId, groupBy: "place" });
    expect(places.map((g) => g.label)).toEqual(["Porto"]);
  });

  test("an empty place clears it", async () => {
    const { owner, eventId } = await setup();
    const momentId = await addMoment(owner, eventId);
    await owner.mutation(api.moments.update, { momentId, place: "" });
    const [moment] = await owner.query(api.moments.list, { eventId });
    expect(moment?.place).toBeUndefined();
    const places = await owner.query(api.itinerary.grouped, { eventId, groupBy: "place" });
    expect(places.map((g) => g.label)).toEqual(["No place"]);
  });

  test("edits are logged by field name, never by content", async () => {
    const { t, owner, eventId } = await setup();
    const momentId = await addMoment(owner, eventId);
    await owner.mutation(api.moments.update, {
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
      who.mutation(api.moments.update, { momentId, blocks: [{ type: "note", text: "x" }] });

    await expect(edit(viewer, ownersMoment)).rejects.toThrow();
    await expect(edit(helper, ownersMoment)).rejects.toThrow(/own moments/);
    await edit(helper, helpersMoment);
    await edit(owner, helpersMoment);
  });

  test("archived experiences can't be edited", async () => {
    const { owner, eventId } = await setup();
    const momentId = await addMoment(owner, eventId);
    await owner.mutation(api.events.update, { eventId, status: "archived" });
    await expect(
      owner.mutation(api.moments.update, { momentId, place: "x" }),
    ).rejects.toThrow(/ARCHIVED/);
  });

  test("dropping a photo detaches it and reports it for deletion", async () => {
    const { t, owner, eventId } = await setup();
    const photo = await readyPhoto(owner, eventId);
    const momentId = await owner.mutation(api.moments.create, {
      eventId,
      startsAt: JUNE_1,
      blocks: [{ type: "photo", mediaId: photo }, { type: "note", text: "hi" }],
    });
    const result = await owner.mutation(api.moments.update, {
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
    const momentId = await helper.mutation(api.moments.create, {
      eventId,
      startsAt: JUNE_1,
      blocks: [{ type: "photo", mediaId: photo }],
    });
    const result = await owner.mutation(api.moments.update, {
      momentId,
      blocks: [{ type: "photo", mediaId: photo }, { type: "note", text: "caption" }],
    });
    expect(result.removedMediaIds).toEqual([]);
  });
});
