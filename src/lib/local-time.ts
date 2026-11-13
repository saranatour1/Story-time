export const wallClockAsUtc = (ms: number, offset?: number): Date => {
  return new Date(
    offset === undefined ? ms - new Date(ms).getTimezoneOffset() * 60_000 : ms + offset * 60_000,
  );
};

export const formatTime = (ms: number, offset?: number): string => {
  return wallClockAsUtc(ms, offset).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
};

export const formatDay = (
  ms: number,
  offset?: number,
  opts?: Intl.DateTimeFormatOptions,
): string => {
  return wallClockAsUtc(ms, offset).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
};

export const formatDateTime = (
  ms: number,
  offset?: number,
  opts?: Intl.DateTimeFormatOptions,
): string => {
  return wallClockAsUtc(ms, offset).toLocaleString(undefined, { ...opts, timeZone: "UTC" });
};

export const calendarDay = (ms: number, offset?: number): Date => {
  const at = wallClockAsUtc(ms, offset);
  return new Date(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
};

export const toInput = (ms: number, offset?: number): string => {
  return wallClockAsUtc(ms, offset).toISOString().slice(0, 16);
};

export const fromInput = (value: string, offset?: number): number => {
  return offset === undefined
    ? new Date(value).getTime()
    : Date.parse(`${value}Z`) - offset * 60_000;
};
