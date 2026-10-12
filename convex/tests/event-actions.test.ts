/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { api, components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import emailSchema from "../components/email/schema";
import invitesSchema from "../components/invites/schema";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);
const invitesModules = import.meta.glob(["../components/invites/**/*.ts", "../components/invites/**/*.js"]);
const emailModules = import.meta.glob(["../components/email/**/*.ts", "../components/email/**/*.js"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(
    String.fromCharCode(...new Uint8Array(32).fill(7)),
  );
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const setup = async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("invites", invitesSchema, invitesModules);
  t.registerComponent("email", emailSchema, emailModules);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, friendId] = [await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.api.events.createDraft, {});
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: friendId, grantedBy: ownerId, role: "viewer" }),
  );
  return { t, owner, ownerId, friend: as(friendId), eventId };
};

const fill = async (owner: Awaited<ReturnType<typeof setup>>["owner"], eventId: Id<"events">) => {
  const { mediaId, r2Key } = await owner.mutation(api.api.media.reserveUpload, {
    eventId,
    size: 100,
    mime: "image/png",
  });
  await owner.mutation(api.api.media.confirmUpload, { mediaId });
  await owner.mutation(api.api.moments.create, {
    eventId,
    startsAt: Date.UTC(2026, 5, 1, 12),
    blocks: [{ type: "photo", mediaId }, { type: "note", text: "hi" }],
  });
  await owner.mutation(api.api.invites.create, { eventId, role: "viewer" });
  return r2Key;
};

const leftovers = async (t: Awaited<ReturnType<typeof setup>>["t"], eventId: Id<"events">) => {
  return t.run(async (ctx) => {
    const count = (rows: Array<{ eventId?: unknown }>) =>
      rows.filter((r) => r.eventId === eventId).length;
    return {
      event: await ctx.db.get("events", eventId),
      moments: count(await ctx.db.query("moments").collect()),
      media: count(await ctx.db.query("media").collect()),
      sessions: count(await ctx.db.query("sessions").collect()),
      changes: count(await ctx.db.query("changes").collect()),
    };
  });
};

const EMPTY = { event: null, moments: 0, media: 0, sessions: 0, changes: 0 };

describe("events.remove", () => {
  test("only the owner can delete, and everything in the experience goes", async () => {
    const { t, owner, friend, eventId } = await setup();
    await fill(owner, eventId);

    await expect(friend.mutation(api.api.events.remove, { eventId })).rejects.toThrow();
    await owner.mutation(api.api.events.remove, { eventId });
    expect(await friend.query(api.api.events.get, { eventId })).toBeNull();

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await leftovers(t, eventId)).toEqual(EMPTY);
    expect(await t.query(components.invites.lib.listForEvent, { eventId })).toEqual([]);
  });

  test("an archived experience can still be deleted", async () => {
    const { t, owner, eventId } = await setup();
    await owner.mutation(api.api.events.update, { eventId, status: "archived" });
    await owner.mutation(api.api.events.remove, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await leftovers(t, eventId)).event).toBeNull();
  });

  test("guestbook notes and Activity read marks go with the experience", async () => {
    const { t, owner, ownerId, friend, eventId } = await setup();
    await owner.mutation(api.api.events.update, { eventId, status: "active" });
    await friend.mutation(api.api.guestNotes.leave, { eventId, text: "What a trip!" });
    await t.run((ctx) => ctx.db.insert("activityReads", { userId: ownerId, eventId, readAt: 1 }));
    await owner.mutation(api.api.events.remove, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const left = await t.run(async (ctx) => [(await ctx.db.query("guestNotes").collect()).length, (await ctx.db.query("activityReads").collect()).length]);
    expect(left).toEqual([0, 0]);
  });

  test("rows in the tables being retired go with the experience too", async () => {
    const { t, owner, ownerId, eventId } = await setup();
    await t.run(async (ctx) => {
      const momentId = await ctx.db.insert("moments", { eventId, authorId: ownerId, startsAt: 0, blocks: [] });
      await ctx.db.insert("itinerary", { eventId, momentId, startsAt: 0, dayKey: "2026-06-01", monthKey: "2026-06", position: 0 });
      await ctx.db.insert("quotaRequests", { eventId, requestedBy: ownerId, extra: 10, status: "pending" });
      const canvasId = await ctx.db.insert("canvases", { eventId, desk: "cork" });
      await ctx.db.insert("canvasNodes", { canvasId, eventId, kind: "frame", x: 0, y: 0, w: 1, h: 1, rotation: 0, z: 0 });
    });
    await owner.mutation(api.api.events.remove, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const left = await t.run(async (ctx) =>
      Promise.all((["itinerary", "quotaRequests", "canvases", "canvasNodes"] as const).map(async (table) => (await ctx.db.query(table).collect()).length)),
    );
    expect(left).toEqual([0, 0, 0, 0]);
  });

  test("a token limited to the experience goes with it; an account-wide token stays", async () => {
    const { t, owner, ownerId, eventId } = await setup();
    const [scoped, account] = await t.run(async (ctx) => {
      const scoped = await ctx.db.insert("agentTokens", {
        userId: ownerId,
        name: "Claude Desktop",
        tokenKey: "scoped-key",
        prefix: "scop",
        eventId,
        createdAt: 1,
      });
      const account = await ctx.db.insert("agentTokens", {
        userId: ownerId,
        name: "Claude Desktop",
        tokenKey: "account-key",
        prefix: "acco",
        createdAt: 2,
      });
      return [scoped, account];
    });
    await owner.mutation(api.api.events.remove, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const left = await t.run(async (ctx) => ({
      scoped: await ctx.db.get("agentTokens", scoped),
      account: await ctx.db.get("agentTokens", account),
    }));
    expect(left.scoped).toBeNull();
    expect(left.account?._id).toBe(account);
  });

  test("a large activity log is deleted in batches", async () => {
    const { t, owner, ownerId, eventId } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 1200; i++) {
        await ctx.db.insert("changes", {
          eventId,
          entity: "event",
          entityId: eventId,
          actorId: ownerId,
          action: "update",
          fields: ["title"],
          at: i,
        });
      }
    });
    await owner.mutation(api.api.events.remove, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await leftovers(t, eventId)).changes).toBe(0);
  });
});

describe("media.listKeysForEvent", () => {
  test("lists the stored objects, for the owner only", async () => {
    const { owner, friend, eventId } = await setup();
    const key = await fill(owner, eventId);
    expect(await owner.query(api.api.media.listKeysForEvent, { eventId })).toEqual([key]);
    await expect(friend.query(api.api.media.listKeysForEvent, { eventId })).rejects.toThrow();
  });

  test("live objects are listed even behind thousands of deleted uploads", async () => {
    const { t, owner, ownerId, eventId } = await setup();
    const live = await fill(owner, eventId);
    await t.run(async (ctx) => {
      for (let i = 0; i < 5050; i++) {
        await ctx.db.insert("media", {
          eventId,
          uploaderId: ownerId,
          r2Key: `gone/${i}`,
          size: 1,
          mime: "image/png",
          keyVersion: 1,
          status: "deleted",
        });
      }
    });
    const keys = await owner.query(api.api.media.listKeysForEvent, { eventId });
    expect(keys).toContain(live);
    // Deleted objects are listed too, since they may not be gone from R2 yet.
    expect(keys).toHaveLength(5051);
  });
});

describe("events.createDraft", () => {
  test("an owner can have 20 experiences; deleting one frees its slot", async () => {
    const { t, owner, eventId } = await setup();
    for (let i = 1; i < 20; i++) await owner.mutation(api.api.events.createDraft, {});
    await expect(owner.mutation(api.api.events.createDraft, {})).rejects.toThrow(/EVENT_LIMIT/);
    await owner.mutation(api.api.events.remove, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(owner.mutation(api.api.events.createDraft, {})).resolves.toBeTruthy();
  });
});

describe("events.listMine, get and update", () => {
  test("cards use the first photo (not video) as the cover, for owner and guests", async () => {
    const { owner, friend, eventId } = await setup();
    expect((await owner.query(api.api.events.listMine, {}))[0]?.coverMediaId).toBeUndefined();
    const upload = async (mime: string) => {
      const { mediaId } = await owner.mutation(api.api.media.reserveUpload, { eventId, size: 100, mime });
      await owner.mutation(api.api.media.confirmUpload, { mediaId });
      return mediaId;
    };
    const video = await upload("video/mp4");
    const photo = await upload("image/png");
    await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: Date.UTC(2026, 5, 1, 12),
      blocks: [{ type: "video", mediaId: video }],
      stops: [{ place: "Porto", blocks: [{ type: "photo", mediaId: photo }] }],
    });
    expect((await owner.query(api.api.events.listMine, {}))[0]?.coverMediaId).toBe(photo);
    expect((await friend.query(api.api.events.listMine, {}))[0]?.coverMediaId).toBe(photo);
  });

  test("a malformed id reads as not found", async () => {
    const { owner } = await setup();
    expect(await owner.query(api.api.events.get, { eventId: "not-an-id" })).toBeNull();
  });

  test("null clears a date, and the change is logged as null", async () => {
    const { t, owner, eventId } = await setup();
    const at = Date.UTC(2026, 5, 1);
    await owner.mutation(api.api.events.update, { eventId, startsAt: at, endsAt: at + 1000 });
    await owner.mutation(api.api.events.update, { eventId, startsAt: null });
    const event = await owner.query(api.api.events.get, { eventId });
    expect(event?.startsAt).toBeUndefined();
    expect(event?.endsAt).toBe(at + 1000);
    const last = await t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_event_and_at", (q) => q.eq("eventId", eventId))
        .order("desc")
        .first(),
    );
    expect(last).toMatchObject({
      fields: ["startsAt"],
      before: { startsAt: at },
      after: { startsAt: null },
    });
  });
});
