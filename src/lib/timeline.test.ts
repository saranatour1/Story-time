import { describe, expect, test } from "vite-plus/test";
import type { MomentView } from "@/components/event/types";
import type { Id } from "../../convex/_generated/dataModel";
import { firstLine, groupByDay, mediaOf, rowLabel } from "./timeline";

const moment = (id: string, startsAt: number, over: Partial<MomentView> = {}): MomentView => ({
  _id: id as MomentView["_id"],
  authorId: "u1" as MomentView["authorId"],
  startsAt,
  blocks: [],
  stops: [],
  labels: [],
  people: [],
  ...over,
});

describe("days", () => {
  test("group by the day in the zone the moment happened in, oldest first", () => {
    // 22:15 UTC on 8 November is 07:15 on 9 November in Japan (UTC+9).
    const kyoto = Date.UTC(2025, 10, 8, 22, 15);
    const days = groupByDay([
      moment("b", kyoto, { tzOffsetMinutes: 540 }),
      moment("a", Date.UTC(2025, 10, 8, 10), { tzOffsetMinutes: 0 }),
      moment("c", kyoto + 3_600_000, { tzOffsetMinutes: 540 }),
    ]);
    expect(days.map((d) => d.day)).toEqual(["2025-11-08", "2025-11-09"]);
    expect(days[1]!.moments.map((m) => m._id)).toEqual(["b", "c"]);
    expect(days[1]!.label).toMatch(/Nov 9/);
    expect(days.every((d) => d.today === false)).toBe(true);
  });

  test("the viewer's day is marked, and only that day", () => {
    const kyoto = Date.UTC(2025, 10, 8, 22, 15);
    const days = groupByDay(
      [
        moment("a", Date.UTC(2025, 10, 8, 10), { tzOffsetMinutes: 0 }),
        moment("b", kyoto, { tzOffsetMinutes: 540 }),
      ],
      "2025-11-09",
    );
    expect(days.map((d) => d.today)).toEqual([false, true]);
  });

  test("nothing in, nothing out", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("the line a moment is listed by", () => {
  test("its first words, else a link, else its first named place", () => {
    expect(
      firstLine(
        moment("a", 0, {
          blocks: [{ type: "note", text: "Ferry back\nat sunset" }],
          place: "Cacilhas",
        }),
      ),
    ).toBe("Ferry back");
    expect(
      firstLine(
        moment("b", 0, { blocks: [{ type: "link", url: "https://x.test", title: "A page" }] }),
      ),
    ).toBe("A page");
    expect(firstLine(moment("c", 0, { stops: [{ place: "Sintra", blocks: [] }] }))).toBe("Sintra");
    expect(firstLine(moment("d", 0))).toBeUndefined();
  });
});

describe("a moment's row", () => {
  const photo = (id: string) => ({ type: "photo" as const, mediaId: id as Id<"media"> });
  const video = (id: string) => ({ type: "video" as const, mediaId: id as Id<"media"> });

  test("its photos and videos, in order across stops", () => {
    const m = moment("a", 0, {
      blocks: [photo("p1"), video("v1")],
      stops: [{ blocks: [photo("p2")] }],
    });
    expect(mediaOf(m)).toEqual([
      { mediaId: "p1", video: false },
      { mediaId: "v1", video: true },
      { mediaId: "p2", video: false },
    ]);
    expect(rowLabel(m)).toBe("2 photos · 1 video");
  });

  test("words come first; an empty moment is just a moment", () => {
    expect(
      rowLabel(moment("b", 0, { blocks: [{ type: "note", text: "Dinner" }, photo("p1")] })),
    ).toBe("Dinner");
    expect(rowLabel(moment("c", 0, { blocks: [video("v1")] }))).toBe("1 video");
    expect(rowLabel(moment("d", 0))).toBe("A moment");
  });
});
