import { describe, expect, test } from "vitest";
import type { MomentView } from "@/components/event/types";
import type { Id } from "../../convex/_generated/dataModel";
import { describeOp, placesToFind, withPins, type PlanOp } from "./command-plan";

const FLIGHT = Date.UTC(2025, 1, 20, 14, 29);
const flightId = "flight" as Id<"moments">;

const flight: MomentView = {
  _id: flightId,
  authorId: "u1" as Id<"users">,
  startsAt: FLIGHT,
  tzOffsetMinutes: 180,
  place: "Queen Alia Airport",
  blocks: [{ type: "photo", mediaId: "p1" as Id<"media"> }],
  transport: "plane",
  stops: [
    {
      place: "Istanbul",
      blocks: [
        { type: "photo", mediaId: "p2" as Id<"media"> },
        { type: "photo", mediaId: "p3" as Id<"media"> },
      ],
    },
  ],
  labels: [],
  people: [],
};

describe("describeOp", () => {
  test("a new moment says what it holds and when", () => {
    const line = describeOp(
      {
        op: "add",
        note: "Museum day",
        place: "Berlin",
        startsAt: FLIGHT,
        tzOffsetMinutes: 60,
        transport: "train",
      },
      [flight],
    );
    expect(line.heading).toBe("New moment in Berlin");
    expect(line.changes[0]).toBe('"Museum day"');
    expect(line.changes).toContain("by train");
    expect(line.destructive).toBe(false);
  });

  test("an edit names the moment and each change", () => {
    const line = describeOp(
      {
        op: "edit",
        momentId: flightId,
        stop: 1,
        startsAt: FLIGHT + 86_400_000,
        transport: null,
        labels: ["travel"],
        note: "Gate 24",
      },
      [flight],
    );
    expect(line.heading).toBe("Queen Alia Airport · Feb 20");
    expect(line.changes).toEqual([
      expect.stringMatching(/^time: .*Feb 21/),
      "no transport",
      'add a note "Gate 24"',
      "labels: travel",
    ]);
  });

  test("an edit of a later stop says which one", () => {
    const line = describeOp({ op: "edit", momentId: flightId, stop: 2, place: "Sabiha Gökçen" }, [
      flight,
    ]);
    expect(line.heading).toBe("Queen Alia Airport · Feb 20, stop 2 (Istanbul)");
    expect(line.changes).toEqual(["place: Sabiha Gökçen"]);
  });

  test("a new stop says where it goes", () => {
    const line = describeOp(
      { op: "addStop", momentId: flightId, place: "Hanover", after: 1, transport: "plane" },
      [flight],
    );
    expect(line.changes).toEqual(["add a stop: Hanover after stop 1", "by plane"]);
  });

  test("removals are marked, and say what goes with them", () => {
    const stop = describeOp({ op: "remove", momentId: flightId, stop: 2 }, [flight]);
    expect(stop).toEqual({
      heading: "Queen Alia Airport · Feb 20",
      changes: ["remove stop 2 (Istanbul), with its 2 photos"],
      destructive: true,
    });
    const whole = describeOp({ op: "remove", momentId: flightId }, [flight]);
    expect(whole.changes).toEqual(["delete the whole moment, with its 3 photos"]);
    expect(whole.destructive).toBe(true);
  });

  test("a moment that has gone since is said so, not guessed at", () => {
    expect(
      describeOp({ op: "edit", momentId: "other" as Id<"moments">, place: "x" }, [flight]).heading,
    ).toBe("A moment that is no longer here");
  });
});

describe("pinning places", () => {
  const ops: PlanOp[] = [
    { op: "addStop", momentId: flightId, place: "Hanover" },
    { op: "edit", momentId: flightId, place: "Hanover" },
    { op: "edit", momentId: flightId, place: "Berlin", geo: { lat: 52.5, lng: 13.4 } },
    { op: "edit", momentId: flightId, note: "no place" },
  ];

  test("each unpinned name is looked up once", () => {
    expect(placesToFind(ops)).toEqual(["Hanover"]);
  });

  test("a found pin goes on every operation that names the place, and the name stays", () => {
    const pinned = withPins(ops, new Map([["Hanover", { lat: 52.37, lng: 9.73 }]]));
    expect(pinned.map((o) => [o.place, o.geo?.lat])).toEqual([
      ["Hanover", 52.37],
      ["Hanover", 52.37],
      ["Berlin", 52.5],
      [undefined, undefined],
    ]);
  });

  test("a name that wasn't found stays unpinned", () => {
    expect(withPins(ops, new Map()).map((o) => o.geo?.lat)).toEqual([
      undefined,
      undefined,
      52.5,
      undefined,
    ]);
  });
});
