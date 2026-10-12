import { type CSSProperties, type ReactNode, type RefObject, useEffect, useRef } from "react";
import { type Camera, panBy, type Size, zoomAt } from "@/lib/canvas/camera";
import { DESK } from "@/lib/canvas/look";
import { cn } from "@/lib/utils";

// An infinite surface you can pan and zoom, and nothing else: it knows
// nothing about frames or photos. Whatever it is given as children lives in
// world space, under a camera. Drag on the desk to pan; scroll to pan; pinch,
// or Ctrl/⌘ + scroll, to zoom at the pointer; hold Space to pan from anywhere.
// Children that handle a press themselves stop it, and the desk never sees it.

type Props = {
  camera: Camera;
  onCamera: (camera: Camera) => void;
  // The size of the viewport, whenever it changes.
  onView?: (size: Size) => void;
  // Where the viewport is on the page, for turning pointer positions to world ones.
  boxRef?: RefObject<HTMLDivElement | null>;
  // Pressing the empty desk.
  onDeskDown?: () => void;
  // The colour of the desk, which the flow changes to match the frame it is in.
  desk?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

export function Canvas({ camera, onCamera, onView, boxRef, onDeskDown, desk = DESK.color, className, style, children }: Props) {
  const own = useRef<HTMLDivElement>(null);
  const box = boxRef ?? own;
  // The latest camera, for handlers that outlive a render.
  const live = useRef(camera);
  live.current = camera;
  const space = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panning = useRef(false);

  useEffect(() => {
    const el = box.current;
    if (el === null) return;
    const report = () => onView?.({ w: el.clientWidth, h: el.clientHeight });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);

    const rectOf = () => el.getBoundingClientRect();
    // Not passive: a pinch or Ctrl+scroll must not zoom the whole page.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = rectOf();
      if (e.ctrlKey || e.metaKey) {
        onCamera(zoomAt(live.current, Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top));
      } else {
        onCamera(panBy(live.current, -e.deltaX, -e.deltaY));
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });

    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e) && el.matches(":hover, :focus-within")) {
        space.current = true;
        e.preventDefault();
        el.style.cursor = "grab";
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        space.current = false;
        el.style.cursor = "";
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [box, onCamera, onView]);

  // One finger or the mouse pans; two fingers pan and pinch together.
  function begin(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    panning.current = true;
  }

  function move(e: React.PointerEvent<HTMLDivElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (prev === undefined || !panning.current) return;
    const now = { x: e.clientX, y: e.clientY };
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
    if (others.length === 0) {
      onCamera(panBy(live.current, now.x - prev.x, now.y - prev.y));
    } else {
      // Pinch: the distance to the other finger scales, the midpoint pans.
      const other = others[0]!;
      const r = box.current?.getBoundingClientRect();
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(now.x - other.x, now.y - other.y);
      if (r !== undefined && before > 0) {
        const mid = { x: (now.x + other.x) / 2 - r.left, y: (now.y + other.y) / 2 - r.top };
        const pan = { x: (now.x - prev.x) / 2, y: (now.y - prev.y) / 2 };
        onCamera(panBy(zoomAt(live.current, after / before, mid.x, mid.y), pan.x, pan.y));
      }
    }
    pointers.current.set(e.pointerId, now);
  }

  function end(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) panning.current = false;
  }

  const { x, y, zoom } = camera;
  return (
    <div
      ref={box}
      className={cn("relative touch-none overflow-hidden select-none", className)}
      style={{
        backgroundColor: desk,
        backgroundImage: `radial-gradient(circle, ${DESK.dot} ${Math.max(1, zoom * 1.4)}px, transparent ${Math.max(1.5, zoom * 1.9)}px)`,
        backgroundSize: `${DESK.gap * zoom}px ${DESK.gap * zoom}px`,
        backgroundPosition: `${-x * zoom}px ${-y * zoom}px`,
        transition: "background-color 900ms ease",
        ...style,
      }}
      // Space turns any press into a pan, even over a piece.
      onPointerDownCapture={(e) => {
        if (space.current) {
          e.stopPropagation();
          begin(e);
        }
      }}
      onPointerDown={(e) => {
        onDeskDown?.();
        begin(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="absolute top-0 left-0"
        style={{ transform: `scale(${zoom}) translate(${-x}px, ${-y}px)`, transformOrigin: "0 0", ["--zoom" as string]: zoom }}
      >
        {children}
      </div>
    </div>
  );
}
