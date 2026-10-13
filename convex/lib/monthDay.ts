// The month and day a moment happened, in the zone it happened in, as "MM-DD".
// Shifting by the offset and then reading UTC fields is that local calendar day.
export const monthDayOf = (startsAt: number, tzOffsetMinutes: number | undefined): string => {
  const local = new Date(startsAt + (tzOffsetMinutes ?? 0) * 60_000);
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  const day = String(local.getUTCDate()).padStart(2, "0");
  return `${month}-${day}`;
};

export const localYear = (startsAt: number, tzOffsetMinutes: number | undefined): number => {
  return new Date(startsAt + (tzOffsetMinutes ?? 0) * 60_000).getUTCFullYear();
};
