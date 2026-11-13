export const localDay = (ms: number): string => {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};
export const localMidnight = (day: string): number => new Date(`${day}T00:00:00`).getTime();
export const localEndOfDay = (day: string): number => new Date(`${day}T23:59:59`).getTime();

const DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

export const eventDates = (e: { startsAt?: number; endsAt?: number }): string | null => {
  if (e.startsAt === undefined) return e.endsAt === undefined ? null : DAY.format(e.endsAt);
  return e.endsAt === undefined ? DAY.format(e.startsAt) : DAY.formatRange(e.startsAt, e.endsAt);
};
