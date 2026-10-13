import { convexGateway, type GatewayModelOptions } from "@convex-dev/ai-sdk-provider";
import type { Experimental_DecisionModel } from "ai";

type DecisionModel = Exclude<Experimental_DecisionModel, string>;

// Haiku and Jev are reached through zero-data-retention endpoints only: the
// provider keeps nothing it's sent (photos, notes, places). The gateway fails
// a request rather than fall back to an endpoint that keeps data. Whisper
// can't be asked yet (see model/ai/voice.ts).
export const ZDR: GatewayModelOptions = { zdr: true };

// Haiku reads the photos and writes the diary line and labels.
export const scribeModel = convexGateway.messages("anthropic/claude-haiku-5.5", ZDR);

// Speech to text, through the gateway's HTTP route (the provider package's
// own voice support is still an alpha release).
export const TRANSCRIPTION_MODEL = "openai/whisper-large-v3-turbo";

// The gateway types its evaluation models as `any`, so the one place that
// calls it gives the result a type here. If the gateway rejects this id,
// "typesafe/jev-router" is the alias in its model list.
export const jevModel = (): DecisionModel => {
  const gateway: { evaluationModel(modelId: string, options?: GatewayModelOptions): DecisionModel } = convexGateway;
  return gateway.evaluationModel("typesafe/jev-1.13", ZDR);
};

// Only the message. Gateway errors carry the request body, and that holds
// the photos and places, so it never goes into the logs.
export const skipReason = (error: unknown): string => {
  return error instanceof Error ? error.message : "unknown error";
};
