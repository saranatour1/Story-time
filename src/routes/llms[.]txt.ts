import { createFileRoute } from "@tanstack/react-router";
import { markdownForAgents } from "@/server/agents";

export const Route = createFileRoute("/llms.txt")({
  server: { handlers: { GET: () => markdownForAgents() } },
});
