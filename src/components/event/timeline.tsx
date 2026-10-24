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

// The moments of an experience as a grid of cards, oldest first, with a search
// box. Picking one hands it to the page, which edits it or opens it in the
// story. Each card you may change has its own Edit and Delete buttons.
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
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: Math.min(6, event.momentCount) }, (_, i) => (
            <Skeleton key={i} aria-hidden className="aspect-[4/3] w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (moments.length === 0) return <Empty event={event} />;

  const shown = moments.filter((m) => matchesSearch(m, query));
  const days = groupByDay(shown, viewerDay());
  return (
    <div className="@container space-y-4">
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
      {/* One grid of moments, oldest first, each card saying its day. */}
      <ul className="grid grid-cols-2 items-start gap-3 @2xl:grid-cols-3">
        {days.flatMap((day) =>
          day.moments.map((m) => {
            const selected = m._id === selectedMomentId;
            const media = mediaOf(m);
            const editable = canEdit(m.authorId);
            return (
              <li
                key={m._id}
                className={cn(
                  "relative overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md",
                  selected && "ring-2 ring-ring",
                )}
              >
                <button
                  type="button"
                  data-moment-id={m._id}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onPick(m)}
                  className="block w-full text-left outline-none focus-visible:bg-muted/60"
                >
                  {media.length > 0 && <Mosaic media={media} />}
                  <span className="block space-y-1 p-3">
                    <span
                      className={cn(
                        "block font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase",
                        // Room for Edit and Delete, which sit over a card with no photo.
                        media.length === 0 && editable && "pr-16",
                      )}
                    >
                      {day.label} · {formatTime(m.startsAt, m.tzOffsetMinutes)}
                      {day.today && (
                        <span className="ml-1.5 font-sans tracking-normal text-primary normal-case">
                          Today
                        </span>
                      )}
                    </span>
                    <span className="line-clamp-2 text-sm">{rowLabel(m)}</span>
                    {m.people.length > 0 && (
                      <span className="block truncate text-xs text-muted-foreground">
                        With {m.people.map((p) => p.name ?? "Anonymous").join(", ")}
                      </span>
                    )}
                    {unpaged.has(m._id) && (
                      <span className="block text-xs text-muted-foreground">
                        The journal is full, so this moment has no page.
                      </span>
                    )}
                    <span className="flex flex-wrap items-center gap-2 pt-0.5">
                      <PlaceChip place={m.place} />
                      <ActorBadge actor={authorOf(m)} you={m.authorId === meId} />
                    </span>
                  </span>
                </button>
                {editable && (
                  <div className="absolute top-2 right-2 flex rounded-md bg-background/85 shadow-xs backdrop-blur-sm">
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
          }),
        )}
      </ul>
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

// A moment's photos as a small collage: one, two side by side, or one large
// with two beside it, the last saying how many more. Videos have no stored
// thumbnail, so they show as a play tile.
const Mosaic = ({ media }: { media: Array<{ mediaId: string; video: boolean }> }) => {
  const shown = media.slice(0, 3);
  const more = media.length - shown.length;
  return (
    <span
      className={cn(
        "grid aspect-[4/3] gap-0.5 bg-muted",
        shown.length === 2 && "grid-cols-2",
        shown.length === 3 && "grid-cols-3 grid-rows-2",
      )}
    >
      {shown.map(({ mediaId, video }, i) => (
        <span
          key={mediaId}
          className={cn(
            "relative min-h-0 overflow-hidden",
            shown.length === 3 && i === 0 && "col-span-2 row-span-2",
          )}
        >
          {video ? (
            <span className="grid size-full place-items-center bg-muted text-muted-foreground">
              <PlayIcon aria-label="Video" className="size-5" />
            </span>
          ) : (
            <AuthImage mediaId={mediaId} alt="" className="aspect-auto size-full rounded-none" />
          )}
          {more > 0 && i === shown.length - 1 && (
            <span className="absolute inset-0 grid place-items-center bg-black/50 text-sm font-medium text-white">
              +{more}
            </span>
          )}
        </span>
      ))}
    </span>
  );
};
