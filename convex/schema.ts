import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Sensitive fields (place, coordinates, notes, links) are stored as AES-GCM
// ciphertext.
// `v` is the event key version used, so keys can be rotated later.
export const vEncrypted = v.object({
  iv: v.string(),
  ct: v.string(),
  v: v.number(),
});

// A point on the map, as clients send and receive it. Stored encrypted, like
// the place it pins.
export const vGeo = v.object({ lat: v.number(), lng: v.number() });

// Legacy: regions were dropped. Older users and experiences may still carry
// one, so the field stays optional and nothing reads it.
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
  geo: v.optional(vEncrypted), // "lat,lng"; only set alongside a place
  transport: v.optional(vTransport),
  blocks: v.array(vBlock),
});

// What can sit on a canvas.
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

// Who touched a moment last, and when. `userId` is the person (or, for an
// agent, the person it acts for); `agent` names the agent, if one made the edit.
export const vLastEdit = v.object({
  at: v.number(),
  userId: v.optional(v.id("users")),
  agent: v.optional(v.string()),
});

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
    region: v.optional(vRegion), // legacy, unused
    locale: v.optional(v.string()),
  }).index("by_username", ["username"]),

  events: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    // Under the event key. Rows from before that hold plain text, which
    // reads as is until migrations:encryptPlainText runs.
    description: v.optional(v.union(v.string(), vEncrypted)),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("archived"),
    ),
    // "link": anyone holding the share link can watch (share.ts). "invite" is
    // what rows from before links carry, and reads as private.
    visibility: v.union(
      v.literal("private"),
      v.literal("invite"),
      v.literal("link"),
    ),
    // Set only while visibility is "link". The key finds the experience from a
    // link (a keyed hash, never the token); the token is kept encrypted so the
    // owner can copy the link again.
    shareKey: v.optional(v.string()),
    shareToken: v.optional(vEncrypted),
    region: v.optional(vRegion), // legacy, unused
    momentLimit: v.number(),
    momentCount: v.number(),
    keyVersion: v.number(),
    coverMediaId: v.optional(v.id("media")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_shareKey", ["shareKey"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["ownerId"],
    }),

  moments: defineTable({
    eventId: v.id("events"),
    authorId: v.id("users"),
    startsAt: v.number(),
    // Minutes east of UTC where the moment happened. Absent for moments made
    // before it was kept.
    tzOffsetMinutes: v.optional(v.number()),
    place: v.optional(vEncrypted),
    geo: v.optional(vEncrypted), // "lat,lng"; only set alongside a place
    blocks: v.array(vBlock),
    // How they got to the first stop.
    transport: v.optional(vTransport),
    stops: v.optional(v.array(vStop)),
    labels: v.optional(v.array(vEncrypted)),
    // Set when an agent created the moment for `authorId`: the agent's name.
    authorAgent: v.optional(v.string()),
    // Absent until the moment is edited.
    lastEdit: v.optional(vLastEdit),
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
    // Who last took it off a moment, so they may delete it even if someone
    // else uploaded it. Only read while it is unattached.
    detachedBy: v.optional(v.id("users")),
  })
    .index("by_event_and_status", ["eventId", "status"])
    .index("by_moment", ["momentId"])
    // The reserved-upload sweep finds stale rows across experiences.
    .index("by_status", ["status"])
    // One person's live uploads, summed for their upload budget.
    .index("by_uploader_and_status", ["uploaderId", "status"]),

  // One row per invite email sent, for the daily cap. No address is kept.
  inviteEmails: defineTable({ userId: v.id("users") }).index("by_user", [
    "userId",
  ]),

  // "Credits": owners/contributors ask for a higher moment limit.
  quotaRequests: defineTable({
    eventId: v.id("events"),
    requestedBy: v.id("users"),
    extra: v.number(),
    // Under the event key, like the description; quota:reasonOf reads it.
    reason: v.optional(v.union(v.string(), vEncrypted)),
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
    // The person behind the change; for an agent, the person it acts for.
    // Undefined with no agent = the system / operator.
    actorId: v.optional(v.id("users")),
    // The agent that made the change (Scribe, an MCP client), when one did.
    agent: v.optional(v.string()),
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

  // The collage view of an experience: one infinite canvas of frames and
  // pieces laid over the same moments and photos. It holds no content of its
  // own beyond what people write on it, so deleting it loses nothing.
  canvases: defineTable({
    eventId: v.id("events"),
    // The desk under the frames, by name (see src/lib/canvas/look.ts).
    desk: v.string(),
    // Moments made up to this time have been put on the canvas, so one taken
    // off by hand stays off. Unset until the first fill.
    filledAt: v.optional(v.number()),
  }).index("by_event", ["eventId"]),

  // One row per thing on a canvas. They nest: a frame holds pieces, and a
  // ransom-note title holds its letters, so editing can go from a whole frame
  // down to one letter. A child's x and y are inside its parent.
  canvasNodes: defineTable({
    canvasId: v.id("canvases"),
    eventId: v.id("events"),
    parentId: v.optional(v.id("canvasNodes")),
    kind: vCanvasKind,
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    // Degrees. Only loose pieces and letters turn; frames and titles don't.
    rotation: v.number(),
    z: v.number(),
    // What a piece shows: a moment of this experience, or one of its photos.
    momentId: v.optional(v.id("moments")),
    mediaId: v.optional(v.id("media")),
    // Words someone wrote on it (a frame's name, a scrap, a title, a letter),
    // under the event key like every other note.
    text: v.optional(vEncrypted),
    // How it looks, by name: a paper, a print style, a tape. Never content.
    look: v.optional(v.string()),
    // A frame's place in the flow, which is the order it plays in.
    order: v.optional(v.number()),
  })
    .index("by_canvas", ["canvasId"])
    .index("by_event", ["eventId"])
    .index("by_parent", ["parentId"]),

  // Connections for assistants (MCP). The token itself is never stored, only a
  // keyed hash of it, so a database leak hands out nothing usable.
  agentTokens: defineTable({
    // The person the agent acts for: it can do what they could do, no more.
    userId: v.id("users"),
    // Shown on everything the agent adds, e.g. "Claude Desktop".
    name: v.string(),
    tokenKey: v.string(),
    // The first characters of the token, so a list can tell them apart.
    prefix: v.string(),
    // Limits the connection to one experience; absent = all of theirs.
    eventId: v.optional(v.id("events")),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    // A fixed window of requests, for a gentle rate limit.
    windowStart: v.optional(v.number()),
    windowCount: v.optional(v.number()),
  })
    .index("by_tokenKey", ["tokenKey"])
    .index("by_user", ["userId"]),
});
