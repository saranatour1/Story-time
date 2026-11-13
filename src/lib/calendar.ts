import { differenceInCalendarDays } from "date-fns";

// An event's bar in one week: the first column it covers, how many it spans,
// the row it sits on, and whether it really starts and ends here or carries
// on from, or into, another week.
export type Bar<T> = {
  event: T;
  col: number;
  span: number;
  lane: number;
  starts: boolean;
  ends: boolean;
};

// One bar for each event the week touches, covering every local day from its
// start to its end. Events that overlap sit on different lanes, the earlier
// one higher, so a bar never changes row part-way along.
export const weekBars = <T extends { start: Date; end: Date }>(week: Date[], events: T[]): Bar<T>[] => {
  const first = week[0];
  if (first === undefined) return [];
  const lastTaken: number[] = []; // per lane, the last column in use
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
      const free = lastTaken.findIndex((last) => last < col);
      const lane = free === -1 ? lastTaken.length : free;
      lastTaken[lane] = end;
      return { event, col, span: end - col + 1, lane, starts: from >= 0, ends: to < week.length };
    });
};
