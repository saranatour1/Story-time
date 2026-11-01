import { createFileRoute } from "@tanstack/react-router";
import { authForAgents } from "@/server/agents";

// How agents authenticate (Auth.md). The text is src/server/auth.md.
export const Route = createFileRoute("/auth.md")({
  server: { handlers: { GET: () => authForAgents() } },
});
