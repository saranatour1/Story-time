import { formatDay } from "@/lib/local-time";
import { dayKey } from "@/lib/photo-groups";

// A page in the contents strip. The cover has no moment; a page the owner
// added by hand may not either.
export type ContentsPage = { _id: string; momentId?: string };

type DayMoment = { startsAt: number; tzOffsetMinutes?: number };

export type ContentsGroup = {
  key: string;
  label: string;
  today: boolean;
  pages: Array<{ index: number }>;
};

const DAY = { weekday: "short", month: "short", day: "numeric" } as const;

// The strip, in book order, gathered the way the moments list is: the cover,
// then each day. A page with no moment stays with the group before it.
export const contentsByDay = (pages: ContentsPage[], moments: ReadonlyMap<string, DayMoment>, today?: string): ContentsGroup[] => {
  const groups: ContentsGroup[] = [];
  const byKey = new Map<string, ContentsGroup>();
  const push = (key: string, label: string, index: number) => {
    let group = byKey.get(key);
    if (group === undefined) {
      group = { key, label, today: key === today, pages: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.pages.push({ index });
  };
  pages.forEach((page, index) => {
    if (index === 0 && page.momentId === undefined) {
      push("cover", "Cover", index);
      return;
    }
    const moment = page.momentId === undefined ? undefined : moments.get(page.momentId);
    if (moment !== undefined) {
      push(dayKey(moment.startsAt, moment.tzOffsetMinutes), formatDay(moment.startsAt, moment.tzOffsetMinutes, DAY), index);
      return;
    }
    const previous = groups.at(-1);
    if (previous !== undefined) previous.pages.push({ index });
    else push(`loose-${page._id}`, "Added", index);
  });
  return groups;
};
