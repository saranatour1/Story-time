import { Agent, createThread } from "@convex-dev/agent";
import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { components, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { action, internalQuery } from "../../_generated/server";
import { assertNotArchived, requireEventAccess } from "../../lib/access";
import { AI_LIMIT_MESSAGE, takeAi } from "../../lib/rateLimit";
import { generateStructured } from "../../lib/ai/generate";
import { scribeModel, skipReason } from "../../lib/ai/models";
import { promptFor } from "./scribe";

// "Try another": one more title for a moment's journal page, from the same
// details Scribe writes captions from. It is only a suggestion: nothing is
// stored here, and using it goes through `savePage`, which encrypts it.

const INSTRUCTIONS = [
  "You write the title for one page of a scrapbook journal about a moment someone shared.",
  "Write one title: playful and warm, at most five words and 40 characters. No emojis, no quotation marks, no hashtags, no full stop.",
  "Use the language of the notes, English if there are none. Never invent names, places or times the details don't give.",
].join("\n");

const JSON_INSTRUCTIONS = `${INSTRUCTIONS}\nReply with JSON only: {"title": string}.`;

const titleSchema = z.object({ title: z.string().min(1).max(80) });

const titler = new Agent(components.agent, {
  name: "Scribe",
  languageModel: scribeModel,
  instructions: INSTRUCTIONS,
  storageOptions: { saveMessages: "none" },
});

// The page's moment and who is asking. Only the journal's owner may.
export const pageMoment = internalQuery({
  args: { pageId: v.id("journalPages") },
  returns: v.object({ userId: v.id("users"), momentId: v.id("moments") }),
  handler: async (ctx, args) => {
    const page = await ctx.db.get("journalPages", args.pageId);
    if (page === null) throw new ConvexError({ code: "NOT_FOUND", message: "That page isn't here any more." });
    const { userId, event } = await requireEventAccess(ctx, page.eventId, "owner");
    assertNotArchived(event);
    if (page.momentId === undefined) throw new ConvexError({ code: "INVALID", message: "Only a moment's page has a moment to name it after." });
    return { userId, momentId: page.momentId };
  },
});

const suggest = action({
  args: { pageId: v.id("journalPages"), current: v.optional(v.string()) },
  handler: async (ctx, args): Promise<string> => {
    const { userId, momentId }: { userId: Id<"users">; momentId: Id<"moments"> } = await ctx.runQuery(internal.model.ai.title.pageMoment, { pageId: args.pageId });
    if (!(await takeAi(ctx, userId))) throw new ConvexError({ code: "RATE_LIMITED", message: AI_LIMIT_MESSAGE });
    const details = await ctx.runQuery(internal.model.ai.scribe.context, { momentId });
    const current = args.current?.trim().slice(0, 80);
    const threadId = await createThread(ctx, components.agent);
    try {
      const { title } = await generateStructured(ctx, titler, threadId, {
        schema: titleSchema,
        messages: [{ role: "user", content: [promptFor(details).replace("The photos are this moment.", ""), current ? `The page's title now, write a different one: ${current}` : "", "Write the title."].filter(Boolean).join("\n") }],
        jsonInstructions: JSON_INSTRUCTIONS,
        maxOutputTokens: 100,
      });
      return title.replace(/^["'“”]+|["'“”.]+$/g, "").trim().slice(0, 60);
    } catch (error) {
      console.warn("No title suggestion:", skipReason(error));
      throw new ConvexError({ code: "AI_FAILED", message: "I couldn't think of a title just now. Try again." });
    } finally {
      await titler.deleteThreadSync(ctx, { threadId }).catch(() => undefined);
    }
  },
});

// What the app calls. Registered once, by convex/api/ai/title.ts, which re-exports it.
export const titleApi = { suggest };
