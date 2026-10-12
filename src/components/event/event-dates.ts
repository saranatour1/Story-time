const DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

// The experience's own dates, compact ("Jun 3 – 10, 2026"), or null when
// none are set.
export const eventDates = (e: { startsAt?: number; endsAt?: number }): string | null => {
  if (e.startsAt === undefined) return e.endsAt === undefined ? null : DAY.format(e.endsAt);
  return e.endsAt === undefined ? DAY.format(e.startsAt) : DAY.formatRange(e.startsAt, e.endsAt);
};
