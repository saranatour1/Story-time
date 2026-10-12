// A moment's times read in the zone it happened in, not the viewer's. The
// offset is minutes east of UTC; without one, the viewer's own zone is used.

// A Date whose UTC fields are the wall clock at `offset`, so it can be
// formatted in UTC without the viewer's zone creeping in.
export const localParts = (ms: number, offset?: number): Date => {
  return new Date(offset === undefined ? ms - new Date(ms).getTimezoneOffset() * 60_000 : ms + offset * 60_000);
};

// The clock time, e.g. "7:15 AM".
export const formatTime = (ms: number, offset?: number): string => {
  return localParts(ms, offset).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
};

// The date, read in the same zone. Takes the options toLocaleDateString does.
export const formatDay = (ms: number, offset?: number, opts?: Intl.DateTimeFormatOptions): string => {
  return localParts(ms, offset).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
};

// The date and clock time together. Takes the options toLocaleString does.
export const formatDateTime = (ms: number, offset?: number, opts?: Intl.DateTimeFormatOptions): string => {
  return localParts(ms, offset).toLocaleString(undefined, { ...opts, timeZone: "UTC" });
};

// The day a moment fell on, as a local date for a calendar to show.
export const calendarDay = (ms: number, offset?: number): Date => {
  const at = localParts(ms, offset);
  return new Date(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
};

// The clock as a <input type="datetime-local"> value, YYYY-MM-DDTHH:mm.
export const toInput = (ms: number, offset?: number): string => {
  return localParts(ms, offset).toISOString().slice(0, 16);
};

// The instant a <input type="datetime-local"> value names, read in the zone
// it was shown in: the moment's, or the viewer's when it has none.
export const fromInput = (value: string, offset?: number): number => {
  return offset === undefined ? new Date(value).getTime() : Date.parse(`${value}Z`) - offset * 60_000;
};
