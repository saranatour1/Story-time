import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/e/$id/guestbook")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/e/$id/shared", params, replace: true });
  },
});
