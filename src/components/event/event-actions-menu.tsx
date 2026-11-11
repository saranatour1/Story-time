import { useNavigate } from "@tanstack/react-router";
import { useAuthToken } from "@convex-dev/auth/react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  HistoryIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { queries } from "@/lib/queries";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteExperience } from "@/lib/actions";
import { errorMessage } from "@/lib/errors";

// The "..." menu for an experience. Items show only when they apply: edit
// needs a handler, archive and delete need the owner.
export const EventActionsMenu = ({
  event,
  onEditDetails,
  compact = false,
}: {
  // Home cards carry no description, and the menu never needs one.
  event: Omit<EventView, "description">;
  onEditDetails?: () => void;
  // The icon alone, where a label would crowd (a card's corner).
  compact?: boolean;
}) => {
  const update = useMutation(api.events.update);
  const token = useAuthToken();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const isOwner = event.role === "owner";
  const archived = event.status === "archived";
  // New moments, pages and guestbook notes since the owner last opened
  // Activity. Not asked for on a Home card: one count per card is too many.
  const { data: unread = 0 } = useQuery(
    queries.changes.unreadCount(isOwner && !compact ? { eventId: event._id } : "skip"),
  );

  const setArchived = async (next: boolean) => {
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
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/e/${event._id}`);
    toast.success("Link copied");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* "More" is spelled out from the `sm` breakpoint up (the icon alone
              below it, and always when `compact`, as in a card's corner). */}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`More actions for ${event.title}${unread > 0 ? `, ${unread} new in Activity` : ""}`}
            title="More: edit details, activity, archive"
            className={compact ? "relative" : "relative sm:w-auto sm:gap-1.5 sm:px-3"}
          >
            <MoreHorizontalIcon />
            {!compact && <span className="hidden sm:inline">More</span>}
            {unread > 0 && (
              <span
                aria-hidden
                className="absolute top-1 right-1 size-2 rounded-full bg-amber-400"
              />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-72">
          <DropdownMenuLabel>Experience</DropdownMenuLabel>
          {onEditDetails && isOwner && !archived && (
            <DropdownMenuItem onSelect={onEditDetails}>
              <PencilIcon /> Edit details
            </DropdownMenuItem>
          )}
          {event.momentCount > 0 && (
            <DropdownMenuItem
              data-track="story_played"
              data-from="menu"
              onSelect={() =>
                void navigate({
                  to: "/e/$id/story",
                  params: { id: event._id },
                  search: { step: 0 },
                })
              }
            >
              <PlayIcon /> Play story
            </DropdownMenuItem>
          )}
          <DropdownMenuItem data-track="link_copied" onSelect={() => void copyLink()}>
            <LinkIcon /> Copy link
          </DropdownMenuItem>
          {isOwner && !compact && (
            <DropdownMenuItem
              onSelect={() => void navigate({ to: "/e/$id/activity", params: { id: event._id } })}
            >
              <HistoryIcon /> Activity
              {unread > 0 && (
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {unread > 99 ? "99+" : unread} new
                </span>
              )}
            </DropdownMenuItem>
          )}
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
};
