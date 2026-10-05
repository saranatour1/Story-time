import { useQuery } from "convex/react";
import {
  CalendarDaysIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  FileTextIcon,
  HeartIcon,
  ImageIcon,
  Layers2Icon,
  LinkIcon,
  ListFilterIcon,
  MapPinIcon,
  PaperclipIcon,
  PlusIcon,
  RouteIcon,
  SearchIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import {
  columnFilteringFeature,
  columnGroupingFeature,
  createColumnHelper,
  createFilteredRowModel,
  createGroupedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  metaHelper,
  rowExpandingFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MomentCard } from "@/components/event/moment-card";
import type { MomentView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  allBlocks,
  type BlockType,
  type MomentFilters,
  isFiltering,
  matches,
  NO_PLACE,
  noFilters,
} from "@/lib/moment-filters";
import { cn } from "@/lib/utils";

export type Grouping = "day" | "place" | "month" | "none";
export type ItineraryView = "table" | "cards";

// The outline links to groups by this id.
export const groupAnchor = (key: string) => `group-${key}`;

const BLOCKS: Array<{ type: BlockType; label: string; icon: typeof ImageIcon }> = [
  { type: "photo", label: "Photos", icon: ImageIcon },
  { type: "video", label: "Videos", icon: VideoIcon },
  { type: "note", label: "Notes", icon: FileTextIcon },
  { type: "link", label: "Links", icon: LinkIcon },
  { type: "feeling", label: "Feelings", icon: HeartIcon },
];

const GROUPINGS: Array<{ value: Grouping; label: string }> = [
  { value: "day", label: "Day" },
  { value: "place", label: "Place" },
  { value: "month", label: "Month" },
  { value: "none", label: "All" },
];

const GROUP_ICON = { day: CalendarIcon, month: CalendarDaysIcon, place: MapPinIcon } as const;

// One grid for headers and rows, so the columns line up. Columns fold away as
// the table narrows (it is a container): first the type icon and Contains,
// then Place, which moves under the title.
const GRID =
  "grid items-center gap-x-3 px-4 grid-cols-[minmax(0,1fr)_6.5rem_1.5rem_2rem] @xl:grid-cols-[minmax(0,1fr)_8rem_6.5rem_1.5rem_2rem] @3xl:grid-cols-[1rem_minmax(0,1fr)_7.5rem_8rem_6.5rem_1.5rem_2rem]";

const date = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

function groupLabel(grouping: Grouping, key: string, label: string) {
  const [y, m, d] = key.split("-").map(Number);
  if (grouping === "day" && d) {
    return new Date(y!, m! - 1, d).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (grouping === "month" && m) {
    return new Date(y!, m - 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  return label;
}

type Row = MomentView & { groupKey: string; groupLabel: string };

type Meta = {
  meId?: string;
  timeOnly: boolean;
  onSelectMoment: (momentId: string) => void;
  renderActions: (moment: MomentView) => ReactNode;
};

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  columnGroupingFeature,
  groupedRowModel: createGroupedRowModel(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowExpandingFeature,
  tableMeta: metaHelper<Meta>(),
  columnMeta: metaHelper<{ className?: string }>(),
});

const helper = createColumnHelper<typeof features, Row>();

// Cell order is the grid's column order. `meta.className` folds a column
// away as the table narrows (see GRID).
const columns = helper.columns([
  // The server's group key (author-local day, month or place): grouped on,
  // never rendered. Day and month keys sort chronologically as strings.
  helper.accessor("groupKey", {
    id: "group",
    sortFn: (a, b, id) => String(a.getValue(id)).localeCompare(String(b.getValue(id))),
  }),
  helper.display({
    id: "glyph",
    meta: { className: "hidden justify-center @3xl:flex" },
    cell: ({ row }) => {
      const blocks = allBlocks(row.original);
      const kind = BLOCKS.find((b) => blocks.some((x) => x.type === b.type));
      const Glyph = kind?.icon ?? FileTextIcon;
      return <Glyph aria-hidden className="size-3.5 text-muted-foreground" />;
    },
  }),
  helper.accessor((m) => firstLine(m) ?? "", {
    id: "title",
    header: "Moment",
    meta: { className: "min-w-0" },
    cell: ({ row, table }) => {
      const m = row.original;
      const title = firstLine(m);
      return (
        <>
          {/* The row is clickable; this button is the keyboard way in. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              table.options.meta?.onSelectMoment(m._id);
            }}
            className={cn(
              "block max-w-full truncate rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !title && "text-muted-foreground",
            )}
          >
            {title ?? "Untitled moment"}
          </button>
          <span className="block truncate text-xs text-muted-foreground @xl:hidden">{m.place ?? "No place"}</span>
        </>
      );
    },
  }),
  helper.display({
    id: "contains",
    header: () => <PaperclipIcon aria-label="Contains" className="size-4" />,
    meta: { className: "hidden @3xl:flex" },
    cell: ({ row }) => <Contains moment={row.original} />,
  }),
  helper.accessor((m) => m.place ?? NO_PLACE, {
    id: "place",
    header: () => <MapPinIcon aria-label="Place" className="size-4" />,
    meta: { className: "hidden min-w-0 @xl:flex" },
    cell: ({ row }) => <PlaceChip place={row.original.place} />,
  }),
  helper.accessor("startsAt", {
    header: () => <ClockIcon aria-label="Time" className="size-4" />,
    meta: { className: "truncate whitespace-nowrap text-muted-foreground" },
    cell: ({ getValue, table }) => {
      const when = new Date(getValue());
      const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      return table.options.meta?.timeOnly ? time : `${date(when)}, ${time}`;
    },
  }),
  helper.accessor((m) => m.authorName ?? "", {
    id: "author",
    meta: { className: "flex justify-end" },
    cell: ({ row, table }) => {
      const m = row.original;
      const mine = m.authorId === table.options.meta?.meId;
      const name = m.authorName ?? "Anonymous";
      return (
        <>
          <span className="sr-only">By {mine ? "you" : name}</span>
          <span
            aria-hidden
            title={mine ? "You" : name}
            className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold ring-2 ring-card"
          >
            {(m.authorName ?? "?").charAt(0).toUpperCase()}
          </span>
        </>
      );
    },
  }),
  helper.display({
    id: "actions",
    meta: { className: "flex justify-end" },
    cell: ({ row, table }) => table.options.meta?.renderActions(row.original),
  }),
]);

const EMPTY: Row[] = [];
const GROUPED = ["group"];
const UNGROUPED: string[] = [];

export function ItineraryTab({
  eventId,
  meId,
  grouping,
  view,
  onGroupingChange,
  onViewChange,
  onAddToDay,
  onOrderChange,
  selectedMomentId,
  onSelectMoment,
  renderActions,
}: {
  eventId: Id<"events">;
  meId?: string;
  grouping: Grouping;
  view: ItineraryView;
  onGroupingChange: (g: Grouping) => void;
  onViewChange: (v: ItineraryView) => void;
  // Only passed when the viewer may add moments.
  onAddToDay?: (day: string) => void;
  // The visible moments, in table order (grouping, filters and sort applied).
  onOrderChange?: (momentIds: string[]) => void;
  selectedMomentId?: string;
  onSelectMoment: (momentId: string) => void;
  renderActions: (moment: MomentView) => ReactNode;
}) {
  // "All" still asks for days: the rows come back the same, just ungrouped.
  const groups = useQuery(api.itinerary.grouped, {
    eventId,
    groupBy: grouping === "none" ? "day" : grouping,
  });
  const [filters, setFilters] = useState<MomentFilters>(noFilters);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newestFirst, setNewestFirst] = useState(false);

  const data = useMemo(
    () => groups?.flatMap((g) => g.moments.map((m) => ({ ...m, groupKey: g.key, groupLabel: g.label }))) ?? EMPTY,
    [groups],
  );
  const places = useMemo(
    () => [...new Set(data.map((m) => m.place ?? NO_PLACE))].sort((a, b) => a.localeCompare(b)),
    [data],
  );
  const labels = useMemo(
    () => [...new Set(data.flatMap((m) => m.labels))].sort((a, b) => a.localeCompare(b)),
    [data],
  );
  // Everyone with a moment here, you first.
  const people = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; initial: string }>();
    for (const m of data) {
      if (!byId.has(m.authorId)) {
        byId.set(m.authorId, {
          id: m.authorId,
          name: m.authorId === meId ? "You" : (m.authorName ?? "Anonymous"),
          initial: (m.authorName ?? "?").charAt(0).toUpperCase(),
        });
      }
    }
    return [...byId.values()].sort((a, b) => Number(b.id === meId) - Number(a.id === meId));
  }, [data, meId]);
  const filtering = isFiltering(filters);
  // Groups sort by key: newest first reverses days and months, while places
  // stay alphabetical. Within a group, moments sort by time.
  const sorting = useMemo(
    () => [
      { id: "group", desc: newestFirst && grouping !== "place" },
      { id: "startsAt", desc: newestFirst },
    ],
    [newestFirst, grouping],
  );

  const table = useTable({
    features,
    columns,
    data,
    state: {
      grouping: grouping === "none" ? UNGROUPED : GROUPED,
      sorting,
      globalFilter: filtering ? filters : undefined,
    },
    initialState: { expanded: true },
    // Keep collapsed groups collapsed when moments change live.
    autoResetExpanded: false,
    globalFilterFn: (row, _columnId, f: MomentFilters) => matches(row.original, f),
    // One column is enough: the filter looks at the whole moment.
    getColumnCanGlobalFilter: (column) => column.id === "title",
    meta: { meId, timeOnly: grouping === "day", onSelectMoment, renderActions },
  });

  const all = data.length;
  const count = table.getFilteredRowModel().rows.length;
  const rows = table.getRowModel().rows;
  const leaves = rows.flatMap((r) => (r.getIsGrouped() ? r.subRows : [r]));
  const order = groups === undefined ? null : leaves.map((r) => r.original._id).join(",");
  useEffect(() => {
    if (order !== null) onOrderChange?.(order === "" ? [] : order.split(","));
  }, [order, onOrderChange]);
  const headers = table.getHeaderGroups()[0]!.headers.filter((h) => h.column.id !== "group");

  const row = (r: (typeof rows)[number]) => {
    const selected = r.original._id === selectedMomentId;
    return (
      <li
        key={r.id}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelectMoment(r.original._id)}
        className={cn(GRID, "min-h-11 cursor-pointer rounded-lg py-1.5", selected ? "bg-accent" : "hover:bg-muted/50")}
      >
        {r
          .getAllCells()
          .filter((c) => c.column.id !== "group")
          .map((c) => (
            <span
              key={c.id}
              className={c.column.columnDef.meta?.className}
              onClick={c.column.id === "actions" ? (e) => e.stopPropagation() : undefined}
            >
              <table.FlexRender cell={c} />
            </span>
          ))}
      </li>
    );
  };

  // The header strip: a group's header, or the column header when ungrouped.
  const headerRow = (opts: { label: ReactNode; glyph?: ReactNode; end?: ReactNode; sticky?: boolean }) => (
    <div
      className={cn(
        GRID,
        "h-9 rounded-lg bg-[color-mix(in_oklch,var(--muted)_70%,var(--card))]",
        opts.sticky && "group/header sticky top-0 z-10",
      )}
    >
      {headers.map((h) => {
        switch (h.column.id) {
          case "glyph":
            return (
              <span key={h.id} className={h.column.columnDef.meta?.className}>
                {opts.glyph}
              </span>
            );
          case "title":
            return <span key={h.id} className="min-w-0">{opts.label}</span>;
          case "author":
            return (
              <span key={h.id} className="col-[-3/-1] flex items-center justify-end gap-1">
                {opts.end}
              </span>
            );
          case "actions":
            return null;
          default:
            return (
              <span key={h.id} className={cn(h.column.columnDef.meta?.className, "text-muted-foreground")}>
                <table.FlexRender header={h} />
              </span>
            );
        }
      })}
    </div>
  );

  let body: ReactNode;
  if (groups === undefined) {
    body = <Skeleton className="m-1.5 h-48" />;
  } else if (all === 0) {
    body = <p className="py-12 text-center text-muted-foreground">No moments yet. Add one to start the itinerary.</p>;
  } else if (count === 0) {
    body = (
      <div className="space-y-3 py-12 text-center">
        <p className="text-muted-foreground">No moments match.</p>
        <Button variant="outline" size="sm" onClick={() => setFilters(noFilters)}>
          Clear filters
        </Button>
      </div>
    );
  } else if (view === "cards") {
    body = (
      <div className="grid gap-4 p-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {leaves.map((r) => (
          <MomentCard key={r.id} moment={r.original} />
        ))}
      </div>
    );
  } else if (grouping === "none") {
    body = (
      <div className="px-1.5 pb-1.5">
        {headerRow({ label: <span className="px-0 font-medium">Moment</span> })}
        <ul className="py-1">{rows.map(row)}</ul>
      </div>
    );
  } else {
    const Glyph = GROUP_ICON[grouping];
    body = (
      <div className="flex flex-col gap-1 px-1.5 pb-1.5">
        {rows.map((g) => {
          const key = String(g.groupingValue);
          const label = groupLabel(grouping, key, g.subRows[0]?.original.groupLabel ?? key);
          const open = g.getIsExpanded();
          return (
            <section key={g.id} id={groupAnchor(key)} aria-label={label} className="scroll-mt-4">
              {headerRow({
                sticky: true,
                glyph: <Glyph aria-hidden className="size-3.5 text-muted-foreground" />,
                label: (
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={`${label}, ${g.subRows.length} moment${g.subRows.length === 1 ? "" : "s"}`}
                    onClick={() => g.toggleExpanded()}
                    className="-ms-2 flex min-w-0 items-center gap-2 justify-self-start rounded-md px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate font-medium">{label}</span>
                    <span className="rounded-full bg-foreground/5 px-1.5 text-xs leading-5 text-muted-foreground">
                      {g.subRows.length}
                    </span>
                  </button>
                ),
                end: (
                  <>
                    {grouping === "day" && onAddToDay && (
                      <button
                        type="button"
                        aria-label={`Add a moment to ${label}`}
                        onClick={() => onAddToDay(key)}
                        // Shown on hover, focus and touch screens.
                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity group-hover/header:opacity-100 hover:bg-foreground/5 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:opacity-100"
                      >
                        <PlusIcon className="size-4" />
                      </button>
                    )}
                    <ChevronDownIcon
                      aria-hidden
                      className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
                    />
                  </>
                ),
              })}
              {open && <ul className="py-1">{g.subRows.map(row)}</ul>}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    // A container, so columns fold based on the table's own width: with the
    // panel open it is much narrower than the screen.
    <div className="@container rounded-xl border bg-card text-sm text-card-foreground">
      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3 pb-2">
        <div role="group" aria-label="Group by" className="inline-flex rounded-full text-[13px]">
          {GROUPINGS.map((g) => (
            <button
              key={g.value}
              type="button"
              aria-pressed={grouping === g.value}
              onClick={() => onGroupingChange(g.value)}
              className={cn(
                "rounded-full px-3 py-1.5 whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                grouping === g.value
                  ? "bg-muted text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>

        <People
          people={people}
          selected={filters.authors}
          onChange={(authors) => setFilters({ ...filters, authors })}
        />

        <div className="ms-auto flex min-w-0 items-center gap-0.5">
          {searchOpen || filters.search !== "" ? (
            <div className="relative w-48 max-w-full sm:w-60">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                autoFocus
                aria-label="Search moments"
                placeholder="Search places and notes…"
                className="h-8 pr-8 pl-8"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setFilters({ ...filters, search: "" });
                    setSearchOpen(false);
                  }
                }}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Close search"
                className="absolute top-1/2 right-1 -translate-y-1/2"
                onClick={() => {
                  setFilters({ ...filters, search: "" });
                  setSearchOpen(false);
                }}
              >
                <XIcon />
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="icon-sm" aria-label="Search moments" onClick={() => setSearchOpen(true)}>
              <SearchIcon />
            </Button>
          )}
          <FiltersPopover
            filters={filters}
            places={places}
            labels={labels}
            defaultMonth={data[0] ? new Date(data[0].startsAt) : undefined}
            onChange={setFilters}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="View options">
                <Layers2Icon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuLabel>View</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={view} onValueChange={(v) => onViewChange(v as ItineraryView)}>
                <DropdownMenuRadioItem value="table">Table</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="cards">Cards</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Order</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={newestFirst ? "newest" : "oldest"}
                onValueChange={(v) => setNewestFirst(v === "newest")}
              >
                <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className={cn("flex items-center gap-2 px-4 pb-2", !filtering && "sr-only")}>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {count === all ? `${count} moment${count === 1 ? "" : "s"}` : `${count} of ${all} moments`}
        </p>
        {filtering && count > 0 && (
          <Button variant="ghost" size="xs" onClick={() => setFilters(noFilters)}>
            Clear filters
          </Button>
        )}
      </div>

      {body}
    </div>
  );
}

// The people behind the moments, as overlapping avatars. Each one toggles a
// filter to that person's moments.
// ponytail: shows everyone; collapse the tail into "+N" if experiences get
// more than a handful of contributors.
function People({
  people,
  selected,
  onChange,
}: {
  people: Array<{ id: string; name: string; initial: string }>;
  selected: string[];
  onChange: (authors: string[]) => void;
}) {
  if (people.length === 0) return null;
  return (
    <div role="group" aria-label="Filter by person" className="flex items-center ps-1.5">
      {people.map((p) => {
        const on = selected.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            aria-label={p.name === "You" ? "Only your moments" : `Only ${p.name}'s moments`}
            title={p.name}
            onClick={() => onChange(on ? selected.filter((id) => id !== p.id) : [...selected, p.id])}
            className={cn(
              "-ms-1.5 flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold ring-2 outline-none transition-[opacity,box-shadow] focus-visible:z-10 focus-visible:ring-ring hover:z-10",
              on ? "z-10 ring-primary" : "ring-card",
              selected.length > 0 && !on && "opacity-50 hover:opacity-100",
            )}
          >
            {p.initial}
          </button>
        );
      })}
    </div>
  );
}

function Contains({ moment }: { moment: MomentView }) {
  const blocks = allBlocks(moment);
  const counts = BLOCKS.map((b) => ({ ...b, n: blocks.filter((x) => x.type === b.type).length })).filter(
    (b) => b.n > 0,
  );
  const stops = moment.stops.length + 1;
  if (counts.length === 0 && stops === 1) return null;
  return (
    <span className="inline-flex h-6 items-center gap-2.5 rounded-full border px-2 text-[13px] text-muted-foreground">
      {stops > 1 && (
        <span className="inline-flex items-center gap-1" title="Stops">
          <RouteIcon aria-hidden className="size-3.5" />
          {stops}
          <span className="sr-only">stops</span>
        </span>
      )}
      {counts.map(({ type, label, icon: Icon, n }) => (
        <span key={type} className="inline-flex items-center gap-1" title={label}>
          <Icon aria-hidden className="size-3.5" />
          {n}
          <span className="sr-only">{label.toLowerCase()}</span>
        </span>
      ))}
    </span>
  );
}

function PlaceChip({ place }: { place?: string }) {
  if (!place) {
    return (
      <span className="inline-flex h-6 items-center rounded-full border border-dashed px-2 text-[13px] whitespace-nowrap text-muted-foreground">
        No place
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full border px-2 text-[13px] text-muted-foreground">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: placeColor(place) }} />
      <span className="truncate">{place}</span>
    </span>
  );
}

// A stable color per place, so the same place reads the same everywhere.
function placeColor(place: string) {
  let hue = 0;
  for (const ch of place.toLowerCase()) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return `oklch(0.65 0.16 ${hue})`;
}

function firstLine(m: MomentView) {
  for (const b of allBlocks(m)) {
    if (b.type === "note" || b.type === "feeling") return b.text.split("\n")[0]!.trim() || undefined;
    if (b.type === "link") return b.title ?? b.url;
  }
  return undefined;
}

function FiltersPopover({
  filters,
  places,
  labels,
  defaultMonth,
  onChange,
}: {
  filters: MomentFilters;
  places: string[];
  labels: string[];
  defaultMonth?: Date;
  onChange: (f: MomentFilters) => void;
}) {
  const active =
    filters.places.length + filters.contains.length + filters.labels.length + (filters.from ? 1 : 0);
  const toggle = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={active ? `Filters, ${active} active` : "Filters"} className="relative">
          <ListFilterIcon />
          {active > 0 && (
            <span aria-hidden className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">
              {active}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-[min(22rem,calc(100vw-2rem))] space-y-4">
        <FilterChips
          label="Place"
          options={places.map((p) => ({ value: p, label: p === NO_PLACE ? "No place" : p }))}
          selected={filters.places}
          onToggle={(p) => onChange({ ...filters, places: toggle(filters.places, p) })}
        />
        <FilterChips
          label="Contains"
          options={BLOCKS.map((b) => ({ value: b.type, label: b.label }))}
          selected={filters.contains}
          onToggle={(t) => onChange({ ...filters, contains: toggle(filters.contains, t as BlockType) })}
        />
        {labels.length > 0 && (
          <FilterChips
            label="Labels"
            options={labels.map((l) => ({ value: l, label: l }))}
            selected={filters.labels}
            onToggle={(l) => onChange({ ...filters, labels: toggle(filters.labels, l) })}
          />
        )}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Dates
            {filters.from && (
              <span className="font-normal">
                {" · "}
                {date(filters.from)}
                {filters.to && ` – ${date(filters.to)}`}
              </span>
            )}
          </p>
          <Calendar
            mode="range"
            className="p-0"
            selected={{ from: filters.from, to: filters.to }}
            defaultMonth={filters.from ?? defaultMonth}
            onSelect={(r) => onChange({ ...filters, from: r?.from, to: r?.to })}
          />
        </div>
        {active > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onChange({ ...noFilters, search: filters.search })}
          >
            Clear filters
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FilterChips({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.value)}
              className={cn(
                "h-7 rounded-full border px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
