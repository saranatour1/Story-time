import { generateObject, generateText } from "ai";
import { expect, test, vi } from "vite-plus/test";
import { z } from "zod";
import { generateStructured } from "../lib/ai/generate";

vi.mock("ai", () => ({ generateObject: vi.fn(), generateText: vi.fn() }));

const schema = z.object({ summary: z.string() });
const ask = () =>
  generateStructured({
    schema,
    instructions: "plan",
    jsonInstructions: "plan, as JSON",
    messages: [{ role: "user", content: "move this to Friday" }],
    maxOutputTokens: 10,
  });

test("a plan comes from structured output, or from JSON text when that is refused", async () => {
  vi.mocked(generateObject).mockResolvedValueOnce({ object: { summary: "direct" } } as never);
  expect(await ask()).toEqual({ summary: "direct" });
  expect(generateText).not.toHaveBeenCalled();

  vi.mocked(generateObject).mockRejectedValue(new Error("refused"));
  vi.mocked(generateText).mockResolvedValueOnce({
    text: 'Here it is:\n```json\n{"summary":"from text"}\n```',
  } as never);
  expect(await ask()).toEqual({ summary: "from text" });
  expect(vi.mocked(generateText).mock.calls[0]?.[0]).toMatchObject({
    instructions: "plan, as JSON",
  });

  vi.mocked(generateText).mockResolvedValueOnce({ text: '{"other":1}' } as never);
  await expect(ask()).rejects.toThrow("didn't match the shape");
});
