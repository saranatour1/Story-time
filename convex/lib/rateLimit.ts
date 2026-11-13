import { DAY, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { components } from "../_generated/api";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import { EMAIL_CHECKS_PER_DAY, INVITE_EMAILS_PER_DAY, SHARE_EMAILS_PER_DAY } from "./limits";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // typed or spoken request. The day starts at midnight UTC.
  ai: { kind: "fixed window", rate: 10, period: DAY, start: 0 },
  // Changes a person makes (moments, invites, sharing...):
  writes: { kind: "token bucket", rate: 300, period: MINUTE },
  inviteEmail: { kind: "token bucket", rate: INVITE_EMAILS_PER_DAY, period: DAY },
  shareEmail: { kind: "token bucket", rate: SHARE_EMAILS_PER_DAY, period: DAY },
  emailCheck: { kind: "token bucket", rate: EMAIL_CHECKS_PER_DAY, period: DAY },
});

export const AI_LIMIT_MESSAGE = "You've used today's AI requests. They come back at midnight UTC.";

export const takeAi = async (ctx: MutationCtx | ActionCtx, userId: string): Promise<boolean> => {
  return (await rateLimiter.limit(ctx, "ai", { key: userId })).ok;
};

// Gives that use back, for a request the AI couldn't answer.
export const creditAi = (ctx: MutationCtx | ActionCtx, userId: string): Promise<void> => {
  return rateLimiter.credit(ctx, "ai", { key: userId });
};

export const chargeEmail = async (
  ctx: MutationCtx,
  kind: "inviteEmail" | "shareEmail" | "emailCheck",
  userId: string,
  message: string,
): Promise<void> => {
  const { ok } = await rateLimiter.limit(ctx, kind, { key: userId });
  if (!ok) throw new ConvexError({ code: "RATE_LIMITED", message });
};

export const limitWrites = async (ctx: MutationCtx, userId: string): Promise<void> => {
  const { ok } = await rateLimiter.limit(ctx, "writes", { key: userId });
  if (!ok)
    throw new ConvexError({
      code: "RATE_LIMITED",
      message: "That's a lot of changes at once. Wait a moment and try again.",
    });
};
