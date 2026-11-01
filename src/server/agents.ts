import auth from "./auth.md?raw";
import llms from "./llms.md?raw";

// Where the home page points agents, in its Link header (RFC 8288).
export const AGENT_LINKS = [
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</openapi.json>; rel="service-desc"',
  '</llms.txt>; rel="service-doc"',
  '</llms.txt>; rel="describedby"',
].join(", ");

const markdown = (text: string): Response => {
  return new Response(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      Vary: "Accept",
      Link: AGENT_LINKS,
    },
  });
};

// The site as markdown, for AI agents: /llms.txt, and the home page when a
// request asks for text/markdown. The home page's HTML is an app shell, so an
// agent reading it would otherwise find almost nothing.
export const markdownForAgents = (): Response => markdown(llms);

// How an agent may authenticate, at /auth.md: no registration, and only the
// credentials a person hands it.
export const authForAgents = (): Response => markdown(auth);

export const wantsMarkdown = (request: Request): boolean => {
  return request.headers.get("Accept")?.includes("text/markdown") ?? false;
};

// The Worker's /api routes, at /.well-known/api-catalog (RFC 9727). The spec
// has HEAD answer with the Link header, so one function serves both.
export const apiCatalog = (request: Request): Response => {
  const { origin } = new URL(request.url);
  const catalog = {
    linkset: [
      {
        anchor: `${origin}/api`,
        "service-desc": [{ href: `${origin}/openapi.json`, type: "application/json" }],
        "service-doc": [{ href: `${origin}/llms.txt`, type: "text/markdown" }],
      },
    ],
  };
  return new Response(request.method === "HEAD" ? null : JSON.stringify(catalog), {
    headers: {
      "Content-Type": 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      "Cache-Control": "public, max-age=3600",
      Link: '</.well-known/api-catalog>; rel="api-catalog"',
    },
  });
};
