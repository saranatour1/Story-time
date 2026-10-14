import { track } from "@databuddy/sdk";
import { ConvexError } from "convex/values";

// Events sent to Databuddy (only on production builds; see __root.tsx).
// Names and a few fixed values, never ids, titles, words or links: the
// dashboard sees that the box was used, not what was said.
//
// Button clicks are counted with a `data-track` attribute on the button
// instead (Databuddy sends the attribute's value as the event, and the
// button's other data-* attributes with it).

export type AiFeature = "note" | "box" | "voice" | "title";

const outcomeOf = (error: unknown): "limit" | "error" => {
  const data: unknown = error instanceof ConvexError ? error.data : undefined;
  return typeof data === "object" && data !== null && "code" in data && data.code === "RATE_LIMITED"
    ? "limit"
    : "error";
};

// Counts one AI request: which feature, and how it ended ("ok", "limit",
// "error", or what `outcome` reads from the result).
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
