/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(
    String.fromCharCode(...new Uint8Array(32).fill(7)),
  );
});

async function setup() {
  const t = convexTest(schema, modules);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, friendId] = [await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  return { t, ownerId, friendId, owner: as(ownerId), friend: as(friendId) };
}

const note = (text: string) => [{ type: "note" as const, text }];

async function addMoment(
  who: Awaited<ReturnType<typeof setup>>["owner"],
  eventId: Id<"events">,
  text = "hello",
) {
  return who.mutation(api.moments.create, {
    eventId,
    startsAt: Date.UTC(2026, 5, 1, 12),
    blocks: note(text),
  });
}

async function changeCount(
  t: Awaited<ReturnType<typeof setup>>["t"],
  eventId: Id<"events">,
) {
  return (
    await t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_event_and_at", (q) => q.eq("eventId", eventId))
        .collect(),
    )
  ).length;
}

describe("moment limit and credits", () => {
  test("11th moment is rejected; an approved request raises the limit", async () => {
    const { t, owner } = await setup();
    const eventId = await owner.mutation(api.events.createDraft, {});
    for (let i = 0; i < 10; i++) await addMoment(owner, eventId, `m${i}`);
    await expect(addMoment(owner, eventId)).rejects.toThrow(/MOMENT_LIMIT/);

    const requestId = await owner.mutation(api.quota.request, {
      eventId,
      extra: 5,
    });
    await t.mutation(internal.quota.resolve, { requestId, approve: true });
    await addMoment(owner, eventId);
    const event = await owner.query(api.events.get, { eventId });
    expect(event?.momentLimit).toBe(15);
  });

  test("archived experiences reject new moments", async () => {
    const { owner } = await setup();
    const eventId = await owner.mutation(api.events.createDraft, {});
    await owner.mutation(api.events.update, { eventId, status: "archived" });
    await expect(addMoment(owner, eventId)).rejects.toThrow(/ARCHIVED/);

    await owner.mutation(api.events.update, { eventId, status: "active" });
    await addMoment(owner, eventId);
  });

  test("archived experiences reject uploads and quota requests", async () => {
    const { owner } = await setup();
    const eventId = await owner.mutation(api.events.createDraft, {});
    const { mediaId } = await owner.mutation(api.media.reserveUpload, {
      eventId,
      size: 100,
      mime: "image/png",
    });
    await owner.mutation(api.events.update, { eventId, status: "archived" });

    await expect(
      owner.mutation(api.media.reserveUpload, {
        eventId,
        size: 100,
        mime: "image/png",
      }),
    ).rejects.toThrow(/ARCHIVED/);
    await expect(
      owner.mutation(api.media.confirmUpload, { mediaId }),
    ).rejects.toThrow(/ARCHIVED/);
    await expect(
      owner.mutation(api.quota.request, { eventId, extra: 5 }),
    ).rejects.toThrow(/ARCHIVED/);
  });

  test("the moment limit stops at the maximum", async () => {
    const { t, owner } = await setup();
    const eventId = await owner.mutation(api.events.createDraft, {});
    await t.run((ctx) => ctx.db.patch("events", eventId, { momentLimit: 450 }));
    const requestId = await owner.mutation(api.quota.request, {
      eventId,
      extra: 100,
    });
    await t.mutation(internal.quota.resolve, { requestId, approve: true });
    expect((await owner.query(api.events.get, { eventId }))?.momentLimit).toBe(
      500,
    );
    await expect(
      owner.mutation(api.quota.request, { eventId, extra: 1 }),
    ).rejects.toThrow(/MOMENT_LIMIT/);
  });

  test("pending requests are listed even after many resolved ones", async () => {
    const { t, owner, ownerId } = await setup();
    const eventId = await owner.mutation(api.events.createDraft, {});
    await t.run(async (ctx) => {
      for (let i = 0; i < 60; i++) {
        await ctx.db.insert("quotaRequests", {
          eventId,
          requestedBy: ownerId,
          extra: 1,
          status: "approved",
        });
      }
    });
    const pendingId = await owner.mutation(api.quota.request, {
      eventId,
      extra: 5,
    });
    const rows = await owner.query(api.quota.listForEvent, { eventId });
    expect(rows).toHaveLength(50);
    expect(rows[0]?._id).toBe(pendingId);
  });
});

describe("change tracking", () => {
  test("every mutation writes one change row; failures write none", async () => {
    const { t, owner } = await setup();
    const eventId = await owner.mutation(api.events.createDraft, {});
    expect(await changeCount(t, eventId)).toBe(1);

    await owner.mutation(api.events.update, { eventId, title: "Lisbon trip" });
    expect(await changeCount(t, eventId)).toBe(2);

    await expect(
      owner.mutation(api.events.update, { eventId, title: "x" }),
    ).rejects.toThrow();
    expect(await changeCount(t, eventId)).toBe(2);
  });

  test("sensitive values never appear in plaintext", async () => {
    const { t, owner } = await setup();
    const eventId = await owner.mutation(api.events.createDraft, {});
    await owner.mutation(api.events.update, {
      eventId,
      description: "secret-description",
    });
    await addMoment(owner, eventId, "secret-note");
    const rows = await t.run((ctx) => ctx.db.query("changes").collect());
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("secret-description");
    expect(dump).not.toContain("secret-note");

    const moments = await t.run((ctx) => ctx.db.query("moments").collect());
    expect(JSON.stringify(moments)).not.toContain("secret-note");
  });
});

describe("access and revoke", () => {
  test("strangers see nothing; a granted viewer reads; revoke removes access", async () => {
    const { t, owner, friend, friendId, ownerId } = await setup();
    const eventId = await owner.mutation(api.events.createDraft, {});
    await addMoment(owner, eventId, "for friends");

    await expect(friend.query(api.moments.list, { eventId })).rejects.toThrow();
    expect(await friend.query(api.events.get, { eventId })).toBeNull();

    const sessionId = await t.run((ctx) =>
      ctx.db.insert("sessions", {
        eventId,
        userId: friendId,
        grantedBy: ownerId,
        role: "viewer",
      }),
    );
    const moments = await friend.query(api.moments.list, { eventId });
    expect(moments[0]?.blocks[0]).toEqual({ type: "note", text: "for friends" });

    await expect(addMoment(friend, eventId)).rejects.toThrow();
    await expect(
      friend.query(api.changes.listForEvent, {
        eventId,
        paginationOpts: { numItems: 5, cursor: null },
      }),
    ).rejects.toThrow();

    await owner.mutation(api.sessions.revoke, { sessionId });
    await expect(friend.query(api.moments.list, { eventId })).rejects.toThrow();
    expect(await friend.query(api.events.get, { eventId })).toBeNull();
  });
});

describe("uploads", () => {
  test("over 5 MB and non-images are rejected", async () => {
    const { owner } = await setup();
    const eventId = await owner.mutation(api.events.createDraft, {});
    await expect(
      owner.mutation(api.media.reserveUpload, {
        eventId,
        size: 5 * 1024 * 1024 + 1,
        mime: "image/png",
      }),
    ).rejects.toThrow(/TOO_LARGE/);
    await expect(
      owner.mutation(api.media.reserveUpload, {
        eventId,
        size: 100,
        mime: "application/pdf",
      }),
    ).rejects.toThrow();
    const ok = await owner.mutation(api.media.reserveUpload, {
      eventId,
      size: 5 * 1024 * 1024,
      mime: "image/png",
    });
    expect(ok.r2Key).toContain(eventId);
  });

  test("a revoked contributor can't confirm a pending upload", async () => {
    const { t, owner, friend, friendId, ownerId } = await setup();
    const eventId = await owner.mutation(api.events.createDraft, {});
    const sessionId = await t.run((ctx) =>
      ctx.db.insert("sessions", {
        eventId,
        userId: friendId,
        grantedBy: ownerId,
        role: "contributor",
      }),
    );
    const { mediaId } = await friend.mutation(api.media.reserveUpload, {
      eventId,
      size: 100,
      mime: "image/png",
    });
    await owner.mutation(api.sessions.revoke, { sessionId });
    await expect(
      friend.mutation(api.media.confirmUpload, { mediaId }),
    ).rejects.toThrow();
    const media = await t.run((ctx) => ctx.db.get("media", mediaId));
    expect(media?.status).toBe("reserved");
  });

  test("unattached photos are visible to their uploader only", async () => {
    const { t, owner, friend, friendId, ownerId } = await setup();
    const eventId = await owner.mutation(api.events.createDraft, {});
    await t.run((ctx) =>
      ctx.db.insert("sessions", {
        eventId,
        userId: friendId,
        grantedBy: ownerId,
        role: "viewer",
      }),
    );
    const { mediaId } = await owner.mutation(api.media.reserveUpload, {
      eventId,
      size: 100,
      mime: "image/png",
    });
    await owner.mutation(api.media.confirmUpload, { mediaId });

    expect(await owner.query(api.media.getForDownload, { mediaId })).not.toBeNull();
    expect(await friend.query(api.media.getForDownload, { mediaId })).toBeNull();

    await owner.mutation(api.moments.create, {
      eventId,
      startsAt: Date.UTC(2026, 5, 1, 12),
      blocks: [{ type: "photo", mediaId }],
    });
    expect(await friend.query(api.media.getForDownload, { mediaId })).not.toBeNull();
  });
});

describe("itinerary", () => {
  test("groups by day, month and place", async () => {
    const { owner } = await setup();
    const eventId = await owner.mutation(api.events.createDraft, {});
    const at = (d: number) => Date.UTC(2026, 5, d, 12);
    for (const [d, place] of [
      [1, "Lisbon"],
      [1, "lisbon"],
      [2, "Porto"],
    ] as const) {
      await owner.mutation(api.moments.create, {
        eventId,
        startsAt: at(d),
        place,
        blocks: note("x"),
      });
    }
    const by = (groupBy: "day" | "month" | "place") =>
      owner.query(api.itinerary.grouped, { eventId, groupBy });
    expect((await by("day")).map((g) => g.moments.length)).toEqual([2, 1]);
    expect(await by("month")).toHaveLength(1);
    expect((await by("place")).length).toBe(2);
  });
});

describe("privacy by default", () => {
  test("new users store nothing from the profile", async () => {
    const { t, ownerId } = await setup();
    const user = await t.run((ctx) => ctx.db.get("users", ownerId));
    expect(Object.keys(user ?? {}).sort()).toEqual(["_creationTime", "_id"]);
  });
});
