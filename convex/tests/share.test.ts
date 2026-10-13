/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import emailSchema from "../components/email/schema";
import schema from "../schema";
import { SHARE_EMAILS_PER_DAY } from "../lib/limits";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);
const emailModules = import.meta.glob([
  "../components/email/**/*.ts",
  "../components/email/**/*.js",
]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(
    String.fromCharCode(...new Uint8Array(32).fill(7)),
  );
});

const setup = async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  t.registerComponent("email", emailSchema, emailModules);
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
    blocks: [{ type: "photo", mediaId }, { type: "note", text: "Tram 28" }],
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
    expect(link).toMatch(/\/s#[A-Za-z0-9_-]{20,64}$/);
    // Switching on again hands back the same link.
    expect(await owner.mutation(api.api.share.enable, { eventId })).toBe(link);
    expect(await owner.query(api.api.share.link, { eventId })).toBe(link);
    expect((await owner.query(api.api.events.get, { eventId }))?.visibility).toBe("link");

    const story = await t.query(api.api.share.get, { token: tokenOf(link) });
    expect(story?.event).toMatchObject({ _id: eventId, title: "Untitled experience", momentCount: 1 });
    expect(story?.moments).toHaveLength(1);
    expect(story?.moments[0]?.place).toBe("Lisbon");
    expect(story?.moments[0]?.blocks.map((b) => b.type)).toEqual(["photo", "note"]);
    expect(story?.moments[0]).not.toHaveProperty("authorId");
    expect(story?.moments[0]).not.toHaveProperty("authorName");
    expect(JSON.stringify(story)).not.toContain(ownerId);
  });

  test("a link opens the book, one page at a time, and not another experience's page", async () => {
    const { t, owner, eventId } = await setup();
    await momentWithPhoto(owner, eventId);
    await t.finishAllScheduledFunctions(() => undefined);
    const { mediaId: shelf } = await owner.mutation(api.api.media.reserveUpload, { eventId, size: 100, mime: "image/png" });
    await owner.mutation(api.api.media.confirmUpload, { mediaId: shelf });
    await owner.mutation(api.api.journal.keepSticker, { mediaId: shelf });
    const token = tokenOf(await owner.mutation(api.api.share.enable, { eventId }));

    const book = await t.query(api.api.share.journal, { token });
    expect(book?.pages.map((p) => p.label)).toEqual(["Untitled experience", "Lisbon"]);
    expect(book?.pages[0]).not.toHaveProperty("elements");
    const momentPage = book?.pages[1];
    const page = await t.query(api.api.share.page, { token, pageId: momentPage!._id });
    expect(page?.elements.find((e) => e.kind === "note")?.text).toBe("Tram 28");
    expect(page?.elements.some((e) => e.mediaId === shelf)).toBe(false);
    const stored = await t.run((ctx) => ctx.db.query("journalPages").take(10));
    expect(JSON.stringify(stored)).not.toContain("Tram 28");

    const other = await owner.mutation(api.api.events.createDraft, {});
    const foreign = await owner.mutation(api.api.journal.addPage, { eventId: other });
    expect(await t.query(api.api.share.page, { token, pageId: foreign })).toBeNull();
    expect(await t.query(api.api.share.journal, { token: "A".repeat(32) })).toBeNull();
    expect(await t.query(api.api.share.page, { token: "A".repeat(32), pageId: momentPage!._id })).toBeNull();
    await owner.mutation(api.api.share.disable, { eventId });
    expect(await t.query(api.api.share.journal, { token })).toBeNull();
    expect(await t.query(api.api.share.page, { token, pageId: momentPage!._id })).toBeNull();
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
    const bad = ["", "short", "x".repeat(65), `${token}=`, "bad token with spaces!", token.slice(1)];
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

  test("a sticker is readable through a link only when a page of that experience shows it", async () => {
    const { t, owner, eventId } = await setup();
    const upload = async (id: Id<"events">) => {
      const { mediaId } = await owner.mutation(api.api.media.reserveUpload, { eventId: id, size: 100, mime: "image/png" });
      await owner.mutation(api.api.media.confirmUpload, { mediaId });
      await owner.mutation(api.api.journal.keepSticker, { mediaId });
      return mediaId;
    };
    const onPage = await upload(eventId);
    const shelf = await upload(eventId);
    const pageId = await owner.mutation(api.api.journal.addPage, { eventId });
    await owner.mutation(api.api.journal.savePage, {
      pageId,
      elements: [{ id: "s1", kind: "sticker", x: 10, y: 10, w: 80, h: 80, rotation: 0, z: 1, mediaId: onPage }],
    });
    const other = await owner.mutation(api.api.events.createDraft, {});
    const foreign = await upload(other);
    const foreignPage = await owner.mutation(api.api.journal.addPage, { eventId: other });
    await owner.mutation(api.api.journal.savePage, {
      pageId: foreignPage,
      elements: [{ id: "s2", kind: "sticker", x: 10, y: 10, w: 80, h: 80, rotation: 0, z: 1, mediaId: foreign }],
    });
    const { mediaId: loose } = await owner.mutation(api.api.media.reserveUpload, { eventId, size: 100, mime: "image/jpeg" });
    await owner.mutation(api.api.media.confirmUpload, { mediaId: loose });
    const token = tokenOf(await owner.mutation(api.api.share.enable, { eventId }));

    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: onPage })).toMatchObject({ mime: "image/png", keyScope: eventId });
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: shelf })).toBeNull();
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: foreign })).toBeNull();
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: loose })).toBeNull();
  });

  test("only the owner can switch a link on, and archived experiences can't", async () => {
    const { owner, guest, eventId } = await setup();
    await expect(guest.mutation(api.api.share.enable, { eventId })).rejects.toThrow(/Event not found/);
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

  test("a link can hide every picture, and the payload has no media id or image url", async () => {
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
    const { mediaId: sticker } = await owner.mutation(api.api.media.reserveUpload, {
      eventId,
      size: 100,
      mime: "image/png",
    });
    await owner.mutation(api.api.media.confirmUpload, { mediaId: sticker });
    await owner.mutation(api.api.journal.keepSticker, { mediaId: sticker });
    await t.finishAllScheduledFunctions(() => undefined);
    const book = await owner.query(api.api.journal.outline, { eventId });
    const pageId = book.pages[1]!._id;
    const image = "https://cdn.example.com/og-photo.jpg";
    const httpImage = "http://cdn.example.com/plain.jpg";
    await owner.mutation(api.api.journal.savePage, {
      pageId,
      elements: [
        { id: "p1", kind: "photo", x: 40, y: 40, w: 200, h: 200, rotation: 0, z: 1, mediaId: photo },
        { id: "s1", kind: "sticker", x: 80, y: 80, w: 80, h: 80, rotation: 0, z: 2, mediaId: sticker },
        { id: "n1", kind: "note", x: 40, y: 300, w: 300, h: 80, rotation: 0, z: 3, text: "Tram 28" },
        {
          id: "l1",
          kind: "link",
          x: 40,
          y: 420,
          w: 280,
          h: 120,
          rotation: 0,
          z: 4,
          style: "card",
          text: JSON.stringify({
            url: "https://example.com/tram",
            title: "Tram",
            image,
          }),
        },
        {
          id: "l2",
          kind: "link",
          x: 40,
          y: 560,
          w: 280,
          h: 120,
          rotation: 0,
          z: 5,
          style: "card",
          text: JSON.stringify({
            url: "https://example.com/night",
            title: "Night",
            image: httpImage,
          }),
        },
      ],
    });

    expect(await owner.query(api.api.share.hidePhotos, { eventId })).toBe(false);
    await expect(guest.mutation(api.api.share.setHidePhotos, { eventId, hide: true })).rejects.toThrow(/Event not found/);
    const link = await owner.mutation(api.api.share.enable, { eventId });
    const token = tokenOf(link);
    // The ordinary link still carries the picture, so hiding is a choice.
    expect(JSON.stringify(await t.query(api.api.share.get, { token }))).toContain(photo);

    await owner.mutation(api.api.share.setHidePhotos, { eventId, hide: true });
    expect(await owner.query(api.api.share.hidePhotos, { eventId })).toBe(true);
    const story = await t.query(api.api.share.get, { token });
    const page = await t.query(api.api.share.page, { token, pageId });
    const owned = await owner.query(api.api.journal.page, { pageId });
    expect(owned?.elements.some((e) => e.mediaId === photo)).toBe(true);

    const payload = JSON.stringify({ story, page });
    expect(payload).not.toContain("mediaId");
    expect(payload).not.toContain(photo);
    expect(payload).not.toContain(video);
    expect(payload).not.toContain(sticker);
    expect(payload).not.toContain(image);
    expect(payload).not.toContain(httpImage);
    expect(payload).not.toMatch(/https?:\/\/[^"\\]+\.(jpg|jpeg|png|gif|webp|svg)/i);
    expect(story?.moments.flatMap((m) => m.blocks.map((b) => b.type)).sort()).toEqual(["note", "note"]);
    expect(page?.elements.map((e) => e.kind).sort()).toEqual(["link", "link", "note"]);
    expect(page?.elements.find((e) => e.kind === "note")?.text).toBe("Tram 28");
    const linkText = page?.elements.filter((e) => e.kind === "link").map((e) => e.text).join("\n") ?? "";
    expect(linkText).toContain("https://example.com/tram");
    expect(linkText).toContain("https://example.com/night");
    expect(linkText).not.toContain("image");
    expect(linkText).not.toContain(httpImage);
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: photo })).toBeNull();
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: video })).toBeNull();
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: sticker })).toBeNull();

    await owner.mutation(api.api.share.setHidePhotos, { eventId, hide: false });
    const shown = JSON.stringify(await t.query(api.api.share.page, { token, pageId }));
    expect(shown).toContain(photo);
    expect(shown).toContain(httpImage);
    expect(await t.query(api.api.share.mediaForShare, { token, mediaId: photo })).toMatchObject({ mime: "image/jpeg" });
  });

  test("the share link can be emailed, only when it is on and email is configured", async () => {
    const { t, owner, guest, eventId } = await setup();
    const send = (to: string) => owner.mutation(api.api.share.emailLink, { eventId, to });
    await expect(send("friend@example.com")).rejects.toThrow(/Switch the share link on first/);
    const link = await owner.mutation(api.api.share.enable, { eventId });
    const token = tokenOf(link);
    await expect(send("not-an-email")).rejects.toThrow(/Enter a valid email/);
    await expect(guest.mutation(api.api.share.emailLink, { eventId, to: "friend@example.com" })).rejects.toThrow(
      /Event not found/,
    );
    expect((await send("friend@example.com")).emailed).toBe(false);

    const cf = { CF_ACCOUNT_ID: "acct", CF_EMAIL_TOKEN: "token", EMAIL_FROM: "a@example.com" };
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ result: {} })));
    // eslint-disable-next-line @convex-dev/no-process-env -- test setup
    Object.assign(process.env, cf);
    try {
      for (let i = 0; i < SHARE_EMAILS_PER_DAY; i++) {
        expect((await send(`friend${i}@example.com`)).emailed).toBe(true);
      }
      await expect(send("one-more@example.com")).rejects.toThrow(/RATE_LIMITED/);
      const rows = await t.run((ctx) => ctx.db.query("shareEmails").collect());
      expect(rows).toHaveLength(SHARE_EMAILS_PER_DAY);
      expect(JSON.stringify(rows)).not.toContain("friend");
      const changes = await t.run((ctx) => ctx.db.query("changes").collect());
      const logged = JSON.stringify(changes);
      expect(logged).not.toContain(token);
      expect(logged).not.toContain("friend0@example.com");
      expect(changes.some((c) => c.fields.includes("shareEmail"))).toBe(true);

      vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 1);
      expect((await send("tomorrow@example.com")).emailed).toBe(true);
      expect(await t.run((ctx) => ctx.db.query("shareEmails").collect())).toHaveLength(1);
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
});
