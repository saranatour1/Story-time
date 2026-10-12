/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import {
  allowsRemoval,
  fromLocal,
  localOf,
  orderOps,
  promptFor,
  readVerdict,
  resolvePlan,
  type Op,
  type RawPlan,
} from "../model/ai/command";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { rateLimiter } from "../lib/rateLimit";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});

const CET = 60;
// Thu 20 Feb 2025, 17:29 in Amman (UTC+3).
const AMMAN = 3 * 60;
const FLIGHT = Date.UTC(2025, 1, 20, 14, 29);

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
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
  // The flight has a second stop; the helper adds a moment of their own.
  const flight = await owner.mutation(api.api.moments.create, {
    eventId,
    startsAt: FLIGHT,
    tzOffsetMinutes: AMMAN,
    place: "Queen Alia Airport",
    blocks: [{ type: "note", text: "Off we go" }],
    transport: "plane",
    stops: [{ place: "Istanbul", blocks: [{ type: "note", text: "Layover" }] }],
    labels: ["travel"],
  });
  const helper = as(helperId);
  const theirs = await helper.mutation(api.api.moments.create, {
    eventId,
    startsAt: FLIGHT + 24 * 3_600_000,
    tzOffsetMinutes: CET,
    place: "Hanover",
    blocks: [{ type: "note", text: "Arrived" }],
  });
  const list = () => owner.query(api.api.moments.list, { eventId });
  return { t, eventId, ownerId, helperId, owner, helper, viewer: as(viewerId), flight, theirs, list };
}

describe("reading a local time", () => {
  test("a bare date keeps the clock, and the zone decides the instant", () => {
    expect(fromLocal("2025-02-21", AMMAN, "17:29")).toBe(Date.UTC(2025, 1, 21, 14, 29));
    expect(fromLocal("2025-02-21T09:00", CET, "17:29")).toBe(Date.UTC(2025, 1, 21, 8, 0));
  });

  test("a date that doesn't exist is refused", () => {
    expect(fromLocal("2025-02-31", 0, "12:00")).toBeUndefined();
    expect(fromLocal("2025-13-01T10:00", 0, "12:00")).toBeUndefined();
  });

  test("localOf is the reverse", () => {
    expect(localOf(FLIGHT, AMMAN)).toBe("2025-02-20T17:29");
  });
});

describe("Jev's verdict", () => {
  test("a choice counts only with even odds", () => {
    const confident = readVerdict({
      intent: { type: "choice", choice: "change", probabilities: { change: 0.8, new: 0.2 } },
      removes: { type: "boolean", probability: 0.1 },
    });
    expect(confident).toEqual({ intent: "change", removes: 0.1 });
    const torn = readVerdict({ intent: { type: "choice", choice: "new", probabilities: { new: 0.4, change: 0.4 } } });
    expect(torn.intent).toBeUndefined();
    expect(readVerdict({})).toEqual({ intent: undefined, removes: undefined });
  });

  test("a removal needs Jev's yes; without an answer the words decide", () => {
    expect(allowsRemoval({ intent: "change", removes: 0.2 }, "delete the stop")).toBe(false);
    expect(allowsRemoval({ intent: "change", removes: 0.9 }, "make it shorter")).toBe(true);
    expect(allowsRemoval({ intent: undefined, removes: undefined }, "delete the Hanover stop")).toBe(true);
    expect(allowsRemoval({ intent: undefined, removes: undefined }, "move it to Friday")).toBe(false);
  });
});

describe("turning a plan into operations", () => {
  const ctxOf = async () => {
    const { owner, eventId, flight, theirs, helperId } = await setup();
    // `read` is what the models see; the test reads it as the owner would.
    const found = await owner.query(internal.model.ai.command.read, { eventId, openMomentId: flight });
    return { found, flight, theirs, helperId };
  };
  const raw = (ops: RawPlan["ops"]): RawPlan => ({ summary: "x", ops });

  test("the context lists moments in order and marks what is open and changeable", async () => {
    const { found, flight } = await ctxOf();
    expect(found.moments.map((m) => m.place)).toEqual(["Queen Alia Airport", "Hanover"]);
    expect(found.open).toBe(0);
    expect(found.zone).toBe(AMMAN);
    expect(found.moments.every((m) => m.editable)).toBe(true); // the owner may change anything
    expect(found.moments[0]?.id).toBe(flight);
    expect(found.moments[0]?.stops).toEqual([{ startsAt: undefined, place: "Istanbul", transport: undefined }]);
  });

  test("a date alone keeps the moment's clock, in the moment's own zone", async () => {
    const { found, flight } = await ctxOf();
    const { ops, needs } = resolvePlan(raw([{ op: "edit", moment: 1, when: "2025-02-21" }]), found, {
      removesOk: false,
      zone: 0,
    });
    expect(needs).toBeUndefined();
    expect(ops).toEqual([
      expect.objectContaining({ op: "edit", momentId: flight, stop: 1, startsAt: Date.UTC(2025, 1, 21, 14, 29) }),
    ]);
  });

  test("a moment that isn't in the list, or has no change, is dropped with a reason", async () => {
    const { found } = await ctxOf();
    const { ops, needs } = resolvePlan(
      raw([{ op: "edit", moment: 9, place: "Berlin" }, { op: "edit", moment: 1 }]),
      found,
      { removesOk: false, zone: 0 },
    );
    expect(ops).toEqual([]);
    expect(needs).toContain("which moment");
  });

  test("a removal is left out unless Jev agreed, and says so", async () => {
    const { found } = await ctxOf();
    const plan = raw([{ op: "remove", moment: 2 }]);
    expect(resolvePlan(plan, found, { removesOk: false, zone: 0 })).toEqual({
      ops: [],
      needs: expect.stringContaining("left out a removal"),
    });
    expect(resolvePlan(plan, found, { removesOk: true, zone: 0 }).ops).toHaveLength(1);
  });

  test("stop 1 can't be removed on its own, and stops past the end don't exist", async () => {
    const { found } = await ctxOf();
    const { ops, needs } = resolvePlan(
      raw([{ op: "remove", moment: 1, stop: 1 }, { op: "remove", moment: 1, stop: 5 }]),
      found,
      { removesOk: true, zone: 0 },
    );
    expect(ops).toEqual([]);
    expect(needs).toContain("remove the moment");
  });

  test("one change to a moment's stops per request, and nothing else on a moment that goes", async () => {
    const { found, theirs } = await ctxOf();
    const { ops } = resolvePlan(
      raw([
        { op: "addStop", moment: 1, place: "Berlin" },
        { op: "addStop", moment: 1, place: "Munich" },
        { op: "edit", moment: 2, place: "Hannover" },
        { op: "remove", moment: 2 },
      ]),
      found,
      { removesOk: true, zone: 0 },
    );
    expect(ops.map((o) => [o.op, o.place ?? null, o.momentId === theirs])).toEqual([
      ["addStop", "Berlin", false],
      ["remove", null, true],
    ]);
  });

  test("a plan longer than the limit is cut, not refused", async () => {
    const { found } = await ctxOf();
    const many = raw(Array.from({ length: 12 }, (_, i) => ({ op: "add" as const, note: `Note ${i}` })));
    const { ops, needs } = resolvePlan(many, found, { removesOk: false, zone: 0 });
    expect(ops).toHaveLength(8);
    expect(needs).toContain("first 8");
  });

  test("a new moment needs a note; a new stop needs a place or a note", async () => {
    const { found } = await ctxOf();
    const { ops, needs } = resolvePlan(
      raw([{ op: "add", place: "Cologne" }, { op: "addStop", moment: 1, transport: "train" }]),
      found,
      { removesOk: false, zone: 0 },
    );
    expect(ops).toEqual([]);
    expect(needs).toContain("few words");
  });

  test("operations run new moments first and whole moments last", () => {
    const ops: Op[] = [
      { op: "remove" },
      { op: "remove", stop: 2 },
      { op: "addStop" },
      { op: "edit" },
      { op: "add" },
    ];
    expect(orderOps(ops).map((o) => (o.op === "remove" ? `remove${o.stop ?? ""}` : o.op))).toEqual([
      "add",
      "edit",
      "addStop",
      "remove2",
      "remove",
    ]);
  });

  test("the prompt says what is open, and flags moments that aren't the person's", async () => {
    const { found } = await ctxOf();
    const text = promptFor({ ...found, moments: found.moments.map((m, i) => ({ ...m, editable: i === 0 })) }, "move this", FLIGHT, AMMAN);
    expect(text).toContain("Open on screen: moment 1");
    expect(text).toContain("1) Queen Alia Airport (by plane), 2) Istanbul");
    expect(text).toContain("(not yours to change)");
    expect(text).toContain("The person says: move this");
  });
});

describe("who can ask", () => {
  test("a helper sees the owner's moment as not theirs to change; a viewer can't ask", async () => {
    const { helper, viewer, eventId } = await setup();
    const found = await helper.query(internal.model.ai.command.read, { eventId });
    expect(found.moments.map((m) => [m.place, m.editable])).toEqual([
      ["Queen Alia Airport", false],
      ["Hanover", true],
    ]);
    await expect(viewer.query(internal.model.ai.command.read, { eventId })).rejects.toThrow();
  });

  test("a request is refused before any model when it is empty, too long, or the allowance is spent", async () => {
    const { owner, ownerId, eventId, t } = await setup();
    const ask = (text: string) => owner.action(api.api.ai.command.propose, { eventId, text, zone: 0 });
    await expect(ask("   ")).rejects.toThrow("Say what to add or change");
    await expect(ask("x".repeat(601))).rejects.toThrow("under 600");
    for (let i = 0; i < 60; i++) await t.run((ctx) => rateLimiter.limit(ctx, "command", { key: ownerId }));
    await expect(ask("move this to Friday")).rejects.toThrow("a lot of requests");
  });
});

describe("applying a plan", () => {
  test("add, edit and add a stop land together", async () => {
    const { owner, eventId, flight, list } = await setup();
    const out = await owner.mutation(api.api.ai.command.apply, {
      eventId,
      ops: [
        { op: "addStop", momentId: flight, place: "Hanover", transport: "plane", note: "Landed", after: 1 },
        { op: "edit", momentId: flight, stop: 1, startsAt: FLIGHT + 3_600_000, labels: ["travel", "flight"], note: "Gate 24" },
        { op: "add", startsAt: FLIGHT + 5 * 24 * 3_600_000, tzOffsetMinutes: CET, place: "Berlin", note: "Museum day" },
      ],
    });
    expect(out.summary).toBe("1 added, 2 changed");
    expect(out.created).toHaveLength(1);

    const moments = await list();
    expect(moments.map((m) => m.place)).toEqual(["Queen Alia Airport", "Hanover", "Berlin"]);
    const first = moments[0]!;
    expect(first.startsAt).toBe(FLIGHT + 3_600_000);
    expect(first.labels).toEqual(["travel", "flight"]);
    expect(first.blocks.map((b) => b.type === "note" && b.text)).toEqual(["Off we go", "Gate 24"]);
    expect(first.tzOffsetMinutes).toBe(AMMAN); // a new time keeps the moment's zone
    // "after stop 1" puts the new stop right behind the first one.
    expect(first.stops.map((s) => s.place)).toEqual(["Hanover", "Istanbul"]);
    expect(first.stops[0]?.transport).toBe("plane");
  });

  test("a stop can be removed, but not the same moment's stops twice in one request", async () => {
    const { owner, eventId, flight, list } = await setup();
    await expect(
      owner.mutation(api.api.ai.command.apply, {
        eventId,
        ops: [
          { op: "remove", momentId: flight, stop: 2 },
          { op: "addStop", momentId: flight, place: "Hanover" },
        ],
      }),
    ).rejects.toThrow("one set of stops");
    await owner.mutation(api.api.ai.command.apply, { eventId, ops: [{ op: "remove", momentId: flight, stop: 2 }] });
    expect((await list())[0]!.stops).toEqual([]);
  });

  test("a stop's own fields can change, and a new place without a pin drops the old one", async () => {
    const { owner, eventId, flight, list } = await setup();
    await owner.mutation(api.api.ai.command.apply, {
      eventId,
      ops: [{ op: "edit", momentId: flight, stop: 2, place: "Sabiha Gökçen", transport: "bus", note: "Waited" }],
    });
    const stop = (await list())[0]!.stops[0]!;
    expect(stop.place).toBe("Sabiha Gökçen");
    expect(stop.transport).toBe("bus");
    expect(stop.blocks.map((b) => b.type === "note" && b.text)).toEqual(["Layover", "Waited"]);
  });

  test("it is all or nothing: one bad operation undoes the others", async () => {
    const { owner, eventId, flight, theirs, list, t } = await setup();
    await owner.mutation(api.api.moments.remove, { momentId: theirs });
    await expect(
      owner.mutation(api.api.ai.command.apply, {
        eventId,
        ops: [
          { op: "edit", momentId: flight, place: "Somewhere else" },
          { op: "edit", momentId: theirs, place: "Gone already" },
        ],
      }),
    ).rejects.toThrow("no longer exists");
    expect((await list())[0]!.place).toBe("Queen Alia Airport");
    expect(await t.run((ctx) => ctx.db.query("changes").take(100).then((c) => c.filter((x) => x.action === "update")))).toHaveLength(0);
  });

  test("two new moments in one request both count toward the experience", async () => {
    const { owner, eventId, list } = await setup();
    const before = (await owner.query(api.api.events.get, { eventId }))!.momentCount;
    await owner.mutation(api.api.ai.command.apply, {
      eventId,
      ops: [
        { op: "add", note: "One" },
        { op: "add", note: "Two" },
      ],
    });
    expect((await owner.query(api.api.events.get, { eventId }))!.momentCount).toBe(before + 2);
    expect(await list()).toHaveLength(4);
  });

  test("removing a moment deletes it and counts it out", async () => {
    const { owner, eventId, theirs, list } = await setup();
    const out = await owner.mutation(api.api.ai.command.apply, { eventId, ops: [{ op: "remove", momentId: theirs }] });
    expect(out.removedMediaIds).toEqual([]);
    expect((await list()).map((m) => m.place)).toEqual(["Queen Alia Airport"]);
    expect((await owner.query(api.api.events.get, { eventId }))!.momentCount).toBe(1);
  });

  test("a helper may change their own moment but not the owner's", async () => {
    const { helper, eventId, flight, theirs, list } = await setup();
    await helper.mutation(api.api.ai.command.apply, { eventId, ops: [{ op: "edit", momentId: theirs, place: "Hannover" }] });
    expect((await list())[1]!.place).toBe("Hannover");
    await expect(
      helper.mutation(api.api.ai.command.apply, { eventId, ops: [{ op: "edit", momentId: flight, place: "Nope" }] }),
    ).rejects.toThrow("only change moments you added");
    await expect(
      helper.mutation(api.api.ai.command.apply, { eventId, ops: [{ op: "remove", momentId: flight }] }),
    ).rejects.toThrow("only change moments you added");
  });

  test("a viewer can't apply anything, and neither can anyone on an archived experience", async () => {
    const { viewer, owner, eventId, flight, t } = await setup();
    await expect(
      viewer.mutation(api.api.ai.command.apply, { eventId, ops: [{ op: "add", note: "hi" }] }),
    ).rejects.toThrow();
    await t.run((ctx) => ctx.db.patch("events", eventId, { status: "archived" }));
    await expect(
      owner.mutation(api.api.ai.command.apply, { eventId, ops: [{ op: "edit", momentId: flight, place: "x" }] }),
    ).rejects.toThrow();
  });

  test("a moment from another experience is refused", async () => {
    const { owner, eventId } = await setup();
    const otherEvent = await owner.mutation(api.api.events.createDraft, {});
    const stray = await owner.mutation(api.api.moments.create, {
      eventId: otherEvent,
      startsAt: FLIGHT,
      blocks: [{ type: "note", text: "elsewhere" }],
    });
    await expect(
      owner.mutation(api.api.ai.command.apply, { eventId, ops: [{ op: "remove", momentId: stray }] }),
    ).rejects.toThrow("no longer exists");
  });

  test("empty, oversized and contradictory requests are refused", async () => {
    const { owner, eventId, flight } = await setup();
    await expect(owner.mutation(api.api.ai.command.apply, { eventId, ops: [] })).rejects.toThrow("nothing to apply");
    await expect(
      owner.mutation(api.api.ai.command.apply, { eventId, ops: Array.from({ length: 9 }, () => ({ op: "add" as const, note: "n" })) }),
    ).rejects.toThrow("at most 8");
    await expect(
      owner.mutation(api.api.ai.command.apply, {
        eventId,
        ops: [{ op: "edit", momentId: flight, place: "x" }, { op: "remove", momentId: flight }],
      }),
    ).rejects.toThrow("changed and removed");
    await expect(
      owner.mutation(api.api.ai.command.apply, { eventId, ops: [{ op: "add", place: "no words" }] }),
    ).rejects.toThrow();
  });
});
