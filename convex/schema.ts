import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { ELEMENT_KINDS } from "./lib/journal";

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
export const TRANSPORTS = ["walk", "bike", "car", "bus", "train", "plane", "boat", "other"] as const;
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

// One thing on a journal page (lib/journal.ts says what each field means).
// Words are encrypted like notes; the rest is layout.
export const vJournalKind = v.union(...ELEMENT_KINDS.map((k) => v.literal(k)));
export const vJournalElement = v.object({
  id: v.string(),
  kind: vJournalKind,
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  rotation: v.number(),
  z: v.number(),
  style: v.optional(v.string()),
  text: v.optional(vEncrypted),
  tone: v.optional(v.string()),
  color: v.optional(v.string()),
  mediaId: v.optional(v.id("media")),
  momentId: v.optional(v.id("moments")),
  locked: v.optional(v.boolean()),
  // A piece the layout made whose words the owner then changed: theirs now,
  // so bringing the page up to its moment leaves it.
  own: v.optional(v.boolean()),
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
  v.literal("page"),
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

// Who touched a moment last, and when. `userId` is the person (or, for an
// agent, the person it acts for); `agent` names the agent, if one made the edit.
export const vLastEdit = v.object({
  at: v.number(),
  userId: v.optional(v.id("users")),
  agent: v.optional(v.string()),
});

export default defineSchema({
  // Created by Convex Auth. A verified OAuth email is copied as a contact
  // address; name and avatar are not. The address is never used to sign in.
  users: defineTable({
    displayName: v.optional(v.string()),
    // Lowercase, 3-20 chars of a-z 0-9 _. Unique across users when set.
    username: v.optional(v.string()),
    // A contact address we will send to and put as Reply-To. Set from a
    // verified OAuth email, or from Settings after the confirmation link is
    // opened. Never used to sign in.
    email: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
    // An address typed in Settings, waiting on its confirmation link.
    pendingEmail: v.optional(v.string()),
    // Hash of that link. The token itself is not stored.
    emailVerifyKey: v.optional(v.string()),
    emailVerifyExpires: v.optional(v.number()),
    // Opt-in: a daily note that a memory is waiting. No memory text is mailed.
    onThisDay: v.optional(v.boolean()),
    imageMediaId: v.optional(v.id("media")),
    region: v.optional(vRegion), // legacy, unused
    locale: v.optional(v.string()),
  })
    .index("by_username", ["username"])
    .index("by_emailVerifyKey", ["emailVerifyKey"]),

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
    // Opt-in: a live link shows the words and leaves out every picture. Off
    // (or unset) keeps the link as it was, photos included.
    shareRedacted: v.optional(v.boolean()),
    region: v.optional(vRegion), // legacy, unused
    momentLimit: v.optional(v.number()), // legacy, unused: lib/limits.ts holds the one limit
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
    // "MM-DD" where the moment happened, so a daily job can find this date.
    monthDay: v.optional(v.string()),
  })
    .index("by_event_and_startsAt", ["eventId", "startsAt"])
    .index("by_author", ["authorId"])
    .index("by_monthDay", ["monthDay"]),

  // Legacy: nothing reads or writes it. Cleared and removed in the next step.
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
    // An avatar belongs to a user; a sticker is cut from a photo for a journal.
    purpose: v.optional(v.union(v.literal("avatar"), v.literal("sticker"), v.literal("pdf"))),
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

  // One row per share-link email sent, for the daily cap. No address is kept.
  shareEmails: defineTable({ userId: v.id("users") }).index("by_user", [
    "userId",
  ]),

  // One row per address-confirmation email, for the daily cap. No address is kept.
  emailChecks: defineTable({ userId: v.id("users") }).index("by_user", ["userId"]),

  // One row per person per UTC day, so the memory email is sent once.
  memoryMails: defineTable({
    userId: v.id("users"),
    day: v.string(),
  }).index("by_user_and_day", ["userId", "day"]),

  // Legacy: nothing reads or writes it. Cleared and removed in the next step.
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
    .index("by_entity", ["entity", "entityId", "at"])
    // Unread counts one kind of create at a time, so other changes cannot crowd them out.
    .index("by_event_entity_action_at", ["eventId", "entity", "action", "at"]),

  // When the owner last opened Activity, so the badge can count what is newer.
  activityReads: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    readAt: v.number(),
  })
    .index("by_user_and_event", ["userId", "eventId"])
    // So deleting an experience can find them.
    .index("by_event", ["eventId"]),

  // A short note from someone who was invited. The words sit under the event key.
  guestNotes: defineTable({
    eventId: v.id("events"),
    authorId: v.id("users"),
    text: vEncrypted,
  }).index("by_event", ["eventId"]),

  // The journal of an experience: a book of A4 pages. `filledAt` is how far
  // the moments have been given pages, so a page taken out isn't made again.
  journals: defineTable({
    eventId: v.id("events"),
    filledAt: v.optional(v.number()),
    locked: v.optional(v.boolean()),
    // The whole book as a PDF locked with a password, for the share link. The
    // password is kept under the event key so its owner can copy it again.
    pdf: v.optional(v.object({ mediaId: v.id("media"), password: vEncrypted, pages: v.number(), at: v.number() })),
  }).index("by_event", ["eventId"]),

  // One page of a journal, with everything on it. `order` sorts the book; a
  // moment's page starts at the moment's time, so new ones land in place.
  journalPages: defineTable({
    eventId: v.id("events"),
    order: v.number(),
    paper: v.string(),
    locked: v.optional(v.boolean()),
    momentId: v.optional(v.id("moments")),
    // The moment time this page was laid out from: its last edit, or its
    // creation when it has never been edited. A later edit leaves the page
    // behind. Absent on a cover, a blank page, and a page made before this.
    builtFrom: v.optional(v.number()),
    // The owner has saved this page, so it is not rewritten until they ask.
    edited: v.optional(v.boolean()),
    elements: v.array(vJournalElement),
  })
    .index("by_event_and_order", ["eventId", "order"])
    .index("by_event_and_moment", ["eventId", "momentId"]),

  // Legacy: nothing reads or writes it. Cleared and removed in the next step.
  canvases: defineTable({
    eventId: v.id("events"),
    desk: v.string(),
    filledAt: v.optional(v.number()),
  }).index("by_event", ["eventId"]),

  // Legacy: nothing reads or writes it. Cleared and removed in the next step.
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

  // Legacy: nothing reads or writes it. Cleared and removed in the next step.
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
    .index("by_user", ["userId"])
    // Event-scoped connections only. A token with no eventId is account-wide
    // and is not in this index; A2 still clears those.
    .index("by_event", ["eventId"]),
});
