import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { assertNotArchived, requireEventAccess } from "../lib/access";
import { recordChange } from "../lib/changes";
import { decryptText, encryptText } from "../lib/crypto";
import { MAX_JOURNAL_PAGES } from "../lib/journal";
import { MAX_PDF_BYTES } from "../lib/limits";
import { assertUploadBudget } from "./media";

// The journal as one PDF, locked with a password, for its share link. The
// browser prints and encrypts it (AES-256, the PDF standard's own
// encryption), the upload route stores it encrypted at rest like any photo,
// and the password is kept here under the event key so its owner can copy it
// again. The share link can fetch the file but never the password: that goes
// to people separately.

const PDF_MIME = "application/pdf";

async function journalOf(ctx: MutationCtx, eventId: Id<"events">) {
  return ctx.db
    .query("journals")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .unique();
}

// Step 1 of the upload, called by the server route before it streams bytes.
const reserve = mutation({
  args: { eventId: v.id("events"), size: v.number() },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    if (!Number.isInteger(args.size) || args.size < 1) throw new ConvexError({ code: "INVALID", field: "size", message: "Empty file" });
    if (args.size > MAX_PDF_BYTES) throw new ConvexError({ code: "TOO_LARGE", message: "The PDF can be at most 50 MB. Try the pages of one day.", maxBytes: MAX_PDF_BYTES });
    await assertUploadBudget(ctx, userId, args.size);
    const r2Key = `events/${event._id}/${crypto.randomUUID()}`;
    const mediaId = await ctx.db.insert("media", {
      eventId: event._id,
      uploaderId: userId,
      purpose: "pdf",
      r2Key,
      size: args.size,
      mime: PDF_MIME,
      keyVersion: event.keyVersion,
      status: "reserved",
    });
    await recordChange(ctx, {
      eventId: event._id,
      entity: "media",
      entityId: mediaId,
      actorId: userId,
      action: "create",
      fields: ["size", "mime", "status"],
      after: { size: args.size, mime: PDF_MIME, status: "reserved" },
    });
    return { mediaId, r2Key, keyVersion: event.keyVersion, keyScope: event._id };
  },
});

// Puts an uploaded PDF on the share link, with its password. Returns the one
// it replaces, so the caller can delete that file from storage.
const set = mutation({
  args: { eventId: v.id("events"), mediaId: v.id("media"), password: v.string(), pages: v.number() },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    const media = await ctx.db.get("media", args.mediaId);
    if (media === null || media.eventId !== event._id || media.purpose !== "pdf" || media.status !== "ready" || media.uploaderId !== userId) {
      throw new ConvexError({ code: "INVALID", message: "That PDF isn't ready." });
    }
    if (args.password.length < 8 || args.password.length > 128) {
      throw new ConvexError({ code: "INVALID", field: "password", message: "Use a password of 8 to 128 characters." });
    }
    if (!Number.isInteger(args.pages) || args.pages < 1 || args.pages > MAX_JOURNAL_PAGES) {
      throw new ConvexError({ code: "INVALID", field: "pages", message: "That isn't a page count." });
    }
    const pdf = { mediaId: media._id, password: await encryptText(event._id, event.keyVersion, args.password), pages: args.pages, at: Date.now() };
    const journal = await journalOf(ctx, event._id);
    const replaced = journal?.pdf?.mediaId ?? null;
    if (journal === null) await ctx.db.insert("journals", { eventId: event._id, pdf });
    else await ctx.db.patch("journals", journal._id, { pdf });
    await recordChange(ctx, {
      eventId: event._id,
      entity: "event",
      entityId: event._id,
      actorId: userId,
      action: "update",
      fields: ["sharedPdf"],
    });
    return replaced === media._id ? null : replaced;
  },
});

// Takes the PDF off the share link. Returns it, so the caller can delete it.
const drop = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    const journal = await journalOf(ctx, event._id);
    if (!journal?.pdf) return null;
    await ctx.db.patch("journals", journal._id, { pdf: undefined });
    await recordChange(ctx, {
      eventId: event._id,
      entity: "event",
      entityId: event._id,
      actorId: userId,
      action: "update",
      fields: ["sharedPdf"],
    });
    return journal.pdf.mediaId;
  },
});

// The locked PDF, if there is one. Its owner also gets the password back.
const get = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const { event, role } = await requireEventAccess(ctx, args.eventId, "viewer");
    const journal = await ctx.db
      .query("journals")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .unique();
    const pdf: Doc<"journals">["pdf"] = journal?.pdf;
    if (!pdf) return null;
    return {
      mediaId: pdf.mediaId,
      pages: pdf.pages,
      at: pdf.at,
      password: role === "owner" ? await decryptText(event._id, pdf.password) : undefined,
    };
  },
});

// What the app calls. Registered once, by convex/api/pdf.ts, which re-exports it.
export const pdfApi = { reserve, set, drop, get };
