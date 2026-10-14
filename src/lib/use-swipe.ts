import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

export type SwipeDirection = "left" | "right" | "up" | "down";

export type SwipeMove = { dx: number; dy: number; ms: number };

// Past this much movement a pointer has taken an axis; short of it, a tap.
const LOCK_PX = 8;
// A drag this far commits at any speed; a flick commits when quick enough.
export const SWIPE_PX = 56;
const FLICK_PX = 24;
const FLICK_SPEED = 0.45; // px per ms

// The dominant axis picks the direction, a tie going across. A move commits when
// it is long enough or quick enough, and is nothing otherwise.
export const classifySwipe = (
  move: SwipeMove,
  opts: { distance?: number; velocity?: number } = {},
): SwipeDirection | null => {
  const distance = opts.distance ?? SWIPE_PX;
  const velocity = opts.velocity ?? FLICK_SPEED;
  const across = Math.abs(move.dx) >= Math.abs(move.dy);
  const along = across ? move.dx : move.dy;
  const size = Math.abs(along);
  if (size === 0) return null;
  const speed = size / Math.max(move.ms, 1);
  if (size < distance && !(speed >= velocity && size >= FLICK_PX)) return null;
  if (across) return along < 0 ? "left" : "right";
  return along < 0 ? "up" : "down";
};

// Forward is the way the story goes: left or up. Back is right or down.
export const isForward = (d: SwipeDirection) => d === "left" || d === "up";

export type SwipeHandlers = {
  onSwipe(direction: SwipeDirection): void;
  onDrag?(drag: { dx: number; dy: number; axis: "x" | "y" | null }): void;
  onCancel?(): void;
  onTap?(point: { x: number; y: number }): void;
};

// `touchOnly` leaves mouse drags alone, so selecting text is not a swipe.
export type SwipeOptions = { axes?: "both" | "x"; enabled?: boolean; touchOnly?: boolean };

// Controls keep their own pointer, a video's native controls among them, and so
// does anything marked out of the surface.
const OWN_POINTER = "button, a, input, textarea, select, summary, video, [data-no-swipe]";

type Gesture = {
  id: number;
  x: number;
  y: number;
  t: number;
  dx: number;
  dy: number;
  axis: "x" | "y" | null;
  // Past the lock, so the surface owns the pointer and it is captured.
  locked: boolean;
};

// The walk stops at the surface itself, so a surface that is marked (a deck
// inside a scroller) still takes its own gestures.
const ownsPointer = (target: EventTarget | null, surface: Element): boolean => {
  for (let n = target instanceof Element ? target : null; n && n !== surface; n = n.parentElement) {
    if (n.matches(OWN_POINTER)) return true;
  }
  return false;
};

// Listens for swipes and taps on an element. Moves and releases are listened
// for on the window, so a drag that leaves the element still ends cleanly. With
// `axes: "x"` a vertical drag is left to the browser, which scrolls the page.
export const useSwipeSurface = (
  ref: RefObject<HTMLElement | null>,
  handlers: SwipeHandlers,
  options: SwipeOptions = {},
) => {
  const { axes = "both", enabled = true, touchOnly = false } = options;
  // Read at each event, so the handlers can change without re-attaching.
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let gesture: Gesture | null = null;
    let frame = 0;
    // A click after a drag is the drag's, not the page's.
    let swallow = false;

    // Reports at most once a frame, however fast the pointer moves.
    const drag = () => {
      frame = 0;
      const g = gesture;
      if (g?.locked) latest.current.onDrag?.({ dx: g.dx, dy: g.dy, axis: g.axis });
    };
    const end = () => {
      const g = gesture;
      gesture = null;
      cancelAnimationFrame(frame);
      frame = 0;
      return g;
    };

    const onDown = (e: PointerEvent) => {
      if (gesture || e.button !== 0 || !e.isPrimary || ownsPointer(e.target, el)) return;
      if (touchOnly && e.pointerType === "mouse") return;
      gesture = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
        dx: 0,
        dy: 0,
        axis: null,
        locked: false,
      };
    };

    const onMove = (e: PointerEvent) => {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      g.dx = e.clientX - g.x;
      g.dy = e.clientY - g.y;
      if (!g.locked) {
        if (Math.hypot(g.dx, g.dy) < LOCK_PX) return;
        g.axis = Math.abs(g.dx) >= Math.abs(g.dy) ? "x" : "y";
        // On an across-only surface a vertical drag is the page's to scroll.
        if (axes === "x" && g.axis === "y") {
          gesture = null;
          return;
        }
        g.locked = true;
        el.setPointerCapture(g.id);
      }
      if (!frame) frame = requestAnimationFrame(drag);
    };

    const onUp = (e: PointerEvent) => {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      end();
      const h = latest.current;
      if (!g.locked) {
        h.onTap?.({ x: e.clientX, y: e.clientY });
        return;
      }
      swallow = true;
      window.setTimeout(() => {
        swallow = false;
      }, 0);
      const dir = classifySwipe({ dx: g.dx, dy: axes === "x" ? 0 : g.dy, ms: e.timeStamp - g.t });
      if (dir) h.onSwipe(dir);
      else h.onCancel?.();
    };

    const onAbort = (e: PointerEvent) => {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      end();
      if (g.locked) latest.current.onCancel?.();
    };

    const onClick = (e: MouseEvent) => {
      if (!swallow) return;
      swallow = false;
      e.stopPropagation();
      e.preventDefault();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("click", onClick, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onAbort);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("click", onClick, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onAbort);
      cancelAnimationFrame(frame);
    };
  }, [ref, axes, enabled, touchOnly]);
};
