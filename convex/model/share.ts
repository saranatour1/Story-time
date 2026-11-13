import { ConvexError, v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { assertNotArchived, isBlocked, requireEventAccess, withheld } from "../lib/access";
import { appOrigin } from "../lib/appUrl";
import { emailConfigured, queueMail, replyAddress } from "../lib/emailAddress";
import { recordChange } from "../lib/changes";
import { decryptText, encryptText, readText, shareKeyFor } from "../lib/crypto";
import { contentsOf, pageInEvent } from "./journal";
import { MAX_JOURNAL_PAGES } from "../lib/journal";
import { isSharedPdf } from "../lib/sharedPdf";
import { listForEvent, type PlainBlock, vMomentView } from "./moments";
import { SHARE_EMAILS_PER_DAY } from "../lib/limits";
import { chargeEmail } from "../lib/rateLimit";

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

// A link switched on before names existed has none, and keeps its old address.
const linkFor = (event: { shareSlug?: string }, token: string) =>
  `${appOrigin()}/s${event.shareSlug === undefined ? "" : `/${event.shareSlug}`}#${token}`;

// The link's name: the title in plain letters, then four random characters.
// Not a secret, so the small bias of % 36 doesn't matter.
const newSlug = async (ctx: MutationCtx, title: string): Promise<string> => {
  const words =
    title
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40)
      .replace(/^-+|-+$/g, "") || "story";
  for (;;) {
    const tail = [...crypto.getRandomValues(new Uint8Array(4))]
      .map((b) => (b % 36).toString(36))
      .join("");
    const slug = `${words}-${tail}`;
    const taken = await ctx.db
      .query("events")
      .withIndex("by_shareSlug", (q) => q.eq("shareSlug", slug))
      .first();
    if (taken === null) return slug;
  }
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

// Points the experience at a new token, and returns its link. Any link made
// before stops working. The name is given once and kept, off and on again.
const switchOn = async (ctx: MutationCtx, event: Doc<"events">): Promise<string> => {
  const token = newToken();
  const shareSlug = event.shareSlug ?? (await newSlug(ctx, event.title));
  await ctx.db.patch("events", event._id, {
    visibility: "link",
    shareKey: await shareKeyFor(token),
    shareToken: await encryptText(event._id, event.keyVersion, token),
    shareSlug,
  });
  return linkFor({ shareSlug }, token);
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
  if (event?.visibility !== "link") return null;
  // A blocked account's links are off, like everything else of theirs.
  return (await isBlocked(ctx, event.ownerId)) ? null : event;
};

// Shared stories leave out who wrote each moment: the people watching them
// have no account here, and the names are for the people who do. `get` and
// `sharedMoment` build what goes out field by field for that reason.

// Photos and videos are the only blocks that carry a picture id. Dropping
// them leaves notes, links and feelings, and no mediaId anywhere.
const withoutPictures = (blocks: PlainBlock[]): PlainBlock[] => {
  return blocks.filter((block) => block.type !== "photo" && block.type !== "video");
};

// With the film off, the map pins stay behind too: only the film draws them.
const sharedMoment = (moment: Infer<typeof vMomentView>, redact: boolean, film: boolean) => {
  const stops = moment.stops.map((stop) => ({
    ...stop,
    geo: film ? stop.geo : undefined,
    blocks: redact ? withoutPictures(stop.blocks) : stop.blocks,
  }));
  return {
    _id: moment._id,
    startsAt: moment.startsAt,
    // Not personal: it's the zone the moment happened in.
    tzOffsetMinutes: moment.tzOffsetMinutes,
    place: moment.place,
    geo: film ? moment.geo : undefined,
    blocks: redact ? withoutPictures(moment.blocks) : moment.blocks,
    transport: moment.transport,
    stops,
    labels: moment.labels,
  };
};

// What the link shows. Everything, until the owner switches a part off,
// including while the link itself is off, so the choice is waiting when they
// switch it on.
const vPart = v.union(v.literal("photos"), v.literal("film"), v.literal("pdf"));
const shownOf = (event: Doc<"events">) => ({
  photos: event.shareRedacted !== true,
  film: event.shareHide?.film !== true,
  pdf: event.shareHide?.pdf !== true,
});

const shown = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    return shownOf(event);
  },
});

// Switches one part of the link on or off. Existing links change at once:
// the same token, with that part gone or returned.
const setShown = mutation({
  args: { eventId: v.id("events"), part: vPart, show: v.boolean() },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    if (shownOf(event)[args.part] === args.show) return null;
    const hide = args.show ? undefined : true;
    await ctx.db.patch(
      "events",
      event._id,
      args.part === "photos"
        ? { shareRedacted: hide }
        : { shareHide: { ...event.shareHide, [args.part]: hide } },
    );
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "event",
      entityId: args.eventId,
      actorId: userId,
      action: "update",
      fields: [args.part === "photos" ? "shareRedacted" : "shareShown"],
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
    return token === null ? null : linkFor(event, token);
  },
});

// Switches the link on, or returns the one already on.
const enable = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    const current = await activeToken(event);
    if (current !== null) return linkFor(event, current);
    const link = await switchOn(ctx, event);
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
    return link;
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
    const link = await switchOn(ctx, event);
    await recordChange(ctx, {
      eventId: args.eventId,
      entity: "event",
      entityId: args.eventId,
      actorId: userId,
      action: "update",
      fields: ["shareLink"],
    });
    return link;
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
      throw new ConvexError({
        code: "INVALID",
        field: "to",
        message: "Enter a valid email address",
      });
    }
    if (!emailConfigured()) return { emailed: false };
    await chargeEmail(
      ctx,
      "shareEmail",
      userId,
      `You can email a share link up to ${SHARE_EMAILS_PER_DAY} times a day. Copy the link and send it yourself.`,
    );
    const link = linkFor(event, token);
    const title = escapeHtml(event.title);
    const replyTo = await replyAddress(ctx, userId);
    await queueMail(ctx, {
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
    // Nobody on a link is someone a moment holds nothing back from.
    const moments = await listForEvent(ctx, event, null);
    const { photos, film } = shownOf(event);
    return {
      // The name this link goes by, so an old address can move to it.
      slug: event.shareSlug,
      film,
      event: {
        _id: event._id,
        title: event.title,
        description: await readText(event._id, event.description),
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        momentCount: event.momentCount - (event.archivedCount ?? 0),
        status: event.status,
      },
      // Field by field, so a field added to moments later isn't shared by accident.
      // A redacted link drops photo and video blocks, so no mediaId leaves.
      moments: moments.map((m) => sharedMoment(m, !photos, film)),
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
    if (event === null || !shownOf(event).photos || !shownOf(event).pdf) return null;
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
      if (!shownOf(event).pdf || !(await isSharedPdf(ctx, event._id, media._id))) return null;
    } else if (media.momentId === undefined) {
      if (media.purpose !== "sticker") return null;
      const pages = await ctx.db
        .query("journalPages")
        .withIndex("by_event_and_order", (q) => q.eq("eventId", event._id))
        .take(MAX_JOURNAL_PAGES);
      if (!pages.some((page) => page.elements.some((element) => element.mediaId === media._id)))
        return null;
    }
    if (await withheld(ctx, media, null)) return null;
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
export const shareApi = {
  shown,
  setShown,
  link,
  enable,
  disable,
  rotate,
  emailLink,
  get,
  journal,
  page,
  pdf,
  mediaForShare,
};
