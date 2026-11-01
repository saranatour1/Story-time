import { createFileRoute } from "@tanstack/react-router";
import { apiCatalog } from "@/server/agents";

// Where the API is described, for automated discovery (RFC 9727).
export const Route = createFileRoute("/.well-known/api-catalog")({
  server: {
    handlers: {
      GET: ({ request }) => apiCatalog(request),
      HEAD: ({ request }) => apiCatalog(request),
    },
  },
});
