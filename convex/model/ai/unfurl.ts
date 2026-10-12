import { v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction, internalQuery, type ActionCtx } from "../../_generated/server";
import { decryptText } from "../../lib/crypto";
import { isPublicWebUrl } from "../../lib/publicWeb";

export { isPublicWebUrl, publicRedirect, readHead } from "../../lib/publicWeb";

const vLinkRef = v.object({
  stopIndex: v.number(),
  blockIndex: v.number(),
  url: v.string(),
});
type LinkRef = Infer<typeof vLinkRef>;

// A moment's links are capped, and each fetch gets 5 seconds and 64 KB.
const MAX_LINKS = 10;
const HEAD_BYTES = 64 * 1024;
const TITLE_CHARS = 200;

// Links with no title yet, with their URLs decrypted for the fetch.
export const linksToUnfurl = internalQuery({
  args: { momentId: v.id("moments") },
  returns: v.array(vLinkRef),
  handler: async (ctx, args): Promise<LinkRef[]> => {
    const moment = await ctx.db.get("moments", args.momentId);
    if (moment === null) return [];
    const event = await ctx.db.get("events", moment.eventId);
    if (event === null) return [];

    const refs: LinkRef[] = [];
    const stops = [moment.blocks, ...(moment.stops ?? []).map((s) => s.blocks)];
    for (const [stopIndex, blocks] of stops.entries()) {
      for (const [blockIndex, block] of blocks.entries()) {
        if (block.type === "link" && block.title === undefined) {
          const url = await decryptText(event._id, block.url);
          refs.push({ stopIndex, blockIndex, url });
        }
      }
    }
    return refs;
  },
});

// Takes a page's <title>, from its first 64 KB, for each untitled link. A link
// that fails for any reason just keeps no title.
export const unfurlLinks = internalAction({
  args: { momentId: v.id("moments") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const links: LinkRef[] = await ctx.runQuery(internal.model.ai.unfurl.linksToUnfurl, {
      momentId: args.momentId,
    });
    // Fetched in parallel, and capped, so one moment can't hold up the workflow.
    const found = await Promise.all(
      links.slice(0, MAX_LINKS).map(async (link) => {
        const title = await titleOf(ctx, link.url);
        return title === undefined ? null : { stopIndex: link.stopIndex, blockIndex: link.blockIndex, title };
      }),
    );
    const linkTitles = found.filter(
      (t): t is { stopIndex: number; blockIndex: number; title: string } => t !== null,
    );
    if (linkTitles.length > 0) {
      await ctx.runMutation(internal.model.ai.apply.apply, { momentId: args.momentId, linkTitles });
    }
    return null;
  },
});

// The page's <title>: entities decoded, whitespace collapsed, at most 200 characters.
export function titleFromHtml(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = decodeEntities(match?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, TITLE_CHARS);
  return title === "" ? undefined : title;
}

// The page is read by the node action, which looks the hostname up and refuses
// a private address. A failure of any kind leaves the link untitled.
async function titleOf(ctx: ActionCtx, raw: string): Promise<string | undefined> {
  try {
    const read = await ctx.runAction(internal.model.ai.publicFetch.fetchPage, { url: raw, limit: HEAD_BYTES });
    return read === null ? undefined : titleFromHtml(read.html);
  } catch {
    return undefined;
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

export type LinkPreview = { url: string; title?: string; description?: string; image?: string; site?: string };

// What a page says about itself for a preview: its Open Graph (or Twitter)
// title, description, picture and site, falling back to <title> and the
// meta description. A picture must be a public https address.
export function previewFromHtml(html: string, url: string): LinkPreview {
  const meta = (names: string[]) => {
    for (const name of names) {
      const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i").exec(html)?.[0];
      const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
      if (content?.trim()) return decodeEntities(content).replace(/\s+/g, " ").trim();
    }
    return undefined;
  };
  const clip = (text: string | undefined, n: number) => (text === undefined ? undefined : text.length > n ? `${text.slice(0, n - 1)}…` : text);
  let image = meta(["og:image", "og:image:url", "twitter:image"]);
  try {
    const resolved = image === undefined ? undefined : new URL(image, url);
    image = resolved && resolved.protocol === "https:" && isPublicWebUrl(resolved) ? resolved.href : undefined;
  } catch {
    image = undefined;
  }
  return {
    url,
    title: clip(meta(["og:title", "twitter:title"]) ?? titleFromHtml(html), 160),
    description: clip(meta(["og:description", "twitter:description", "description"]), 280),
    image: image && image.length <= 600 ? image : undefined,
    site: clip(meta(["og:site_name"]) ?? new URL(url).hostname.replace(/^www\./, ""), 60),
  };
}
