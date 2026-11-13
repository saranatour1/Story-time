import { AIBudget } from "@convex-dev/ai-budget";
import { components } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";

export const aiBudget = new AIBudget(components.aiBudget);

export type MeteredFeature = "note" | "transport" | "intent" | "plan" | "voice" | "title";

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
