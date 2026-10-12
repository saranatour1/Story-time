import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { assertNotArchived, requireEventAccess } from "../lib/access";
import { recordChange } from "../lib/changes";
import { decryptText, encryptText } from "../lib/crypto";

const MAX_NOTE = 500;
const MAX_NOTES = 50;

// A short note from someone invited to the experience. Share-link visitors
// have no account, so they cannot write one.
const leave = mutation({
  args: { eventId: v.id("events"), text: v.string() },
  returns: v.id("guestNotes"),
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "viewer");
    assertNotArchived(event);
    const text = args.text.trim();
    if (text.length === 0 || text.length > MAX_NOTE) {
      throw new ConvexError({
        code: "INVALID",
        field: "text",
        message: `A guestbook note is at most ${MAX_NOTE} characters.`,
      });
    }
    const existing = await ctx.db
      .query("guestNotes")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .take(MAX_NOTES);
    if (existing.length >= MAX_NOTES) {
      throw new ConvexError({ code: "LIMIT", message: "This guestbook is full." });
    }
    const noteId = await ctx.db.insert("guestNotes", {
      eventId: event._id,
      authorId: userId,
      text: await encryptText(event._id, event.keyVersion, text),
    });
    await recordChange(ctx, {
      eventId: event._id,
      entity: "guestNote",
      entityId: noteId,
      actorId: userId,
      action: "create",
      fields: ["text"],
    });
    return noteId;
  },
});

const list = query({
  args: { eventId: v.id("events") },
  returns: v.array(
    v.object({
      _id: v.id("guestNotes"),
      authorName: v.optional(v.string()),
      text: v.string(),
      at: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { event } = await requireEventAccess(ctx, args.eventId, "viewer");
    const rows = await ctx.db
      .query("guestNotes")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .take(MAX_NOTES);
    const notes = await Promise.all(
      rows.map(async (row) => {
        const author = await ctx.db.get("users", row.authorId);
        return {
          _id: row._id,
          authorName: author?.displayName,
          text: await decryptText(event._id, row.text),
          at: row._creationTime,
        };
      }),
    );
    return notes.sort((a, b) => b.at - a.at);
  },
});

// What the app calls. Registered once, by convex/api/guestNotes.ts, which re-exports it.
export const guestNotesApi = { leave, list };
