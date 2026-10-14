import { v } from "convex/values";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";

const MAX_ATTEMPTS = 5;

export const send = mutation({
  args: {
    to: v.string(),
    replyTo: v.optional(v.string()),
    subject: v.string(),
    html: v.string(),
    text: v.optional(v.string()),
  },
  returns: v.id("outbox"),
  handler: async (ctx, args) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.to) || args.to.length > 254) {
      throw new Error("Invalid recipient");
    }
    if (
      args.replyTo !== undefined &&
      (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.replyTo) || args.replyTo.length > 254)
    ) {
      throw new Error("Invalid reply-to");
    }
    const id = await ctx.db.insert("outbox", {
      ...args,
      status: "queued",
      attempts: 0,
    });
    await ctx.scheduler.runAfter(0, internal.lib.deliver, { id });
    return id;
  },
});

export const status = query({
  args: { id: v.id("outbox") },
  returns: v.union(
    v.null(),
    v.object({
      status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
      attempts: v.number(),
      error: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("outbox", args.id);
    if (row === null) return null;
    return { status: row.status, attempts: row.attempts, error: row.error };
  },
});

export const load = internalQuery({
  args: { id: v.id("outbox") },
  handler: async (ctx, args) => ctx.db.get("outbox", args.id),
});

export const finish = internalMutation({
  args: {
    id: v.id("outbox"),
    ok: v.boolean(),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("outbox", args.id);
    if (row === null || row.status !== "queued") return null;
    const attempts = row.attempts + 1;
    if (args.ok) {
      await ctx.db.patch("outbox", args.id, {
        status: "sent",
        attempts,
        messageId: args.messageId,
        to: undefined,
        replyTo: undefined,
        subject: undefined,
        html: undefined,
        text: undefined,
      });
    } else if (attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch("outbox", args.id, {
        status: "failed",
        attempts,
        error: args.error,
        to: undefined,
        replyTo: undefined,
        subject: undefined,
        html: undefined,
        text: undefined,
      });
    } else {
      await ctx.db.patch("outbox", args.id, { attempts, error: args.error });
      // 30s, 60s, 120s, 240s
      await ctx.scheduler.runAfter(30_000 * 2 ** (attempts - 1), internal.lib.deliver, {
        id: args.id,
      });
    }
    return null;
  },
});

// Convex can't use Worker bindings, so this calls the Cloudflare Email
// Service REST API.
export const deliver = internalAction({
  args: { id: v.id("outbox") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.runQuery(internal.lib.load, { id: args.id });
    if (row === null || row.status !== "queued" || row.to === undefined) {
      return null;
    }
    const { CF_ACCOUNT_ID, CF_EMAIL_TOKEN, EMAIL_FROM } = env;
    if (!CF_ACCOUNT_ID || !CF_EMAIL_TOKEN || !EMAIL_FROM) {
      await ctx.runMutation(internal.lib.finish, {
        id: args.id,
        ok: false,
        error: "Cloudflare Email is not configured",
      });
      return null;
    }
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/email/sending/send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CF_EMAIL_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: row.to,
            from: EMAIL_FROM,
            reply_to: row.replyTo,
            subject: row.subject,
            html: row.html,
            text: row.text,
          }),
        },
      );
      if (!res.ok) {
        await ctx.runMutation(internal.lib.finish, {
          id: args.id,
          ok: false,
          error: `Cloudflare responded ${res.status}`,
        });
        return null;
      }
      const body: unknown = await res.json().catch(() => null);
      const messageId =
        typeof body === "object" && body !== null && "result" in body
          ? String((body as { result?: { messageId?: unknown } }).result?.messageId ?? "") ||
            undefined
          : undefined;
      await ctx.runMutation(internal.lib.finish, {
        id: args.id,
        ok: true,
        messageId,
      });
    } catch (e) {
      await ctx.runMutation(internal.lib.finish, {
        id: args.id,
        ok: false,
        error: e instanceof Error ? e.message : "Network error",
      });
    }
    return null;
  },
});
