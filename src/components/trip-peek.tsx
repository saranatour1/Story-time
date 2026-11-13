import { Link } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { PlayIcon } from "lucide-react";
import { AuthImage } from "@/components/auth-image";
import { eventDates } from "@/components/event/event-dates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/local-time";

export type Trip = Pick<
  FunctionReturnType<typeof api.events.listMine>[number],
  "_id" | "title" | "startsAt" | "endsAt" | "role" | "momentCount"
>;

const MAX_MOMENTS = 4;
const MAX_PHOTOS_PER_MOMENT = 4;

export const TripPeek = ({ trip, onClose }: { trip: Trip; onClose: () => void }) => {
  const latest = usePaginatedQuery(
    api.moments.page,
    { eventId: trip._id, newestFirst: true },
    { initialNumItems: MAX_MOMENTS },
  );
  const moments = latest.status === "LoadingFirstPage" ? undefined : latest.results;
  const size = `${trip.momentCount} ${trip.momentCount === 1 ? "moment" : "moments"}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">{trip.title}</DialogTitle>
          <DialogDescription>
            {[eventDates(trip), size].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>
        {moments === undefined ? (
          <Skeleton className="h-24" />
        ) : moments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has been added yet.</p>
        ) : (
          <>
            <ul className="space-y-4">
              {moments.map((moment) => {
                const blocks = [...moment.blocks, ...moment.stops.flatMap((stop) => stop.blocks)];
                const photos = blocks.filter((b) => b.type === "photo").slice(0, MAX_PHOTOS_PER_MOMENT);
                const videos = blocks.filter((b) => b.type === "video").length;
                const words = blocks.find((b) => b.type === "note" || b.type === "feeling");
                return (
                  <li key={moment._id} className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(moment.startsAt, moment.tzOffsetMinutes, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {moment.place ? ` · ${moment.place}` : ""}
                    </p>
                    {photos.length > 0 && (
                      <div className="grid grid-cols-4 gap-1.5">
                        {photos.map((b) => (
                          <AuthImage
                            key={b.mediaId}
                            mediaId={b.mediaId}
                            alt=""
                            className="aspect-square"
                          />
                        ))}
                      </div>
                    )}
                    {videos > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {videos} {videos === 1 ? "video" : "videos"}
                      </p>
                    )}
                    {words && (
                      <p className="line-clamp-2 text-sm whitespace-pre-line">{words.text}</p>
                    )}
                  </li>
                );
              })}
            </ul>
            {trip.momentCount > moments.length && (
              <p className="text-sm text-muted-foreground">
                and {trip.momentCount - moments.length} more
              </p>
            )}
          </>
        )}
        <DialogFooter>
          {trip.momentCount > 0 && (
            <Button variant="outline" asChild>
              <Link
                to="/e/$id/story"
                params={{ id: trip._id }}
                search={{ step: 0 }}
                data-track="story_played"
                data-from="calendar"
              >
                <PlayIcon className="fill-current" /> Play story
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link to="/e/$id" params={{ id: trip._id }}>
              Open
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
