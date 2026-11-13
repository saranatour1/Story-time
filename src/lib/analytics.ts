import { track } from "@databuddy/sdk";
import { ConvexError } from "convex/values";

export type AiFeature = "box" | "voice";

const outcomeOf = (error: unknown): "limit" | "error" => {
  const data: unknown = error instanceof ConvexError ? error.data : undefined;
  return typeof data === "object" && data !== null && "code" in data && data.code === "RATE_LIMITED"
    ? "limit"
    : "error";
};

export const trackAi = async <T>(
  feature: AiFeature,
  request: Promise<T>,
  outcome?: (result: T) => string,
): Promise<T> => {
  try {
    const result = await request;
    track("ai_used", { feature, result: outcome?.(result) ?? "ok" });
    return result;
  } catch (error) {
    track("ai_used", { feature, result: outcomeOf(error) });
    throw error;
  }
};

export { track };
