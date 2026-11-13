const localParts = (ms: number, tzOffsetMinutes: number | undefined) => {
  const shifted = new Date(ms + (tzOffsetMinutes ?? 0) * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
};

export const monthDayOf = (startsAt: number, tzOffsetMinutes: number | undefined): string => {
  const local = localParts(startsAt, tzOffsetMinutes);
  const month = String(local.monthIndex + 1).padStart(2, "0");
  const day = String(local.day).padStart(2, "0");
  return `${month}-${day}`;
};

export const localYear = (startsAt: number, tzOffsetMinutes: number | undefined): number => {
  return localParts(startsAt, tzOffsetMinutes).year;
};
