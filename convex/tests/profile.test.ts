/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

async function setup() {
  const t = convexTest(schema, modules);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [aId, bId] = [await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  return { t, a: as(aId), b: as(bId), aId };
}

describe("profile fields", () => {
  test("username and email are optional and stored normalised", async () => {
    const { a } = await setup();
    await a.mutation(api.users.updateSettings, {
      username: "  Sara_01 ",
      email: " Sara@Example.COM ",
    });
    const me = await a.query(api.users.getCurrentUser, {});
    expect(me).toMatchObject({ username: "sara_01", email: "sara@example.com" });
  });

  test("rejects bad usernames and emails with a field", async () => {
    const { a } = await setup();
    for (const username of ["ab", "has space", "UPPER-dash", "x".repeat(21)]) {
      await expect(
        a.mutation(api.users.updateSettings, { username }),
      ).rejects.toThrow(/username/);
    }
    for (const email of ["nope", "a@b", "a b@c.com", `${"x".repeat(250)}@a.co`]) {
      await expect(
        a.mutation(api.users.updateSettings, { email }),
      ).rejects.toThrow(/email/);
    }
  });

  test("usernames are unique, case-insensitively, but you can keep your own", async () => {
    const { a, b } = await setup();
    await a.mutation(api.users.updateSettings, { username: "sara" });
    await expect(
      b.mutation(api.users.updateSettings, { username: "SARA" }),
    ).rejects.toThrow(/taken/);
    await a.mutation(api.users.updateSettings, { username: "sara" });
  });

  test("an empty string clears a field; omitted fields are untouched", async () => {
    const { a } = await setup();
    await a.mutation(api.users.updateSettings, {
      displayName: "Sara",
      username: "sara",
      email: "s@e.co",
    });
    await a.mutation(api.users.updateSettings, { email: "" });
    const me = await a.query(api.users.getCurrentUser, {});
    expect(me).toMatchObject({ displayName: "Sara", username: "sara" });
    expect(me?.email).toBeUndefined();
    await a.mutation(api.users.updateSettings, { displayName: "" });
    expect((await a.query(api.users.getCurrentUser, {}))?.displayName).toBeUndefined();
  });

  test("a freed username can be claimed by someone else", async () => {
    const { a, b } = await setup();
    await a.mutation(api.users.updateSettings, { username: "sara" });
    await a.mutation(api.users.updateSettings, { username: "" });
    await b.mutation(api.users.updateSettings, { username: "sara" });
    expect((await b.query(api.users.getCurrentUser, {}))?.username).toBe("sara");
  });

  test("signed-out callers are rejected", async () => {
    const { t } = await setup();
    await expect(
      t.mutation(api.users.updateSettings, { username: "sara" }),
    ).rejects.toThrow();
  });

  test("there is no password field on users", async () => {
    const { t, a } = await setup();
    await a.mutation(api.users.updateSettings, { displayName: "Sara" });
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    for (const row of rows) {
      expect(Object.keys(row).join(",")).not.toMatch(/pass|secret|hash/i);
    }
  });
});

describe("profile images", () => {
  const MB = 1024 * 1024;

  async function avatar(who: Awaited<ReturnType<typeof setup>>["a"]) {
    const r = await who.mutation(api.media.reserveAvatarUpload, {
      size: 1000,
      mime: "image/png",
    });
    await who.mutation(api.media.confirmUpload, { mediaId: r.mediaId });
    return r.mediaId;
  }

  test("over 2 MB and unsupported types are rejected", async () => {
    const { a } = await setup();
    await expect(
      a.mutation(api.media.reserveAvatarUpload, { size: 2 * MB + 1, mime: "image/png" }),
    ).rejects.toThrow(/TOO_LARGE/);
    for (const mime of ["image/gif", "application/pdf", "image/svg+xml"]) {
      await expect(
        a.mutation(api.media.reserveAvatarUpload, { size: 100, mime }),
      ).rejects.toThrow();
    }
    const ok = await a.mutation(api.media.reserveAvatarUpload, {
      size: 2 * MB,
      mime: "image/webp",
    });
    expect(ok.r2Key.startsWith("avatars/")).toBe(true);
    expect(ok.keyScope.startsWith("avatar:")).toBe(true);
  });

  test("you can only set your own finished avatar", async () => {
    const { a, b } = await setup();
    const reserved = await a.mutation(api.media.reserveAvatarUpload, {
      size: 100,
      mime: "image/png",
    });
    // not confirmed yet
    await expect(
      a.mutation(api.media.setAvatar, { mediaId: reserved.mediaId }),
    ).rejects.toThrow(/available/);
    await a.mutation(api.media.confirmUpload, { mediaId: reserved.mediaId });
    // someone else's image
    await expect(
      b.mutation(api.media.setAvatar, { mediaId: reserved.mediaId }),
    ).rejects.toThrow(/available/);
    await a.mutation(api.media.setAvatar, { mediaId: reserved.mediaId });
    expect((await a.query(api.users.getCurrentUser, {}))?.imageMediaId).toBe(
      reserved.mediaId,
    );
  });

  test("an experience photo can't be used as an avatar", async () => {
    const { a } = await setup();
    const eventId = await a.mutation(api.events.createDraft, {});
    const photo = await a.mutation(api.media.reserveUpload, {
      eventId,
      size: 100,
      mime: "image/png",
    });
    await a.mutation(api.media.confirmUpload, { mediaId: photo.mediaId });
    await expect(
      a.mutation(api.media.setAvatar, { mediaId: photo.mediaId }),
    ).rejects.toThrow(/available/);
  });

  test("replacing returns the old image; clearing returns the current one", async () => {
    const { a } = await setup();
    const first = await avatar(a);
    expect(await a.mutation(api.media.setAvatar, { mediaId: first })).toBeNull();
    const second = await avatar(a);
    expect(await a.mutation(api.media.setAvatar, { mediaId: second })).toBe(first);
    expect(await a.mutation(api.media.clearAvatar, {})).toBe(second);
    expect(await a.mutation(api.media.clearAvatar, {})).toBeNull();
  });

  test("only you and people who share an experience can view it", async () => {
    const { t, a, b, aId } = await setup();
    const stranger = t.withIdentity({
      subject: await t.run((ctx) => ctx.db.insert("users", {})),
    });
    const mediaId = await avatar(a);
    await a.mutation(api.media.setAvatar, { mediaId });

    expect(await a.query(api.media.getForDownload, { mediaId })).not.toBeNull();
    expect(await b.query(api.media.getForDownload, { mediaId })).toBeNull();
    expect(await stranger.query(api.media.getForDownload, { mediaId })).toBeNull();
    expect(await t.query(api.media.getForDownload, { mediaId })).toBeNull();

    // b gets a grant on one of a's experiences
    const eventId = await a.mutation(api.events.createDraft, {});
    const bId = (await b.query(api.users.getCurrentUser, {}))!.id;
    const sessionId = await t.run((ctx) =>
      ctx.db.insert("sessions", {
        eventId,
        userId: bId,
        grantedBy: aId,
        role: "viewer",
      }),
    );
    expect(await b.query(api.media.getForDownload, { mediaId })).not.toBeNull();
    expect(await stranger.query(api.media.getForDownload, { mediaId })).toBeNull();

    // revoking that grant ends it
    await a.mutation(api.sessions.revoke, { sessionId });
    expect(await b.query(api.media.getForDownload, { mediaId })).toBeNull();
  });

  test("an image in use can't be deleted; after clearing it can, and is then gone", async () => {
    const { a } = await setup();
    const mediaId = await avatar(a);
    await a.mutation(api.media.setAvatar, { mediaId });
    expect(await a.query(api.media.getForDelete, { mediaId })).toBeNull();

    await a.mutation(api.media.clearAvatar, {});
    const target = await a.query(api.media.getForDelete, { mediaId });
    expect(target?.r2Key).toContain("avatars/");

    await a.mutation(api.media.markDeleted, { mediaId });
    expect(await a.query(api.media.getForDelete, { mediaId })).toBeNull();
    expect(await a.query(api.media.getForDownload, { mediaId })).toBeNull();
  });

  test("others can't delete or mark your image deleted", async () => {
    const { a, b } = await setup();
    const mediaId = await avatar(a);
    expect(await b.query(api.media.getForDelete, { mediaId })).toBeNull();
    await expect(b.mutation(api.media.markDeleted, { mediaId })).rejects.toThrow();
  });

  test("users still start with no image", async () => {
    const { t } = await setup();
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    for (const row of rows) expect(row.imageMediaId).toBeUndefined();
  });
});
