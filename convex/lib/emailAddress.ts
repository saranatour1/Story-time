import { ConvexError } from "convex/values";
import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { env, type MutationCtx } from "../_generated/server";
import { appOrigin } from "./appUrl";
import { emailKeyFor } from "./crypto";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECKS_PER_DAY = 5;
const VERIFY_TTL_MS = 2 * DAY_MS;

// Cloudflare Email is off until all three are set. Callers skip the send
// rather than queueing a message that can only fail.
export const emailConfigured = (): boolean => {
  return Boolean(env.CF_ACCOUNT_ID && env.CF_EMAIL_TOKEN && env.EMAIL_FROM);
};

// The address we may put on a message: confirmed, and never an unverified one.
export const replyAddress = async (
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<string | undefined> => {
  const user = await ctx.db.get("users", userId);
  if (user?.emailVerified !== true || user.email === undefined) return undefined;
  return user.email;
};

const newToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const chargeEmailCheck = async (ctx: MutationCtx, userId: Id<"users">) => {
  const since = Date.now() - DAY_MS;
  const recent = await ctx.db
    .query("emailChecks")
    .withIndex("by_user", (q) => q.eq("userId", userId).gt("_creationTime", since))
    .take(CHECKS_PER_DAY);
  if (recent.length >= CHECKS_PER_DAY) {
    throw new ConvexError({
      code: "RATE_LIMITED",
      message: `You can send ${CHECKS_PER_DAY} confirmation emails a day.`,
    });
  }
  const stale = await ctx.db
    .query("emailChecks")
    .withIndex("by_user", (q) => q.eq("userId", userId).lte("_creationTime", since))
    .take(CHECKS_PER_DAY);
  for (const row of stale) await ctx.db.delete("emailChecks", row._id);
  await ctx.db.insert("emailChecks", { userId });
};

// Stores the address as waiting, and mails a link when email is configured.
// The token stays in the link fragment. Only its hash is kept.
export const issueEmailCheck = async (
  ctx: MutationCtx,
  userId: Id<"users">,
  to: string,
): Promise<"sent" | "waiting"> => {
  const token = newToken();
  await ctx.db.patch("users", userId, {
    pendingEmail: to,
    emailVerifyKey: await emailKeyFor(token),
    emailVerifyExpires: Date.now() + VERIFY_TTL_MS,
  });
  if (!emailConfigured()) return "waiting";
  await chargeEmailCheck(ctx, userId);
  const link = `${appOrigin()}/verify-email#${token}`;
  await ctx.runMutation(components.email.lib.send, {
    to,
    subject: "Confirm your email for Story-time",
    html: `<p>Confirm this address for your Story-time account.</p><p><a href="${link}">Confirm email</a></p><p>The link works for two days. If you didn't ask for this, you can ignore it.</p>`,
    text: `Confirm this address for your Story-time account.\n${link}\nThe link works for two days. If you didn't ask for this, you can ignore it.`,
  });
  return "sent";
};
