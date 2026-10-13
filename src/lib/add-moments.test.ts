import { afterEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { enrichMoment, momentsFromPlan, type PlannedDay, readPicked, uploadAll } from "./add-moments";
import type { Geo, PhotoPoint } from "./photo-groups";

// Local times, so the day holds in any time zone.
const at = (h: number, m = 0) => new Date(2026, 6, 10, h, m).getTime();
const point = (id: string, takenAt: number, offsetMinutes?: number): PhotoPoint => ({ id, takenAt, offsetMinutes });
const LISBON: Geo = { lat: 38.72, lng: -9.14 };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("momentsFromPlan", () => {
  test("keeps the photos that uploaded, drops stops with none, names a place only when it has one", () => {
    const days: PlannedDay[] = [
      {
        day: "2026-07-10",
        moments: [
          [
            { startsAt: at(9), photos: [point("a", at(9), 60), point("b", at(9, 5))] },
            { startsAt: at(10), place: " Café ", geo: LISBON, photos: [point("c", at(10))] },
            { startsAt: at(11), place: "Park", geo: LISBON, photos: [point("d", at(11))] },
            { startsAt: at(12), place: "  ", geo: LISBON, photos: [point("e", at(12))] },
          ],
        ],
      },
    ];
    const uploaded = new Map([
      ["a", "m-a"],
      ["b", "m-b"],
      ["c", "m-c"],
      ["e", "m-e"],
    ]);
    const [moment] = momentsFromPlan(days, uploaded, () => "photo");

    expect(moment?.create).toEqual({
      startsAt: at(9),
      tzOffsetMinutes: 60,
      blocks: [
        { type: "photo", mediaId: "m-a" },
        { type: "photo", mediaId: "m-b" },
      ],
      stops: [
        { startsAt: at(10), place: "Café", geo: LISBON, blocks: [{ type: "photo", mediaId: "m-c" }] },
        { startsAt: at(12), blocks: [{ type: "photo", mediaId: "m-e" }] },
      ],
    });
    expect(moment?.uses.map((u) => u.mediaId)).toEqual(["m-a", "m-b", "m-c", "m-e"]);
  });

  test("a moment with no uploads has nothing to create, and a day's later moments are numbered", () => {
    const days: PlannedDay[] = [
      {
        day: "2026-07-10",
        moments: [
          [{ startsAt: at(9), photos: [point("x", at(9))] }],
          [{ startsAt: at(20), photos: [point("y", at(20))] }],
        ],
      },
    ];
    const [first, second] = momentsFromPlan(days, new Map([["y", "m-y"]]), () => "photo");

    expect(first?.create).toBeUndefined();
    expect(first?.uses).toEqual([]);
    expect(first?.label).toMatch(/, part 1$/);
    expect(second?.label).toMatch(/, part 2$/);
    expect(second?.create?.blocks).toEqual([{ type: "photo", mediaId: "m-y" }]);
  });
});

describe("uploadAll", () => {
  test("stops at the upload limit and reports what was left", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ error: "This experience has reached its upload limit" }), { status: 429 }),
    );
    const items = ["a", "b", "c", "d", "e"].map((id) => ({ id, file: new File(["x"], `${id}.jpg`, { type: "image/jpeg" }) }));

    const { uploaded, failures, full } = await uploadAll(items, "event-1", () => "token", () => {});

    expect(full).toBe(true);
    expect(uploaded.size).toBe(0);
    expect(failures.at(-1)).toBe("2 more files weren't uploaded: the upload limit has been reached");
  });
});

describe("readPicked", () => {
  test("reports the files it leaves out, and picks each file once", async () => {
    const heic = new File(["x"], "IMG_1.HEIC", { type: "image/heic", lastModified: 1 });
    const photo = new File(["p"], "beach.png", { type: "image/png", lastModified: 2 });
    const clip = new File(["v"], "clip.mp4", { type: "video/mp4", lastModified: 3 });
    const seen = new Set<string>();
    let n = 0;

    const { picked, problems } = await readPicked([heic, photo, photo, clip], seen, () => `p${n++}`);

    expect(picked.map((p) => p.kind)).toEqual(["photo", "video"]);
    expect(problems).toEqual(["IMG_1.HEIC: HEIC photos aren't supported yet; export them as JPEG"]);
    expect(seen.size).toBe(2);
  });
});

describe("enrichMoment", () => {
  test("asks for the notes even when no thumbnail can be made", async () => {
    const enrich = vi.fn(async () => null);
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });

    enrichMoment(enrich, "m1" as Id<"moments">, [{ mediaId: "p1" as Id<"media">, file }]);
    await flush();

    expect(enrich).toHaveBeenCalledWith({ momentId: "m1", thumbs: [] });
  });

  test("after a refusal, every form skips the request for a while, then asks again", async () => {
    // Clock at 0, so the pause it leaves behind is long over in real time.
    vi.useFakeTimers({ now: 0 });
    try {
      const refuse = vi.fn(async () => false);
      enrichMoment(refuse, "m1" as Id<"moments">, []);
      await vi.runAllTimersAsync();
      expect(refuse).toHaveBeenCalledOnce();

      // Another form, with its own enrich function, waits too.
      const other = vi.fn(async () => true);
      enrichMoment(other, "m2" as Id<"moments">, []);
      await vi.runAllTimersAsync();
      expect(other).not.toHaveBeenCalled();

      vi.advanceTimersByTime(60 * 60_000);
      enrichMoment(other, "m3" as Id<"moments">, []);
      await vi.runAllTimersAsync();
      expect(other).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test("a failed request is logged, not thrown", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    enrichMoment(
      async () => {
        throw new Error("offline");
      },
      "m1" as Id<"moments">,
      [],
    );
    await flush();

    expect(warn).toHaveBeenCalledOnce();
  });
});
