import { createFileRoute } from "@tanstack/react-router";
import { markdownForAgents } from "@/server/agents";

// What Story-time is, for AI agents (llmstxt.org). The text is src/server/llms.md.
export const Route = createFileRoute("/llms.txt")({
  server: { handlers: { GET: () => markdownForAgents() } },
});
