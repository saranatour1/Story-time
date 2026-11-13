import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export const monthGrid = (month: Date): Date[][] => {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
};

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
