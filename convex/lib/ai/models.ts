import { convexGateway, type GatewayModelOptions } from "@convex-dev/ai-sdk-provider";
import type { Experimental_DecisionModel } from "ai";

type DecisionModel = Exclude<Experimental_DecisionModel, string>;

export const ZDR: GatewayModelOptions = { zdr: true };

// The models, by the gateway's ids.
const HAIKU = "anthropic/claude-haiku-5.5";
const JEV = "typesafe/jev-1.13";

export const scribeModel = convexGateway.messages(HAIKU, ZDR);

export const TRANSCRIPTION_MODEL = "openai/whisper-large-v3-turbo";

// The gateway types its evaluation models as `any`, so the one place that
// calls it gives the result a type here.
export const jevModel = (): DecisionModel => {
  const gateway: {
    evaluationModel(modelId: string, options?: GatewayModelOptions): DecisionModel;
  } = convexGateway;
  return gateway.evaluationModel(JEV, ZDR);
};

// Only the message. Gateway errors carry the request body, and that holds
// the photos and places, so it never goes into the logs.
export const skipReason = (error: unknown): string => {
  return error instanceof Error ? error.message : "unknown error";
};
