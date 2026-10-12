import { beforeEach, describe, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";

const sent = vi.hoisted(() => [] as Array<[string, unknown]>);
vi.mock("@databuddy/sdk", () => ({ track: (name: string, props: unknown) => sent.push([name, props]) }));

const { trackAi } = await import("./analytics");

describe("trackAi", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  test("counts how a request ended, never what it returned", async () => {
    await trackAi("box", Promise.resolve({ kind: "plan", summary: "Moved lunch to Friday" }), (p) => p.kind);
    await trackAi("voice", Promise.resolve("we took the ferry"));
    expect(sent).toEqual([
      ["ai_used", { feature: "box", result: "plan" }],
      ["ai_used", { feature: "voice", result: "ok" }],
    ]);
  });

  test("a spent allowance reads as limit, anything else as error, and the error still reaches the caller", async () => {
    const limited = new ConvexError({ code: "RATE_LIMITED", message: "You've used today's 10 AI requests." });
    await expect(trackAi("title", Promise.reject(limited))).rejects.toBe(limited);
    await expect(trackAi("note", Promise.reject(new Error("offline")))).rejects.toThrow("offline");
    expect(sent).toEqual([
      ["ai_used", { feature: "title", result: "limit" }],
      ["ai_used", { feature: "note", result: "error" }],
    ]);
  });
});
