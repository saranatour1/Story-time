import { PencilIcon } from "lucide-react";
import { AuthImage, AuthVideo } from "@/components/auth-image";
import type { MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/local-time";
import { cn } from "@/lib/utils";

// A moment opened to look at, over the page: every photo and video uncropped,
// then its words. Nothing here changes it; Edit hands over to the form.
export const MomentPeek = ({
  moment,
  onEdit,
  onClose,
}: {
  moment: MomentView;
  // Absent when this person may not change the moment.
  onEdit?: () => void;
  onClose: () => void;
}) => {
  const blocks = [...moment.blocks, ...moment.stops.flatMap((stop) => stop.blocks)];
  const media = blocks.filter((b) => b.type === "photo" || b.type === "video");
  const places = [moment.place, ...moment.stops.map((stop) => stop.place)].filter(Boolean);
  const when = formatDateTime(moment.startsAt, moment.tzOffsetMinutes, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{places.length > 0 ? places.join(" → ") : when}</DialogTitle>
          <DialogDescription>
            {places.length > 0 ? `${when} · ` : ""}
            {moment.authorName ?? "Someone"}
          </DialogDescription>
        </DialogHeader>
        {media.length > 0 && (
          <div className={cn("grid gap-2", media.length > 1 && "sm:grid-cols-2")}>
            {media.map((b) =>
              b.type === "video" ? (
                <AuthVideo key={b.mediaId} mediaId={b.mediaId} label="Video" />
              ) : (
                <AuthImage
                  key={b.mediaId}
                  mediaId={b.mediaId}
                  alt=""
                  variant="full"
                  // The photo's own shape, not a crop.
                  className="aspect-auto min-h-24 rounded-lg [&_img]:h-auto [&_img]:object-contain"
                />
              ),
            )}
          </div>
        )}
        {blocks.map((b, i) =>
          b.type === "note" || b.type === "feeling" ? (
            <p key={i} className="text-sm whitespace-pre-line">
              {b.type === "feeling" && b.mood ? `${b.mood} ` : ""}
              {b.text}
            </p>
          ) : b.type === "link" ? (
            <a
              key={i}
              href={b.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block truncate text-sm underline"
            >
              {b.title ?? b.url}
            </a>
          ) : null,
        )}
        {moment.labels.length > 0 && (
          <p className="text-xs text-muted-foreground">{moment.labels.join(" · ")}</p>
        )}
        {onEdit && (
          <div>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <PencilIcon /> Edit
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
