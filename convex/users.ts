import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { vGithubProfile } from "@convex-dev/auth/providers/oauth/github";
import { vGoogleProfile } from "@convex-dev/auth/providers/oauth/google";
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

export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("users"),
      displayName: v.optional(v.string()),
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
      region: user.region ?? "us",
      locale: user.locale,
    };
  },
});

export const updateSettings = mutation({
  args: {
    displayName: v.optional(v.string()),
    region: v.optional(vRegion),
    locale: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new Error("Not signed in");
    const userId = ctx.db.normalizeId("users", identity.subject);
    if (userId === null) throw new Error("Not signed in");
    if (args.displayName !== undefined && args.displayName.length > 60) {
      throw new Error("Display name is too long");
    }
    await ctx.db.patch("users", userId, args);
    return null;
  },
});
