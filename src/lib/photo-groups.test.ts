import { describe, expect, test } from "vitest";
import {
  dayKey,
  distanceMeters,
  groupPhotos,
  type Geo,
  localClock,
  type PhotoPoint,
  toStop,
} from "./photo-groups";

// Local times, so day boundaries hold in any time zone.
const at = (day: number, h: number, m = 0) => new Date(2026, 6, day, h, m).getTime();
let n = 0;
const photo = (takenAt: number, geo?: Geo, offsetMinutes?: number): PhotoPoint => ({
  id: `p${String(++n).padStart(3, "0")}`,
  takenAt,
  offsetMinutes,
  geo,
});

// Roughly 0.009° of latitude is 1 km.
const lisbon: Geo = { lat: 38.7, lng: -9.14 };
const north = (km: number): Geo => ({ lat: lisbon.lat + km * 0.009, lng: lisbon.lng });

const shape = (days: ReturnType<typeof groupPhotos>) =>
  days.map((d) => ({
    day: d.day,
    moments: d.moments.map((stops) => stops.map((s) => s.photos.length)),
  }));

describe("groupPhotos", () => {
  test("nothing in, nothing out", () => {
    expect(groupPhotos([])).toEqual([]);
  });

  test("starts a stop after a gap of more than 45 minutes", () => {
    const days = groupPhotos([
      photo(at(10, 9)),
      photo(at(10, 9, 45)),
      photo(at(10, 10, 31)),
      photo(at(10, 10, 40)),
    ]);
    expect(shape(days)).toEqual([{ day: "2026-07-10", moments: [[2, 2]] }]);
    expect(days[0]!.moments[0]![1]!.startsAt).toBe(at(10, 10, 31));
  });

  test("starts a stop over 1 km from where the stop began, when both are known", () => {
    const days = groupPhotos([
      photo(at(10, 9), lisbon),
      photo(at(10, 9, 5), north(0.6)),
      // Without a location it stays put, whatever the distance.
      photo(at(10, 9, 10)),
      photo(at(10, 9, 15), north(1.2)),
    ]);
    expect(shape(days)).toEqual([{ day: "2026-07-10", moments: [[3, 1]] }]);
  });

  test("days follow the camera's zone when it recorded one, not the browser's", () => {
    // Tokyo (+09:00): 08:00 and 23:30 on the 10th, 00:30 on the 11th.
    const tokyo = (day: number, h: number, m = 0) => Date.UTC(2026, 6, day, h - 9, m);
    const days = groupPhotos([
      photo(tokyo(10, 8), undefined, 540),
      photo(tokyo(10, 23, 30), undefined, 540),
      photo(tokyo(11, 0, 30), undefined, 540),
    ]);
    expect(shape(days)).toEqual([
      { day: "2026-07-10", moments: [[1, 1]] },
      { day: "2026-07-11", moments: [[1]] },
    ]);
  });

  test("one moment per local day, in order, whatever order the files came in", () => {
    const days = groupPhotos([photo(at(11, 8)), photo(at(10, 20)), photo(at(10, 9))]);
    expect(shape(days)).toEqual([
      { day: "2026-07-10", moments: [[1, 1]] },
      { day: "2026-07-11", moments: [[1]] },
    ]);
  });

  test("a day with more than 10 stops merges the neighbours closest in time", () => {
    // 12 stops an hour apart, except two that follow their neighbour by 50
    // and 46 minutes.
    const times = [0, 60, 120, 170, 230, 290, 350, 410, 456, 516, 576, 636].map(
      (m) => at(10, 7) + m * 60_000,
    );
    const days = groupPhotos(times.map((t) => photo(t)));
    const stops = days[0]!.moments[0]!;
    expect(days[0]!.moments).toHaveLength(1);
    expect(stops).toHaveLength(10);
    expect(stops.map((s) => s.photos.length)).toEqual([1, 1, 2, 1, 1, 1, 2, 1, 1, 1]);
    expect(stops[2]!.startsAt).toBe(times[2]);
  });

  test("keeps at most 20 photos in a stop", () => {
    const burst = Array.from({ length: 45 }, (_, i) => photo(at(10, 12) + i * 1000));
    expect(shape(groupPhotos(burst))).toEqual([{ day: "2026-07-10", moments: [[20, 20, 5]] }]);
  });

  test("spills into a second moment when merging can't fit the day", () => {
    // 11 full stops, each 20 photos: nothing can merge.
    const full = Array.from({ length: 11 }, (_, s) =>
      Array.from({ length: 20 }, (_, i) => photo(at(10, 6) + s * 60 * 60_000 + i * 1000)),
    ).flat();
    const days = groupPhotos(full);
    expect(days[0]!.moments.map((m) => m.length)).toEqual([10, 1]);
  });
});

describe("toStop", () => {
  test("its time is the first photo's and its place the median location", () => {
    const stop = toStop([
      photo(at(10, 10), north(0.2)),
      photo(at(10, 9), lisbon),
      photo(at(10, 11), north(0.1)),
      photo(at(10, 12)),
    ]);
    expect(stop.startsAt).toBe(at(10, 9));
    expect(stop.photos.map((p) => p.takenAt)).toEqual([
      at(10, 9),
      at(10, 10),
      at(10, 11),
      at(10, 12),
    ]);
    expect(stop.geo).toEqual(north(0.1));
  });

  test("no locations, no place", () => {
    expect(toStop([photo(at(10, 9))]).geo).toBeUndefined();
  });
});

test("distanceMeters and dayKey", () => {
  expect(distanceMeters(lisbon, north(1))).toBeGreaterThan(990);
  expect(distanceMeters(lisbon, north(1))).toBeLessThan(1010);
  expect(dayKey(at(9, 23, 59))).toBe("2026-07-09");
  // 2026-07-10 02:00 UTC is still the 9th in New York (-04:00).
  expect(dayKey(Date.UTC(2026, 6, 10, 2), -240)).toBe("2026-07-09");
  expect(localClock(Date.UTC(2026, 6, 10, 2), -240).getUTCHours()).toBe(22);
  expect(localClock(at(10, 18, 30)).getUTCHours()).toBe(18);
});
