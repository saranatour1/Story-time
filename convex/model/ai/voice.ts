import { ConvexError, v } from "convex/values";
import { getServiceToken } from "convex/server";
import { z } from "zod";
import { action } from "../../_generated/server";
import { MAX_COMMAND_CHARS, MAX_VOICE_BYTES } from "../../lib/limits";
import { AI_LIMIT_MESSAGE, takeAi } from "../../lib/rateLimit";
import { TRANSCRIPTION_MODEL } from "../../lib/ai/models";
import { metered } from "../../lib/ai/budget";

// Turns a short recording into text for the box above the itinerary. The clip
// goes to the gateway's speech-to-text model and nowhere else: it isn't stored,
// logged or kept, and neither is the text.

const GATEWAY = "https://ai-gateway.convex.dev/v1/audio/transcriptions";

// What a browser's recorder makes, by the names the gateway knows.
export const FORMATS = ["webm", "ogg", "m4a", "mp3", "wav"] as const;
export type Format = (typeof FORMATS)[number];

export const isFormat = (value: string): value is Format => {
  return FORMATS.some((f) => f === value);
};

// Base64 without the stack-size limit of one big String.fromCharCode call.
export const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const reply = z.object({ text: z.string() });

// The words in the gateway's reply, tidied, or undefined when it isn't one.
export const readTranscript = (body: unknown): string | undefined => {
  const parsed = reply.safeParse(body);
  if (!parsed.success) return undefined;
  return parsed.data.text.replace(/\s+/g, " ").trim().slice(0, MAX_COMMAND_CHARS);
};

const transcribe = action({
  args: { audio: v.bytes(), format: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to use your voice." });
    if (!isFormat(args.format)) {
      throw new ConvexError({ code: "INVALID", message: "This browser recorded in a format I can't read." });
    }
    if (args.audio.byteLength === 0) throw new ConvexError({ code: "INVALID", message: "That recording was empty." });
    if (args.audio.byteLength > MAX_VOICE_BYTES) {
      throw new ConvexError({ code: "INVALID", message: "That recording is too long. Keep it under a minute." });
    }
    if (!(await takeAi(ctx, identity.subject))) {
      throw new ConvexError({ code: "RATE_LIMITED", message: `${AI_LIMIT_MESSAGE} You can still type it.` });
    }

    const res = await metered(ctx, { userId: identity.subject, feature: "voice", model: TRANSCRIPTION_MODEL }, async () => {
      const out = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await getServiceToken("ai-gateway")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: TRANSCRIPTION_MODEL,
        input_audio: { data: toBase64(new Uint8Array(args.audio)), format: args.format },
        // No `provider.zdr` here: the transcription route refuses it (400,
        // unsupported parameter), so voice is the one model call that can't
        // ask for zero-data-retention endpoints yet.
      }),
      });
      // The gateway's cost, from a clone: the body is read again below.
      const body: unknown = out.ok ? await out.clone().json() : undefined;
      const usage: unknown = typeof body === "object" && body !== null && "usage" in body ? body.usage : undefined;
      const cost = typeof usage === "object" && usage !== null && "cost" in usage && typeof usage.cost === "number" ? usage.cost : undefined;
      return { result: out, costUsd: cost };
    });
    // Status only: an error body can echo the request, and the request is the recording.
    if (!res.ok) {
      console.warn(`Transcription failed with status ${res.status}`);
      throw new ConvexError({ code: "AI_UNAVAILABLE", message: "I couldn't make that out just now. Try again, or type it." });
    }
    const text = readTranscript(await res.json());
    if (text === undefined || text === "") {
      throw new ConvexError({ code: "NO_SPEECH", message: "I didn't catch any words. Try again a little closer to the mic." });
    }
    return text;
  },
});

// What the app calls. Registered once, by convex/api/ai/voice.ts, which re-exports it.
export const voiceApi = { transcribe };
