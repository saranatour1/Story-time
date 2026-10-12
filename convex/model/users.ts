import { ConvexError, v } from "convex/values";
import { env, internalMutation, mutation, query } from "../_generated/server";
import { vGithubProfile } from "@convex-dev/auth/providers/oauth/github";
import { vGoogleProfile } from "@convex-dev/auth/providers/oauth/google";
import { requireUserId } from "../lib/access";
import { appOrigins } from "../lib/appUrl";
import { emailKeyFor } from "../lib/crypto";
import { emailConfigured, issueEmailCheck } from "../lib/emailAddress";
import {
  EMAIL_PATTERN,
  MAX_DISPLAY_NAME,
  MAX_EMAIL,
  USERNAME_PATTERN,
  cleanEmail,
  cleanUsername,
} from "../lib/profile";

// A verified provider email, normalised, or nothing. An unverified or
// malformed address is left off. Name and avatar are never copied.
function oauthEmail(profile: { email?: string; emailVerified: boolean }): string | undefined {
  if (!profile.emailVerified || profile.email === undefined) return undefined;
  const email = cleanEmail(profile.email);
  if (email === undefined || email.length > MAX_EMAIL || !EMAIL_PATTERN.test(email)) return undefined;
  return email;
}

// Privacy by default: the row starts empty apart from a verified contact
// email. Nothing else from the OAuth profile is copied.
export const createGithubUser = internalMutation({
  args: {
    provider: v.object({
      name: v.literal("github"),
      accountId: v.string(),
      profile: vGithubProfile,
    }),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const email = oauthEmail(args.provider.profile);
    return await ctx.db.insert("users", email === undefined ? {} : { email, emailVerified: true });
  },
});

export const createGoogleUser = internalMutation({
  args: {
    provider: v.object({
      name: v.literal("google"),
      accountId: v.string(),
      profile: vGoogleProfile,
    }),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const email = oauthEmail(args.provider.profile);
    return await ctx.db.insert("users", email === undefined ? {} : { email, emailVerified: true });
  },
});

export const createAnonymousUser = internalMutation({
  args: {
    provider: v.object({
      name: v.literal("anonymous"),
      accountId: v.string(),
      profile: v.object({}),
    }),
  },
  returns: v.id("users"),
  handler: async (ctx) => {
    // The flag alone isn't enough: every app origin must be local too, so a
    // flag left on a production deployment does nothing.
    const localOnly = appOrigins().every((origin) => {
      const host = new URL(origin).hostname;
      return host === "localhost" || host === "127.0.0.1";
    });
    if (env.ALLOW_ANONYMOUS_SIGNIN !== "true" || !localOnly) {
      throw new ConvexError("Anonymous sign-in is disabled.");
    }
    return await ctx.db.insert("users", {});
  },
});

const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = ctx.db.normalizeId("users", identity.subject);
    if (userId === null) return null;
    const user = await ctx.db.get("users", userId);
    if (user === null) return null;
    const verified = user.emailVerified === true;
    return {
      id: user._id,
      displayName: user.displayName,
      username: user.username,
      // Only a confirmed address is the one we send to.
      email: verified ? user.email : undefined,
      // A typed address, or an older one that was saved before confirmation existed.
      pendingEmail: user.pendingEmail ?? (verified ? undefined : user.email),
      emailVerified: verified,
      onThisDay: user.onThisDay === true,
      imageMediaId: user.imageMediaId,
      locale: user.locale,
    };
  },
});

function invalid(field: string, message: string): never {
  throw new ConvexError({ code: "INVALID", field, message });
}

type EmailStatus = "unchanged" | "cleared" | "sent" | "waiting";

// Only fields that are passed change. An empty string clears a text field.
// A typed email is not trusted until its confirmation link is opened.
const updateSettings = mutation({
  args: {
    displayName: v.optional(v.string()),
    username: v.optional(v.string()),
    email: v.optional(v.string()),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get("users", userId);
    if (user === null) throw new Error("User not found");
    const patch: {
      displayName?: string;
      username?: string;
      email?: string;
      emailVerified?: boolean;
      pendingEmail?: string;
      emailVerifyKey?: string;
      emailVerifyExpires?: number;
      locale?: string;
    } = {};
    let emailStatus: EmailStatus = "unchanged";
    let confirm: string | undefined;

    if (args.displayName !== undefined) {
      const name = args.displayName.trim();
      if (name.length > MAX_DISPLAY_NAME) {
        invalid("displayName", "Keep the name under 60 characters");
      }
      patch.displayName = name === "" ? undefined : name;
    }

    if (args.username !== undefined) {
      const username = cleanUsername(args.username);
      if (username !== undefined) {
        if (!USERNAME_PATTERN.test(username)) {
          invalid(
            "username",
            "Use 3 to 20 lowercase letters, numbers or underscores",
          );
        }
        const taken = await ctx.db
          .query("users")
          .withIndex("by_username", (q) => q.eq("username", username))
          .first();
        if (taken !== null && taken._id !== userId) {
          invalid("username", "That username is taken");
        }
      }
      patch.username = username;
    }

    if (args.email !== undefined) {
      const email = cleanEmail(args.email);
      if (
        email !== undefined &&
        (email.length > MAX_EMAIL || !EMAIL_PATTERN.test(email))
      ) {
        invalid("email", "Enter a valid email address");
      }
      if (email === undefined) {
        patch.email = undefined;
        patch.emailVerified = undefined;
        patch.pendingEmail = undefined;
        patch.emailVerifyKey = undefined;
        patch.emailVerifyExpires = undefined;
        emailStatus = "cleared";
      } else if (user.emailVerified === true && email === user.email) {
        patch.pendingEmail = undefined;
        patch.emailVerifyKey = undefined;
        patch.emailVerifyExpires = undefined;
      } else if (email === user.pendingEmail || (user.emailVerified !== true && email === user.email)) {
        // Already waiting, or an older unconfirmed address. Resend is separate.
      } else {
        confirm = email;
      }
    }

    if (args.locale !== undefined) patch.locale = args.locale;

    if (Object.keys(patch).length > 0) await ctx.db.patch("users", userId, patch);
    if (confirm !== undefined) emailStatus = await issueEmailCheck(ctx, userId, confirm);
    return { emailStatus };
  },
});

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,64}$/;

// Opens the confirmation link. The signed-in person must be the one it was sent to.
const verifyEmail = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!TOKEN_SHAPE.test(args.token)) {
      throw new ConvexError("That confirmation link doesn't work.");
    }
    const emailVerifyKey = await emailKeyFor(args.token);
    const user = await ctx.db
      .query("users")
      .withIndex("by_emailVerifyKey", (q) => q.eq("emailVerifyKey", emailVerifyKey))
      .unique();
    if (user === null || user.pendingEmail === undefined) {
      throw new ConvexError("That confirmation link doesn't work.");
    }
    if (user._id !== userId) {
      throw new ConvexError("Sign in as the person this link was sent to.");
    }
    if (user.emailVerifyExpires === undefined || user.emailVerifyExpires < Date.now()) {
      throw new ConvexError("That link has expired. Send a new one from Settings.");
    }
    await ctx.db.patch("users", user._id, {
      email: user.pendingEmail,
      emailVerified: true,
      pendingEmail: undefined,
      emailVerifyKey: undefined,
      emailVerifyExpires: undefined,
    });
    return null;
  },
});

// Sends the confirmation again for an address that is still waiting.
const resendEmailVerification = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get("users", userId);
    if (user === null) throw new Error("User not found");
    const to = user.pendingEmail ?? (user.emailVerified === true ? undefined : user.email);
    if (to === undefined) throw new ConvexError("There's no address waiting to be confirmed.");
    if (!emailConfigured()) return { emailed: false };
    const status = await issueEmailCheck(ctx, userId, to);
    return { emailed: status === "sent" };
  },
});

// The daily memory note. It needs a confirmed address, and the mail says only
// that a memory is waiting.
const setOnThisDay = mutation({
  args: { on: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get("users", userId);
    if (user === null) throw new Error("User not found");
    if (args.on && user.emailVerified !== true) {
      throw new ConvexError("Confirm your email address first.");
    }
    await ctx.db.patch("users", userId, { onThisDay: args.on ? true : undefined });
    return null;
  },
});

// What the app calls. Registered once, by convex/api/users.ts, which re-exports it.
export const usersApi = { getCurrentUser, updateSettings, verifyEmail, resendEmailVerification, setOnThisDay };
