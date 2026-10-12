import { createMiddleware, createStart } from "@tanstack/react-start";
import { trackAgents } from "@databuddy/sdk/agents";
import { waitUntil } from "cloudflare:workers";

// Pages can't be framed (clickjacking), sniffed into another type, or pass the
// full URL on to other sites, which matters for share links that carry a token.
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

// AI crawlers and agents (GPTBot, ClaudeBot, Perplexity...) never run the
// page's script, so the Worker tells Databuddy about their reads: the path
// without its query, the agent, and the format asked for. It runs after the
// response and never delays it. Production builds only, like the page script.
const DATABUDDY_ID: string | undefined = import.meta.env.VITE_DATABUDDY_CLIENT_ID;
const aiAgents = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  if (DATABUDDY_ID) waitUntil(trackAgents(request, { websiteId: DATABUDDY_ID }));
  return next();
});

// SSR is off app-wide: routes render in the browser. The shell and the root
// route's head() still render on the server, for link previews and the
// no-flash theme script.
export const startInstance = createStart(() => ({
  defaultSsr: false,
  requestMiddleware: [securityHeaders, aiAgents],
}));
