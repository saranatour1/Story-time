import llms from "./llms.md?raw";

// The site as markdown, for AI agents: /llms.txt, and the home page when a
// request asks for text/markdown. The home page's HTML is an app shell, so an
// agent reading it would otherwise find almost nothing.
export const markdownForAgents = (): Response => {
  return new Response(llms, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      Vary: "Accept",
    },
  });
};

export const wantsMarkdown = (request: Request): boolean => {
  return request.headers.get("Accept")?.includes("text/markdown") ?? false;
};
