import { useMutation } from "convex/react";
import { Share2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";

// Owners share by invite, as on the Shared tab: a one-time viewer link.
// Everyone else copies the story's own address.
export function ShareButton({ event, label }: { event: EventView; label?: string }) {
  const createInvite = useMutation(api.invites.create);
  const [busy, setBusy] = useState(false);
  const isOwner = event.role === "owner";
  const archived = event.status === "archived";

  async function share() {
    setBusy(true);
    try {
      if (isOwner && !archived) {
        const { link } = await createInvite({ eventId: event._id, role: "viewer" });
        await navigator.clipboard.writeText(link);
        toast.success("Invite link copied", { description: "It works once and expires in 7 days." });
      } else {
        await navigator.clipboard.writeText(`${window.location.origin}/e/${event._id}/story`);
        toast.success("Link copied");
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (label) {
    return (
      <Button variant="secondary" onClick={() => void share()} disabled={busy}>
        <Share2Icon /> {label}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isOwner ? "Share by invite link" : "Copy link"}
      onClick={() => void share()}
      disabled={busy}
      className="text-white hover:bg-white/10 hover:text-white"
    >
      <Share2Icon />
    </Button>
  );
}
