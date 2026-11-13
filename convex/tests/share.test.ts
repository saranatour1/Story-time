/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { AGGREGATES } from "../lib/aggregates";
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import cloudflareEmailTest from "@sarant/cloudflare-email-component/test";
import schema from "../schema";
import { SHARE_EMAILS_PER_DAY } from "../lib/limits";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});

const setup = async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  for (const name of AGGREGATES) aggregateTest.register(t, name);
  cloudflareEmailTest.register(t);
  const make = () => t.run((ctx) => ctx.db.insert("users", {}));
  const [ownerId, guestId] = [await make(), await make()];
  const as = (id: Id<"users">) => t.withIdentity({ subject: id });
  const owner = as(ownerId);
  const eventId = await owner.mutation(api.api.events.createDraft, {});
  return { t, ownerId, owner, guest: as(guestId), eventId };
};

type Owner = Awaited<ReturnType<typeof setup>>["owner"];

// A photo attached to a moment of `eventId`, the way the app makes one.
const momentWithPhoto = async (owner: Owner, eventId: Id<"events">) => {
  const { mediaId } = await owner.mutation(api.api.media.reserveUpload, {
    eventId,
    size: 100,
    mime: "image/jpeg",
  });
  await owner.mutation(api.api.media.confirmUpload, { mediaId });
  await owner.mutation(api.api.moments.create, {
    eventId,
    startsAt: Date.UTC(2026, 5, 1, 12),
    place: "Lisbon",
    blocks: [
      { type: "photo", mediaId },
      { type: "note", text: "Tram 28" },
    ],
  });
  return mediaId;
};

// The link is `<origin>/s#<token>`: the token is the fragment.
const tokenOf = (link: string) => link.slice(link.indexOf("#") + 1);

describe("share links", () => {
  test("an experience has no link until its owner switches one on", async () => {
    const { owner, eventId } = await setup();
    expect(await owner.query(api.api.share.link, { eventId })).toBeNull();
    expect((await owner.query(api.api.events.get, { eventId }))?.visibility).toBe("private");
  });

  test("a link opens the story with no account, and names no one", async () => {
    const { t, ownerId, owner, eventId } = await setup();
    await momentWithPhoto(owner, eventId);
    const link = await owner.mutation(api.api.share.enable, { eventId });
    // Named after the title, with the key after "#".
    expect(link).toMatch(/\/s\/untitled-experience-[a-z0-9]{4}#[A-Za-z0-9_-]{20,64}$/);
    // Switching on again hands back the same link.
    expect(await owner.mutation(api.api.share.enable, { eventId })).toBe(link);
    expect(await owner.query(api.api.share.link, { eventId })).toBe(link);
    expect((await owner.query(api.api.events.get, { eventId }))?.visibility).toBe("link");

    const story = await t.query(api.api.share.get, { token: tokenOf(link) });
    expect(story?.event).toMatchObject({
      _id: eventId,
      title: "Untitled experience",
      momentCount: 1,
    });
    expect(story?.moments).toHaveLength(1);
    expect(story?.moments[0]?.place).toBe("Lisbon");
    expect(story?.moments[0]?.blocks.map((b) => b.type)).toEqual(["photo", "note"]);
    expect(story?.moments[0]).not.toHaveProperty("authorId");
    expect(story?.moments[0]).not.toHaveProperty("authorName");
    expect(JSON.stringify(story)).not.toContain(ownerId);
  });

  test("a shared story carries each moment's offset, so its times read where it happened", async () => {
    const { t, owner, eventId } = await setup();
    await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: Date.UTC(2025, 10, 8, 22, 15),
      tzOffsetMinutes: 540,
      place: "Kyoto",
      blocks: [{ type: "note", text: "Fushimi Inari" }],
    });
    const token = tokenOf(await owner.mutation(api.api.share.enable, { eventId }));
    const story = await t.query(api.api.share.get, { token });
    expect(story?.moments[0]?.tzOffsetMinutes).toBe(540);
  });

  test("disabling the link closes it, and switching on again makes a new one", async () => {
    const { t, owner, eventId } = await setup();
    const token = tokenOf(await owner.mutation(api.api.share.enable, { eventId }));
    await owner.mutation(api.api.share.disable, { eventId });
    expect(await t.query(api.api.share.get, { token })).toBeNull();
    expect(await owner.query(api.api.share.link, { eventId })).toBeNull();
    expect((await owner.query(api.api.events.get, { eventId }))?.visibility).toBe("private");

    const again = await owner.mutation(api.api.share.enable, { eventId });
    expect(tokenOf(again)).not.toBe(token);
  });

  test("rotating makes a new link and the old one stops working", async () => {
    const { t, owner, eventId } = await setup();
    const first = await owner.mutation(api.api.share.enable, { eventId });
    const second = await owner.mutation(api.api.share.rotate, { eventId });
    expect(second).not.toBe(first);
    expect(await t.query(api.api.share.get, { token: tokenOf(first) })).toBeNull();
    expect(await t.query(api.api.share.get, { token: tokenOf(second) })).not.toBeNull();
    expect(await owner.query(api.api.share.link, { eventId })).toBe(second);
  });

  test("malformed and unknown tokens read the same: no story", async () => {
    const { t, owner, eventId } = await setup();
    const token = tokenOf(await owner.mutation(api.api.share.enable, { eventId }));
    const mediaId = await momentWithPhoto(owner, eventId);
    const bad = [
      "",
      "short",
      "x".repeat(65),
      `${token}=`,
      "bad token with spaces!",
      token.slice(1),
    ];
    for (const candidate of bad) {
      expect(await t.query(api.api.share.get, { token: candidate })).toBeNull();
      expect(await t.query(api.api.share.mediaForShare, { token: candidate, mediaId })).toBeNull();
    }
    // Well-formed, but never issued.
    expect(await t.query(api.api.share.get, { token: "A".repeat(32) })).toBeNull();
  });

  test("a picture comes through a link only from a moment of that experience", async () => {
    const { t, owner, eventId } = await setup();
    const onMoment = await momentWithPhoto(owner, eventId);
    // Uploaded but never attached to a moment.
    const { mediaId: loose } = await owner.mutation(api.api.media.reserveUpload, {
      eventId,
      size: 100,
      mime: "image/jpeg",
    });
    await owner.mutation(api.api.media.confirmUpload, { mediaId: loose });
    // A picture from another experience.
    const other = await owner.mutation(api.api.events.createDraft, {});
    const elsewhere = await momentWithPhoto(owner, other);
    const token = tokenOf(await owner.mutation(api.api.share.enable, { eventId }));

    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: onMoment })).toMatchObject({
      mime: "image/jpeg",
      keyScope: eventId,
    });
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: loose })).toBeNull();
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: elsewhere })).toBeNull();
  });

  test("only the owner can switch a link on, and archived experiences can't", async () => {
    const { owner, guest, eventId } = await setup();
    await expect(guest.mutation(api.api.share.enable, { eventId })).rejects.toThrow(
      /Event not found/,
    );
    await expect(guest.query(api.api.share.link, { eventId })).rejects.toThrow(/Event not found/);

    await owner.mutation(api.api.events.update, { eventId, status: "archived" });
    await expect(owner.mutation(api.api.share.enable, { eventId })).rejects.toThrow(/ARCHIVED/);
    await expect(owner.mutation(api.api.share.rotate, { eventId })).rejects.toThrow(/ARCHIVED/);
  });

  test("the change log records that a link changed, never the link", async () => {
    const { t, owner, eventId } = await setup();
    const token = tokenOf(await owner.mutation(api.api.share.enable, { eventId }));
    const rows = await t.run((ctx) => ctx.db.query("changes").collect());
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  test("a link can hide every picture, and the payload has no media id", async () => {
    const { t, owner, guest, eventId } = await setup();
    const photo = await momentWithPhoto(owner, eventId);
    const { mediaId: video } = await owner.mutation(api.api.media.reserveUpload, {
      eventId,
      size: 100,
      mime: "video/mp4",
    });
    await owner.mutation(api.api.media.confirmUpload, { mediaId: video });
    await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: Date.UTC(2026, 5, 2, 12),
      place: "Porto",
      blocks: [
        { type: "video", mediaId: video },
        { type: "note", text: "The river" },
      ],
    });

    expect((await owner.query(api.api.share.shown, { eventId })).photos).toBe(true);
    await expect(
      guest.mutation(api.api.share.setShown, { eventId, part: "photos", show: false }),
    ).rejects.toThrow(/Event not found/);
    const link = await owner.mutation(api.api.share.enable, { eventId });
    const token = tokenOf(link);
    // The ordinary link still carries the picture, so hiding is a choice.
    expect(JSON.stringify(await t.query(api.api.share.get, { token }))).toContain(photo);

    await owner.mutation(api.api.share.setShown, { eventId, part: "photos", show: false });
    expect((await owner.query(api.api.share.shown, { eventId })).photos).toBe(false);
    const story = await t.query(api.api.share.get, { token });

    const payload = JSON.stringify(story);
    expect(payload).not.toContain("mediaId");
    expect(payload).not.toContain(photo);
    expect(payload).not.toContain(video);
    expect(story?.moments.flatMap((m) => m.blocks.map((b) => b.type)).sort()).toEqual([
      "note",
      "note",
    ]);
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: photo })).toBeNull();
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: video })).toBeNull();

    await owner.mutation(api.api.share.setShown, { eventId, part: "photos", show: true });
    expect(JSON.stringify(await t.query(api.api.share.get, { token }))).toContain(photo);
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: photo })).toMatchObject({
      mime: "image/jpeg",
    });
  });

  test("the share link can be emailed, only when it is on and email is configured", async () => {
    const { t, owner, guest, eventId } = await setup();
    const send = (to: string) => owner.mutation(api.api.share.emailLink, { eventId, to });
    await expect(send("friend@example.com")).rejects.toThrow(/Switch the share link on first/);
    const link = await owner.mutation(api.api.share.enable, { eventId });
    const token = tokenOf(link);
    await expect(send("not-an-email")).rejects.toThrow(/Enter a valid email/);
    await expect(
      guest.mutation(api.api.share.emailLink, { eventId, to: "friend@example.com" }),
    ).rejects.toThrow(/Event not found/);
    expect((await send("friend@example.com")).emailed).toBe(false);

    const cf = { CF_ACCOUNT_ID: "acct", CF_EMAIL_TOKEN: "token", EMAIL_FROM: "a@example.com" };
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ result: {} })),
    );
    // eslint-disable-next-line @convex-dev/no-process-env -- test setup
    Object.assign(process.env, cf);
    try {
      for (let i = 0; i < SHARE_EMAILS_PER_DAY; i++) {
        expect((await send(`friend${i}@example.com`)).emailed).toBe(true);
      }
      await expect(send("one-more@example.com")).rejects.toThrow(/RATE_LIMITED/);
      const changes = await t.run((ctx) => ctx.db.query("changes").collect());
      const logged = JSON.stringify(changes);
      expect(logged).not.toContain(token);
      expect(logged).not.toContain("friend0@example.com");
      expect(changes.some((c) => c.fields.includes("shareEmail"))).toBe(true);

      // A minute past the day: convex-test's clock creeps ahead of a frozen fake one.
      vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 60_000);
      expect((await send("tomorrow@example.com")).emailed).toBe(true);
    } finally {
      // eslint-disable-next-line @convex-dev/no-process-env -- test setup
      for (const key of Object.keys(cf)) delete process.env[key];
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  test("taking visibility off through events.update switches the link off", async () => {
    const { t, owner, eventId } = await setup();
    const token = tokenOf(await owner.mutation(api.api.share.enable, { eventId }));
    await owner.mutation(api.api.events.update, { eventId, visibility: "private" });
    expect(await t.query(api.api.share.get, { token })).toBeNull();
    expect(await owner.query(api.api.share.link, { eventId })).toBeNull();
  });

  test("a link keeps its name when it is renewed, and no two share one", async () => {
    const { owner, eventId } = await setup();
    const nameOf = (link: string) => link.slice(link.indexOf("/s/") + 3, link.indexOf("#"));
    const first = await owner.mutation(api.api.share.enable, { eventId });
    const second = await owner.mutation(api.api.share.rotate, { eventId });
    expect(nameOf(second)).toBe(nameOf(first));
    expect(tokenOf(second)).not.toBe(tokenOf(first));

    const other = await owner.mutation(api.api.events.createDraft, {});
    const theirs = await owner.mutation(api.api.share.enable, { eventId: other });
    expect(nameOf(theirs)).not.toBe(nameOf(first));
  });

  test("with the film off, the link says so and carries no map pins", async () => {
    const { t, owner, guest, eventId } = await setup();
    await owner.mutation(api.api.moments.create, {
      eventId,
      startsAt: Date.UTC(2026, 5, 1, 12),
      place: "Lisbon",
      geo: { lat: 38.7, lng: -9.1 },
      blocks: [{ type: "note", text: "Tram 28" }],
    });
    const token = tokenOf(await owner.mutation(api.api.share.enable, { eventId }));
    const before = await t.query(api.api.share.get, { token });
    expect(before?.film).toBe(true);
    expect(before?.moments[0]?.geo).toEqual({ lat: 38.7, lng: -9.1 });

    await expect(
      guest.mutation(api.api.share.setShown, { eventId, part: "film", show: false }),
    ).rejects.toThrow(/Event not found/);
    await owner.mutation(api.api.share.setShown, { eventId, part: "film", show: false });
    expect(await owner.query(api.api.share.shown, { eventId })).toEqual({
      photos: true,
      film: false,
    });
    const after = await t.query(api.api.share.get, { token });
    expect(after?.film).toBe(false);
    expect(after?.moments[0]?.place).toBe("Lisbon");
    expect(JSON.stringify(after)).not.toContain("38.7");
  });

  test("a blocked account is shut out, and so is everything it shared", async () => {
    const { t, ownerId, owner, guest, eventId } = await setup();
    await t.run(async (ctx) => {
      const guestId = (await ctx.db.query("users").collect()).find((u) => u._id !== ownerId)!._id;
      await ctx.db.insert("sessions", {
        eventId,
        userId: guestId,
        grantedBy: ownerId,
        role: "viewer",
      });
    });
    expect(await guest.query(api.api.events.get, { eventId })).not.toBeNull();
    const token = tokenOf(await owner.mutation(api.api.share.enable, { eventId }));
    await t.run((ctx) => ctx.db.patch("users", ownerId, { email: "a@b.co", emailVerified: true }));

    await t.mutation(internal.model.users.block, { userId: ownerId, reason: "malware" });
    expect(await owner.query(api.api.users.getCurrentUser, {})).toBeNull();
    expect(await owner.query(api.api.events.get, { eventId })).toBeNull();
    await expect(
      owner.mutation(api.api.media.reserveUpload, { eventId, size: 100, mime: "image/jpeg" }),
    ).rejects.toThrow();
    await expect(owner.mutation(api.api.events.createDraft, {})).rejects.toThrow();
    // The public link and the invited guest are closed too.
    expect(await t.query(api.api.share.get, { token })).toBeNull();
    expect(await guest.query(api.api.events.get, { eventId })).toBeNull();
    // A new login on the same verified email gets no fresh account.
    const again = {
      provider: {
        name: "google" as const,
        accountId: "new-login",
        profile: { id: "new-login", email: "a@b.co", emailVerified: true },
      },
    };
    await expect(t.mutation(internal.model.users.createGoogleUser, again)).rejects.toThrow(
      /closed/,
    );

    await t.mutation(internal.model.users.block, { userId: ownerId, lift: true });
    expect(await t.query(api.api.share.get, { token })).not.toBeNull();
    expect(await t.mutation(internal.model.users.createGoogleUser, again)).toBe(ownerId);
  });
});
