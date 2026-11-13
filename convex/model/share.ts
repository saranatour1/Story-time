import { ConvexError, v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { assertNotArchived, isBlocked, requireEventAccess, withheld } from "../lib/access";
import { appOrigin } from "../lib/appUrl";
import { emailConfigured, queueMail, replyAddress } from "../lib/emailAddress";
import { recordChange } from "../lib/changes";
import { decryptText, encryptText, readText, shareKeyFor } from "../lib/crypto";
import { listForEvent, type PlainBlock, vMomentView } from "./moments";
import { SHARE_EMAILS_PER_DAY } from "../lib/limits";
import { chargeEmail } from "../lib/rateLimit";

const newToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,64}$/;

const linkFor = (event: { shareSlug?: string }, token: string) =>
  `${appOrigin()}/s${event.shareSlug === undefined ? "" : `/${event.shareSlug}`}#${token}`;

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

const activeToken = async (event: Doc<"events">): Promise<string | null> => {
  if (event.visibility !== "link" || event.shareToken === undefined) return null;
  return decryptText(event._id, event.shareToken);
};

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

const eventFor = async (ctx: QueryCtx, token: string): Promise<Doc<"events"> | null> => {
  if (!TOKEN_SHAPE.test(token)) return null;
  const shareKey = await shareKeyFor(token);
  const event = await ctx.db
    .query("events")
    .withIndex("by_shareKey", (q) => q.eq("shareKey", shareKey))
    .unique();
  if (event?.visibility !== "link") return null;
  return (await isBlocked(ctx, event.ownerId)) ? null : event;
};

const withoutPictures = (blocks: PlainBlock[]): PlainBlock[] => {
  return blocks.filter((block) => block.type !== "photo" && block.type !== "video");
};

const sharedMoment = (moment: Infer<typeof vMomentView>, redact: boolean, film: boolean) => {
  const stops = moment.stops.map((stop) => ({
    ...stop,
    geo: film ? stop.geo : undefined,
    blocks: redact ? withoutPictures(stop.blocks) : stop.blocks,
  }));
  return {
    _id: moment._id,
    startsAt: moment.startsAt,
    tzOffsetMinutes: moment.tzOffsetMinutes,
    place: moment.place,
    geo: film ? moment.geo : undefined,
    blocks: redact ? withoutPictures(moment.blocks) : moment.blocks,
    transport: moment.transport,
    stops,
    labels: moment.labels,
  };
};

const vPart = v.union(v.literal("photos"), v.literal("film"));
const shownOf = (event: Doc<"events">) => ({
  photos: event.shareRedacted !== true,
  film: event.shareHide?.film !== true,
});

const shown = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    return shownOf(event);
  },
});

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
        : { shareHide: { ...event.shareHide, film: hide } },
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

const link = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "owner");
    const token = await activeToken(event);
    return token === null ? null : linkFor(event, token);
  },
});

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

const get = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const event = await eventFor(ctx, args.token);
    if (event === null) return null;
    // Nobody on a link is someone a moment holds nothing back from.
    const moments = await listForEvent(ctx, event, null);
    const { photos, film } = shownOf(event);
    return {
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
      moments: moments.map((m) => sharedMoment(m, !photos, film)),
    };
  },
});

// route gets. Only a picture on a moment qualifies; a loose upload does not.
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
    if (media === null || media.status !== "ready" || media.eventId !== event._id) return null;
    if (media.momentId === undefined) return null;
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

export const shareApi = {
  shown,
  setShown,
  link,
  enable,
  disable,
  rotate,
  emailLink,
  get,
  mediaForShare,
};
