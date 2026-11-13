import { differenceInCalendarDays } from "date-fns";

export type Bar<T> = {
  event: T;
  col: number;
  span: number;
  lane: number;
  startsThisWeek: boolean;
  endsThisWeek: boolean;
};

export const weekBars = <T extends { start: Date; end: Date }>(
  week: Date[],
  events: T[],
): Bar<T>[] => {
  const first = week[0];
  if (first === undefined) return [];
  const lastColumnByLane: number[] = [];
  return events
    .map((event) => {
      const from = differenceInCalendarDays(event.start, first);
      return { event, from, to: Math.max(from, differenceInCalendarDays(event.end, first)) };
    })
    .filter(({ from, to }) => to >= 0 && from < week.length)
    .sort((a, b) => a.from - b.from || b.to - a.to)
    .map(({ event, from, to }) => {
      const col = Math.max(from, 0);
      const end = Math.min(to, week.length - 1);
      const free = lastColumnByLane.findIndex((last) => last < col);
      const lane = free === -1 ? lastColumnByLane.length : free;
      lastColumnByLane[lane] = end;
      return { event, col, span: end - col + 1, lane, startsThisWeek: from >= 0, endsThisWeek: to < week.length };
    });
};

export const dayGrabbed = (x: number, left: number, width: number, span: number): number =>
  width > 0 ? Math.min(span - 1, Math.max(0, Math.floor((x - left) / (width / span)))) : 0;
