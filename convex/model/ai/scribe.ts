import { v } from "convex/values";
import type { Infer } from "convex/values";
import { Agent, createThread } from "@convex-dev/agent";
import type { FilePart, ModelMessage, TextPart } from "ai";
import { z } from "zod";
import { components, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { internalQuery } from "../../_generated/server";
import { readText } from "../../lib/crypto";
import { listForEvent, viewMoment, type PlainBlock } from "../moments";
import { vTransport } from "../../schema";
import { generateStructured } from "../../lib/ai/generate";
import { scribeModel, skipReason } from "../../lib/ai/models";

// The mood emojis the moment form offers. Copied, not imported from src/.
const MOODS = ["😊", "😍", "😌", "😂", "🥹", "😴"] as const;

// Haiku looks at a few photos, not all of them. This also keeps the arguments small.
const MAX_THUMBS = 4;
// A diary line and three labels; also stops the gateway guessing a limit.
const MAX_OUTPUT_TOKENS = 400;

const INSTRUCTIONS = [
  "You write the diary entry for one moment of an experience someone shared, from its photos and the details given.",
  "Write one note: a short line in the author's voice, first person plural and past tense, at most 200 characters. No hashtags, no emojis, no exclamation marks. Use the language of the existing text, English if there is none.",
  "Write up to three labels: one to three words each, lower case. Prefer labels the experience already uses when one fits.",
  `Give a mood only if one fits: ${MOODS.join(" ")}. Otherwise leave it out.`,
  "Never invent names, places or times the details don't give, and never repeat text already written.",
].join("\n");

const JSON_INSTRUCTIONS = `${INSTRUCTIONS}\nReply with JSON only: {"note": string, "labels": string[], "mood": optional, one of the emojis above}.`;

const captionSchema = z.object({
  note: z.string().max(240),
  labels: z.array(z.string().max(40)).max(3),
  mood: z.enum(MOODS).optional(),
});
type Caption = z.infer<typeof captionSchema>;

// A 512px copy of a photo, base64 JPEG.
export const vThumb = v.object({ mediaId: v.id("media"), jpeg: v.string() });

const vScribeContext = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  startsAt: v.number(),
  // The zone the moment happened in, so its clock time is given there.
  tzOffsetMinutes: v.optional(v.number()),
  place: v.optional(v.string()),
  transport: v.optional(vTransport),
  // The places in order, the moment's own first.
  route: v.array(v.string()),
  labels: v.array(v.string()),
  // Notes and feelings already written on any stop.
  notes: v.array(v.string()),
  experienceLabels: v.array(v.string()),
});
type ScribeContext = Infer<typeof vScribeContext>;

// Each call gets its own thread, since the agent needs one to generate.
// `saveMessages: "none"` keeps prompts and outputs out of it.
const scribe = new Agent(components.agent, {
  name: "Scribe",
  languageModel: scribeModel,
  instructions: INSTRUCTIONS,
  storageOptions: { saveMessages: "none" },
});

export const context = internalQuery({
  args: { momentId: v.id("moments") },
  returns: vScribeContext,
  handler: async (ctx, args): Promise<ScribeContext> => {
    const moment = await ctx.db.get("moments", args.momentId);
    if (moment === null) throw new Error("Moment not found");
    const event = await ctx.db.get("events", moment.eventId);
    if (event === null) throw new Error("Event not found");
    const mine = await viewMoment(ctx, event, moment);
    const everyone = await listForEvent(ctx, event);
    const places = [mine.place, ...mine.stops.map((s) => s.place)];
    return {
      title: event.title,
      description: await readText(event._id, event.description),
      startsAt: mine.startsAt,
      tzOffsetMinutes: mine.tzOffsetMinutes,
      place: mine.place,
      transport: mine.transport,
      route: places.filter((place): place is string => place !== undefined),
      labels: mine.labels,
      notes: writtenText([mine.blocks, ...mine.stops.map((s) => s.blocks)]),
      experienceLabels: [...new Set(everyone.flatMap((m) => m.labels))],
    };
  },
});

// The text of every note and feeling across a moment's stops.
const writtenText = (lists: PlainBlock[][]): string[] => {
  return lists.flat().flatMap((b) => (b.type === "note" || b.type === "feeling" ? [b.text] : []));
};

// "UTC+09:00", or plain "UTC" when there is no offset or it is zero.
const zoneLabel = (offset: number | undefined): string => {
  if (offset === undefined || offset === 0) return "UTC";
  const hours = String(Math.trunc(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `UTC${offset < 0 ? "-" : "+"}${hours}:${minutes}`;
};

export const promptFor = (c: ScribeContext, hint?: string): string => {
  // The clock where it happened, in the zone it happened in.
  const when = new Date(c.startsAt + (c.tzOffsetMinutes ?? 0) * 60_000).toISOString().slice(0, 16).replace("T", " ");
  const lines: Array<string | undefined> = [
    `Experience: ${c.title}`,
    c.description ? `About it: ${c.description}` : undefined,
    `When: ${when} ${zoneLabel(c.tzOffsetMinutes)}`,
    c.place ? `Place: ${c.place}` : undefined,
    c.route.length > 1 ? `Route: ${c.route.join(" → ")}` : undefined,
    c.transport ? `Got there by: ${c.transport}` : undefined,
    c.labels.length > 0 ? `Labels here: ${c.labels.join(", ")}` : undefined,
    c.experienceLabels.length > 0 ? `Labels this experience uses: ${c.experienceLabels.join(", ")}` : undefined,
    c.notes.length > 0 ? `Already written, don't repeat it: ${c.notes.join(" / ")}` : undefined,
    // What the person said the photos are, when they said: their own words.
    hint ? `The person says the photos are: ${hint}` : undefined,
    "The photos are this moment.",
  ];
  return lines.filter((line): line is string => line !== undefined).join("\n");
};

const writeCaption = (ctx: ActionCtx, threadId: string, messages: ModelMessage[]): Promise<Caption> => {
  return generateStructured(ctx, scribe, threadId, {
    schema: captionSchema,
    messages,
    jsonInstructions: JSON_INSTRUCTIONS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });
};

// Writes the diary line and labels from the photos, then hands them to `apply`,
// which keeps anything a person already wrote. `enrich` calls this directly
// rather than through the `caption` action: an action calling an action is only
// worth it across runtimes.
export const captionMoment = async (
  ctx: ActionCtx,
  args: { momentId: Id<"moments">; thumbs: Array<{ mediaId: Id<"media">; jpeg: string }>; hint?: string },
): Promise<void> => {
  const found: ScribeContext = await ctx.runQuery(internal.model.ai.scribe.context, { momentId: args.momentId });
  // Nothing left to fill, so no model call.
  if (found.notes.length > 0 && found.labels.length > 0) return;

  const threadId = await createThread(ctx, components.agent);
  let draft: Caption;
  try {
    const images = args.thumbs.slice(0, MAX_THUMBS).map((thumb): FilePart => ({
      type: "file",
      data: Uint8Array.from(atob(thumb.jpeg), (c) => c.charCodeAt(0)),
      mediaType: "image/jpeg",
    }));
    const text: TextPart = { type: "text", text: promptFor(found, args.hint) };
    const messages: ModelMessage[] = [{ role: "user", content: [...images, text] }];
    draft = await writeCaption(ctx, threadId, messages);
  } catch (error) {
    // The moment is already saved; the caption is just skipped.
    console.warn("Scribe skipped a caption:", skipReason(error));
    return;
  } finally {
    // The thread held nothing; without this each caption would leave a row behind.
    await scribe.deleteThreadSync(ctx, { threadId }).catch(() => undefined);
  }
  await ctx.runMutation(internal.model.ai.apply.apply, {
    momentId: args.momentId,
    note: draft.note,
    mood: draft.mood,
    labels: draft.labels,
  });
};

