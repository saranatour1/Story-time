import { describe, expect, test } from "vite-plus/test";
import type { MomentView } from "@/components/event/types";
import type { Id } from "../../convex/_generated/dataModel";
import { bounds, mapPoints } from "./map-points";

const moment = (over: Partial<MomentView>): MomentView => ({
  _id: "m1" as MomentView["_id"],
  authorId: "u1" as MomentView["authorId"],
  startsAt: 0,
  blocks: [],
  stops: [],
  labels: [],
  people: [],
  ...over,
});

const lisbon = { lat: 38.7, lng: -9.14 };
const sintra = { lat: 38.8, lng: -9.39 };
const porto = { lat: 41.15, lng: -8.61 };

describe("mapPoints", () => {
  test("nothing in, nothing out", () => {
    expect(mapPoints([])).toEqual([]);
  });

  test("orders by moment time, then by stop within a moment", () => {
    const later = moment({
      _id: "late" as Id<"moments">,
      startsAt: 20,
      place: "Porto",
      geo: porto,
    });
    const earlier = moment({
      _id: "early" as Id<"moments">,
      startsAt: 10,
      place: "Lisbon",
      geo: lisbon,
      stops: [{ startsAt: 11, place: "Sintra", geo: sintra, blocks: [] }],
    });
    expect(mapPoints([later, earlier]).map((p) => [p.momentId, p.stopIndex])).toEqual([
      ["early", 0],
      ["early", 1],
      ["late", 0],
    ]);
  });

  test("skips stops without coordinates, keeping each stop's place in its moment", () => {
    const trip = moment({
      place: "Lisbon",
      geo: lisbon,
      stops: [
        { place: "Somewhere", blocks: [] },
        { place: "Sintra", geo: sintra, blocks: [] },
      ],
    });
    expect(mapPoints([trip]).map((p) => [p.place, p.stopIndex])).toEqual([
      ["Lisbon", 0],
      ["Sintra", 2],
    ]);
  });

  test("carries each stop's place, time, zone and transport", () => {
    const trip = moment({
      startsAt: 5,
      tzOffsetMinutes: 60,
      place: "Lisbon",
      geo: lisbon,
      transport: "train",
      stops: [{ startsAt: 9, place: "Sintra", geo: sintra, transport: "bus", blocks: [] }],
    });
    expect(mapPoints([trip])).toEqual([
      {
        momentId: "m1",
        stopIndex: 0,
        lat: lisbon.lat,
        lng: lisbon.lng,
        place: "Lisbon",
        startsAt: 5,
        tzOffsetMinutes: 60,
        transport: "train",
      },
      {
        momentId: "m1",
        stopIndex: 1,
        lat: sintra.lat,
        lng: sintra.lng,
        place: "Sintra",
        startsAt: 9,
        tzOffsetMinutes: 60,
        transport: "bus",
      },
    ]);
  });

  test("a moment with places but no coordinates has no points", () => {
    expect(
      mapPoints([moment({ place: "Nowhere", stops: [{ place: "Somewhere", blocks: [] }] })]),
    ).toEqual([]);
  });
});

describe("bounds", () => {
  test("the box around every point, southwest then northeast", () => {
    const points = mapPoints([moment({ geo: lisbon, stops: [{ geo: porto, blocks: [] }] })]);
    expect(bounds(points)).toEqual([
      [lisbon.lng, lisbon.lat],
      [porto.lng, porto.lat],
    ]);
  });

  test("a single point is a box with no size, and no points is null", () => {
    expect(bounds(mapPoints([moment({ geo: lisbon })]))).toEqual([
      [lisbon.lng, lisbon.lat],
      [lisbon.lng, lisbon.lat],
    ]);
    expect(bounds([])).toBeNull();
  });
});
