import { describe, expect, test } from "vite-plus/test";
import { classifySwipe, isForward, type SwipeDirection } from "./use-swipe";

describe("classifySwipe", () => {
  test("a long drag commits, however slowly it went", () => {
    expect(classifySwipe({ dx: -70, dy: 0, ms: 2000 })).toBe("left");
  });

  test("a short drag that is slow does not commit", () => {
    expect(classifySwipe({ dx: 40, dy: 0, ms: 900 })).toBeNull();
  });

  test("a short fast flick commits", () => {
    expect(classifySwipe({ dx: 30, dy: 0, ms: 50 })).toBe("right");
  });

  test("a flick under 24px is too small to commit, however quick", () => {
    expect(classifySwipe({ dx: 20, dy: 0, ms: 5 })).toBeNull();
  });

  test("a tiny move is nothing", () => {
    expect(classifySwipe({ dx: 3, dy: 2, ms: 10 })).toBeNull();
    expect(classifySwipe({ dx: 0, dy: 0, ms: 10 })).toBeNull();
  });

  test("the dominant axis picks the direction", () => {
    expect(classifySwipe({ dx: 4, dy: -90, ms: 400 })).toBe("up");
    expect(classifySwipe({ dx: 0, dy: 80, ms: 400 })).toBe("down");
    expect(classifySwipe({ dx: 60, dy: 50, ms: 300 })).toBe("right");
    expect(classifySwipe({ dx: -50, dy: 60, ms: 300 })).toBe("down");
  });

  test("a tie goes across, horizontally", () => {
    expect(classifySwipe({ dx: 60, dy: -60, ms: 300 })).toBe("right");
    expect(classifySwipe({ dx: -60, dy: 60, ms: 300 })).toBe("left");
  });

  test("the distance and speed can be set", () => {
    expect(classifySwipe({ dx: 30, dy: 0, ms: 1000 }, { distance: 20 })).toBe("right");
    expect(classifySwipe({ dx: 70, dy: 0, ms: 2000 }, { distance: 100 })).toBeNull();
    expect(classifySwipe({ dx: 30, dy: 0, ms: 100 }, { velocity: 1 })).toBeNull();
  });
});

describe("isForward", () => {
  test("left and up go forward, right and down go back", () => {
    const forward: SwipeDirection[] = ["left", "up"];
    const back: SwipeDirection[] = ["right", "down"];
    expect(forward.map(isForward)).toEqual([true, true]);
    expect(back.map(isForward)).toEqual([false, false]);
  });
});
