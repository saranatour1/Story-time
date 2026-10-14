import { AIBudget } from "@convex-dev/ai-budget";
import { components } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";

// Measures every AI call: which model, for whom, for which feature, its
// tokens, and its cost (the gateway's own dollar figure). It keeps no prompts
// or responses: `storeContent: false`, set once per deployment by
// model/aiBudget.ts `configure`. It caps nothing; the daily allowance is
// lib/rateLimit.ts. Its dashboard is at <deployment>.convex.site/aibudget.
export const aiBudget = new AIBudget(components.aiBudget);

export type MeteredFeature = "note" | "transport" | "intent" | "plan" | "voice" | "title";

// The gateway's cost for one AI SDK call, in nanodollars, when it reports one.
const gatewayCostNanos = (providerMetadata: unknown): number | undefined => {
  if (
    typeof providerMetadata !== "object" ||
    providerMetadata === null ||
    !("convexGateway" in providerMetadata)
  )
    return undefined;
  const gateway: unknown = providerMetadata.convexGateway;
  if (typeof gateway !== "object" || gateway === null || !("cost" in gateway)) return undefined;
  return typeof gateway.cost === "number" && gateway.cost >= 0
    ? Math.round(gateway.cost * 1e9)
    : undefined;
};

// Runs one AI call and records it. `run` returns the call's result with its
// usage and provider metadata (the AI SDK's), or a cost in dollars when the
// call is a plain fetch. An error is recorded, then thrown on as it was.
export const metered = async <T>(
  ctx: ActionCtx,
  call: { userId: string; feature: MeteredFeature; model: string },
  run: () => Promise<{ result: T; usage?: unknown; providerMetadata?: unknown; costUsd?: number }>,
): Promise<T> => {
  let done: { result: T } | undefined;
  await aiBudget.meter(
    ctx,
    {
      model: call.model,
      messages: [],
      userId: call.userId,
      action: call.feature,
      tags: [{ dimension: "feature", value: call.feature }],
    },
    async () => {
      const { result, usage, providerMetadata, costUsd } = await run();
      done = { result };
      return {
        usage,
        costNanos:
          costUsd !== undefined ? Math.round(costUsd * 1e9) : gatewayCostNanos(providerMetadata),
      };
    },
  );
  if (done === undefined) throw new Error("The AI call didn't run");
  return done.result;
};
