import { createFileRoute } from "@tanstack/react-router";
import { InvitePage } from "@/components/invite-page";

const OlderInvite = () => {
  const { token } = Route.useParams();
  return <InvitePage token={token} />;
};

export const Route = createFileRoute("/invite/$token")({ component: OlderInvite });
