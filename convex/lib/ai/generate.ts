import { generateObject, generateText, type ModelMessage } from "ai";
import type { z } from "zod";
import { scribeModel } from "./models";

// Structured output first. If the gateway refuses it, ask for JSON text and
// check the shape here. One call each way: nothing is stored, and there is no
// thread or tool loop.
export const generateStructured = async <T>(args: {
  schema: z.ZodType<T>;
  instructions: string;
  jsonInstructions: string;
  messages: ModelMessage[];
  maxOutputTokens: number;
}): Promise<T> => {
  const { schema, messages, maxOutputTokens } = args;
  const call = { model: scribeModel, messages, maxOutputTokens };
  try {
    // Spelled out, since a generic result can't be worked out from the schema.
    const out = await generateObject<z.ZodType<T>, "object", T>({
      ...call,
      instructions: args.instructions,
      schema,
    });
    return schema.parse(out.object);
  } catch {
    const { text } = await generateText({ ...call, instructions: args.jsonInstructions });
    // The reply may wrap the JSON in prose or a code fence; take the object.
    const object = /\{[\s\S]*\}/.exec(text)?.[0] ?? text;
    const parsed = schema.safeParse(JSON.parse(object));
    if (!parsed.success) throw new Error("The model's reply didn't match the shape asked for");
    return parsed.data;
  }
};
