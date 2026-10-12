/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { isFormat, readTranscript, toBase64 } from "../model/ai/voice";
import { promptFor } from "../model/ai/scribe";
import { api } from "../_generated/api";
import { MAX_VOICE_BYTES } from "../lib/limits";
import { rateLimiter } from "../lib/rateLimit";
import schema from "../schema";

const modules = import.meta.glob(["../**/*.ts", "../**/*.js", "!../**/*.test.ts"]);

beforeAll(() => {
  // eslint-disable-next-line @convex-dev/no-process-env -- test setup
  process.env.ENCRYPTION_MASTER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
});

const clip = (bytes: number) => new Uint8Array(bytes).fill(1).buffer;

const setup = async () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  return { t, userId, person: t.withIdentity({ subject: userId }) };
};

describe("reading the gateway's reply", () => {
  test("keeps the words, tidied", () => {
    expect(readTranscript({ text: "  move this\n to   Friday ", usage: { seconds: 3 } })).toBe("move this to Friday");
  });

  test("anything else is nothing", () => {
    expect(readTranscript({})).toBeUndefined();
    expect(readTranscript({ text: 4 })).toBeUndefined();
    expect(readTranscript(null)).toBeUndefined();
  });

  test("a long reply is cut to what the box holds", () => {
    expect(readTranscript({ text: "a".repeat(5000) })).toHaveLength(600);
  });
});

describe("encoding", () => {
  test("base64 matches the standard encoding, at any size", () => {
    expect(toBase64(new TextEncoder().encode("Hello"))).toBe("SGVsbG8=");
    const big = new Uint8Array(MAX_VOICE_BYTES).fill(255);
    expect(toBase64(big)).toHaveLength(4 * Math.ceil(MAX_VOICE_BYTES / 3));
  });

  test("only formats the gateway reads are accepted", () => {
    expect(["webm", "ogg", "m4a"].every(isFormat)).toBe(true);
    expect(isFormat("exe")).toBe(false);
  });
});

describe("transcribe is refused before anything is sent", () => {
  test("when nobody is signed in", async () => {
    const { t } = await setup();
    await expect(t.action(api.api.ai.voice.transcribe, { audio: clip(10), format: "webm" })).rejects.toThrow("Sign in");
  });

  test("for a format it can't read, an empty clip or one that's too long", async () => {
    const { person } = await setup();
    await expect(person.action(api.api.ai.voice.transcribe, { audio: clip(10), format: "exe" })).rejects.toThrow("format");
    await expect(person.action(api.api.ai.voice.transcribe, { audio: clip(0), format: "webm" })).rejects.toThrow("empty");
    await expect(person.action(api.api.ai.voice.transcribe, { audio: clip(MAX_VOICE_BYTES + 1), format: "webm" })).rejects.toThrow("too long");
  });

  test("once the person's allowance is spent", async () => {
    const { t, userId, person } = await setup();
    for (let i = 0; i < 40; i++) await t.run((ctx) => rateLimiter.limit(ctx, "voice", { key: userId }));
    await expect(person.action(api.api.ai.voice.transcribe, { audio: clip(10), format: "webm" })).rejects.toThrow("a lot of recordings");
  });
});

describe("the person's words guide the note", () => {
  const found = {
    title: "Germany",
    startsAt: Date.UTC(2025, 1, 20, 14, 29),
    route: [],
    labels: [],
    notes: [],
    experienceLabels: [],
  };

  test("a hint goes in the prompt as theirs; no hint adds nothing", () => {
    expect(promptFor(found, "the dinner in Berlin")).toContain("The person says the photos are: the dinner in Berlin");
    expect(promptFor(found)).not.toContain("The person says");
  });
});
