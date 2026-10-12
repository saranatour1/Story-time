import { ConvexError, v, type Infer } from "convex/values";
import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { assertNotArchived, requireEventAccess } from "../lib/access";
import { appOrigin } from "../lib/appUrl";
import { emailConfigured, replyAddress } from "../lib/emailAddress";
import { recordChange } from "../lib/changes";
import { decryptText, encryptText, readText, shareKeyFor } from "../lib/crypto";
import { contentsOf, pageInEvent } from "./journal";
import { MAX_JOURNAL_PAGES } from "../lib/journal";
import { isSharedPdf } from "../lib/sharedPdf";
import { listForEvent, type PlainBlock, vMomentView } from "./moments";

// "Anyone with the link can watch". The link carries a random token in its
// fragment, which browsers never send to a server, so it stays out of logs.
// Off until the owner switches it on.

// Same shape as an invite token: 24 random bytes, base64url.
const newToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// Checked before any hashing, so junk never reaches the key derivation.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,64}$/;

const linkFor = (token: string) => `${appOrigin()}/s#${token}`;

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAILS_PER_DAY = 20;

// Counts share-link emails per sender over a rolling day. The address itself
// is not stored.
const chargeShareEmail = async (ctx: MutationCtx, userId: Id<"users">) => {
  const since = Date.now() - DAY_MS;
  const recent = await ctx.db
    .query("shareEmails")
    .withIndex("by_user", (q) => q.eq("userId", userId).gt("_creationTime", since))
    .take(EMAILS_PER_DAY);
  if (recent.length >= EMAILS_PER_DAY) {
    throw new ConvexError({
      code: "RATE_LIMITED",
      message: `You can email a share link up to ${EMAILS_PER_DAY} times a day. Copy the link and send it yourself.`,
    });
  }
  const stale = await ctx.db
    .query("shareEmails")
    .withIndex("by_user", (q) => q.eq("userId", userId).lte("_creationTime", since))
    .take(EMAILS_PER_DAY);
  for (const row of stale) await ctx.db.delete("shareEmails", row._id);
  await ctx.db.insert("shareEmails", { userId });
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });

// The token of the link that is switched on, or null.
const activeToken = async (event: Doc<"events">): Promise<string | null> => {
  if (event.visibility !== "link" || event.shareToken === undefined) return null;
  return decryptText(event._id, event.shareToken);
};

// Points the experience at a new token. Any link made before stops working.
const switchOn = async (ctx: MutationCtx, event: Doc<"events">): Promise<string> => {
  const token = newToken();
  await ctx.db.patch("events", event._id, {
    visibility: "link",
    shareKey: await shareKeyFor(token),
    shareToken: await encryptText(event._id, event.keyVersion, token),
  });
  return token;
};

// The experience a link opens, or null. A malformed, unknown and switched-off
// token all read the same, so a caller can't tell which one they had.
const eventFor = async (ctx: QueryCtx, token: string): Promise<Doc<"events"> | null> => {
  if (!TOKEN_SHAPE.test(token)) return null;
  const shareKey = await shareKeyFor(token);
  const event = await ctx.db
    .query("events")
    .withIndex("by_shareKey", (q) => q.eq("shareKey", shareKey))
    .unique();
  return event?.visibility === "link" ? event : null;
};

// Shared stories leave out who wrote each moment: the people watching them
// have no account here, and the names are for the people who do. `get` and
// `sharedMoment` build what goes out field by field for that reason.

// Photos and videos are the only blocks that carry a picture id. Dropping
// them leaves notes, links and feelings, and no mediaId anywhere.
const withoutPictures = (blocks: PlainBlock[]): PlainBlock[] => {
  return blocks.filter((block) => block.type !== "photo" && block.type !== "video");
};

const sharedMoment = (moment: Infer<typeof vMomentView>, redact: boolean) => {
  const stops = redact
    ? moment.stops.map((stop) => ({ ...stop, blocks: withoutPictures(stop.blocks) }))
    : moment.stops;
  return {
    _id: moment._id,
    startsAt: moment.startsAt,
    // Not personal: it's the zone the moment happened in.
    tzOffsetMinutes: moment.tzOffsetMinutes,
    place: moment.place,
    geo: moment.geo,
    blocks: redact ? withoutPictures(moment.blocks) : moment.blocks,
    transport: moment.transport,
    stops,
    labels: moment.labels,
  };
};

// Whether this experience's link hides photos. False until the owner opts in,
// including while the link itself is off, so the choice is waiting when they
// switch it on.
const hidePhotos = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    return event.shareRedacted === true;
  },
});

// Opts the link into hiding photos, or back out. Existing links change at
// once: the same token, with pictures gone or returned.
const setHidePhotos = mutation({
  args: { eventId: v.id("events"), hide: v.boolean() },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    const current = event.shareRedacted === true;
    if (current === args.hide) return null;
    await ctx.db.patch("events", event._id, { shareRedacted: args.hide ? true : undefined });
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "event",
      entityId: args.eventId,
      actorId: userId,
      action: "update",
      fields: ["shareRedacted"],
    });
    return null;
  },
});

// The owner's link, to copy again. Null when none is switched on.
const link = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    const token = await activeToken(event);
    return token === null ? null : linkFor(token);
  },
});

// Switches the link on, or returns the one already on.
const enable = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    const current = await activeToken(event);
    if (current !== null) return linkFor(current);
    const token = await switchOn(ctx, event);
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "event",
      entityId: args.eventId,
      actorId: userId,
      action: "update",
      fields: ["visibility"],
      before: { visibility: event.visibility },
      after: { visibility: "link" },
    });
    return linkFor(token);
  },
});

// Switches the link off. Nothing happens if it was already off.
const disable = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    if (event.visibility !== "link") return null;
    await ctx.db.patch("events", event._id, {
      visibility: "private",
      shareKey: undefined,
      shareToken: undefined,
    });
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "event",
      entityId: args.eventId,
      actorId: userId,
      action: "update",
      fields: ["visibility"],
      before: { visibility: "link" },
      after: { visibility: "private" },
    });
    return null;
  },
});

// A new link, for when the old one has got out. The old one stops working at once.
const rotate = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    const token = await switchOn(ctx, event);
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "event",
      entityId: args.eventId,
      actorId: userId,
      action: "update",
      fields: ["shareLink"],
    });
    return linkFor(token);
  },
});

// Emails the live share link. The address is handed to the email component
// and not kept here. Unconfigured email returns emailed: false, and the
// caller still has the link to copy.
const emailLink = mutation({
  args: { eventId: v.id("events"), to: v.string() },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    const token = await activeToken(event);
    if (token === null) {
      throw new ConvexError({ code: "INVALID", message: "Switch the share link on first." });
    }
    const to = args.to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254) {
      throw new ConvexError({ code: "INVALID", field: "to", message: "Enter a valid email address" });
    }
    if (!emailConfigured()) return { emailed: false };
    await chargeShareEmail(ctx, userId);
    const link = linkFor(token);
    const title = escapeHtml(event.title);
    const replyTo = await replyAddress(ctx, userId);
    await ctx.runMutation(components.email.lib.send, {
      to,
      ...(replyTo === undefined ? {} : { replyTo }),
      subject: `A story to read: "${event.title}"`,
      html: `<p>Someone shared a story with you on Story-time: ${title}.</p><p><a href="${link}">Open the story</a></p><p>Anyone with this link can watch it. No account is needed.</p>`,
      text: `Someone shared "${event.title}" with you on Story-time.\n${link}\nAnyone with this link can watch it. No account is needed.`,
    });
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "event",
      entityId: args.eventId,
      actorId: userId,
      action: "update",
      fields: ["shareEmail"],
    });
    return { emailed: true };
  },
});

// Public: the token is the only credential. Null for anything but a live link.
const get = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const event = await eventFor(ctx, args.token);
    if (event === null) return null;
    const moments = await listForEvent(ctx, event);
    return {
      event: {
        _id: event._id,
        title: event.title,
        description: await readText(event._id, event.description),
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        momentCount: event.momentCount,
        status: event.status,
      },
      // Field by field, so a field added to moments later isn't shared by accident.
      // A redacted link drops photo and video blocks, so no mediaId leaves.
      moments: moments.map((m) => sharedMoment(m, event.shareRedacted === true)),
    };
  },
});

// Public: the book's contents for a share link. Words stay on `page`, so
// opening the link does not decrypt every note. Null for anything but a live link.
const journal = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const event = await eventFor(ctx, args.token);
    if (event === null) return null;
    return { pages: await contentsOf(ctx, event) };
  },
});

// Public: one page of the book that token opens. A page from another
// experience is null, the same as a token that was never issued.
const page = query({
  args: { token: v.string(), pageId: v.id("journalPages") },
  handler: async (ctx, args) => {
    const event = await eventFor(ctx, args.token);
    if (event === null) return null;
    return await pageInEvent(ctx, event, args.pageId, event.shareRedacted === true);
  },
});

// Public: the journal's locked PDF on this link, if its owner made one. Never
// its password: that travels separately, from the owner. A link that hides
// photos does not name the file either — the book is the pictures.
const pdf = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const event = await eventFor(ctx, args.token);
    if (event === null || event.shareRedacted === true) return null;
    const journal = await ctx.db
      .query("journals")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .unique();
    if (!journal?.pdf) return null;
    return { mediaId: journal.pdf.mediaId, pages: journal.pdf.pages, at: journal.pdf.at };
  },
});

// Public: a picture's bytes for a share link, the same shape the signed-in
// route gets. A moment's picture qualifies. A sticker qualifies only when a
// page of this experience actually shows it.
const mediaForShare = query({
  args: {
    token: v.string(),
    mediaId: v.id("media"),
    variant: v.optional(v.union(v.literal("full"), v.literal("thumb"))),
  },
  handler: async (ctx, args) => {
    const event = await eventFor(ctx, args.token);
    if (event === null || event.shareRedacted === true) return null;
    const media = await ctx.db.get("media", args.mediaId);
    // Not while still being uploaded, and never another experience's.
    if (media === null || media.status !== "ready" || media.eventId !== event._id) return null;
    // A picture on a moment qualifies. A sticker qualifies only when some page
    // of this experience shows it, and a PDF only while it is the journal's
    // locked one. A loose upload, or a sticker only on the shelf, does not.
    if (media.momentId === undefined && media.purpose === "pdf") {
      if (!(await isSharedPdf(ctx, event._id, media._id))) return null;
    } else if (media.momentId === undefined) {
      if (media.purpose !== "sticker") return null;
      const pages = await ctx.db
        .query("journalPages")
        .withIndex("by_event_and_order", (q) => q.eq("eventId", event._id))
        .take(MAX_JOURNAL_PAGES);
      if (!pages.some((page) => page.elements.some((element) => element.mediaId === media._id))) return null;
    }
    const thumbKey = args.variant === "thumb" ? media.thumbR2Key : undefined;
    return {
      r2Key: thumbKey ?? media.r2Key,
      mime: thumbKey !== undefined ? "image/jpeg" : media.mime,
      keyVersion: media.keyVersion,
      keyScope: event._id,
    };
  },
});

// What the app calls. Registered once, by convex/api/share.ts, which re-exports it.
export const shareApi = { hidePhotos, setHidePhotos, link, enable, disable, rotate, emailLink, get, journal, page, pdf, mediaForShare };
