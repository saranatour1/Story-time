import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { LinkIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deletePhotos } from "@/lib/actions";

export function MomentActionsMenu({
  eventId,
  moment,
  canEdit,
  onEdit,
  onDeleted,
}: {
  eventId: Id<"events">;
  moment: MomentView;
  canEdit: boolean;
  onEdit: () => void;
  onDeleted?: () => void;
}) {
  const remove = useMutation(api.moments.remove);
  const token = useAuthToken();
  const [confirming, setConfirming] = useState(false);

  async function copyLink() {
    const url = `${window.location.origin}/e/${eventId}?panel=moment&momentId=${moment._id}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Moment actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {canEdit && (
            <DropdownMenuItem onSelect={onEdit}>
              <PencilIcon /> Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void copyLink()}>
            <LinkIcon /> Copy link
          </DropdownMenuItem>
          {canEdit && (
            <>
              <DropdownMenuSeparator />
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
        title="Delete this moment?"
        description="Its notes, links and photos are removed for everyone. This can't be undone."
        confirmLabel="Delete moment"
        onConfirm={async () => {
          const { removedMediaIds } = await remove({ momentId: moment._id });
          if (token) await deletePhotos(removedMediaIds, token);
          toast.success("Moment deleted");
          onDeleted?.();
        }}
      />
    </>
  );
}
