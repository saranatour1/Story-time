import { createFileRoute } from "@tanstack/react-router";
import { InvitePage } from "@/components/invite-page";

const OlderInvite = () => {
  const { token } = Route.useParams();
  return <InvitePage token={token} />;
};

// Invite links made before the token moved after "#". They still work until
// they expire; new links are /invite#<token>.
export const Route = createFileRoute("/invite/$token")({ component: OlderInvite });
