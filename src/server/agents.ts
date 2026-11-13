import auth from "./auth.md?raw";
import llms from "./llms.md?raw";

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

export const markdownForAgents = (): Response => markdown(llms);

export const authForAgents = (): Response => markdown(auth);

export const wantsMarkdown = (request: Request): boolean => {
  return request.headers.get("Accept")?.includes("text/markdown") ?? false;
};

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
