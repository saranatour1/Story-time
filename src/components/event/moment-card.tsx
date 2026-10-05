import { AuthImage, AuthVideo } from "@/components/auth-image";
import { stopsOf, transportOf } from "@/components/event/transport";
import type { MomentView } from "@/components/event/types";
import { Badge } from "@/components/ui/badge";

export function MomentCard({ moment }: { moment: MomentView }) {
  const stops = stopsOf(moment);
  return (
    <article className="space-y-3 rounded-lg border bg-card p-4">
      <header className="space-y-2 text-sm text-muted-foreground">
        <p>
          {new Date(moment.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          {moment.place ? ` · ${moment.place}` : ""}
        </p>
        {moment.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {moment.labels.map((l) => (
              <Badge key={l} variant="secondary">
                {l}
              </Badge>
            ))}
          </div>
        )}
      </header>
      {stops.map((stop, s) => {
        const transport = transportOf(stop.transport);
        return (
          <section key={s} className="space-y-3">
            {/* Later stops get a heading; the first is the card's header. */}
            {s > 0 && (
              <h3 className="flex items-center gap-1.5 border-t pt-3 text-sm font-medium">
                {transport && <transport.icon aria-label={transport.phrase} className="size-3.5 text-muted-foreground" />}
                {stop.place ?? `Stop ${s + 1}`}
              </h3>
            )}
            {stop.blocks.map((b, i) =>
              b.type === "photo" ? (
                <AuthImage key={i} mediaId={b.mediaId} alt="Moment photo" />
              ) : b.type === "video" ? (
                <AuthVideo key={i} mediaId={b.mediaId} label="Moment video" />
              ) : b.type === "link" ? (
                <a key={i} href={b.url} target="_blank" rel="noreferrer noopener" className="block truncate text-sm underline">
                  {b.title ?? b.url}
                </a>
              ) : b.type === "note" ? (
                <p key={i} className="whitespace-pre-wrap text-sm">{b.text}</p>
              ) : (
                <p key={i} className="whitespace-pre-wrap text-sm italic">
                  {b.mood} {b.text}
                </p>
              ),
            )}
          </section>
        );
      })}
    </article>
  );
}
