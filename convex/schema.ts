import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Sensitive fields (place, notes, links) are stored as AES-GCM ciphertext.
// `v` is the event key version used, so keys can be rotated later.
export const vEncrypted = v.object({
  iv: v.string(),
  ct: v.string(),
  v: v.number(),
});

export const vRegion = v.union(
  v.literal("us"),
  v.literal("eu"),
  v.literal("au"),
  v.literal("ca"),
);

export const vRole = v.union(v.literal("viewer"), v.literal("contributor"));

export const vBlock = v.union(
  v.object({ type: v.literal("photo"), mediaId: v.id("media") }),
  v.object({ type: v.literal("video"), mediaId: v.id("media") }),
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

// How someone got to a stop. Not sensitive, so stored in the clear.
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

// A stop after the first; the moment's own startsAt/place/blocks are stop one.
export const vStop = v.object({
  startsAt: v.optional(v.number()),
  place: v.optional(vEncrypted),
  transport: v.optional(vTransport),
  blocks: v.array(vBlock),
});

export const vChangeEntity = v.union(
  v.literal("event"),
  v.literal("moment"),
  v.literal("itinerary"),
  v.literal("media"),
  v.literal("session"),
  v.literal("invite"),
  v.literal("quota"),
  v.literal("user"),
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

export default defineSchema({
  // Created by Convex Auth (`createUser` inserts `{}`). Everything is
  // optional and user-entered: nothing is copied from the OAuth profile.
  users: defineTable({
    displayName: v.optional(v.string()),
    // Lowercase, 3-20 chars of a-z 0-9 _. Unique across users when set.
    username: v.optional(v.string()),
    // Typed in by the user, never copied from the OAuth profile and never
    // verified, so it must not be trusted for sign-in or access decisions.
    email: v.optional(v.string()),
    imageMediaId: v.optional(v.id("media")),
    region: v.optional(vRegion), // undefined means "us"
    locale: v.optional(v.string()),
  }).index("by_username", ["username"]),

  events: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("archived"),
    ),
    visibility: v.union(v.literal("private"), v.literal("invite")),
    region: vRegion,
    momentLimit: v.number(),
    momentCount: v.number(),
    keyVersion: v.number(),
    coverMediaId: v.optional(v.id("media")),
  })
    .index("by_owner", ["ownerId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["ownerId"],
    }),

  moments: defineTable({
    eventId: v.id("events"),
    authorId: v.id("users"),
    startsAt: v.number(),
    place: v.optional(vEncrypted),
    blocks: v.array(vBlock),
    // How they got to the first stop.
    transport: v.optional(vTransport),
    stops: v.optional(v.array(vStop)),
    labels: v.optional(v.array(vEncrypted)),
  })
    .index("by_event_and_startsAt", ["eventId", "startsAt"])
    .index("by_author", ["authorId"]),

  // One denormalised row per moment; the itinerary view groups on these keys.
  itinerary: defineTable({
    eventId: v.id("events"),
    momentId: v.id("moments"),
    startsAt: v.number(),
    dayKey: v.string(), // YYYY-MM-DD
    monthKey: v.string(), // YYYY-MM
    placeKey: v.optional(v.string()), // hash of the place, never plaintext
    position: v.number(),
  })
    .index("by_event_and_day", ["eventId", "dayKey", "position"])
    .index("by_event_and_month", ["eventId", "monthKey", "position"])
    .index("by_event_and_place", ["eventId", "placeKey", "position"])
    .index("by_moment", ["momentId"]),

  media: defineTable({
    // Absent for profile images, which belong to a user, not an experience.
    eventId: v.optional(v.id("events")),
    purpose: v.optional(v.literal("avatar")),
    momentId: v.optional(v.id("moments")),
    uploaderId: v.id("users"),
    r2Key: v.string(),
    size: v.number(),
    mime: v.string(),
    sha256: v.optional(v.string()),
    keyVersion: v.number(),
    status: v.union(
      v.literal("reserved"),
      v.literal("ready"),
      v.literal("deleted"),
    ),
  })
    .index("by_event", ["eventId"])
    .index("by_moment", ["momentId"]),

  // "Credits": owners/contributors ask for a higher moment limit.
  quotaRequests: defineTable({
    eventId: v.id("events"),
    requestedBy: v.id("users"),
    extra: v.number(),
    reason: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
    ),
  })
    .index("by_event_and_status", ["eventId", "status"]),

  // Share grants: who can view an experience. Revoke sets `revokedAt`.
  sessions: defineTable({
    eventId: v.id("events"),
    userId: v.id("users"),
    grantedBy: v.id("users"),
    role: vRole,
    lastSeenAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_event_and_user", ["eventId", "userId"]),

  // Append-only change history. Written in the same mutation as the change.
  // `before`/`after` hold non-sensitive fields only; sensitive fields appear
  // by name in `fields` and never by value.
  changes: defineTable({
    eventId: v.id("events"),
    entity: vChangeEntity,
    entityId: v.string(),
    actorId: v.optional(v.id("users")), // undefined = system / operator
    action: vChangeAction,
    fields: v.array(v.string()),
    before: v.optional(
      v.record(
        v.string(),
        v.union(v.string(), v.number(), v.boolean(), v.null()),
      ),
    ),
    after: v.optional(
      v.record(
        v.string(),
        v.union(v.string(), v.number(), v.boolean(), v.null()),
      ),
    ),
    at: v.number(),
  })
    .index("by_event_and_at", ["eventId", "at"])
    .index("by_entity", ["entity", "entityId", "at"]),
});
