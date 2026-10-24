import { DAY, HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { components } from "../_generated/api";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import {
  AI_PER_DAY,
  EMAIL_CHECKS_PER_DAY,
  INVITE_EMAILS_PER_DAY,
  SHARE_EMAILS_PER_DAY,
} from "./limits";

// Per-person allowances, keyed by user id.
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Every AI feature draws on one allowance: a note written for a moment, a
  // typed or spoken request, a journal title. The day starts at midnight UTC.
  ai: { kind: "fixed window", rate: AI_PER_DAY, period: DAY, start: 0 },
  // A link preview fetches someone else's page. Not AI, so it has its own.
  linkPreview: { kind: "token bucket", rate: 60, period: HOUR },
  // Changes a person makes (moments, journal pages, invites, sharing...):
  // far more than anyone types, enough for a big photo import, and a stop
  // for a client stuck in a loop. Token buckets refill steadily.
  writes: { kind: "token bucket", rate: 300, period: MINUTE },
  // Emails to addresses someone types, so the forms can't mail strangers in
  // bulk. A day's worth comes back over a day.
  inviteEmail: { kind: "token bucket", rate: INVITE_EMAILS_PER_DAY, period: DAY },
  shareEmail: { kind: "token bucket", rate: SHARE_EMAILS_PER_DAY, period: DAY },
  emailCheck: { kind: "token bucket", rate: EMAIL_CHECKS_PER_DAY, period: DAY },
});

export const AI_LIMIT_MESSAGE = `You've used today's ${AI_PER_DAY} AI requests. They come back at midnight UTC.`;

// One use of the day's AI allowance, or false when it's spent.
export const takeAi = async (ctx: MutationCtx | ActionCtx, userId: string): Promise<boolean> => {
  return (await rateLimiter.limit(ctx, "ai", { key: userId })).ok;
};

// One email of a kind, or a RATE_LIMITED error that says what to do instead.
export const chargeEmail = async (
  ctx: MutationCtx,
  kind: "inviteEmail" | "shareEmail" | "emailCheck",
  userId: string,
  message: string,
): Promise<void> => {
  const { ok } = await rateLimiter.limit(ctx, kind, { key: userId });
  if (!ok) throw new ConvexError({ code: "RATE_LIMITED", message });
};

// Throws when someone is changing things faster than a person can.
export const limitWrites = async (ctx: MutationCtx, userId: string): Promise<void> => {
  const { ok } = await rateLimiter.limit(ctx, "writes", { key: userId });
  if (!ok)
    throw new ConvexError({
      code: "RATE_LIMITED",
      message: "That's a lot of changes at once. Wait a moment and try again.",
    });
};
