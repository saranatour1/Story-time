import { createFileRoute, redirect } from "@tanstack/react-router";

// The old composer page. Creating and editing now happen in the panel
// beside the itinerary; keep old links working.
export const Route = createFileRoute("/_app/e/$id/new")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/e/$id",
      params,
      search: { panel: "new-moment" as const },
      replace: true,
    });
  },
});
