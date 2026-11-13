import type { Agent } from "@convex-dev/agent";
import type { ModelMessage } from "ai";
import type { z } from "zod";
import type { ActionCtx } from "../../_generated/server";
import { metered, type MeteredFeature } from "./budget";
import { HAIKU } from "./models";

export const generateStructured = async <T>(
  ctx: ActionCtx,
  agent: Agent,
  threadId: string,
  args: {
    schema: z.ZodType<T>;
    messages: ModelMessage[];
    jsonInstructions: string;
    maxOutputTokens: number;
  },
  who: { userId: string; feature: MeteredFeature },
): Promise<T> => {
  const { schema, messages, maxOutputTokens } = args;
  const call = { ...who, model: HAIKU };
  try {
    const object = await metered(ctx, call, async () => {
      const out = await agent.generateObject<z.ZodType<T>, "object", T>(
        ctx,
        { threadId },
        { schema, messages, maxOutputTokens },
      );
      return { result: out.object, usage: out.usage, providerMetadata: out.providerMetadata };
    });
    return schema.parse(object);
  } catch {
    const text = await metered(ctx, call, async () => {
      const out = await agent.generateText(
        ctx,
        { threadId },
        { system: args.jsonInstructions, messages, maxOutputTokens },
      );
      return { result: out.text, usage: out.usage, providerMetadata: out.providerMetadata };
    });
    const object = /\{[\s\S]*\}/.exec(text)?.[0] ?? text;
    const parsed = schema.safeParse(JSON.parse(object));
    if (!parsed.success) throw new Error("The model's reply didn't match the shape asked for");
    return parsed.data;
  }
};
