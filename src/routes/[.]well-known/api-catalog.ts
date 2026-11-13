import { createFileRoute } from "@tanstack/react-router";
import { apiCatalog } from "@/server/agents";

export const Route = createFileRoute("/.well-known/api-catalog")({
  server: {
    handlers: {
      GET: ({ request }) => apiCatalog(request),
      HEAD: ({ request }) => apiCatalog(request),
    },
  },
});
