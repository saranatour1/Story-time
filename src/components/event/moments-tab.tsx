import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AuthImage } from "@/components/auth-image";
import { Skeleton } from "@/components/ui/skeleton";

export function MomentsTab({ eventId }: { eventId: Id<"events"> }) {
  const moments = useQuery(api.moments.list, { eventId });
  if (moments === undefined) return <Skeleton className="h-48 w-full" />;
  if (moments.length === 0) return <p className="py-12 text-center text-muted-foreground">No moments yet.</p>;

  return (
    <div className="magnetic grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <span className="magnetic-indicator" aria-hidden />
      {moments.map((m) => (
        <article key={m._id} className="space-y-3 rounded-lg border bg-card p-4">
          <header className="text-sm text-muted-foreground">
            {new Date(m.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            {m.place ? ` · ${m.place}` : ""}
          </header>
          {m.blocks.map((b, i) =>
            b.type === "photo" ? (
              <AuthImage key={i} mediaId={b.mediaId} alt="Moment photo" />
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
        </article>
      ))}
    </div>
  );
}
