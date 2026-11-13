import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const vEncrypted = v.object({
  iv: v.string(),
  ct: v.string(),
  v: v.number(),
});

export const vGeo = v.object({ lat: v.number(), lng: v.number() });

export const vRegion = v.union(v.literal("us"), v.literal("eu"), v.literal("au"), v.literal("ca"));

export const vRole = v.union(v.literal("viewer"), v.literal("contributor"));
export const vGrantRole = v.union(vRole, v.literal("owner"));

// A hidden photo or video is kept from everyone but the experience's owners
// and the moment's author (lib/access.ts, `seesAllOf`).
export const vBlock = v.union(
  v.object({ type: v.literal("photo"), mediaId: v.id("media"), hidden: v.optional(v.boolean()) }),
  v.object({ type: v.literal("video"), mediaId: v.id("media"), hidden: v.optional(v.boolean()) }),
  v.object({
    type: v.literal("link"),
    url: vEncrypted,
    title: v.optional(vEncrypted),
  }),
  v.object({ type: v.literal("note"), text: vEncrypted }),
  v.object({
    type: v.literal("feeling"),
    text: vEncrypted,
    mood: v.optional(v.string()),
  }),
);

export const TRANSPORTS = [
  "walk",
  "bike",
  "car",
  "bus",
  "train",
  "plane",
  "boat",
  "other",
] as const;
export const vTransport = v.union(
  v.literal("walk"),
  v.literal("bike"),
  v.literal("car"),
  v.literal("bus"),
  v.literal("train"),
  v.literal("plane"),
  v.literal("boat"),
  v.literal("other"),
);

export const vStop = v.object({
  startsAt: v.optional(v.number()),
  place: v.optional(vEncrypted),
  geo: v.optional(vEncrypted),
  transport: v.optional(vTransport),
  blocks: v.array(vBlock),
});

export const vCanvasKind = v.union(
  v.literal("frame"),
  v.literal("moment"),
  v.literal("photo"),
  v.literal("scrap"),
  v.literal("ransom"),
  v.literal("letter"),
  v.literal("tape"),
);

export const vChangeEntity = v.union(
  v.literal("event"),
  v.literal("moment"),
  v.literal("itinerary"),
  v.literal("media"),
  v.literal("session"),
  v.literal("invite"),
  v.literal("quota"),
  v.literal("user"),
  v.literal("page"), // legacy: older Activity rows carry it, nothing writes it
  v.literal("guestNote"),
);

export const vChangeAction = v.union(
  v.literal("create"),
  v.literal("update"),
  v.literal("delete"),
  v.literal("revoke"),
  v.literal("accept"),
  v.literal("dismiss"),
  v.literal("expire"),
);

export const vLastEdit = v.object({
  at: v.number(),
  userId: v.optional(v.id("users")),
  agent: v.optional(v.string()),
});

export default defineSchema({
  users: defineTable({
    displayName: v.optional(v.string()),
    username: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
    pendingEmail: v.optional(v.string()),
    emailVerifyKey: v.optional(v.string()),
    emailVerifyExpires: v.optional(v.number()),
    onThisDay: v.optional(v.boolean()),
    imageMediaId: v.optional(v.id("media")),
    // The photo on their GitHub or Google account, as of the last sign-in.
    // An image they upload (imageMediaId) is shown instead.
    imageUrl: v.optional(v.string()),
    blockedAt: v.optional(v.number()),
    blockedReason: v.optional(v.string()),
    region: v.optional(vRegion),
    locale: v.optional(v.string()),
  })
    .index("by_username", ["username"])
    .index("by_emailVerifyKey", ["emailVerifyKey"])
    .index("by_email", ["email"]),

  events: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    description: v.optional(v.union(v.string(), vEncrypted)),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("archived")),
    visibility: v.union(v.literal("private"), v.literal("invite"), v.literal("link")),
    shareKey: v.optional(v.string()),
    shareToken: v.optional(vEncrypted),
    shareRedacted: v.optional(v.boolean()),
    // More the owner switched off on the link: the film with its map. `pdf`
    // is legacy: older experiences may carry it, and nothing reads it.
    shareHide: v.optional(
      v.object({ film: v.optional(v.boolean()), pdf: v.optional(v.boolean()) }),
    ),
    shareSlug: v.optional(v.string()),
    region: v.optional(vRegion),
    momentLimit: v.optional(v.number()),
    momentCount: v.number(),
    // How many of those moments are archived; absent when none ever was.
    archivedCount: v.optional(v.number()),
    keyVersion: v.number(),
    coverMediaId: v.optional(v.id("media")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_shareKey", ["shareKey"])
    .index("by_shareSlug", ["shareSlug"]),

  moments: defineTable({
    eventId: v.id("events"),
    authorId: v.id("users"),
    startsAt: v.number(),
    tzOffsetMinutes: v.optional(v.number()),
    place: v.optional(vEncrypted),
    geo: v.optional(vEncrypted),
    blocks: v.array(vBlock),
    transport: v.optional(vTransport),
    stops: v.optional(v.array(vStop)),
    labels: v.optional(v.array(vEncrypted)),
    // share link leaves them out.
    people: v.optional(v.array(v.id("users"))),
    authorAgent: v.optional(v.string()),
    lastEdit: v.optional(vLastEdit),
    monthDay: v.optional(v.string()),
    // Archived: out of the story, and kept from everyone but the experience's
    // owners and the moment's author until it is restored.
    archived: v.optional(v.boolean()),
  })
    .index("by_event_and_startsAt", ["eventId", "startsAt"])
    .index("by_monthDay", ["monthDay"]),

  itinerary: defineTable({
    eventId: v.id("events"),
    momentId: v.id("moments"),
    startsAt: v.number(),
    dayKey: v.string(),
    monthKey: v.string(),
    placeKey: v.optional(v.string()),
    position: v.number(),
  })
    .index("by_event_and_day", ["eventId", "dayKey", "position"])
    .index("by_event_and_month", ["eventId", "monthKey", "position"])
    .index("by_event_and_place", ["eventId", "placeKey", "position"])
    .index("by_moment", ["momentId"]),

  media: defineTable({
    eventId: v.optional(v.id("events")),
    // An avatar belongs to a user. "sticker" and "pdf" are legacy: older
    // uploads carry them, and nothing writes them.
    purpose: v.optional(v.union(v.literal("avatar"), v.literal("sticker"), v.literal("pdf"))),
    momentId: v.optional(v.id("moments")),
    uploaderId: v.id("users"),
    r2Key: v.string(),
    size: v.number(),
    mime: v.string(),
    thumbR2Key: v.optional(v.string()),
    thumbSize: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    sha256: v.optional(v.string()),
    keyVersion: v.number(),
    status: v.union(v.literal("reserved"), v.literal("ready"), v.literal("deleted")),
    detachedBy: v.optional(v.id("users")),
  })
    .index("by_event_and_status", ["eventId", "status"])
    .index("by_status", ["status"])
    .index("by_uploader_and_status", ["uploaderId", "status"]),

  memoryMails: defineTable({
    userId: v.id("users"),
    day: v.string(),
  }).index("by_user_and_day", ["userId", "day"]),

  quotaRequests: defineTable({
    eventId: v.id("events"),
    requestedBy: v.id("users"),
    extra: v.number(),
    reason: v.optional(v.union(v.string(), vEncrypted)),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied")),
  }).index("by_event_and_status", ["eventId", "status"]),

  sessions: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    grantedBy: v.id("users"),
    role: vGrantRole,
    lastSeenAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_event_and_user", ["eventId", "userId"]),

  changes: defineTable({
    eventId: v.id("events"),
    entity: vChangeEntity,
    entityId: v.string(),
    actorId: v.optional(v.id("users")),
    agent: v.optional(v.string()),
    action: vChangeAction,
    fields: v.array(v.string()),
    before: v.optional(
      v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null())),
    ),
    after: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))),
    at: v.number(),
  })
    .index("by_event_and_at", ["eventId", "at"])
    .index("by_event_entity_action_at", ["eventId", "entity", "action", "at"]),

  activityReads: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    readAt: v.number(),
  })
    .index("by_user_and_event", ["userId", "eventId"])
    .index("by_event", ["eventId"]),

  guestNotes: defineTable({
    eventId: v.id("events"),
    authorId: v.id("users"),
    text: vEncrypted,
  }).index("by_event", ["eventId"]),

  canvases: defineTable({
    eventId: v.id("events"),
    desk: v.string(),
    filledAt: v.optional(v.number()),
  }).index("by_event", ["eventId"]),

  canvasNodes: defineTable({
    canvasId: v.id("canvases"),
    eventId: v.id("events"),
    parentId: v.optional(v.id("canvasNodes")),
    kind: vCanvasKind,
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    rotation: v.number(),
    z: v.number(),
    momentId: v.optional(v.id("moments")),
    mediaId: v.optional(v.id("media")),
    text: v.optional(vEncrypted),
    look: v.optional(v.string()),
    order: v.optional(v.number()),
  })
    .index("by_canvas", ["canvasId"])
    .index("by_event", ["eventId"])
    .index("by_parent", ["parentId"]),

  agentTokens: defineTable({
    userId: v.id("users"),
    name: v.string(),
    tokenKey: v.string(),
    prefix: v.string(),
    eventId: v.optional(v.id("events")),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    windowStart: v.optional(v.number()),
    windowCount: v.optional(v.number()),
  })
    .index("by_tokenKey", ["tokenKey"])
    .index("by_user", ["userId"])
    .index("by_event", ["eventId"]),
});
