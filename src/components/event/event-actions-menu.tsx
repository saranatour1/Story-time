import { useNavigate } from "@tanstack/react-router";
import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteExperience } from "@/lib/actions";
import { errorMessage } from "@/lib/errors";

// The "..." menu for an experience. Items show only when they apply: edit
// and add need a handler, archive and delete need the owner.
export function EventActionsMenu({
  event,
  onEditDetails,
  onAddMoment,
}: {
  event: EventView;
  onEditDetails?: () => void;
  onAddMoment?: () => void;
}) {
  const update = useMutation(api.events.update);
  const token = useAuthToken();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const isOwner = event.role === "owner";
  const archived = event.status === "archived";

  async function setArchived(next: boolean) {
    const status = (on: boolean) => (on ? ("archived" as const) : ("active" as const));
    try {
      await update({ eventId: event._id, status: status(next) });
      toast.success(next ? "Experience archived" : "Experience restored", {
        // Long enough to notice and reach Undo; the default is ~4s.
        duration: 10_000,
        action: {
          label: "Undo",
          onClick: () => void update({ eventId: event._id, status: status(!next) }),
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/e/${event._id}`);
    toast.success("Link copied");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${event.title}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {onEditDetails && isOwner && !archived && (
            <DropdownMenuItem onSelect={onEditDetails}>
              <PencilIcon /> Edit details
            </DropdownMenuItem>
          )}
          {onAddMoment && event.role !== "viewer" && !archived && (
            <DropdownMenuItem onSelect={onAddMoment}>
              <PlusIcon /> Add moment
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void copyLink()}>
            <LinkIcon /> Copy link
          </DropdownMenuItem>
          {isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void setArchived(!archived)}>
                {archived ? (
                  <>
                    <ArchiveRestoreIcon /> Restore
                  </>
                ) : (
                  <>
                    <ArchiveIcon /> Archive
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete "${event.title}"?`}
        description="This removes the experience, its moments and photos, and everyone's access to it. It can't be undone."
        confirmLabel="Delete experience"
        onConfirm={async () => {
          if (!token) throw new Error("Sign in again to delete");
          await deleteExperience(event._id, token);
          toast.success("Experience deleted");
          await navigate({ to: "/home" });
        }}
      />
    </>
  );
}
