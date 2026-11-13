import { useQuery } from "@tanstack/react-query";
import { useMutation, usePaginatedQuery } from "convex/react";
import { format, formatDistanceToNow, isThisYear, isToday, isYesterday } from "date-fns";
import { BotIcon, CogIcon, UserRoundIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { queries } from "@/lib/queries";
import type { Id } from "../../../convex/_generated/dataModel";
import { ActorBadge } from "@/components/event/actor-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { changeActorOf, type ActorView } from "@/lib/actors";
import { describeChange } from "@/lib/change-text";
import { cn } from "@/lib/utils";

type Kind = "everyone" | "people" | "agents" | "system";
// Everything, one person's own changes (their user id), agents', or the
// app's own.
type Filter = "everyone" | "agents" | "system" | { person: string };

const matches = (filter: Filter, actor: ActorView, actorId?: string): boolean => {
  if (filter === "everyone") return true;
  if (filter === "agents") return actor.kind === "agent";
  if (filter === "system") return actor.kind === "system";
  return actor.kind === "human" && actorId === filter.person;
};

const WHO: Record<Exclude<Kind, "everyone">, string> = {
  people: "people",
  agents: "agents",
  system: "Story-time",
};

// What the numbers count, in a sentence: "44 changes: 37 by people, 7 by
// Story-time." A bare number beside "People" reads as a head count.
const summary = (counts: Record<Kind, number>): string => {
  const total = `${counts.everyone.toLocaleString()} ${counts.everyone === 1 ? "change" : "changes"}`;
  const kinds = (["people", "agents", "system"] as const).filter((who) => counts[who] > 0);
  // One kind of author made them all: the split would only repeat the total.
  if (kinds.length < 2) return `${total}${kinds[0] ? `, all by ${WHO[kinds[0]]}` : ""}.`;
  return `${total}: ${kinds.map((who) => `${counts[who].toLocaleString()} by ${WHO[who]}`).join(", ")}.`;
};

// The full date, for the tooltip on the relative one.
const fullDate = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

// "Today", "Yesterday", then the day itself.
const dayLabel = (ms: number): string => {
  if (isToday(ms)) return "Today";
  if (isYesterday(ms)) return "Yesterday";
  return format(ms, isThisYear(ms) ? "EEEE, MMM d" : "EEEE, MMM d, yyyy");
};

// "Added a moment" reads "added a moment" after a name.
const asPredicate = (phrase: string) => phrase.charAt(0).toLowerCase() + phrase.slice(1);

// Every change to the experience, newest first, grouped by day: who did it (a
// person, an agent for a person, or Story-time itself) and what, in a sentence.
export const ActivityTab = ({ eventId, meId }: { eventId: Id<"events">; meId?: string }) => {
  const { results, status, loadMore } = usePaginatedQuery(
    api.changes.listForEvent,
    { eventId },
    { initialNumItems: 25 },
  );
  const [filter, setFilter] = useState<Filter>("everyone");
  // Totals from the server: the list only holds the pages loaded so far.
  const { data: counts } = useQuery(queries.changes.counts({ eventId }));
  const markRead = useMutation(api.changes.markRead);
  // Opening the list is looking at it. A later moment, page or note counts again.
  useEffect(() => {
    void markRead({ eventId });
  }, [eventId, markRead, results.length]);
  if (status === "LoadingFirstPage") return <Skeleton className="mx-auto h-48 w-full max-w-3xl" />;

  if (results.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Nothing yet. Edits by people and agents show up here.
      </p>
    );
  }

  const actorOf = (c: (typeof results)[number]) => changeActorOf(c, c.actorName);
  const shown = results.filter((c) => matches(filter, actorOf(c), c.actorId));
  // One button per person in the changes loaded so far, you first; then
  // agents and the app itself, when they have made any.
  const people = new Map<string, string>();
  for (const c of results) {
    if (c.actorId === undefined || c.agent !== undefined || people.has(c.actorId)) continue;
    people.set(c.actorId, c.actorId === meId ? "You" : (c.actorName ?? "Anonymous"));
  }
  const filters: { value: Filter; label: string; title?: string }[] = [
    { value: "everyone", label: "All" },
    ...[...people]
      .sort(([a], [b]) => Number(b === meId) - Number(a === meId))
      .map(([person, label]) => ({ value: { person }, label })),
    ...(counts?.agents ? [{ value: "agents" as const, label: "Agents" }] : []),
    ...(counts?.system
      ? [
          {
            value: "system" as const,
            label: "Automatic",
            title: "What Story-time did by itself",
          },
        ]
      : []),
  ];
  const picked = (value: Filter) =>
    typeof value === "object" && typeof filter === "object"
      ? value.person === filter.person
      : value === filter;
  // Newest first, as they come; a new heading wherever the day changes.
  const days: Array<{ label: string; changes: typeof shown }> = [];
  for (const c of shown) {
    const label = dayLabel(c.at);
    const last = days.at(-1);
    if (last?.label === label) last.changes.push(c);
    else days.push({ label, changes: [c] });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {counts
            ? summary(counts)
            : "Every change to this experience: by people, by agents, and by Story-time itself."}
        </p>
        <div
          role="radiogroup"
          aria-label="Show changes by"
          className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1"
        >
          {filters.map(({ value, label, title }) => (
            <button
              key={typeof value === "object" ? value.person : value}
              type="button"
              role="radio"
              title={title}
              aria-checked={picked(value)}
              onClick={() => setFilter(value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                picked(value) && "bg-background font-medium text-foreground shadow-sm",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          None of the loaded edits match. Show more below to look further back.
        </p>
      ) : (
        days.map(({ label, changes }) => (
          <section key={label} aria-label={label} className="space-y-2">
            <h3 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {label}
            </h3>
            <ol className="divide-y rounded-xl border bg-card">
              {changes.map((c) => {
                const actor = actorOf(c);
                const you = actor.kind === "human" && c.actorId !== undefined && c.actorId === meId;
                return (
                  <li key={c._id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar actor={actor} />
                    <p className="min-w-0 flex-1 text-sm leading-relaxed text-pretty">
                      <Who actor={actor} you={you} />{" "}
                      <span className="text-muted-foreground">
                        {asPredicate(describeChange(c))}
                      </span>
                    </p>
                    <time
                      dateTime={new Date(c.at).toISOString()}
                      title={fullDate(c.at)}
                      className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
                    >
                      {formatDistanceToNow(c.at, { addSuffix: true })}
                    </time>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}

      {status === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => loadMore(25)}>
            Show older changes
          </Button>
        </div>
      )}
    </div>
  );
};

// A round mark at the start of each line: a person, an agent (violet, as on
// its badge) or Story-time's own cog.
const Avatar = ({ actor }: { actor: ActorView }) => {
  const Icon = actor.kind === "agent" ? BotIcon : actor.kind === "system" ? CogIcon : UserRoundIcon;
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full",
        actor.kind === "agent"
          ? "bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-200"
          : "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="size-4" />
    </span>
  );
};

// The doer, as the sentence's subject: a person by name ("You" for yourself),
// an agent as its badge, the system as Story-time.
const Who = ({ actor, you }: { actor: ActorView; you: boolean }) => {
  if (actor.kind === "agent") return <ActorBadge actor={actor} className="align-[1px]" />;
  if (actor.kind === "system")
    return <span className="font-medium text-foreground">Story-time</span>;
  return (
    <span className="font-medium text-foreground">{you ? "You" : (actor.name ?? "Someone")}</span>
  );
};
