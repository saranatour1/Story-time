import type { Agent } from "@convex-dev/agent";
import type { ModelMessage } from "ai";
import type { z } from "zod";
import type { ActionCtx } from "../../_generated/server";

// Structured output first. If the gateway refuses it, ask for JSON text and
// check the shape here. Shared by every place Haiku fills in a shape.
export async function generateStructured<T>(
  ctx: ActionCtx,
  agent: Agent,
  threadId: string,
  args: { schema: z.ZodType<T>; messages: ModelMessage[]; jsonInstructions: string; maxOutputTokens: number },
): Promise<T> {
  const { schema, messages, maxOutputTokens } = args;
  try {
    // Spelled out, since a generic result can't be worked out from the schema.
    const { object } = await agent.generateObject<z.ZodType<T>, "object", T>(
      ctx,
      { threadId },
      { schema, messages, maxOutputTokens },
    );
    return schema.parse(object);
  } catch {
    const { text } = await agent.generateText(
      ctx,
      { threadId },
      { system: args.jsonInstructions, messages, maxOutputTokens },
    );
    // The reply may wrap the JSON in prose or a code fence; take the object.
    const object = /\{[\s\S]*\}/.exec(text)?.[0] ?? text;
    const parsed = schema.safeParse(JSON.parse(object));
    if (!parsed.success) throw new Error("The model's reply didn't match the shape asked for");
    return parsed.data;
  }
}
