/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { MAX_MEDIA_PER_EVENT, MOMENT_LIMIT } from "../lib/limits";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(
    String.fromCharCode(...new Uint8Array(32).fill(7)),
  );
});

const setup = async () => {
  const t = convexTest(schema, modules);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, friendId] = [await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  return { t, ownerId, friendId, owner: as(ownerId), friend: as(friendId) };
};

const note = (text: string) => [{ type: "note" as const, text }];

const addMoment = async (
  who: Awaited<ReturnType<typeof setup>>["owner"],
  eventId: Id<"events">,
  text = "hello",
) => {
  return who.mutation(api.api.moments.create, {
    eventId,
    startsAt: Date.UTC(2026, 5, 1, 12),
    blocks: note(text),
  });
};

const changeCount = async (
  t: Awaited<ReturnType<typeof setup>>["t"],
  eventId: Id<"events">,
) => {
  return (
    await t.run((ctx) =>
      ctx.db
        .query("changes")
        .withIndex("by_event_and_at", (q) => q.eq("eventId", eventId))
        .collect(),
    )
  ).length;
};

describe("the moment limit", () => {
  test("one more than the limit is rejected", async () => {
    expect(MOMENT_LIMIT).toBe(300);
    const { t, owner } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    // Counted up to the limit, not added one by one: that would make the test slow.
    await t.run((ctx) => ctx.db.patch("events", eventId, { momentCount: MOMENT_LIMIT - 1 }));
    await addMoment(owner, eventId);
    await expect(addMoment(owner, eventId)).rejects.toThrow(/MOMENT_LIMIT/);
  });

  test("archived experiences reject new moments", async () => {
    const { owner } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    await owner.mutation(api.api.events.update, { eventId, status: "archived" });
    await expect(addMoment(owner, eventId)).rejects.toThrow(/ARCHIVED/);

    await owner.mutation(api.api.events.update, { eventId, status: "active" });
    await addMoment(owner, eventId);
  });

  test("archived experiences reject uploads", async () => {
    const { owner } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    const { mediaId } = await owner.mutation(api.api.media.reserveUpload, {
      eventId,
      size: 100,
      mime: "image/png",
    });
    await owner.mutation(api.api.events.update, { eventId, status: "archived" });

    await expect(
      owner.mutation(api.api.media.reserveUpload, {
        eventId,
        size: 100,
        mime: "image/png",
      }),
    ).rejects.toThrow(/ARCHIVED/);
    await expect(
      owner.mutation(api.api.media.confirmUpload, { mediaId }),
    ).rejects.toThrow(/ARCHIVED/);
  });
});

describe("change tracking", () => {
  test("every mutation writes one change row; failures write none", async () => {
    const { t, owner } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    expect(await changeCount(t, eventId)).toBe(1);

    await owner.mutation(api.api.events.update, { eventId, title: "Lisbon trip" });
    expect(await changeCount(t, eventId)).toBe(2);

    await expect(
      owner.mutation(api.api.events.update, { eventId, title: "x" }),
    ).rejects.toThrow();
    expect(await changeCount(t, eventId)).toBe(2);
  });

  test("sensitive values never appear in plaintext", async () => {
    const { t, owner } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    await owner.mutation(api.api.events.update, {
      eventId,
      description: "secret-description",
    });
    await owner.mutation(api.api.events.update, { eventId, title: "secret-title" });
    await addMoment(owner, eventId, "secret-note");
    const rows = await t.run((ctx) => ctx.db.query("changes").collect());
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("secret-description");
    expect(dump).not.toContain("secret-title");
    expect(dump).not.toContain("secret-note");

    const moments = await t.run((ctx) => ctx.db.query("moments").collect());
    expect(JSON.stringify(moments)).not.toContain("secret-note");

    // The description itself is stored encrypted, and reads back as written.
    const event = await t.run((ctx) => ctx.db.get("events", eventId));
    expect(JSON.stringify(event)).not.toContain("secret-description");
    expect((await owner.query(api.api.events.get, { eventId }))?.description).toBe("secret-description");
  });

  test("descriptions saved as plain text still read, and the migration encrypts them", async () => {
    const { t, owner } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    await t.run((ctx) => ctx.db.patch("events", eventId, { description: "from before" }));
    expect((await owner.query(api.api.events.get, { eventId }))?.description).toBe("from before");

    // One page is enough here; a second run finds nothing left.
    expect(await t.mutation(internal.model.migrations.encryptPlainText, {})).toBe(1);
    const event = await t.run((ctx) => ctx.db.get("events", eventId));
    expect(typeof event?.description).toBe("object");
    expect((await owner.query(api.api.events.get, { eventId }))?.description).toBe("from before");
    expect(await t.mutation(internal.model.migrations.encryptPlainText, {})).toBe(0);
  });
});

describe("access and revoke", () => {
  test("strangers see nothing; a granted viewer reads; revoke removes access", async () => {
    const { t, owner, friend, friendId, ownerId } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    await addMoment(owner, eventId, "for friends");

    await expect(friend.query(api.api.moments.list, { eventId })).rejects.toThrow();
    expect(await friend.query(api.api.events.get, { eventId })).toBeNull();

    const sessionId = await t.run((ctx) =>
      ctx.db.insert("sessions", {
        eventId,
        userId: friendId,
        grantedBy: ownerId,
        role: "viewer",
      }),
    );
    const moments = await friend.query(api.api.moments.list, { eventId });
    expect(moments[0]?.blocks[0]).toEqual({ type: "note", text: "for friends" });

    await expect(addMoment(friend, eventId)).rejects.toThrow();
    await expect(
      friend.query(api.api.changes.listForEvent, {
        eventId,
        paginationOpts: { numItems: 5, cursor: null },
      }),
    ).rejects.toThrow();

    await owner.mutation(api.api.sessions.revoke, { sessionId });
    await expect(friend.query(api.api.moments.list, { eventId })).rejects.toThrow();
    expect(await friend.query(api.api.events.get, { eventId })).toBeNull();
  });

  test("revoking reads the same for a stranger and for a grant that doesn't exist", async () => {
    const { t, owner, friendId, ownerId } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    const sessionId = await t.run((ctx) =>
      ctx.db.insert("sessions", { eventId, userId: friendId, grantedBy: ownerId, role: "viewer" }),
    );
    const strangerId = await t.run((ctx) => ctx.db.insert("users", {}));
    const stranger = t.withIdentity({ subject: strangerId });
    const missing = await t.run(async (ctx) => {
      const id = await ctx.db.insert("sessions", {
        eventId,
        userId: strangerId,
        grantedBy: ownerId,
        role: "viewer",
      });
      await ctx.db.delete("sessions", id);
      return id;
    });
    await expect(stranger.mutation(api.api.sessions.revoke, { sessionId })).rejects.toThrow("Event not found");
    await expect(stranger.mutation(api.api.sessions.revoke, { sessionId: missing })).rejects.toThrow(
      "Event not found",
    );
    expect((await t.run((ctx) => ctx.db.get("sessions", sessionId)))?.revokedAt).toBeUndefined();
  });

  test("the people list pages through every grant, for the owner only", async () => {
    const { t, owner, friend, ownerId } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) {
        const userId = await ctx.db.insert("users", {});
        await ctx.db.insert("sessions", { eventId, userId, grantedBy: ownerId, role: "viewer" });
      }
    });
    await expect(
      friend.query(api.api.sessions.listForEvent, { eventId, paginationOpts: { numItems: 2, cursor: null } }),
    ).rejects.toThrow();
    const seen: string[] = [];
    let cursor: string | null = null;
    let isDone = false;
    while (!isDone) {
      const page: FunctionReturnType<typeof api.api.sessions.listForEvent> = await owner.query(
        api.api.sessions.listForEvent,
        {
          eventId,
          paginationOpts: { numItems: 2, cursor },
        },
      );
      seen.push(...page.page.map((grant) => grant._id));
      cursor = page.continueCursor;
      isDone = page.isDone;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });
});

describe("uploads", () => {
  test("over 5 MB and non-images are rejected", async () => {
    const { owner } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    await expect(
      owner.mutation(api.api.media.reserveUpload, {
        eventId,
        size: 5 * 1024 * 1024 + 1,
        mime: "image/png",
      }),
    ).rejects.toThrow(/TOO_LARGE/);
    await expect(
      owner.mutation(api.api.media.reserveUpload, {
        eventId,
        size: 100,
        mime: "application/pdf",
      }),
    ).rejects.toThrow();
    const ok = await owner.mutation(api.api.media.reserveUpload, {
      eventId,
      size: 5 * 1024 * 1024,
      mime: "image/png",
    });
    expect(ok.r2Key).toContain(eventId);
  });

  test("a revoked contributor can't confirm a pending upload", async () => {
    const { t, owner, friend, friendId, ownerId } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    const sessionId = await t.run((ctx) =>
      ctx.db.insert("sessions", {
        eventId,
        userId: friendId,
        grantedBy: ownerId,
        role: "contributor",
      }),
    );
    const { mediaId } = await friend.mutation(api.api.media.reserveUpload, {
      eventId,
      size: 100,
      mime: "image/png",
    });
    await owner.mutation(api.api.sessions.revoke, { sessionId });
    await expect(
      friend.mutation(api.api.media.confirmUpload, { mediaId }),
    ).rejects.toThrow();
    const media = await t.run((ctx) => ctx.db.get("media", mediaId));
    expect(media?.status).toBe("reserved");
  });

  test("deleted uploads don't count toward the upload cap", async () => {
    const { t, owner, ownerId } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    const fill = (status: "ready" | "deleted", n: number) =>
      t.run(async (ctx) => {
        for (let i = 0; i < n; i++) {
          await ctx.db.insert("media", {
            eventId,
            uploaderId: ownerId,
            r2Key: `events/${eventId}/${status}${i}`,
            size: 100,
            mime: "image/png",
            keyVersion: 1,
            status,
          });
        }
      });
    const reserve = () =>
      owner.mutation(api.api.media.reserveUpload, { eventId, size: 100, mime: "image/png" });
    // Deleted uploads don't count towards the cap.
    await fill("deleted", 60);
    await fill("ready", MAX_MEDIA_PER_EVENT - 1);
    await reserve();
    await expect(reserve()).rejects.toThrow(/MEDIA_LIMIT/);
  });

  test("a deleted upload can't be confirmed back to life", async () => {
    const { t, owner } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    const { mediaId } = await owner.mutation(api.api.media.reserveUpload, {
      eventId,
      size: 100,
      mime: "image/png",
    });
    await owner.mutation(api.api.media.markDeleted, { mediaId });
    await expect(
      owner.mutation(api.api.media.confirmUpload, { mediaId }),
    ).rejects.toThrow();
    const media = await t.run((ctx) => ctx.db.get("media", mediaId));
    expect(media?.status).toBe("deleted");
  });

  test("unattached photos are visible to their uploader only", async () => {
    const { t, owner, friend, friendId, ownerId } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    await t.run((ctx) =>
      ctx.db.insert("sessions", {
        eventId,
        userId: friendId,
        grantedBy: ownerId,
        role: "viewer",
      }),
    );
    const { mediaId } = await owner.mutation(api.api.media.reserveUpload, {
      eventId,
      size: 100,
      mime: "image/png",
    });
    await owner.mutation(api.api.media.confirmUpload, { mediaId });

    expect(await owner.query(api.api.media.getForDownload, { mediaId })).not.toBeNull();
    expect(await friend.query(api.api.media.getForDownload, { mediaId })).toBeNull();

    await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: Date.UTC(2026, 5, 1, 12),
      blocks: [{ type: "photo", mediaId }],
    });
    expect(await friend.query(api.api.media.getForDownload, { mediaId })).not.toBeNull();
  });

  test("one person's live uploads share a byte budget across experiences", async () => {
    const { t, owner, ownerId } = await setup();
    const first = await owner.mutation(api.api.events.createDraft, {});
    const second = await owner.mutation(api.api.events.createDraft, {});
    const CAP = 2 * 1024 ** 3;
    const big = await t.run((ctx) =>
      ctx.db.insert("media", {
        eventId: first,
        uploaderId: ownerId,
        r2Key: "test/big",
        size: CAP - 100,
        mime: "image/png",
        keyVersion: 1,
        status: "ready",
      }),
    );
    // Room for exactly 100 bytes, whichever experience they are for.
    await owner.mutation(api.api.media.reserveUpload, { eventId: second, size: 100, mime: "image/png" });
    await expect(
      owner.mutation(api.api.media.reserveUpload, { eventId: first, size: 1, mime: "image/png" }),
    ).rejects.toThrow(/UPLOAD_BUDGET/);
    // Profile images draw on the same budget, so they can't be used to get around it.
    await expect(
      owner.mutation(api.api.media.reserveAvatarUpload, { size: 1, mime: "image/png" }),
    ).rejects.toThrow(/UPLOAD_BUDGET/);
    // Deleting an upload frees its room.
    await t.run((ctx) => ctx.db.patch("media", big, { status: "deleted" }));
    await owner.mutation(api.api.media.reserveUpload, { eventId: first, size: 1000, mime: "image/png" });
  });

  test("past 5,000 live uploads the budget can't be checked, so new uploads are refused", async () => {
    const { t, owner, ownerId } = await setup();
    const eventId = await owner.mutation(api.api.events.createDraft, {});
    // Profile images count toward the budget too, and sit outside any experience's cap.
    await t.run(async (ctx) => {
      for (let i = 0; i < 5001; i++) {
        await ctx.db.insert("media", {
          purpose: "avatar",
          uploaderId: ownerId,
          r2Key: `avatars/${i}`,
          size: 1,
          mime: "image/png",
          keyVersion: 1,
          status: "ready",
        });
      }
    });
    await expect(
      owner.mutation(api.api.media.reserveUpload, { eventId, size: 1, mime: "image/png" }),
    ).rejects.toThrow(/UPLOAD_BUDGET/);
  });
});

describe("privacy by default", () => {
  test("new users store nothing from the profile", async () => {
    const { t, ownerId } = await setup();
    const user = await t.run((ctx) => ctx.db.get("users", ownerId));
    expect(Object.keys(user ?? {}).sort()).toEqual(["_creationTime", "_id"]);
  });
});
