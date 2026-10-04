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

async function setup() {
  const t = convexTest(schema, modules);
  t.registerComponent("invites", invitesSchema, invitesModules);
  t.registerComponent("email", emailSchema, emailModules);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, friendId] = [await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.events.createDraft, {});
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: friendId, grantedBy: ownerId, role: "viewer" }),
  );
  return { t, owner, ownerId, friend: as(friendId), eventId };
}

async function fill(owner: Awaited<ReturnType<typeof setup>>["owner"], eventId: Id<"events">) {
  const { mediaId, r2Key } = await owner.mutation(api.media.reserveUpload, {
    eventId,
    size: 100,
    mime: "image/png",
  });
  await owner.mutation(api.media.confirmUpload, { mediaId });
  await owner.mutation(api.moments.create, {
    eventId,
    startsAt: Date.UTC(2026, 5, 1, 12),
    blocks: [{ type: "photo", mediaId }, { type: "note", text: "hi" }],
  });
  await owner.mutation(api.invites.create, { eventId, role: "viewer" });
  await owner.mutation(api.quota.request, { eventId, extra: 5 });
  return r2Key;
}

async function leftovers(t: Awaited<ReturnType<typeof setup>>["t"], eventId: Id<"events">) {
  return t.run(async (ctx) => {
    const count = (rows: Array<{ eventId?: unknown }>) =>
      rows.filter((r) => r.eventId === eventId).length;
    return {
      event: await ctx.db.get("events", eventId),
      moments: count(await ctx.db.query("moments").collect()),
      itinerary: count(await ctx.db.query("itinerary").collect()),
      media: count(await ctx.db.query("media").collect()),
      sessions: count(await ctx.db.query("sessions").collect()),
      quotaRequests: count(await ctx.db.query("quotaRequests").collect()),
      changes: count(await ctx.db.query("changes").collect()),
    };
  });
}

const EMPTY = { event: null, moments: 0, itinerary: 0, media: 0, sessions: 0, quotaRequests: 0, changes: 0 };

describe("events.remove", () => {
  test("only the owner can delete, and everything in the experience goes", async () => {
    const { t, owner, friend, eventId } = await setup();
    await fill(owner, eventId);

    await expect(friend.mutation(api.events.remove, { eventId })).rejects.toThrow();
    await owner.mutation(api.events.remove, { eventId });
    expect(await friend.query(api.events.get, { eventId })).toBeNull();

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await leftovers(t, eventId)).toEqual(EMPTY);
    expect(await t.query(components.invites.lib.listForEvent, { eventId })).toEqual([]);
  });

  test("an archived experience can still be deleted", async () => {
    const { t, owner, eventId } = await setup();
    await owner.mutation(api.events.update, { eventId, status: "archived" });
    await owner.mutation(api.events.remove, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await leftovers(t, eventId)).event).toBeNull();
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
    await owner.mutation(api.events.remove, { eventId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await leftovers(t, eventId)).changes).toBe(0);
  });
});

describe("media.listKeysForEvent", () => {
  test("lists the stored objects, for the owner only", async () => {
    const { owner, friend, eventId } = await setup();
    const key = await fill(owner, eventId);
    expect(await owner.query(api.media.listKeysForEvent, { eventId })).toEqual([key]);
    await expect(friend.query(api.media.listKeysForEvent, { eventId })).rejects.toThrow();
  });
});
