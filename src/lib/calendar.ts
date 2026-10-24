import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

// The weeks a month view shows, Monday first, padded with days from the
// months either side so every week is whole.
export const monthGrid = (month: Date): Date[][] => {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
};

// The trips on a day. A trip covers every local day from its start to its
// end, or only the one day it has; a trip with no dates is on no day.
export const tripsOn = <T extends { startsAt?: number; endsAt?: number }>(
  day: Date,
  trips: T[],
): T[] => {
  const at = startOfDay(day).getTime();
  return trips.filter((trip) => {
    const start = trip.startsAt ?? trip.endsAt;
    if (start === undefined) return false;
    return at >= startOfDay(start).getTime() && at <= startOfDay(trip.endsAt ?? start).getTime();
  });
};
