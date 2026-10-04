import { AuthImage } from "@/components/auth-image";
import type { MomentView } from "@/components/event/types";

export function MomentCard({ moment }: { moment: MomentView }) {
  return (
    <article className="space-y-3 rounded-lg border bg-card p-4">
      <header className="text-sm text-muted-foreground">
        {new Date(moment.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        {moment.place ? ` · ${moment.place}` : ""}
      </header>
      {moment.blocks.map((b, i) =>
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
  );
}
