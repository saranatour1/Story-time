import type { MomentView } from "@/components/event/types";
import { formatDay } from "./local-time";
import { allBlocks } from "./moment-filters";
import { dayKey } from "./photo-groups";

// The moments of an experience as a list: by the day they happened, in the
// zone they happened in, oldest first.

export type Day = { day: string; label: string; today: boolean; moments: MomentView[] };

export const groupByDay = (moments: MomentView[], today?: string): Day[] => {
  const days = new Map<string, Day>();
  for (const m of [...moments].sort((a, b) => a.startsAt - b.startsAt)) {
    const key = dayKey(m.startsAt, m.tzOffsetMinutes);
    const day = days.get(key) ?? {
      day: key,
      label: formatDay(m.startsAt, m.tzOffsetMinutes, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      today: key === today,
      moments: [],
    };
    day.moments.push(m);
    days.set(key, day);
  }
  return [...days.values()];
};

// The line a moment is listed by: its first words, else a link, else its
// first named place.
export const firstLine = (m: MomentView): string | undefined => {
  for (const b of allBlocks(m)) {
    if (b.type === "note" || b.type === "feeling")
      return b.text.split("\n")[0]!.trim() || undefined;
    if (b.type === "link") return b.title ?? b.url;
  }
  return m.place ?? m.stops.find((s) => s.place)?.place;
};
