/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import emailSchema from "../components/email/schema";
import invitesSchema from "../components/invites/schema";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);
const invitesModules = import.meta.glob(["../components/invites/**/*.ts", "../components/invites/**/*.js"]);
const emailModules = import.meta.glob(["../components/email/**/*.ts", "../components/email/**/*.js"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});

const at = { x: 0, y: 0, w: 100, h: 80 };

async function setup() {
  const t = convexTest(schema, modules);
  t.registerComponent("invites", invitesSchema, invitesModules);
  t.registerComponent("email", emailSchema, emailModules);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, helperId, viewerId] = [await make(), await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.events.createDraft, {});
  await t.run((ctx) => ctx.db.insert("sessions", { eventId, userId: helperId, grantedBy: ownerId, role: "contributor" }));
  await t.run((ctx) => ctx.db.insert("sessions", { eventId, userId: viewerId, grantedBy: ownerId, role: "viewer" }));
  const momentId = await owner.mutation(api.moments.create, {
    eventId,
    startsAt: Date.UTC(2025, 1, 20),
    blocks: [{ type: "note", text: "Off we go" }],
  });
  const photo = (over: { eventId?: Id<"events">; momentId?: Id<"moments">; mime?: string } = {}) =>
    t.run((ctx) =>
      ctx.db.insert("media", {
        eventId: over.eventId ?? eventId,
        momentId: over.momentId ?? momentId,
        uploaderId: ownerId,
        r2Key: "k",
        size: 1,
        mime: over.mime ?? "image/jpeg",
        keyVersion: 1,
        status: "ready",
      }),
    );
  const canvasId = await owner.mutation(api.canvas.ensure, { eventId });
  const view = () => owner.query(api.canvas.get, { eventId });
  return { t, eventId, momentId, ownerId, owner, helper: as(helperId), viewer: as(viewerId), photo, canvasId, view };
}

describe("the canvas of an experience", () => {
  test("it is made once, and only by the owner", async () => {
    const { owner, helper, viewer, eventId, canvasId } = await setup();
    expect(await owner.mutation(api.canvas.ensure, { eventId })).toBe(canvasId);
    await expect(helper.mutation(api.canvas.ensure, { eventId })).rejects.toThrow();
    await expect(viewer.mutation(api.canvas.ensure, { eventId })).rejects.toThrow();
  });

  test("everyone who can see the experience can see it, and only the owner may change it", async () => {
    const { owner, helper, viewer, eventId, canvasId } = await setup();
    await owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "frame", ...at, text: "Berlin" }] });
    for (const person of [helper, viewer]) {
      const seen = await person.query(api.canvas.get, { eventId });
      expect(seen.canEdit).toBe(false);
      expect(seen.nodes.map((n) => n.text)).toEqual(["Berlin"]);
    }
    expect((await owner.query(api.canvas.get, { eventId })).canEdit).toBe(true);
    await expect(helper.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "frame", ...at }] })).rejects.toThrow();
  });

  test("an experience with no canvas yet reads as empty", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run((ctx) => ctx.db.insert("users", {}));
    const owner = t.withIdentity({ subject: ownerId });
    const eventId = await owner.mutation(api.events.createDraft, {});
    expect(await owner.query(api.canvas.get, { eventId })).toEqual({ canvasId: null, desk: "desk", canEdit: true, nodes: [], pending: null });
  });
});

describe("filling the canvas with moments", () => {
  const frame = { kind: "frame" as const, x: 0, y: 0, w: 1200, h: 800, order: 1, text: "A day" };

  test("moments not on the canvas yet are pending for the owner, and for nobody else", async () => {
    const { owner, viewer, eventId, momentId } = await setup();
    const mine = await owner.query(api.canvas.get, { eventId });
    expect(mine.pending?.ids).toEqual([momentId]);
    expect(typeof mine.pending?.upTo).toBe("number");
    expect((await viewer.query(api.canvas.get, { eventId })).pending).toBeNull();
  });

  test("a fill marks them done, and the same fill sent twice adds nothing", async () => {
    const { owner, eventId, momentId, canvasId } = await setup();
    const { pending } = await owner.query(api.canvas.get, { eventId });
    const nodes = [frame, { kind: "moment" as const, parent: { ref: 0 }, x: 60, y: 170, w: 420, h: 360, momentId }];
    const ids = await owner.mutation(api.canvas.add, { canvasId, nodes, filled: pending!.upTo });
    expect(ids).toHaveLength(2);
    const after = await owner.query(api.canvas.get, { eventId });
    expect(after.pending).toBeNull();
    expect(after.nodes).toHaveLength(2);
    // Another window, same fill: nothing is made twice.
    expect(await owner.mutation(api.canvas.add, { canvasId, nodes, filled: pending!.upTo })).toEqual([]);
    expect((await owner.query(api.canvas.get, { eventId })).nodes).toHaveLength(2);
  });

  test("a moment made after the fill is pending again, the filled ones aren't", async () => {
    const { owner, eventId, momentId, canvasId } = await setup();
    const { pending } = await owner.query(api.canvas.get, { eventId });
    await owner.mutation(api.canvas.add, { canvasId, nodes: [frame], filled: pending!.upTo });
    const later = await owner.mutation(api.moments.create, { eventId, startsAt: Date.now(), blocks: [{ type: "note", text: "Later" }] });
    const { pending: next } = await owner.query(api.canvas.get, { eventId });
    expect(next?.ids).toEqual([later]);
    expect(next?.ids).not.toContain(momentId);
  });
});

describe("adding things", () => {
  test("a title and its letters go in together, nested inside a frame", async () => {
    const { owner, canvasId, view } = await setup();
    const ids = await owner.mutation(api.canvas.add, {
      canvasId,
      nodes: [
        { kind: "frame", x: 0, y: 0, w: 1200, h: 800, look: "peach", order: 1, text: "Berlin" },
        { kind: "ransom", parent: { ref: 0 }, x: 40, y: 40, w: 300, h: 80 },
        { kind: "letter", parent: { ref: 1 }, x: 0, y: 0, w: 60, h: 70, rotation: -4, text: "B", look: "red" },
        { kind: "letter", parent: { ref: 1 }, x: 62, y: 0, w: 60, h: 70, rotation: 3, text: "E", look: "blue" },
      ],
    });
    expect(ids).toHaveLength(4);
    const { nodes } = await view();
    const byKind = (k: string) => nodes.filter((n) => n.kind === k);
    expect(byKind("ransom")[0]?.parentId).toBe(ids[0]);
    expect(byKind("letter").map((n) => [n.parentId, n.text])).toEqual([[ids[1], "B"], [ids[1], "E"]]);
    expect(byKind("frame")[0]).toMatchObject({ look: "peach", order: 1, text: "Berlin" });
  });

  test("words are kept encrypted", async () => {
    const { t, owner, canvasId } = await setup();
    await owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "scrap", ...at, text: "Days like this make it all worth it" }] });
    const row = await t.run((ctx) => ctx.db.query("canvasNodes").first());
    expect(row?.text).toMatchObject({ iv: expect.any(String), ct: expect.any(String) });
    expect(JSON.stringify(row)).not.toContain("worth it");
  });

  test("a piece goes where its kind may go", async () => {
    const { owner, canvasId } = await setup();
    // a letter needs a title, a frame needs the desk, and nothing sits in a letter
    await expect(
      owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "letter", ...at, text: "A" }] }),
    ).rejects.toThrow("can't go there");
    const [frame, title, letter] = await owner.mutation(api.canvas.add, {
      canvasId,
      nodes: [
        { kind: "frame", ...at },
        { kind: "ransom", parent: { ref: 0 }, ...at },
        { kind: "letter", parent: { ref: 1 }, ...at, text: "A" },
      ],
    });
    await expect(
      owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "frame", parent: frame!, ...at }] }),
    ).rejects.toThrow("can't go there");
    await expect(
      owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "scrap", parent: letter!, ...at, text: "x" }] }),
    ).rejects.toThrow("can't go there");
    expect(title).toBeDefined();
  });

  test("a reference can only point at an earlier thing in the same request", async () => {
    const { owner, canvasId } = await setup();
    await expect(
      owner.mutation(api.canvas.add, {
        canvasId,
        nodes: [{ kind: "ransom", parent: { ref: 1 }, ...at }, { kind: "frame", ...at }],
      }),
    ).rejects.toThrow("isn't on this canvas");
  });

  test("frames and titles stay square; photos and scraps may turn", async () => {
    const { owner, canvasId } = await setup();
    await expect(
      owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "frame", ...at, rotation: 5 }] }),
    ).rejects.toThrow("stays square");
    await expect(
      owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "scrap", ...at, rotation: 5, text: "hi" }] }),
    ).resolves.toHaveLength(1);
  });

  test("sizes, positions and looks are bounded", async () => {
    const { owner, canvasId } = await setup();
    const bad = (over: { w?: number; x?: number; y?: number; look?: string }) =>
      owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "tape", ...at, ...over }] });
    await expect(bad({ w: 0 })).rejects.toThrow("out of range");
    await expect(bad({ x: 1e9 })).rejects.toThrow("out of range");
    await expect(bad({ y: Number.NaN })).rejects.toThrow("out of range");
    await expect(bad({ look: "<script>" })).rejects.toThrow("isn't one I know");
  });

  test("a photo must be one of this experience's, on a moment", async () => {
    const { t, owner, canvasId, photo, momentId, ownerId } = await setup();
    const add = (mediaId?: Id<"media">) =>
      owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "photo", ...at, mediaId }] });
    await expect(add(undefined)).rejects.toThrow("isn't in this experience");
    await expect(add(await photo())).resolves.toHaveLength(1);

    // not yet attached to a moment, not an image, or somebody else's experience
    const loose = await t.run((ctx) =>
      ctx.db.insert("media", { eventId: undefined, uploaderId: ownerId, r2Key: "k", size: 1, mime: "image/jpeg", keyVersion: 1, status: "ready" }),
    );
    await expect(add(loose)).rejects.toThrow("isn't in this experience");
    await expect(add(await photo({ mime: "video/mp4" }))).rejects.toThrow("isn't in this experience");
    const other = await owner.mutation(api.events.createDraft, {});
    const elsewhere = await owner.mutation(api.moments.create, { eventId: other, startsAt: 1, blocks: [{ type: "note", text: "x" }] });
    await expect(add(await photo({ eventId: other, momentId: elsewhere }))).rejects.toThrow("isn't in this experience");
    expect(momentId).toBeDefined();
  });

  test("a moment piece must point at a moment of this experience", async () => {
    const { owner, canvasId, momentId } = await setup();
    await expect(owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "moment", ...at, momentId }] })).resolves.toHaveLength(1);
    await expect(owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "moment", ...at }] })).rejects.toThrow("isn't in this experience");
    const other = await owner.mutation(api.events.createDraft, {});
    const elsewhere = await owner.mutation(api.moments.create, { eventId: other, startsAt: 1, blocks: [{ type: "note", text: "x" }] });
    await expect(
      owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "moment", ...at, momentId: elsewhere }] }),
    ).rejects.toThrow("isn't in this experience");
  });

  test("a scrap needs words, and a letter is exactly one character", async () => {
    const { owner, canvasId } = await setup();
    await expect(owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "scrap", ...at, text: "  " }] })).rejects.toThrow("Write something");
    const [frame] = await owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "ransom", ...at }] });
    await expect(
      owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "letter", parent: frame!, ...at, text: "AB" }] }),
    ).rejects.toThrow("one character");
  });

  test("a canvas holds up to 400 things", async () => {
    const { owner, canvasId } = await setup();
    const tape = (n: number) => Array.from({ length: n }, () => ({ kind: "tape" as const, ...at }));
    for (let i = 0; i < 4; i++) await owner.mutation(api.canvas.add, { canvasId, nodes: tape(100) });
    await expect(owner.mutation(api.canvas.add, { canvasId, nodes: tape(1) })).rejects.toThrow("up to 400");
    await expect(owner.mutation(api.canvas.add, { canvasId, nodes: tape(101) })).rejects.toThrow("at most 100");
  });
});

describe("changing things", () => {
  test("only what is sent changes", async () => {
    const { owner, canvasId, view } = await setup();
    const [id] = await owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "scrap", ...at, text: "hello", look: "kraft", rotation: 3 }] });
    await owner.mutation(api.canvas.patch, { updates: [{ id: id!, x: 250, rotation: -8 }] });
    expect((await view()).nodes[0]).toMatchObject({ x: 250, y: 0, w: 100, rotation: -8, text: "hello", look: "kraft" });
  });

  test("words can be rewritten, and a scrap can't be emptied", async () => {
    const { owner, canvasId, view } = await setup();
    const [id] = await owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "scrap", ...at, text: "hello" }] });
    await owner.mutation(api.canvas.patch, { updates: [{ id: id!, text: "goodbye" }] });
    expect((await view()).nodes[0]?.text).toBe("goodbye");
    await expect(owner.mutation(api.canvas.patch, { updates: [{ id: id!, text: "" }] })).rejects.toThrow("Write something");
  });

  test("a piece moves onto a frame and back to the desk, but a letter stays in its title", async () => {
    const { owner, canvasId, view } = await setup();
    const [frame, scrap, title, letter] = await owner.mutation(api.canvas.add, {
      canvasId,
      nodes: [
        { kind: "frame", ...at },
        { kind: "scrap", ...at, text: "x" },
        { kind: "ransom", ...at },
        { kind: "letter", parent: { ref: 2 }, ...at, text: "Q" },
      ],
    });
    await owner.mutation(api.canvas.patch, { updates: [{ id: scrap!, parentId: frame!, x: 10, y: 10 }] });
    expect((await view()).nodes.find((n) => n._id === scrap)?.parentId).toBe(frame);
    await owner.mutation(api.canvas.patch, { updates: [{ id: scrap!, parentId: null }] });
    expect((await view()).nodes.find((n) => n._id === scrap)?.parentId).toBeUndefined();
    await expect(owner.mutation(api.canvas.patch, { updates: [{ id: letter!, parentId: frame! }] })).rejects.toThrow("can't go there");
    await expect(owner.mutation(api.canvas.patch, { updates: [{ id: letter!, parentId: null }] })).rejects.toThrow("can't go there");
    expect(title).toBeDefined();
  });

  test("a frame takes its place in the flow, and leaves it", async () => {
    const { owner, canvasId, view } = await setup();
    const [id] = await owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "frame", ...at, order: 2 }] });
    await owner.mutation(api.canvas.patch, { updates: [{ id: id!, order: 5 }] });
    expect((await view()).nodes[0]?.order).toBe(5);
    await owner.mutation(api.canvas.patch, { updates: [{ id: id!, order: null }] });
    expect((await view()).nodes[0]?.order).toBeUndefined();
  });

  test("nobody but the owner, and nothing on an archived experience", async () => {
    const { owner, helper, viewer, canvasId, t, eventId } = await setup();
    const [id] = await owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "tape", ...at }] });
    for (const person of [helper, viewer]) {
      await expect(person.mutation(api.canvas.patch, { updates: [{ id: id!, x: 5 }] })).rejects.toThrow();
      await expect(person.mutation(api.canvas.remove, { ids: [id!] })).rejects.toThrow();
    }
    await t.run((ctx) => ctx.db.patch("events", eventId, { status: "archived" }));
    await expect(owner.mutation(api.canvas.patch, { updates: [{ id: id!, x: 5 }] })).rejects.toThrow();
    expect((await owner.query(api.canvas.get, { eventId })).canEdit).toBe(false);
  });
});

describe("taking things away", () => {
  test("a frame goes with everything inside it, and the moments stay", async () => {
    const { owner, canvasId, view, momentId, eventId } = await setup();
    const ids = await owner.mutation(api.canvas.add, {
      canvasId,
      nodes: [
        { kind: "frame", ...at },
        { kind: "ransom", parent: { ref: 0 }, ...at },
        { kind: "letter", parent: { ref: 1 }, ...at, text: "A" },
        { kind: "letter", parent: { ref: 1 }, ...at, text: "B" },
        { kind: "moment", parent: { ref: 0 }, ...at, momentId },
        { kind: "tape", ...at },
      ],
    });
    expect(await owner.mutation(api.canvas.remove, { ids: [ids[0]!] })).toBe(5);
    expect((await view()).nodes.map((n) => n.kind)).toEqual(["tape"]);
    expect((await owner.query(api.moments.list, { eventId })).map((m) => m._id)).toEqual([momentId]);
  });

  test("removing the same thing twice, or something already gone, is harmless", async () => {
    const { owner, canvasId } = await setup();
    const [id] = await owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "tape", ...at }] });
    expect(await owner.mutation(api.canvas.remove, { ids: [id!, id!] })).toBe(1);
    expect(await owner.mutation(api.canvas.remove, { ids: [id!] })).toBe(0);
  });

  test("deleting the experience deletes its canvas", async () => {
    const { t, owner, canvasId, eventId } = await setup();
    await owner.mutation(api.canvas.add, { canvasId, nodes: [{ kind: "frame", ...at }, { kind: "tape", ...at }] });
    await t.mutation(internal.events.purgeEventData, { eventId });
    expect(await t.run((ctx) => ctx.db.query("canvasNodes").first())).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("canvases").first())).toBeNull();
  });
});
