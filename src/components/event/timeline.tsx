import { useQuery } from "@tanstack/react-query";
import { useAuthToken } from "@convex-dev/auth/react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { PencilIcon, PlayIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { queries } from "@/lib/queries";
import { AuthImage } from "@/components/auth-image";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ActorBadge } from "@/components/event/actor-badge";
import { QuickAddButton } from "@/components/event/quick-add";
import type { EventView, MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { deletePhotos } from "@/lib/actions";
import { authorOf } from "@/lib/actors";
import { formatTime } from "@/lib/local-time";
import { matchesSearch } from "@/lib/moment-filters";
import { viewerDay } from "@/lib/photo-groups";
import { groupByDay, mediaOf, rowLabel } from "@/lib/timeline";
import { cn } from "@/lib/utils";

const PAGE = 30;

// The moments of an experience, by day, with a search box. Picking one hands
// it to the page, which edits it or opens it in the story. Each row you may
// change has its own Edit and Delete buttons.
export const Timeline = ({
  event,
  meId,
  selectedMomentId,
  onPick,
  canEdit,
  onEdit,
}: {
  event: EventView;
  meId?: string;
  selectedMomentId?: string;
  onPick: (moment: MomentView) => void;
  canEdit: (authorId: string) => boolean;
  onEdit: (moment: MomentView) => void;
}) => {
  const [query, setQuery] = useState("");
  const searching = query.trim() !== "";
  // Thirty at a time, oldest first. Searching needs every moment (places and
  // notes are encrypted, so only the browser can match them), so it reads them
  // all, and only while something is typed.
  const paged = usePaginatedQuery(
    api.moments.page,
    { eventId: event._id },
    { initialNumItems: PAGE },
  );
  const { data: all } = useQuery(queries.moments.list(searching ? { eventId: event._id } : "skip"));
  const moments = searching ? all : paged.status === "LoadingFirstPage" ? undefined : paged.results;
  const { data: leftOut } = useQuery(queries.journal.unpaged({ eventId: event._id }));
  const unpaged = new Set(leftOut?.full ? leftOut.momentIds : []);
  const remove = useMutation(api.moments.remove);
  const token = useAuthToken();
  const [deleting, setDeleting] = useState<MomentView | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  // "/" jumps to the search from anywhere outside a text field, as on most sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      searchInput.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // The moment named in the address comes into view, loading more until it is there.
  useEffect(() => {
    if (!selectedMomentId || moments === undefined) return;
    if (
      !searching &&
      paged.status === "CanLoadMore" &&
      !moments.some((m) => m._id === selectedMomentId)
    ) {
      paged.loadMore(PAGE);
      return;
    }
    document
      .querySelector(`[data-moment-id="${CSS.escape(selectedMomentId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedMomentId, moments, searching, paged]);

  const search = (
    <div className="relative">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={searchInput}
        type="search"
        aria-label="Search moments"
        aria-keyshortcuts="/"
        placeholder="Search places, notes, people…"
        className="h-8 pr-8 pl-8"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          setQuery("");
          e.currentTarget.blur();
        }}
      />
      {query === "" && (
        <kbd
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border px-1 text-[11px] text-muted-foreground sm:block"
        >
          /
        </kbd>
      )}
    </div>
  );

  if (moments === undefined) {
    if (event.momentCount === 0) return <Empty event={event} />;
    return (
      <div className="space-y-3">
        <p role="status" className="sr-only">
          Loading moments…
        </p>
        <Skeleton aria-hidden className="h-8 w-full" />
        {Array.from({ length: Math.min(6, event.momentCount) }, (_, i) => (
          <Skeleton key={i} aria-hidden className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (moments.length === 0) return <Empty event={event} />;

  const shown = moments.filter((m) => matchesSearch(m, query));
  const days = groupByDay(shown, viewerDay());
  return (
    <div className="space-y-4">
      {search}
      {query.trim() !== "" && (
        <p className="text-xs text-muted-foreground" role="status">
          {shown.length} of {moments.length} {moments.length === 1 ? "moment" : "moments"}
        </p>
      )}
      {days.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          No moments match.
        </p>
      )}
      {days.map((day) => (
        <section
          key={day.day}
          aria-label={day.today ? `${day.label}, today` : day.label}
          className="space-y-1.5"
        >
          <h2 className="sticky top-0 z-10 bg-background/95 py-1 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase backdrop-blur">
            {day.label}
            {day.today && (
              <span className="ml-1.5 font-sans normal-case tracking-normal text-primary">
                Today
              </span>
            )}
            {" · "}
            {day.moments.length} {day.moments.length === 1 ? "moment" : "moments"}
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {day.moments.map((m) => {
              const selected = m._id === selectedMomentId;
              return (
                <li
                  key={m._id}
                  className={cn("group flex items-start hover:bg-muted/60", selected && "bg-muted")}
                >
                  <button
                    type="button"
                    data-moment-id={m._id}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onPick(m)}
                    className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 text-left outline-none focus-visible:bg-muted/60"
                  >
                    <span className="w-16 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatTime(m.startsAt, m.tzOffsetMinutes)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{rowLabel(m)}</span>
                      {m.people.length > 0 && (
                        <span className="block truncate text-xs text-muted-foreground">
                          With {m.people.map((p) => p.name ?? "Anonymous").join(", ")}
                        </span>
                      )}
                      {unpaged.has(m._id) && (
                        <span className="block truncate text-xs text-muted-foreground">
                          The journal is full, so this moment has no page.
                        </span>
                      )}
                      <MediaStrip media={mediaOf(m)} />
                    </span>
                    <PlaceChip place={m.place} />
                    <ActorBadge
                      actor={authorOf(m)}
                      you={m.authorId === meId}
                      className="hidden md:inline-flex"
                    />
                  </button>
                  {canEdit(m.authorId) && (
                    <div className="flex shrink-0 items-center pt-1.5 pr-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit moment"
                        className="text-muted-foreground"
                        onClick={() => onEdit(m)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete moment"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleting(m)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {!searching && paged.status !== "Exhausted" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={paged.status !== "CanLoadMore"}
          onClick={() => paged.loadMore(PAGE)}
        >
          {paged.status === "LoadingMore"
            ? "Loading…"
            : `Show more (${event.momentCount - moments.length} left)`}
        </Button>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this moment?"
        description="Its notes, links and photos are removed for everyone. This can't be undone."
        confirmLabel="Delete moment"
        onConfirm={async () => {
          if (deleting === null) return;
          const { removedMediaIds } = await remove({ momentId: deleting._id });
          if (token) await deletePhotos(removedMediaIds, token);
          toast.success("Moment deleted");
        }}
      />
    </div>
  );
};

const Empty = ({ event }: { event: EventView }) => {
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-amber-900/15 bg-[#f3e9d6]/40 p-8 text-center dark:border-amber-100/10 dark:bg-amber-100/[0.03]">
      <p className="font-serif text-lg">The story starts with a moment.</p>
      <p className="text-sm text-muted-foreground">
        Add photos, or say what happened in the box above.
      </p>
      <QuickAddButton event={event} variant="outline" size="sm" />
    </div>
  );
};

const PlaceChip = ({ place }: { place?: string }) => {
  if (!place) return null;
  return (
    <span className="hidden h-6 max-w-40 min-w-0 items-center gap-1.5 rounded-full border px-2 text-[13px] text-muted-foreground sm:inline-flex">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: placeColor(place) }}
      />
      <span className="truncate">{place.split(",")[0]}</span>
    </span>
  );
};

// A stable colour per place, so the same place reads the same everywhere.
const placeColor = (place: string) => {
  let hue = 0;
  for (const ch of place.toLowerCase()) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return `oklch(0.65 0.16 ${hue})`;
};

// Keys typed into a field belong to the field, not to the page's shortcuts.
const isTyping = (target: EventTarget | null) => {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest("input, textarea, select") !== null)
  );
};

// A moment's photos and videos as small squares: the first few, then how
// many more. Videos have no stored thumbnail, so they show as a play tile.
const SHOWN = 6;
const MediaStrip = ({ media }: { media: Array<{ mediaId: string; video: boolean }> }) => {
  if (media.length === 0) return null;
  const more = media.length - SHOWN;
  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {media.slice(0, SHOWN).map(({ mediaId, video }) =>
        video ? (
          <span
            key={mediaId}
            className="grid size-16 shrink-0 sm:size-20 place-items-center rounded-md bg-muted text-muted-foreground"
          >
            <PlayIcon aria-label="Video" className="size-4" />
          </span>
        ) : (
          <AuthImage
            key={mediaId}
            mediaId={mediaId}
            alt=""
            className="aspect-square size-16 shrink-0 sm:size-20 rounded-md"
          />
        ),
      )}
      {more > 0 && (
        <span className="grid size-16 shrink-0 sm:size-20 place-items-center rounded-md bg-muted text-xs text-muted-foreground">
          +{more}
        </span>
      )}
    </span>
  );
};
