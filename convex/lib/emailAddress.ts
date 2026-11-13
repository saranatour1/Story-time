import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { env, type MutationCtx } from "../_generated/server";
import { appOrigin } from "./appUrl";
import { emailKeyFor } from "./crypto";
import { EMAIL_CHECKS_PER_DAY } from "./limits";
import { chargeEmail } from "./rateLimit";

const DAY_MS = 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 2 * DAY_MS;

export const MAIL_OWNER = "story-time";

export const queueMail = async (
  ctx: MutationCtx,
  mail: { to: string; replyTo?: string; subject: string; html: string; text?: string },
): Promise<void> => {
  const emailId = await ctx.runMutation(components.cloudflareEmail.lib.queue, {
    owner: MAIL_OWNER,
    payload: JSON.stringify(mail),
  });
  await ctx.scheduler.runAfter(0, internal.model.mail.deliver, { emailId });
};

export const emailConfigured = (): boolean => {
  return Boolean(env.CF_ACCOUNT_ID && env.CF_EMAIL_TOKEN && env.EMAIL_FROM);
};

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
  await chargeEmail(
    ctx,
    "emailCheck",
    userId,
    `You can send ${EMAIL_CHECKS_PER_DAY} confirmation emails a day.`,
  );
  const link = `${appOrigin()}/verify-email#${token}`;
  await queueMail(ctx, {
    to,
    subject: "Confirm your email for Story-time",
    html: `<p>Confirm this address for your Story-time account.</p><p><a href="${link}">Confirm email</a></p><p>The link works for two days. If you didn't ask for this, you can ignore it.</p>`,
    text: `Confirm this address for your Story-time account.\n${link}\nThe link works for two days. If you didn't ask for this, you can ignore it.`,
  });
  return "sent";
};
