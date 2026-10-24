/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeAll, describe, expect, test } from "vite-plus/test";
import { api, internal } from "../_generated/api";
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
  const [aId, bId] = [await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  return { t, a: as(aId), b: as(bId), aId };
};

describe("profile fields", () => {
  test("username and email are optional and stored normalised", async () => {
    const { a } = await setup();
    await a.mutation(api.api.users.updateSettings, {
      username: "  Sara_01 ",
      email: " Sara@Example.COM ",
    });
    const me = await a.query(api.api.users.getCurrentUser, {});
    expect(me).toMatchObject({
      username: "sara_01",
      pendingEmail: "sara@example.com",
      emailVerified: false,
    });
    expect(me?.email).toBeUndefined();
  });

  test("rejects bad usernames and emails with a field", async () => {
    const { a } = await setup();
    for (const username of ["ab", "has space", "UPPER-dash", "x".repeat(21)]) {
      await expect(a.mutation(api.api.users.updateSettings, { username })).rejects.toThrow(
        /username/,
      );
    }
    for (const email of ["nope", "a@b", "a b@c.com", `${"x".repeat(250)}@a.co`]) {
      await expect(a.mutation(api.api.users.updateSettings, { email })).rejects.toThrow(/email/);
    }
  });

  test("usernames are unique, case-insensitively, but you can keep your own", async () => {
    const { a, b } = await setup();
    await a.mutation(api.api.users.updateSettings, { username: "sara" });
    await expect(b.mutation(api.api.users.updateSettings, { username: "SARA" })).rejects.toThrow(
      /taken/,
    );
    await a.mutation(api.api.users.updateSettings, { username: "sara" });
  });

  test("an empty string clears a field; omitted fields are untouched", async () => {
    const { a } = await setup();
    await a.mutation(api.api.users.updateSettings, {
      displayName: "Sara",
      username: "sara",
      email: "s@e.co",
    });
    await a.mutation(api.api.users.updateSettings, { email: "" });
    const me = await a.query(api.api.users.getCurrentUser, {});
    expect(me).toMatchObject({ displayName: "Sara", username: "sara" });
    expect(me?.email).toBeUndefined();
    expect(me?.pendingEmail).toBeUndefined();
    await a.mutation(api.api.users.updateSettings, { displayName: "" });
    expect((await a.query(api.api.users.getCurrentUser, {}))?.displayName).toBeUndefined();
  });

  test("a freed username can be claimed by someone else", async () => {
    const { a, b } = await setup();
    await a.mutation(api.api.users.updateSettings, { username: "sara" });
    await a.mutation(api.api.users.updateSettings, { username: "" });
    await b.mutation(api.api.users.updateSettings, { username: "sara" });
    expect((await b.query(api.api.users.getCurrentUser, {}))?.username).toBe("sara");
  });

  test("signed-out callers are rejected", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.api.users.updateSettings, { username: "sara" })).rejects.toThrow();
  });

  test("there is no password field on users", async () => {
    const { t, a } = await setup();
    await a.mutation(api.api.users.updateSettings, { displayName: "Sara" });
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    for (const row of rows) {
      expect(Object.keys(row).join(",")).not.toMatch(/pass|secret|hash/i);
    }
  });
});

describe("profile images", () => {
  const MB = 1024 * 1024;

  const avatar = async (who: Awaited<ReturnType<typeof setup>>["a"]) => {
    const r = await who.mutation(api.api.media.reserveAvatarUpload, {
      size: 1000,
      mime: "image/png",
    });
    await who.mutation(api.api.media.confirmUpload, { mediaId: r.mediaId });
    return r.mediaId;
  };

  test("over 2 MB and unsupported types are rejected", async () => {
    const { a } = await setup();
    await expect(
      a.mutation(api.api.media.reserveAvatarUpload, { size: 2 * MB + 1, mime: "image/png" }),
    ).rejects.toThrow(/TOO_LARGE/);
    for (const mime of ["image/gif", "application/pdf", "image/svg+xml"]) {
      await expect(
        a.mutation(api.api.media.reserveAvatarUpload, { size: 100, mime }),
      ).rejects.toThrow();
    }
    const ok = await a.mutation(api.api.media.reserveAvatarUpload, {
      size: 2 * MB,
      mime: "image/webp",
    });
    expect(ok.r2Key.startsWith("avatars/")).toBe(true);
    expect(ok.keyScope.startsWith("avatar:")).toBe(true);
  });

  test("you can only set your own finished avatar", async () => {
    const { a, b } = await setup();
    const reserved = await a.mutation(api.api.media.reserveAvatarUpload, {
      size: 100,
      mime: "image/png",
    });
    // not confirmed yet
    await expect(
      a.mutation(api.api.media.setAvatar, { mediaId: reserved.mediaId }),
    ).rejects.toThrow(/available/);
    await a.mutation(api.api.media.confirmUpload, { mediaId: reserved.mediaId });
    // someone else's image
    await expect(
      b.mutation(api.api.media.setAvatar, { mediaId: reserved.mediaId }),
    ).rejects.toThrow(/available/);
    await a.mutation(api.api.media.setAvatar, { mediaId: reserved.mediaId });
    expect((await a.query(api.api.users.getCurrentUser, {}))?.imageMediaId).toBe(reserved.mediaId);
  });

  test("an experience photo can't be used as an avatar", async () => {
    const { a } = await setup();
    const eventId = await a.mutation(api.api.events.createDraft, {});
    const photo = await a.mutation(api.api.media.reserveUpload, {
      eventId,
      size: 100,
      mime: "image/png",
    });
    await a.mutation(api.api.media.confirmUpload, { mediaId: photo.mediaId });
    await expect(a.mutation(api.api.media.setAvatar, { mediaId: photo.mediaId })).rejects.toThrow(
      /available/,
    );
  });

  test("replacing returns the old image; clearing returns the current one", async () => {
    const { a } = await setup();
    const first = await avatar(a);
    expect(await a.mutation(api.api.media.setAvatar, { mediaId: first })).toBeNull();
    const second = await avatar(a);
    expect(await a.mutation(api.api.media.setAvatar, { mediaId: second })).toBe(first);
    expect(await a.mutation(api.api.media.clearAvatar, {})).toBe(second);
    expect(await a.mutation(api.api.media.clearAvatar, {})).toBeNull();
  });

  test("only you and people who share an experience can view it", async () => {
    const { t, a, b, aId } = await setup();
    const stranger = t.withIdentity({
      subject: await t.run((ctx) => ctx.db.insert("users", {})),
    });
    const mediaId = await avatar(a);
    await a.mutation(api.api.media.setAvatar, { mediaId });

    expect(await a.query(api.api.media.getForDownload, { mediaId })).not.toBeNull();
    expect(await b.query(api.api.media.getForDownload, { mediaId })).toBeNull();
    expect(await stranger.query(api.api.media.getForDownload, { mediaId })).toBeNull();
    expect(await t.query(api.api.media.getForDownload, { mediaId })).toBeNull();

    // b gets a grant on one of a's experiences
    const eventId = await a.mutation(api.api.events.createDraft, {});
    const bId = (await b.query(api.api.users.getCurrentUser, {}))!.id;
    const sessionId = await t.run((ctx) =>
      ctx.db.insert("sessions", {
        eventId,
        userId: bId,
        grantedBy: aId,
        role: "viewer",
      }),
    );
    expect(await b.query(api.api.media.getForDownload, { mediaId })).not.toBeNull();
    expect(await stranger.query(api.api.media.getForDownload, { mediaId })).toBeNull();

    // revoking that grant ends it
    await a.mutation(api.api.sessions.revoke, { sessionId });
    expect(await b.query(api.api.media.getForDownload, { mediaId })).toBeNull();
  });

  test("an image in use can't be deleted; after clearing it can, and is then gone", async () => {
    const { a } = await setup();
    const mediaId = await avatar(a);
    await a.mutation(api.api.media.setAvatar, { mediaId });
    expect(await a.query(api.api.media.getForDelete, { mediaId })).toBeNull();

    await a.mutation(api.api.media.clearAvatar, {});
    const target = await a.query(api.api.media.getForDelete, { mediaId });
    expect(target?.r2Key).toContain("avatars/");

    await a.mutation(api.api.media.markDeleted, { mediaId });
    expect(await a.query(api.api.media.getForDelete, { mediaId })).toBeNull();
    expect(await a.query(api.api.media.getForDownload, { mediaId })).toBeNull();
  });

  test("others can't delete or mark your image deleted", async () => {
    const { a, b } = await setup();
    const mediaId = await avatar(a);
    expect(await b.query(api.api.media.getForDelete, { mediaId })).toBeNull();
    await expect(b.mutation(api.api.media.markDeleted, { mediaId })).rejects.toThrow();
  });

  test("users still start with no image", async () => {
    const { t } = await setup();
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    for (const row of rows) expect(row.imageMediaId).toBeUndefined();
  });
});

describe("oauth contact email", () => {
  test("a verified GitHub or Google email is copied, and the name and picture are not", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    const githubId = await t.mutation(internal.model.users.createGithubUser, {
      provider: {
        name: "github",
        accountId: "gh-1",
        profile: {
          id: "gh-1",
          login: "sara",
          name: "Sara",
          email: " Sara@Example.COM ",
          emailVerified: true,
          avatarUrl: "https://example.com/a.png",
        },
      },
    });
    const github = await t.run((ctx) => ctx.db.get("users", githubId));
    expect(github).toMatchObject({ email: "sara@example.com", emailVerified: true });
    expect(github?.displayName).toBeUndefined();
    expect(github?.imageMediaId).toBeUndefined();

    const googleId = await t.mutation(internal.model.users.createGoogleUser, {
      provider: {
        name: "google",
        accountId: "g-1",
        profile: {
          id: "g-1",
          email: "Ada@Example.com",
          emailVerified: true,
          name: "Ada",
          picture: "https://example.com/p.png",
        },
      },
    });
    const google = await t.run((ctx) => ctx.db.get("users", googleId));
    expect(google).toMatchObject({ email: "ada@example.com", emailVerified: true });
    expect(google?.displayName).toBeUndefined();
  });

  test("an unverified or unusable address is not copied", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    const unverified = await t.mutation(internal.model.users.createGithubUser, {
      provider: {
        name: "github",
        accountId: "gh-2",
        profile: { id: "gh-2", login: "nope", email: "nope@example.com", emailVerified: false },
      },
    });
    expect((await t.run((ctx) => ctx.db.get("users", unverified)))?.email).toBeUndefined();

    const missing = await t.mutation(internal.model.users.createGoogleUser, {
      provider: { name: "google", accountId: "g-2", profile: { id: "g-2", emailVerified: true } },
    });
    expect((await t.run((ctx) => ctx.db.get("users", missing)))?.email).toBeUndefined();

    const bad = await t.mutation(internal.model.users.createGoogleUser, {
      provider: {
        name: "google",
        accountId: "g-3",
        profile: { id: "g-3", email: "not-an-email", emailVerified: true },
      },
    });
    expect((await t.run((ctx) => ctx.db.get("users", bad)))?.email).toBeUndefined();
  });
});
