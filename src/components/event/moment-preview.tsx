import { PencilIcon } from "lucide-react";
import { AuthImage, AuthVideo } from "@/components/auth-image";
import { stopsOf, transportOf } from "@/components/event/transport";
import type { MomentView } from "@/components/event/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Block = MomentView["blocks"][number];

// dateStyle can't be combined with weekday, so spell the parts out.
const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// The selected moment as a journey: one step per stop, each with how they got
// there, where and when, and what they shared.
export function MomentPreview({
  moment,
  mine,
  onEdit,
}: {
  moment: MomentView;
  mine: boolean;
  onEdit?: () => void;
}) {
  const stops = stopsOf(moment);
  const author = mine ? "you" : (moment.authorName ?? "Anonymous");

  return (
    <article aria-label="Moment preview" className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-muted-foreground">
            {when(moment.startsAt)} · by {author}
            {stops.length > 1 && ` · ${stops.length} stops`}
          </p>
          <h2 className="text-xl font-semibold tracking-tight">{moment.place ?? "A moment"}</h2>
          {moment.labels.length > 0 && (
            <ul aria-label="Labels" className="flex flex-wrap gap-1.5">
              {moment.labels.map((l) => (
                <li key={l}>
                  <Badge variant="secondary">{l}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <PencilIcon /> Edit
          </Button>
        )}
      </header>

      <ol className="space-y-0">
        {stops.map((stop, i) => {
          const transport = transportOf(stop.transport);
          const last = i === stops.length - 1;
          return (
            <li key={i} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4">
              {/* The rail: a numbered dot and a line down to the next stop. */}
              <div className="flex flex-col items-center">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-sm font-medium">
                  {i + 1}
                </span>
                {!last && <span aria-hidden className="w-px flex-1 bg-border" />}
              </div>
              <section aria-label={`Stop ${i + 1}`} className={last ? "min-w-0 pb-2" : "min-w-0 pb-8"}>
                {transport && (
                  <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <transport.icon aria-hidden className="size-3.5" />
                    {transport.phrase}
                  </p>
                )}
                <h3 className="font-medium">{stop.place ?? `Stop ${i + 1}`}</h3>
                {stop.startsAt !== undefined && (
                  <p className="text-sm text-muted-foreground">{when(stop.startsAt)}</p>
                )}
                <StopContent blocks={stop.blocks} />
              </section>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

function StopContent({ blocks }: { blocks: Block[] }) {
  const media = blocks.filter((b) => b.type === "photo" || b.type === "video");
  const rest = blocks.filter((b) => b.type !== "photo" && b.type !== "video");
  if (blocks.length === 0) return null;
  return (
    <div className="mt-3 space-y-3">
      {media.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {media.map((b, i) =>
            b.type === "video" ? (
              <AuthVideo key={i} mediaId={b.mediaId} label="Moment video" />
            ) : b.type === "photo" ? (
              <AuthImage key={i} mediaId={b.mediaId} alt="Moment photo" />
            ) : null,
          )}
        </div>
      )}
      {rest.map((b, i) =>
        b.type === "link" ? (
          <a
            key={i}
            href={b.url}
            target="_blank"
            rel="noreferrer noopener"
            className="block truncate text-sm underline underline-offset-4"
          >
            {b.title ?? b.url}
          </a>
        ) : b.type === "note" ? (
          <p key={i} className="text-sm whitespace-pre-wrap">
            {b.text}
          </p>
        ) : b.type === "feeling" ? (
          <p key={i} className="text-sm whitespace-pre-wrap italic">
            {b.mood} {b.text}
          </p>
        ) : null,
      )}
    </div>
  );
}
