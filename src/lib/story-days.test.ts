import { describe, expect, test } from "vite-plus/test";
import type { MomentView } from "@/components/event/types";
import type { Id } from "../../convex/_generated/dataModel";
import { storyDays, travelMinutes } from "./story-days";
import { buildStorySteps } from "./story-steps";

// Local clock times, so the days come out the same wherever this runs.
const at = (day: number, hour: number, minute = 0) =>
  new Date(2025, 1, day, hour, minute).getTime();

const moment = (over: Partial<MomentView>): MomentView => ({
  _id: "m1" as MomentView["_id"],
  authorId: "u1" as MomentView["authorId"],
  startsAt: at(4, 9),
  blocks: [],
  stops: [],
  labels: [],
  people: [],
  ...over,
});

describe("storyDays", () => {
  test("groups stops by the day they happened on, numbering the days in story order", () => {
    const steps = buildStorySteps("Trip", [
      moment({
        _id: "a" as Id<"moments">,
        startsAt: at(4, 9),
        place: "Lisbon",
        stops: [{ startsAt: at(4, 15), place: "Sintra", blocks: [] }],
      }),
      moment({ _id: "b" as Id<"moments">, startsAt: at(5, 10), place: "Porto" }),
      moment({
        _id: "c" as Id<"moments">,
        startsAt: at(5, 18),
        place: "Coimbra",
        transport: "train",
      }),
    ]);
    const days = storyDays(steps);
    expect(days.map((d) => [d.day, d.index, d.stops.map((s) => s.step)])).toEqual([
      ["2025-02-04", 1, [1, 2]],
      ["2025-02-05", 2, [3, 5]],
    ]);
    expect(days[1]?.label).toContain("Feb 5");
  });

  test("a leg belongs to the stop it travels to, and to no other", () => {
    const steps = buildStorySteps("Trip", [
      moment({
        _id: "a" as Id<"moments">,
        startsAt: at(4, 9),
        place: "Lisbon",
        transport: "plane",
      }),
      moment({ _id: "b" as Id<"moments">, startsAt: at(4, 12), place: "Sintra" }),
      moment({
        _id: "c" as Id<"moments">,
        startsAt: at(4, 18),
        place: "Porto",
        transport: "train",
      }),
    ]);
    const stops = storyDays(steps).flatMap((d) => d.stops);
    expect(stops.map((s) => [s.step, s.leg?.transport])).toEqual([
      [2, "plane"],
      [3, undefined],
      [5, "train"],
    ]);
    expect(stops[0]?.leg).toMatchObject({ from: "Trip", to: "Lisbon" });
  });

  test("a stop without a time of its own takes its moment's day", () => {
    const steps = buildStorySteps("Trip", [
      moment({
        _id: "late" as Id<"moments">,
        startsAt: at(4, 23, 30),
        place: "Dinner",
        stops: [
          { place: "Bar", blocks: [] },
          { startsAt: at(5, 0, 20), place: "Taxi", blocks: [] },
        ],
      }),
    ]);
    expect(storyDays(steps).map((d) => d.stops.map((s) => s.scene.place))).toEqual([
      ["Dinner", "Bar"],
      ["Taxi"],
    ]);
  });

  test("a stop is filed under the day it happened on, in the zone it happened in", () => {
    // 22:15 UTC on Feb 4 is 07:15 on Feb 5 in Japan, so the stop belongs to the 5th.
    const kyoto = moment({
      _id: "k" as Id<"moments">,
      startsAt: Date.UTC(2025, 1, 4, 22, 15),
      tzOffsetMinutes: 540,
      place: "Kyoto",
    });
    const days = storyDays(buildStorySteps("Trip", [kyoto]));
    expect(days.map((d) => [d.day, d.label])).toEqual([["2025-02-05", "Wed, Feb 5"]]);
  });

  test("an empty story has no days", () => {
    expect(storyDays(buildStorySteps("Trip", []))).toEqual([]);
  });
});

describe("travelMinutes", () => {
  test("counts the time from the previous stop, for stops with a leg and times on both ends", () => {
    const steps = buildStorySteps("Trip", [
      moment({ _id: "a" as Id<"moments">, startsAt: at(4, 10), place: "Berlin" }),
      moment({
        _id: "b" as Id<"moments">,
        startsAt: at(4, 11, 45),
        place: "Leipzig",
        transport: "train",
      }),
      moment({
        _id: "c" as Id<"moments">,
        startsAt: at(4, 12, 30),
        place: "Dresden",
        transport: "walk",
      }),
      moment({
        _id: "d" as Id<"moments">,
        startsAt: at(4, 14),
        place: "Home",
        stops: [{ place: "Hotel", transport: "car", blocks: [] }],
      }),
    ]);
    // Berlin to Leipzig is 105 minutes; the Hotel has no time, so nothing for it.
    expect([...travelMinutes(steps)]).toEqual([
      [3, 105],
      [5, 45],
    ]);
  });
});
