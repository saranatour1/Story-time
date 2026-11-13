import { ConvexError, v } from "convex/values";
import { getServiceToken } from "convex/server";
import { z } from "zod";
import { action } from "../../_generated/server";
import { MAX_COMMAND_CHARS, MAX_VOICE_BYTES } from "../../lib/limits";
import { AI_LIMIT_MESSAGE, creditAi, takeAi } from "../../lib/rateLimit";
import { TRANSCRIPTION_MODEL } from "../../lib/ai/models";

const GATEWAY = "https://ai-gateway.convex.dev/v1/audio/transcriptions";

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

export const readTranscript = (body: unknown): string | undefined => {
  const parsed = reply.safeParse(body);
  if (!parsed.success) return undefined;
  return parsed.data.text.replace(/\s+/g, " ").trim().slice(0, MAX_COMMAND_CHARS);
};

const transcribe = action({
  args: { audio: v.bytes(), format: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null)
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in to use your voice." });
    if (!isFormat(args.format)) {
      throw new ConvexError({
        code: "INVALID",
        message: "This browser recorded in a format I can't read.",
      });
    }
    if (args.audio.byteLength === 0)
      throw new ConvexError({ code: "INVALID", message: "That recording was empty." });
    if (args.audio.byteLength > MAX_VOICE_BYTES) {
      throw new ConvexError({
        code: "INVALID",
        message: "That recording is too long. Keep it under a minute.",
      });
    }
    if (!(await takeAi(ctx, identity.subject))) {
      throw new ConvexError({
        code: "RATE_LIMITED",
        message: `${AI_LIMIT_MESSAGE} You can still type it.`,
      });
    }

    const res = await fetch(GATEWAY, {
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
    }).catch(() => undefined);
    if (!res?.ok) {
      console.warn(`Transcription failed with status ${res?.status ?? "none"}`);
      await creditAi(ctx, identity.subject);
      throw new ConvexError({
        code: "AI_UNAVAILABLE",
        message: "I couldn't make that out just now. Try again, or type it.",
      });
    }
    const text = readTranscript(await res.json());
    if (text === undefined || text === "") {
      throw new ConvexError({
        code: "NO_SPEECH",
        message: "I didn't catch any words. Try again a little closer to the mic.",
      });
    }
    return text;
  },
});

export const voiceApi = { transcribe };
