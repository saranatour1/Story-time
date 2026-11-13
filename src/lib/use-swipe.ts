import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

export type SwipeDirection = "left" | "right" | "up" | "down";

export type SwipeMove = { dx: number; dy: number; ms: number };

const LOCK_PX = 8;
export const SWIPE_PX = 56;
const FLICK_PX = 24;
const FLICK_PX_PER_MS = 0.45;

export const classifySwipe = (
  move: SwipeMove,
  opts: { distance?: number; velocity?: number } = {},
): SwipeDirection | null => {
  const distance = opts.distance ?? SWIPE_PX;
  const velocity = opts.velocity ?? FLICK_PX_PER_MS;
  const across = Math.abs(move.dx) >= Math.abs(move.dy);
  const along = across ? move.dx : move.dy;
  const size = Math.abs(along);
  if (size === 0) return null;
  const speed = size / Math.max(move.ms, 1);
  if (size < distance && !(speed >= velocity && size >= FLICK_PX)) return null;
  if (across) return along < 0 ? "left" : "right";
  return along < 0 ? "up" : "down";
};

export const isForward = (d: SwipeDirection) => d === "left" || d === "up";

export type SwipeHandlers = {
  onSwipe(direction: SwipeDirection): void;
  onDrag?(drag: { dx: number; dy: number; axis: "x" | "y" | null }): void;
  onCancel?(): void;
  onTap?(point: { x: number; y: number }): void;
};

export type SwipeOptions = { axes?: "both" | "x"; enabled?: boolean; touchOnly?: boolean };

const OWN_POINTER = "button, a, input, textarea, select, summary, video, [data-no-swipe]";

type Gesture = {
  id: number;
  x: number;
  y: number;
  t: number;
  dx: number;
  dy: number;
  axis: "x" | "y" | null;
  locked: boolean;
};

const ownsPointer = (target: EventTarget | null, surface: Element): boolean => {
  for (let n = target instanceof Element ? target : null; n && n !== surface; n = n.parentElement) {
    if (n.matches(OWN_POINTER)) return true;
  }
  return false;
};

export const useSwipeSurface = (
  ref: RefObject<HTMLElement | null>,
  handlers: SwipeHandlers,
  options: SwipeOptions = {},
) => {
  const { axes = "both", enabled = true, touchOnly = false } = options;
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let gesture: Gesture | null = null;
    let frame = 0;
    let swallow = false;

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
