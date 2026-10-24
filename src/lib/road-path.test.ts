import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import {
  cachedPath,
  fetchPath,
  forgetPaths,
  networkOf,
  parseRoute,
  roundForRouting,
  routeUrl,
  simplifyPath,
  wantsPath,
  type Path,
} from "./road-path";

const STATION = { lat: 34.9858, lng: 135.7588 };
const GION = { lat: 35.0036, lng: 135.7756 };
const BERLIN = { lat: 52.5251, lng: 13.3694 };
const HAMBURG = { lat: 53.5528, lng: 10.0067 };

describe("which ways of travelling follow a network", () => {
  test("roads for walking, cycling and driving (a bus too), rails for a train, nothing for the rest", () => {
    expect(networkOf("walk")).toBe("foot");
    expect(networkOf("bike")).toBe("bike");
    expect(networkOf("car")).toBe("car");
    expect(networkOf("bus")).toBe("car");
    expect(networkOf("train")).toBe("rail");
    expect(networkOf("plane")).toBeUndefined();
    expect(networkOf("boat")).toBeUndefined();
    expect(networkOf("other")).toBeUndefined();
  });

  test("a hop on the spot, a plane and a whole journey are not asked for", () => {
    expect(wantsPath(STATION, GION, "bus")).toBe(true);
    expect(wantsPath(STATION, { lat: 34.9859, lng: 135.7589 }, "walk")).toBe(false);
    expect(wantsPath(STATION, GION, "plane")).toBe(false);
    expect(wantsPath(BERLIN, { lat: 40.4168, lng: -3.7038 }, "train")).toBe(false);
  });
});

describe("what leaves the browser", () => {
  test("coordinates are rounded to about 100 m", () => {
    expect(roundForRouting({ lat: 34.98581, lng: 135.75884 })).toEqual({
      lat: 34.986,
      lng: 135.759,
    });
  });

  test("a road leg asks OpenStreetMap's router for its own network, longitude first", () => {
    expect(routeUrl("foot", STATION, GION)).toBe(
      "https://routing.openstreetmap.de/routed-foot/route/v1/driving/135.759,34.986;135.776,35.004?overview=full&geometries=geojson",
    );
    expect(routeUrl("car", STATION, GION)).toContain("/routed-car/");
    expect(routeUrl("bike", STATION, GION)).toContain("/routed-bike/");
  });

  test("a long road leg comes back simplified, a short one in full", () => {
    expect(routeUrl("car", BERLIN, HAMBURG)).toContain("overview=simplified");
    expect(routeUrl("car", STATION, GION)).toContain("overview=full");
  });

  test("a rail leg asks the rail router, latitude first, and no turn-by-turn", () => {
    const url = routeUrl("rail", STATION, GION);
    expect(url).toBe(
      "https://routing.openrailrouting.org/route?point=34.986,135.759&point=35.004,135.776&profile=all_tracks&points_encoded=false&instructions=false",
    );
  });
});

describe("reading an answer", () => {
  const osrm = {
    code: "Ok",
    routes: [
      {
        geometry: {
          coordinates: [
            [135.7575, 34.9862],
            [135.7591, 34.9871],
            [135.7756, 35.0036],
          ],
        },
      },
    ],
  };

  test("an OSRM route is its line", () => {
    expect(parseRoute("car", osrm)).toEqual([
      [135.7575, 34.9862],
      [135.7591, 34.9871],
      [135.7756, 35.0036],
    ]);
  });

  test("a rail route is its line, with any elevation dropped", () => {
    const answer = {
      paths: [
        {
          points: {
            type: "LineString",
            coordinates: [
              [13.3694, 52.5251, 34],
              [10.0067, 53.5528, 6],
            ],
          },
        },
      ],
    };
    expect(parseRoute("rail", answer)).toEqual([
      [13.3694, 52.5251],
      [10.0067, 53.5528],
    ]);
  });

  test("anything else is nothing: no route, wrong shape, one point, nonsense", () => {
    expect(parseRoute("car", { code: "NoRoute", message: "Impossible route" })).toBeUndefined();
    expect(parseRoute("car", { routes: [{ geometry: { coordinates: "no" } }] })).toBeUndefined();
    expect(
      parseRoute("car", { routes: [{ geometry: { coordinates: [[1, 2]] } }] }),
    ).toBeUndefined();
    expect(parseRoute("rail", osrm)).toBeUndefined();
    expect(parseRoute("car", null)).toBeUndefined();
  });

  test("points off the world are dropped", () => {
    const answer = {
      routes: [
        {
          geometry: {
            coordinates: [
              [0, 0],
              [500, 0],
              [1, 1],
            ],
          },
        },
      ],
    };
    expect(parseRoute("car", answer)).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });
});

describe("simplifyPath", () => {
  test("leaves a small path alone", () => {
    const path: Path = [
      [0, 0],
      [1, 1],
      [2, 0],
    ];
    expect(simplifyPath(path)).toBe(path);
  });

  test("thins a long straight line to its ends", () => {
    const path: Path = Array.from({ length: 1000 }, (_, i) => [i / 1000, i / 1000]);
    const thin = simplifyPath(path, 400);
    expect(thin.length).toBeLessThanOrEqual(400);
    expect(thin[0]).toEqual([0, 0]);
    expect(thin.at(-1)).toEqual([0.999, 0.999]);
  });

  test("keeps a corner when it thins", () => {
    // A road that goes east, then turns north, with a hundred points on each side.
    const east: Path = Array.from({ length: 200 }, (_, i) => [i * 0.0005, 0]);
    const north: Path = Array.from({ length: 200 }, (_, i) => [0.0995, (i + 1) * 0.0005]);
    const thin = simplifyPath([...east, ...north], 50);
    expect(thin.length).toBeLessThanOrEqual(50);
    expect(thin).toContainEqual([0.0995, 0]);
  });
});

describe("fetching a path", () => {
  const answer = {
    routes: [
      {
        geometry: {
          coordinates: [
            [135.7575, 34.9862],
            [135.7756, 35.0036],
          ],
        },
      },
    ],
  };
  const ok = () => new Response(JSON.stringify(answer), { status: 200 });

  beforeEach(() => {
    forgetPaths();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("asks once, however many scenes want the same leg, and remembers the answer", async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    expect(cachedPath(STATION, GION, "bus")).toBeUndefined();
    const [a, b] = await Promise.all([
      fetchPath(STATION, GION, "bus"),
      fetchPath(STATION, GION, "bus"),
    ]);
    expect(a).toEqual([
      [135.7575, 34.9862],
      [135.7756, 35.0036],
    ]);
    expect(b).toEqual(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cachedPath(STATION, GION, "bus")).toEqual(a);
    // A car takes the same roads, so it is the same question.
    await fetchPath(STATION, GION, "car");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a router that says no, or isn't there, leaves the arc: nothing, and no crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("busy", { status: 429 })),
    );
    await expect(fetchPath(STATION, GION, "walk")).resolves.toBeUndefined();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    await expect(fetchPath(STATION, { lat: 35.01, lng: 135.79 }, "walk")).resolves.toBeUndefined();
  });

  test("a miss is not asked again at once, but is after a minute", async () => {
    const fetchMock = vi.fn(async () => new Response("busy", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchPath(STATION, GION, "walk");
    await fetchPath(STATION, GION, "walk");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(61_000);
    await fetchPath(STATION, GION, "walk");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("planes and boats never ask", async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchPath(STATION, GION, "plane")).resolves.toBeUndefined();
    await expect(fetchPath(STATION, GION, "boat")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
