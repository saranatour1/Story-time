import { isPublicWebUrl } from "../../lib/publicWeb";

export { isPublicWebUrl, publicRedirect, readHead } from "../../lib/publicWeb";

const TITLE_CHARS = 200;

// The page's <title>: entities decoded, whitespace collapsed, at most 200 characters.
export const titleFromHtml = (html: string): string | undefined => {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = decodeEntities(match?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TITLE_CHARS);
  return title === "" ? undefined : title;
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export const decodeEntities = (text: string): string => {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
};

export type LinkPreview = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  site?: string;
};

// What a page says about itself for a preview: its Open Graph (or Twitter)
// title, description, picture and site, falling back to <title> and the
// meta description. A picture must be a public https address.
export const previewFromHtml = (html: string, url: string): LinkPreview => {
  const meta = (names: string[]) => {
    for (const name of names) {
      const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i").exec(
        html,
      )?.[0];
      const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
      if (content?.trim()) return decodeEntities(content).replace(/\s+/g, " ").trim();
    }
    return undefined;
  };
  const clip = (text: string | undefined, n: number) =>
    text === undefined ? undefined : text.length > n ? `${text.slice(0, n - 1)}…` : text;
  let image = meta(["og:image", "og:image:url", "twitter:image"]);
  try {
    const resolved = image === undefined ? undefined : new URL(image, url);
    image =
      resolved && resolved.protocol === "https:" && isPublicWebUrl(resolved)
        ? resolved.href
        : undefined;
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
};
