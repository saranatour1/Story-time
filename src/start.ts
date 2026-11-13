import { createMiddleware, createStart } from "@tanstack/react-start";
import { pageMeta } from "@/lib/seo";
import { AGENT_LINKS, markdownForAgents, wantsMarkdown } from "@/server/agents";
import { trackAgents } from "@databuddy/sdk/agents";
import { waitUntil } from "cloudflare:workers";

const securityHeaders = createMiddleware({ type: "request" }).server(async ({ next }) => {
  const result = await next();
  const headers = result.response.headers;
  if (headers.get("content-type")?.startsWith("text/html")) {
    headers.set("X-Frame-Options", "DENY");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  return result;
});

const DATABUDDY_ID: string | undefined = import.meta.env.VITE_DATABUDDY_CLIENT_ID;
const aiAgents = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  if (DATABUDDY_ID) waitUntil(trackAgents(request, { websiteId: DATABUDDY_ID }));
  return next();
});

const forCrawlers = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  const { pathname } = new URL(request.url);
  if (pathname === "/" && wantsMarkdown(request)) return markdownForAgents();
  const result = await next();
  const headers = result.response.headers;
  if (headers.get("content-type")?.startsWith("text/html")) {
    if (!pageMeta(pathname).index) headers.set("X-Robots-Tag", "noindex");
    if (pathname === "/") {
      headers.append("Vary", "Accept");
      headers.set("Link", AGENT_LINKS);
    }
  }
  return result;
});

export const startInstance = createStart(() => ({
  defaultSsr: false,
  requestMiddleware: [securityHeaders, aiAgents, forCrawlers],
}));
