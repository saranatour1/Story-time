import { createFileRoute, redirect } from "@tanstack/react-router";

// The guestbook is on the People page now; old links land there.
export const Route = createFileRoute("/_app/e/$id/guestbook")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/e/$id/shared", params, replace: true });
  },
});
