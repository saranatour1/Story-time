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

type Filter = "everyone" | "people" | "agents" | "system";

// People, agents and Story-time's own changes add up to everyone's.
const FILTERS: { value: Filter; label: string }[] = [
  { value: "everyone", label: "Everyone" },
  { value: "people", label: "People" },
  { value: "agents", label: "Agents" },
  { value: "system", label: "Story-time" },
];

const matches = (filter: Filter, actor: ActorView): boolean => {
  if (filter === "agents") return actor.kind === "agent";
  if (filter === "people") return actor.kind === "human";
  if (filter === "system") return actor.kind === "system";
  return true;
};

const WHO: Record<Exclude<Filter, "everyone">, string> = {
  people: "people",
  agents: "agents",
  system: "Story-time",
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
  const shown = results.filter((c) => matches(filter, actorOf(c)));
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
          Every change to this experience: by people, by agents, and by Story-time itself.
        </p>
        <div
          role="radiogroup"
          aria-label="Show changes by"
          className="flex w-fit gap-1 rounded-lg bg-muted p-1"
        >
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                filter === value && "bg-background font-medium text-foreground shadow-sm",
              )}
            >
              {label}
              <span className="text-xs tabular-nums opacity-70">
                {counts && `${counts[value].toLocaleString()}${counts.capped ? "+" : ""}`}
              </span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          None of the loaded edits are from {filter === "everyone" ? "anyone" : WHO[filter]}.
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
