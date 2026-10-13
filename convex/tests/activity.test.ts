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
  const [ownerId, viewerId, strangerId] = [await make(), await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.api.events.createDraft, {});
  await t.run((ctx) =>
    ctx.db.insert("sessions", { eventId, userId: viewerId, grantedBy: ownerId, role: "viewer" }),
  );
  return { t, owner, viewer: as(viewerId), stranger: as(strangerId), eventId };
};

describe("activity badge", () => {
  test("counts new moments, pages and guestbook notes, then clears when opened", async () => {
    const { t, owner, viewer, stranger, eventId } = await setup();
    expect(await owner.query(api.api.changes.unreadCount, { eventId })).toBe(0);
    await expect(stranger.query(api.api.changes.unreadCount, { eventId })).rejects.toThrow(/Event not found/);
    await expect(viewer.query(api.api.changes.unreadCount, { eventId })).rejects.toThrow(/Event not found/);

    await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: Date.UTC(2026, 5, 1, 12),
      place: "Lisbon",
      blocks: [{ type: "note", text: "Tram 28" }],
    });
    await t.finishAllScheduledFunctions(() => undefined);
    const afterMoment = await owner.query(api.api.changes.unreadCount, { eventId });
    // The moment, its page, and the cover.
    expect(afterMoment).toBe(3);

    await owner.mutation(api.api.changes.markRead, { eventId });
    expect(await owner.query(api.api.changes.unreadCount, { eventId })).toBe(0);

    await viewer.mutation(api.api.guestNotes.leave, { eventId, text: "Wish I had been there" });
    expect(await owner.query(api.api.changes.unreadCount, { eventId })).toBe(1);
    const notes = await owner.query(api.api.guestNotes.list, { eventId });
    expect(notes.map((n) => n.text)).toEqual(["Wish I had been there"]);
    const stored = await t.run((ctx) => ctx.db.query("guestNotes").collect());
    expect(JSON.stringify(stored)).not.toContain("Wish I had been there");
    const changes = await t.run((ctx) => ctx.db.query("changes").collect());
    expect(JSON.stringify(changes)).not.toContain("Wish I had been there");
    expect(changes.some((c) => c.entity === "guestNote" && c.action === "create")).toBe(true);
    expect(changes.some((c) => c.entity === "page" && c.action === "create")).toBe(true);

    await expect(stranger.mutation(api.api.guestNotes.leave, { eventId, text: "Hello" })).rejects.toThrow(/Event not found/);
    await expect(viewer.mutation(api.api.guestNotes.leave, { eventId, text: "   " })).rejects.toThrow(/500/);
  });

  test("a burst of other changes does not hide a new note", async () => {
    const { t, owner, viewer, eventId } = await setup();
    await owner.mutation(api.api.changes.markRead, { eventId });
    const readAt = await t.run(async (ctx) => {
      const read = await ctx.db.query("activityReads").first();
      if (read === null) throw new Error("missing read mark");
      return read.readAt;
    });
    await t.run(async (ctx) => {
      for (let i = 0; i < 200; i++) {
        await ctx.db.insert("changes", {
          eventId,
          entity: "media",
          entityId: `media-${i}`,
          action: "update",
          fields: [],
          at: readAt + 1,
        });
      }
    });
    await viewer.mutation(api.api.guestNotes.leave, { eventId, text: "Still here" });
    expect(await owner.query(api.api.changes.unreadCount, { eventId })).toBe(1);
  });
});
