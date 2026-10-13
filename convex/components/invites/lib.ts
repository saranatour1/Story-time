import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

const MAX_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const vRole = v.union(v.literal("viewer"), v.literal("contributor"));

const sha256Hex = async (text: string): Promise<string> => {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const newToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// The token is returned once, here; only its hash is stored.
export const create = mutation({
  args: {
    eventId: v.string(),
    invitedBy: v.string(),
    role: vRole,
    ttlMs: v.number(),
  },
  returns: v.object({
    inviteId: v.id("invites"),
    token: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const ttl = Math.min(Math.max(args.ttlMs, 60_000), MAX_TTL_MS);
    const token = newToken();
    const expiresAt = Date.now() + ttl;
    const inviteId = await ctx.db.insert("invites", {
      eventId: args.eventId,
      invitedBy: args.invitedBy,
      role: args.role,
      tokenHash: await sha256Hex(token),
      expiresAt,
    });
    await ctx.scheduler.runAfter(ttl, internal.lib.purge, { inviteId });
    return { inviteId, token, expiresAt };
  },
});

// Read-only check, so the app can decide whether the link needs using up.
// Expiry is left to the caller: queries don't read the clock.
export const lookup = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      eventId: v.string(),
      invitedBy: v.string(),
      role: vRole,
      expiresAt: v.number(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const tokenHash = await sha256Hex(args.token);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (invite === null) return null;
    return {
      eventId: invite.eventId,
      invitedBy: invite.invitedBy,
      role: invite.role,
      expiresAt: invite.expiresAt,
      createdAt: invite._creationTime,
    };
  },
});

// Single use: a valid token is deleted as it is read.
export const consume = mutation({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      eventId: v.string(),
      invitedBy: v.string(),
      role: vRole,
    }),
  ),
  handler: async (ctx, args) => {
    const tokenHash = await sha256Hex(args.token);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (invite === null) return null;
    await ctx.db.delete("invites", invite._id);
    if (invite.expiresAt < Date.now()) return null;
    return {
      eventId: invite.eventId,
      invitedBy: invite.invitedBy,
      role: invite.role,
    };
  },
});

// "This isn't important anymore": hard delete, no tombstone.
// The id arrives as a plain string from the app's client, so it's checked here.
export const dismiss = mutation({
  args: { inviteId: v.string(), eventId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const inviteId = ctx.db.normalizeId("invites", args.inviteId);
    const invite = inviteId === null ? null : await ctx.db.get("invites", inviteId);
    if (invite === null || invite.eventId !== args.eventId) return false;
    await ctx.db.delete("invites", invite._id);
    return true;
  },
});

export const listForEvent = query({
  args: { eventId: v.string() },
  returns: v.array(
    v.object({
      inviteId: v.id("invites"),
      role: vRole,
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("invites")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .take(100);
    // No clock check here: queries must be deterministic, and each invite's
    // purge timer deletes it at expiry.
    return rows.map((r) => ({
      inviteId: r._id,
      role: r.role,
      expiresAt: r.expiresAt,
    }));
  },
});

export const purge = internalMutation({
  args: { inviteId: v.id("invites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const invite = await ctx.db.get("invites", args.inviteId);
    if (invite !== null) await ctx.db.delete("invites", args.inviteId);
    return null;
  },
});

// Backstop for the per-invite timers; called from the app's daily cron.
export const sweep = mutation({
  args: { limit: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const expired = await ctx.db
      .query("invites")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
      .take(args.limit);
    for (const invite of expired) await ctx.db.delete("invites", invite._id);
    return expired.length;
  },
});

// Deletes up to 500 invites for an experience; returns how many. Called
// repeatedly by the app while an experience is being deleted.
export const removeForEvent = mutation({
  args: { eventId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("invites")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .take(500);
    for (const row of rows) await ctx.db.delete("invites", row._id);
    return rows.length;
  },
});
