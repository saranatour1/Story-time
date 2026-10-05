import { ConvexError, v } from "convex/values";
import { env, internalMutation, mutation, query } from "./_generated/server";
import { vGithubProfile } from "@convex-dev/auth/providers/oauth/github";
import { vGoogleProfile } from "@convex-dev/auth/providers/oauth/google";
import { requireUserId } from "./lib/access";
import {
  EMAIL_PATTERN,
  MAX_DISPLAY_NAME,
  MAX_EMAIL,
  USERNAME_PATTERN,
  cleanEmail,
  cleanUsername,
} from "./lib/profile";
import { vRegion } from "./schema";

// Privacy by default: the user row starts empty. Nothing from the OAuth
// profile (name, email, avatar) is copied; users add what they choose.
export const createGithubUser = internalMutation({
  args: {
    provider: v.object({
      name: v.literal("github"),
      accountId: v.string(),
      profile: vGithubProfile,
    }),
  },
  returns: v.id("users"),
  handler: async (ctx) => await ctx.db.insert("users", {}),
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
  handler: async (ctx) => await ctx.db.insert("users", {}),
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
    if (env.ALLOW_ANONYMOUS_SIGNIN !== "true") {
      throw new ConvexError("Anonymous sign-in is disabled.");
    }
    return await ctx.db.insert("users", {});
  },
});

export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("users"),
      displayName: v.optional(v.string()),
      username: v.optional(v.string()),
      email: v.optional(v.string()),
      imageMediaId: v.optional(v.id("media")),
      region: vRegion,
      locale: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = ctx.db.normalizeId("users", identity.subject);
    if (userId === null) return null;
    const user = await ctx.db.get("users", userId);
    if (user === null) return null;
    return {
      id: user._id,
      displayName: user.displayName,
      username: user.username,
      email: user.email,
      imageMediaId: user.imageMediaId,
      region: user.region ?? "us",
      locale: user.locale,
    };
  },
});

function invalid(field: string, message: string): never {
  throw new ConvexError({ code: "INVALID", field, message });
}

// Only fields that are passed change. An empty string clears a text field.
export const updateSettings = mutation({
  args: {
    displayName: v.optional(v.string()),
    username: v.optional(v.string()),
    email: v.optional(v.string()),
    region: v.optional(vRegion),
    locale: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const patch: {
      displayName?: string;
      username?: string;
      email?: string;
      region?: typeof args.region;
      locale?: string;
    } = {};

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
      patch.email = email;
    }

    if (args.region !== undefined) patch.region = args.region;
    if (args.locale !== undefined) patch.locale = args.locale;

    if (Object.keys(patch).length === 0) return null;
    await ctx.db.patch("users", userId, patch);
    return null;
  },
});
