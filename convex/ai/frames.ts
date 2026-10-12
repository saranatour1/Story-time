import { Agent, createThread } from "@convex-dev/agent";
import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { z } from "zod";
import { components, internal } from "../_generated/api";
import { action, internalQuery } from "../_generated/server";
import { assertNotArchived, requireEventAccess } from "../lib/access";
import { MAX_CANVAS_FILL } from "../lib/limits";
import { rateLimiter } from "../lib/rateLimit";
import { listForEvent } from "../moments";
import { generateStructured } from "./generate";
import { scribeModel, skipReason } from "./models";

// Names the pages of a collage. Each frame holds a few moments; Haiku reads
// their places and notes and gives the page a short title, like "Pastries by
// the river" or "Lost in Sintra", instead of "Frame 3".

const MAX_FRAMES = 30;
const MAX_TITLE = 40;
const NOTE_PREVIEW = 100;

const vAsk = v.object({ id: v.string(), momentIds: v.array(v.id("moments")) });

const vPage = v.object({
  id: v.string(),
  moments: v.array(
    v.object({
      day: v.string(),
      place: v.optional(v.string()),
      note: v.optional(v.string()),
      labels: v.array(v.string()),
    }),
  ),
});
const vContext = v.object({ userId: v.id("users"), title: v.string(), pages: v.array(vPage) });
type Page = Infer<typeof vPage>;

// What the model sees: only the owner may ask, and only for moments of this
// experience.
export const context = internalQuery({
  args: { eventId: v.id("events"), frames: v.array(vAsk) },
  returns: vContext,
  handler: async (ctx, args) => {
    const { userId, event } = await requireEventAccess(ctx, args.eventId, "owner");
    assertNotArchived(event);
    if (args.frames.length > MAX_FRAMES) {
      throw new ConvexError({ code: "INVALID", message: `Name at most ${MAX_FRAMES} frames at a time.` });
    }
    const all = new Map((await listForEvent(ctx, event)).map((m) => [m._id as string, m]));
    const pages = args.frames.flatMap((f): Page[] => {
      const moments = f.momentIds.slice(0, MAX_CANVAS_FILL).flatMap((id) => {
        const m = all.get(id);
        if (m === undefined) return [];
        const said = m.blocks.find((b) => b.type === "note" || b.type === "feeling");
        return [
          {
            day: new Date(m.startsAt + (m.tzOffsetMinutes ?? 0) * 60_000).toISOString().slice(0, 10),
            place: m.place?.split(",")[0]?.trim(),
            note: said === undefined || (said.type !== "note" && said.type !== "feeling") ? undefined : said.text.slice(0, NOTE_PREVIEW),
            labels: m.labels.slice(0, 4),
          },
        ];
      });
      return moments.length === 0 ? [] : [{ id: f.id, moments }];
    });
    return { userId, title: event.title, pages };
  },
});

const reply = z.object({ titles: z.array(z.object({ id: z.string(), title: z.string() })) });

const INSTRUCTIONS = [
  "You name the pages of a trip scrapbook. Each page holds the moments of one stretch of the trip.",
  "Give each page a short title of two to four words that says what happened or where, like \"Pastries by the river\" or \"Lost in Sintra\".",
  "Be specific to the moments. Never use the date, a number, \"Day 1\", \"Page 1\", or a bare word like \"Memories\". No quotes, no colons, no emoji, no hashtags.",
  "Give every page a different title. Reply with one title for each page, keeping its `id`.",
].join("\n");

const JSON_INSTRUCTIONS = `${INSTRUCTIONS}\nReply with JSON only: {"titles": [{"id": string, "title": string}]}.`;

const namer = new Agent(components.agent, {
  name: "Scribe",
  languageModel: scribeModel,
  instructions: INSTRUCTIONS,
  storageOptions: { saveMessages: "none" },
});

// A title the page can show: trimmed, without quotes or a trailing stop, short.
export function cleanTitle(raw: string): string | undefined {
  const text = raw
    .replace(/["“”«»`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.:;,!\s]+$/, "")
    .trim();
  if (text === "") return undefined;
  if (text.length <= MAX_TITLE) return text;
  // Cut at a word, never in the middle of one.
  const cut = text.slice(0, MAX_TITLE + 1);
  const at = cut.lastIndexOf(" ");
  return at > 12 ? cut.slice(0, at) : text.slice(0, MAX_TITLE);
}

export function promptFor(title: string, pages: Page[]): string {
  const lines = pages.map((p) => {
    const moments = p.moments.map((m) => `  - ${[m.day, m.place, m.note && `"${m.note}"`, m.labels.length > 0 && m.labels.join(", ")].filter(Boolean).join(" · ")}`);
    return `Page ${p.id}:\n${moments.join("\n")}`;
  });
  return `The trip: ${title}\n\n${lines.join("\n\n")}`;
}

// The model's titles for the pages that were asked about, cleaned, with a page
// that came back twice, empty or unasked for left out.
export function titlesFor(asked: string[], got: Array<{ id: string; title: string }>): Array<{ id: string; title: string }> {
  const want = new Set(asked);
  const seen = new Set<string>();
  return got.flatMap(({ id, title }) => {
    const clean = cleanTitle(title);
    if (clean === undefined || !want.has(id) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, title: clean }];
  });
}

export const name = action({
  args: { eventId: v.id("events"), frames: v.array(vAsk) },
  returns: v.array(v.object({ id: v.string(), title: v.string() })),
  handler: async (ctx, args): Promise<Array<{ id: string; title: string }>> => {
    const found = await ctx.runQuery(internal.ai.frames.context, args);
    if (found.pages.length === 0) return [];
    const { ok } = await rateLimiter.limit(ctx, "command", { key: found.userId });
    if (!ok) {
      throw new ConvexError({ code: "RATE_LIMITED", message: "That's a lot of requests this hour. Try again a little later." });
    }
    const threadId = await createThread(ctx, components.agent);
    try {
      const got = await generateStructured(ctx, namer, threadId, {
        schema: reply,
        messages: [{ role: "user", content: promptFor(found.title, found.pages) }],
        jsonInstructions: JSON_INSTRUCTIONS,
        maxOutputTokens: 400,
      });
      return titlesFor(found.pages.map((p) => p.id), got.titles);
    } catch (error) {
      console.warn("Scribe couldn't name the frames:", skipReason(error));
      throw new ConvexError({ code: "AI_UNAVAILABLE", message: "I couldn't think of names just now. Try again in a moment." });
    } finally {
      await namer.deleteThreadSync(ctx, { threadId }).catch(() => undefined);
    }
  },
});
