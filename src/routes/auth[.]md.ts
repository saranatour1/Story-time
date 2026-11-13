import { createFileRoute } from "@tanstack/react-router";
import { authForAgents } from "@/server/agents";

export const Route = createFileRoute("/auth.md")({
  server: { handlers: { GET: () => authForAgents() } },
});
