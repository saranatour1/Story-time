import { useAction, useQuery } from "convex/react";
import { LayoutGridIcon, MaximizeIcon, MinusIcon, PauseIcon, PlayIcon, PlusIcon, Redo2Icon, SkipBackIcon, SkipForwardIcon, Undo2Icon, XIcon } from "lucide-react";
import { type DragEvent, type KeyboardEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { QuickAddButton } from "@/components/event/quick-add";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { type Camera, centerOf, fitRect, flight, type Size, toWorld, zoomAt } from "@/lib/canvas/camera";
import { errorMessage } from "@/lib/errors";
import { copiesOf, newFrame, newMoment, newPhoto, newScrap, newTape, newTitle, type NewNode, piecesOfMoment } from "@/lib/canvas/make";
import { fillSpecs, frameSpot, starterSpecs, type StarterId } from "@/lib/canvas/fill";
import { type Arrangement, arrange, type Box as Area, clearOf, freeSpot, packFrames, pagesOf, snap, topMargin } from "@/lib/canvas/layout";
import { DESK, frameLook, FRAME_SIZES } from "@/lib/canvas/look";
import {
  type Change,
  flowOf,
  frameAt,
  holdsLetters,
  indexNodes,
  nextZ,
  type Node,
  originOf,
  pick,
  union,
  withChange,
  withDescendants,
  worldRect,
} from "@/lib/canvas/model";
import { type Box, type Handle, normalize, resizeBox, round1, turnTo } from "@/lib/canvas/transform";
import { CanvasAsk } from "./ask";
import { Canvas } from "./canvas";
import { Inspector } from "./inspector";
import { NodeTree } from "./node-tree";
import { DRAG_TYPE, type Item, Tray } from "./tray";
import { TransformBox } from "./transform-box";
import { useCanvas } from "./use-canvas";

type NodeId = Id<"canvasNodes">;
type Pt = { x: number; y: number };

type Gesture =
  | { kind: "move"; ids: NodeId[]; start: Pt; origin: Map<NodeId, Pt>; moved: boolean }
  | { kind: "resize"; id: NodeId; handle: Handle; start: Pt; box: Box; ratio: boolean }
  | { kind: "turn"; id: NodeId; center: Pt };

const TURNS = new Set<Node["kind"]>(["moment", "photo", "scrap", "tape", "letter"]);
// How big a piece is when it is added, to find it room.
const PIECE_SIZE = { scrap: { w: 240, h: 140 }, photo: { w: 280, h: 210 }, moment: { w: 420, h: 360 } } as const;
const typing = (e: { target: EventTarget }) => e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The collage canvas of an experience: frames and pieces laid out over its
// moments and photos, edited a piece at a time, and played back as a flow that
// zooms from frame to frame. Anyone who can see the experience can look and
// play it; only its owner edits.
export function CanvasEditor({ event }: { event: EventView }) {
  const canvas = useCanvas(event._id);
  const moments = useQuery(api.moments.list, { eventId: event._id });
  const momentById = useMemo(() => new Map((moments ?? []).map((m) => [m._id as string, m])), [moments]);
  const canEdit = canvas.canEdit;

  const [camera, setCamera] = useState<Camera>({ x: -100, y: -100, zoom: 0.5 });
  const [view, setView] = useState<Size>({ w: 800, h: 600 });
  const [selected, setSelected] = useState<NodeId[]>([]);
  const [scope, setScope] = useState<NodeId | undefined>();
  // Where things are while they are being dragged, before they are saved.
  const [live, setLive] = useState<ReadonlyMap<NodeId, Change>>(new Map());
  // The flow: which frame it is on (-1 is the whole canvas), or null when it isn't playing.
  const [at, setAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [focusWords, setFocusWords] = useState(0);
  // Lines a piece being moved has settled on, in the world.
  const [guides, setGuides] = useState<{ x?: number; y?: number; page: Area }>();

  const box = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const viewRef = useRef(view);
  viewRef.current = view;
  const gesture = useRef<Gesture | null>(null);
  // What is being dragged right now, kept where the end of the gesture can read it.
  const dragging = useRef<ReadonlyMap<NodeId, Change>>(new Map());
  const raf = useRef(0);

  const shown = useMemo(
    () => (live.size === 0 ? canvas.nodes : canvas.nodes.map((n) => { const c = live.get(n._id); return c === undefined ? n : withChange(n, c); })),
    [canvas.nodes, live],
  );
  const tree = useMemo(() => indexNodes(shown), [shown]);
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const flow = useMemo(() => flowOf(shown), [shown]);
  const selectedNodes = selected.flatMap((id) => tree.byId.get(id) ?? []);

  const fail = useCallback((e: unknown) => toast.error(errorMessage(e)), []);

  // ---- Where things are ----------------------------------------------------------

  const worldAt = useCallback((clientX: number, clientY: number): Pt => {
    const r = box.current?.getBoundingClientRect();
    return toWorld(cameraRef.current, clientX - (r?.left ?? 0), clientY - (r?.top ?? 0));
  }, []);

  const everything = useCallback((): Camera => {
    const all = union((treeRef.current.kids.get("") ?? []).map((n) => worldRect(n, treeRef.current.byId)));
    return fitRect(all ?? { x: 0, y: 0, w: 1400, h: 900 }, viewRef.current, 0.1, 1);
  }, []);

  // Open on the whole canvas the first time it loads.
  const fitted = useRef(false);
  useEffect(() => {
    if (!canvas.ready || fitted.current || view.w < 100) return;
    fitted.current = true;
    setCamera(everything());
  }, [canvas.ready, view, everything]);

  const moveCamera = useCallback((next: Camera) => {
    cancelAnimationFrame(raf.current);
    setCamera(next);
  }, []);

  // A flight to somewhere: out of where you are and into it.
  const fly = useCallback((to: Camera, ms = 1500) => {
    cancelAnimationFrame(raf.current);
    return new Promise<void>((resolve) => {
      if (reduced() || ms <= 0) {
        setCamera(to);
        resolve();
        return;
      }
      const path = flight(cameraRef.current, to, viewRef.current);
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        setCamera(path(t));
        if (t < 1) raf.current = requestAnimationFrame(tick);
        else resolve();
      };
      raf.current = requestAnimationFrame(tick);
    });
  }, []);

  const zoomBy = (factor: number) => moveCamera(zoomAt(camera, factor, view.w / 2, view.h / 2));
  const zoomToFrame = useCallback((node: Node) => void fly(fitRect(worldRect(node, treeRef.current.byId), viewRef.current, 0.08, 1.2), 900), [fly]);

  // ---- The flow --------------------------------------------------------------------

  const frameInFlow = at === null || at < 0 ? undefined : flow[at];
  useEffect(() => {
    if (at === null) return;
    const target = frameInFlow === undefined ? everything() : fitRect(worldRect(frameInFlow, treeRef.current.byId), viewRef.current, 0.05, 1.2);
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void fly(target, frameInFlow === undefined ? 1100 : 1800).then(() => {
      if (!alive || !playing) return;
      timer = setTimeout(() => {
        if (at + 1 < flow.length) setAt(at + 1);
        else setPlaying(false);
      }, 3200);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // The flow plays from `at` and `playing`; the frames it plays are read when it gets there.
  }, [at, playing]);

  const startFlow = () => {
    setSelected([]);
    setScope(undefined);
    setAt(flow.length > 0 ? 0 : -1);
    setPlaying(flow.length > 1);
  };
  const stopFlow = () => {
    setAt(null);
    setPlaying(false);
    void fly(everything(), 900);
  };

  // ---- Adding ----------------------------------------------------------------------

  const select = (ids: NodeId[]) => {
    setSelected(ids);
    setScope(undefined);
  };

  const frameBoxes = (skip: ReadonlySet<string> = new Set()): Area[] =>
    (treeRef.current.kids.get("") ?? []).filter((n) => n.kind === "frame" && !skip.has(n._id)).map((f) => worldRect(f, treeRef.current.byId));

  // Brings the camera to a new frame once it is in the tree.
  const showFrame = (id: NodeId) => {
    setTimeout(() => {
      const f = treeRef.current.byId.get(id);
      if (f !== undefined) zoomToFrame(f);
    }, 150);
  };

  // New frames go to the right of the last one with a gap, and the view goes with them.
  const addFrame = async (item: Extract<Item, { what: "frame" }>) => {
    const size = FRAME_SIZES.find((f) => f.id === item.size) ?? FRAME_SIZES[0];
    const spot = frameSpot(frameBoxes(), size, centerOf(camera, view));
    const order = flow.reduce((top, f) => Math.max(top, f.order ?? 0), 0) + 1;
    const [id] = await canvas.add([newFrame(item.size, item.look, order, { x: spot.x + size.w / 2, y: spot.y + size.h / 2 }, `Frame ${order}`)]);
    if (id === undefined) return;
    select([id]);
    showFrame(id);
  };

  // A ready-made page, with the experience's own title and dates on it.
  const addStarter = async (id: StarterId) => {
    const dates = [event.startsAt, event.endsAt]
      .flatMap((t) => (t === undefined ? [] : [new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })]))
      .join(" to ");
    const words = { title: event.title, dates: dates === "" ? undefined : dates };
    const order = flow.reduce((top, f) => Math.max(top, f.order ?? 0), 0) + 1;
    const frame = starterSpecs(id, words, { x: 0, y: 0 }, order)[0]!;
    const spot = frameSpot(frameBoxes(), frame, centerOf(camera, view));
    const ids = await canvas.add(starterSpecs(id, words, { x: spot.x + frame.w / 2, y: spot.y + frame.h / 2 }, order));
    if (ids[0] === undefined) return;
    select(ids.slice(0, 1));
    showFrame(ids[0]);
  };

  // Where a piece goes: into the frame under the point, else on the desk.
  const placeAt = useCallback((pt: Pt) => {
    const t = treeRef.current;
    const frame = frameAt(t, pt.x, pt.y);
    const o = frame === undefined ? { x: 0, y: 0 } : worldRect(frame, t.byId);
    return { x: pt.x - o.x, y: pt.y - o.y, parent: frame?._id };
  }, []);

  // Pieces added by a click go near the middle, each a little further along, so
  // they fan out instead of landing on top of each other.
  const spot = useRef(0);
  const nextSpot = (): Pt => {
    const k = (spot.current++ % 7) - 3;
    const c = centerOf(cameraRef.current, viewRef.current);
    return { x: c.x + (k * 40) / cameraRef.current.zoom, y: c.y + (k * 30) / cameraRef.current.zoom };
  };

  // The page a piece added by a click goes on: the one selected (or the one a
  // selected piece is on), else the one in the middle of the view, else the
  // nearest.
  const targetFrame = (): Node | undefined => {
    const t = treeRef.current;
    for (let n: Node | undefined = selectedNodes[0]; n !== undefined; n = n.parentId === undefined ? undefined : t.byId.get(n.parentId)) if (n.kind === "frame") return n;
    const c = centerOf(cameraRef.current, viewRef.current);
    const under = frameAt(t, c.x, c.y);
    if (under !== undefined) return under;
    const away = (f: Node) => {
      const r = worldRect(f, t.byId);
      return Math.hypot(r.x + r.w / 2 - c.x, r.y + r.h / 2 - c.y);
    };
    return (t.kids.get("") ?? []).filter((n) => n.kind === "frame").sort((a, b) => away(a) - away(b))[0];
  };

  // Where `n` pieces of `size` go on that page so they touch nothing already on it
  // or each other, as centres. The camera goes to the page if it is out of sight.
  // With no page (or a size that isn't a piece, like tape), they fan out from the middle.
  const spotsFor = (size: { w: number; h: number } | undefined, n = 1): Pt[] => {
    const frame = size === undefined ? undefined : targetFrame();
    if (frame === undefined || size === undefined) return Array.from({ length: n }, nextSpot);
    const t = treeRef.current;
    const o = worldRect(frame, t.byId);
    const cam = cameraRef.current;
    const seen = { x: cam.x, y: cam.y, w: viewRef.current.w / cam.zoom, h: viewRef.current.h / cam.zoom };
    if (o.x + o.w / 2 < seen.x || o.x + o.w / 2 > seen.x + seen.w || o.y + o.h / 2 < seen.y || o.y + o.h / 2 > seen.y + seen.h) zoomToFrame(frame);
    const taken = (t.kids.get(frame._id) ?? []).filter((k) => k.kind !== "tape").map((k) => ({ x: k.x, y: k.y, w: k.w, h: k.h }));
    return Array.from({ length: n }, () => {
      const free = freeSpot(frame, taken, size);
      if (free === undefined) {
        // A full page: stack them near its middle.
        const k = (spot.current++ % 7) - 3;
        return { x: o.x + o.w / 2 + k * 30, y: o.y + o.h / 2 + k * 24 };
      }
      taken.push({ ...free, ...size });
      return { x: o.x + free.x + size.w / 2, y: o.y + free.y + size.h / 2 };
    });
  };

  const momentOf = (id: string) => moments?.find((m) => m._id === id);
  const mediaOf = (id: string) =>
    moments?.flatMap((m) => [m.blocks, ...m.stops.map((s) => s.blocks)].flat()).flatMap((b) => (b.type === "photo" && b.mediaId === id ? [b.mediaId] : []))[0];

  const addPiece = async (item: Item, pt: Pt) => {
    try {
      if (item.what === "frame") return void (await addFrame(item));
      if (item.what === "starter") return void (await addStarter(item.id));
      const where = placeAt(pt);
      let specs: NewNode[] = [];
      if (item.what === "scrap") specs = [newScrap("Write something here", item.paper, where)];
      if (item.what === "tape") specs = [newTape(item.look, where)];
      if (item.what === "moment") {
        const m = momentOf(item.momentId);
        if (m !== undefined) specs = [newMoment(m._id, where)];
      }
      if (item.what === "photo") {
        const media = mediaOf(item.mediaId);
        if (media !== undefined) specs = [newPhoto(media, "print", where)];
      }
      if (specs.length === 0) return;
      const ids = await canvas.add(specs);
      select(ids.slice(0, 1));
      if (item.what === "scrap") setFocusWords((n) => n + 1);
    } catch (e) {
      fail(e);
    }
  };

  // Moments made from photos picked here go onto the canvas as they arrive.
  // The list is state, because the moment can reach the page before the upload
  // reports its id.
  const [arriving, setArriving] = useState<string[]>([]);
  useEffect(() => {
    const here = arriving.filter((id) => momentById.has(id));
    if (here.length === 0) return;
    setArriving((list) => list.filter((id) => !here.includes(id)));
    const spots = spotsFor(PIECE_SIZE.moment, here.length);
    for (const [i, id] of here.entries()) void addPiece({ what: "moment", momentId: id }, spots[i]!);
    // Only when these change: addPiece and nextSpot are new every render.
  }, [momentById, arriving]);

  // Every moment gets a page of its day as it is made: the canvas starts out
  // holding them all, each frame in the flow. Moments already on it are left, and
  // one taken off by hand isn't put back, because the canvas remembers how far
  // it has been filled.
  const filledUpTo = useRef<number | undefined>(undefined);
  useEffect(() => {
    const pending = canvas.pending;
    if (!canEdit || !canvas.ready || moments === undefined || pending === null || filledUpTo.current === pending.upTo) return;
    // Wait for the moments themselves to arrive.
    if (!pending.ids.every((id) => momentById.has(id))) return;
    filledUpTo.current = pending.upTo;
    const t = treeRef.current;
    const onCanvas = new Set([...t.byId.values()].flatMap((n) => (n.momentId === undefined ? [] : [n.momentId as string])));
    const fresh = pending.ids.flatMap((id) => (onCanvas.has(id) ? [] : [momentById.get(id)!]));
    const roots = t.kids.get("") ?? [];
    const order = flow.reduce((top, f) => Math.max(top, f.order ?? 0), 0) + 1;
    const frames = roots.filter((n) => n.kind === "frame");
    const homes = frames.map((f) => ({ id: f._id, name: f.text, heads: (t.kids.get(f._id) ?? []).flatMap((k) => (k.kind === "scrap" && k.text !== undefined ? [k.text.split("\n")[0]!] : [])), w: f.w, h: f.h, kids: (t.kids.get(f._id) ?? []).filter((k) => k.kind !== "tape").map((k) => ({ x: k.x, y: k.y, w: k.w, h: k.h })) }));
    const specs = fillSpecs(pagesOf(fresh, -new Date().getTimezoneOffset()), union(roots.map((n) => worldRect(n, t.byId))), order, frames.length, homes);
    const empty = t.byId.size === 0;
    canvas
      .fill(specs, pending.upTo)
      .then((ids) => {
        if (empty && ids[0] !== undefined) showFrame(ids[0]);
        // The frames just made have a day and a place for a name; Haiku offers
        // better ones when it can, and nothing is lost when it can't.
        const made = specs.flatMap((s, i) => {
          const id = ids[i];
          if (s.kind !== "frame" || id === undefined) return [];
          const momentIds = specs.flatMap((m) => (m.kind === "moment" && typeof m.parent === "object" && m.parent.ref === i && m.momentId !== undefined ? [m.momentId] : []));
          return momentIds.length === 0 ? [] : [{ id, momentIds }];
        });
        if (made.length > 0) void nameFrames(made, false).catch(() => undefined);
      })
      .catch(fail);
  }, [canvas.pending, canvas.ready, canEdit, moments, momentById]);

  const addTitle = async (text: string) => {
    try {
      const seed = String(Math.random());
      const probe = newTitle(text, { x: 0, y: 0 }, 110, seed)[0];
      const at = placeAt(spotsFor(probe === undefined ? undefined : { w: probe.w, h: probe.h })[0]!);
      const ids = await canvas.add(newTitle(text, at, 110, seed));
      select(ids.slice(0, 1));
    } catch (e) {
      fail(e);
    }
  };

  const onDrop = (e: DragEvent) => {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (raw === "" || !canEdit) return;
    e.preventDefault();
    try {
      void addPiece(JSON.parse(raw) as Item, worldAt(e.clientX, e.clientY));
    } catch {
      /* not one of ours */
    }
  };

  // ---- Pressing, dragging, sizing, turning ------------------------------------------

  const chainOf = (target: EventTarget | null): string[] => {
    const out: string[] = [];
    for (let el = target instanceof HTMLElement ? target : null; el !== null && el !== box.current; el = el.parentElement) {
      const id = el.dataset.nodeId;
      if (id !== undefined && treeRef.current.byId.has(id)) out.push(id);
    }
    return out;
  };

  const show = (changes: ReadonlyMap<NodeId, Change>) => {
    dragging.current = changes;
    setLive(changes);
  };

  const listen = (g: Gesture) => {
    gesture.current = g;
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    const onMove = (e: globalThis.PointerEvent) => {
      const cur = gesture.current;
      if (cur === null) return stop();
      const p = worldAt(e.clientX, e.clientY);
      const t = treeRef.current;
      if (cur.kind === "move") {
        const dx = p.x - cur.start.x;
        const dy = p.y - cur.start.y;
        if (!cur.moved && Math.hypot(dx, dy) * cameraRef.current.zoom < 3) return;
        cur.moved = true;
        // A piece on a page sits its edges and middle on the page's and its neighbours' when
        // close (hold Alt to move freely).
        let sx = dx;
        let sy = dy;
        let guide: typeof guides;
        const node = cur.ids.length === 1 ? t.byId.get(cur.ids[0]!) : undefined;
        const page = node?.parentId === undefined ? undefined : t.byId.get(node.parentId);
        if (!e.altKey && node !== undefined && page?.kind === "frame" && node.kind !== "letter" && frameAt(t, p.x, p.y, new Set([node._id]))?._id === page._id) {
          const from = cur.origin.get(node._id)!;
          const near = (t.kids.get(page._id) ?? []).filter((k) => k._id !== node._id && k.kind !== "tape").map((k) => ({ x: k.x, y: k.y, w: k.w, h: k.h }));
          const hit = snap({ x: from.x + dx, y: from.y + dy, w: node.w, h: node.h }, [{ x: 0, y: 0, w: page.w, h: page.h }, ...near], 8 / cameraRef.current.zoom);
          sx += hit.dx;
          sy += hit.dy;
          const o = worldRect(page, t.byId);
          if (hit.x !== undefined || hit.y !== undefined) guide = { x: hit.x === undefined ? undefined : o.x + hit.x, y: hit.y === undefined ? undefined : o.y + hit.y, page: o };
        }
        setGuides(guide);
        show(new Map(cur.ids.map((id) => [id, { x: cur.origin.get(id)!.x + sx, y: cur.origin.get(id)!.y + sy }])));
      } else if (cur.kind === "resize") {
        const next = resizeBox(cur.box, cur.handle, p.x - cur.start.x, p.y - cur.start.y, cur.ratio || e.shiftKey);
        show(new Map([[cur.id, { x: next.x, y: next.y, w: next.w, h: next.h }]]));
      } else {
        const node = t.byId.get(cur.id);
        if (node !== undefined) show(new Map([[cur.id, { rotation: turnTo(cur.center, p, e.shiftKey ? 15 : undefined) }]]));
      }
    };
    const onUp = (e: globalThis.PointerEvent) => {
      stop();
      const cur = gesture.current;
      gesture.current = null;
      if (cur === null) return;
      const p = worldAt(e.clientX, e.clientY);
      const t = treeRef.current;
      let updates: Array<{ id: NodeId } & Change> = [];
      if (cur.kind === "move" && cur.moved) {
        const dx = p.x - cur.start.x;
        const dy = p.y - cur.start.y;
        // Dropped on a frame, they join it; dropped on the desk, they leave. Letters and frames stay put.
        const target = frameAt(t, p.x, p.y, withDescendants(t, cur.ids));
        updates = cur.ids.flatMap((id) => {
          const node = t.byId.get(id);
          const from = cur.origin.get(id);
          if (node === undefined || from === undefined) return [];
          // Where it was last shown, which includes any snap.
          const shown = dragging.current.get(id);
          const x = round1(shown?.x ?? from.x + dx);
          const y = round1(shown?.y ?? from.y + dy);
          if (node.kind === "letter" || node.kind === "frame" || target?._id === node.parentId) return [{ id, x, y }];
          const o = originOf(node, t.byId);
          const into = target === undefined ? { x: 0, y: 0 } : worldRect(target, t.byId);
          return [{ id, x: round1(o.x + x - into.x), y: round1(o.y + y - into.y), parentId: target?._id ?? null, z: nextZ(t, target?._id) }];
        });
        // Frames keep a gap between them: one dropped on another is moved clear of it.
        const moved = new Set(updates.filter((u) => t.byId.get(u.id)?.kind === "frame").map((u) => u.id as string));
        if (moved.size > 0) {
          const others = frameBoxes(moved);
          updates = updates.map((u) => {
            const n = t.byId.get(u.id);
            return n?.kind !== "frame" || u.x === undefined || u.y === undefined ? u : { ...u, ...clearOf({ x: u.x, y: u.y, w: n.w, h: n.h }, others) };
          });
        }
      } else if (cur.kind !== "move") {
        const l = dragging.current.get(cur.id);
        if (l !== undefined) updates = [{ id: cur.id, ...roundChange(l) }];
      }
      // The edit shows at once as soon as it is sent, so what was dragged can let go.
      const saving = updates.length > 0 ? canvas.change(updates) : undefined;
      setGuides(undefined);
      show(new Map());
      saving?.catch(fail);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const roundChange = (c: Change): Change => ({
    ...c,
    ...(c.x !== undefined && { x: round1(c.x) }),
    ...(c.y !== undefined && { y: round1(c.y) }),
    ...(c.w !== undefined && { w: round1(c.w) }),
    ...(c.h !== undefined && { h: round1(c.h) }),
    ...(c.rotation !== undefined && { rotation: Math.round(normalize(c.rotation)) }),
  });

  const press = (e: PointerEvent) => {
    wrap.current?.focus({ preventScroll: true });
    if (!canEdit || at !== null || e.button !== 0) return;
    const chain = chainOf(e.target);
    if (chain.length === 0) return;
    e.stopPropagation();
    const id = pick(chain, tree.byId, scope);
    const node = id === undefined ? undefined : tree.byId.get(id);
    if (node === undefined) return;
    const parent = node.parentId === undefined ? undefined : tree.byId.get(node.parentId);
    setScope(parent?.kind === "ransom" ? parent._id : undefined);
    const already = selected.includes(node._id);
    const next = e.shiftKey ? (already ? selected.filter((s) => s !== node._id) : [...selected, node._id]) : already ? selected : [node._id];
    setSelected(next);
    if (e.shiftKey && already) return;
    const start = worldAt(e.clientX, e.clientY);
    listen({ kind: "move", ids: next, start, origin: new Map(next.flatMap((s) => { const n = tree.byId.get(s); return n === undefined ? [] : [[s, { x: n.x, y: n.y }] as const]; })), moved: false });
  };

  const doublePress = (e: React.MouseEvent) => {
    if (!canEdit || at !== null) return;
    const chain = chainOf(e.target);
    const id = pick(chain, tree.byId, scope);
    const node = id === undefined ? undefined : tree.byId.get(id);
    if (node === undefined) return;
    if (holdsLetters(node)) {
      setScope(node._id);
      setSelected([]);
    } else if (node.kind === "frame") zoomToFrame(node);
    else if (node.kind === "scrap") setFocusWords((n) => n + 1);
  };

  const beginResize = (handle: Handle, e: PointerEvent) => {
    const node = selectedNodes[0];
    if (node === undefined) return;
    listen({
      kind: "resize",
      id: node._id,
      handle,
      start: worldAt(e.clientX, e.clientY),
      box: { x: node.x, y: node.y, w: node.w, h: node.h, rotation: node.rotation },
      ratio: node.kind === "photo" || node.kind === "moment" || node.kind === "letter",
    });
  };

  const beginTurn = (e: PointerEvent) => {
    const node = selectedNodes[0];
    if (node === undefined) return;
    const r = worldRect(node, tree.byId);
    listen({ kind: "turn", id: node._id, center: { x: r.x + r.w / 2, y: r.y + r.h / 2 } });
    void e;
  };

  // ---- What you can do with a selection ---------------------------------------------

  const remove = () => {
    if (selected.length > 0) {
      canvas.remove(selected).catch(fail);
      setSelected([]);
    }
  };

  const duplicate = async () => {
    const specs = copiesOf(selected, tree);
    if (specs.length === 0) return;
    try {
      const ids = await canvas.add(specs);
      select(ids.filter((_, i) => typeof specs[i]!.parent !== "object"));
    } catch (e) {
      fail(e);
    }
  };

  const restack = (to: "front" | "back") => {
    const updates = selectedNodes.map((n) => {
      const siblings = tree.kids.get(n.parentId ?? "") ?? [];
      return { id: n._id, z: to === "front" ? nextZ(tree, n.parentId) : Math.min(0, ...siblings.map((s) => s.z)) - 1 };
    });
    canvas.change(updates).catch(fail);
  };

  const breakApart = async () => {
    const node = selectedNodes[0];
    const m = node?.momentId === undefined ? undefined : momentOf(node.momentId);
    if (node === undefined || m === undefined) return;
    try {
      const specs = piecesOfMoment(node, m);
      if (specs.length === 0) return toast.info("There's nothing in this moment to break apart.");
      const ids = await canvas.add(specs);
      await canvas.remove([node._id]);
      select(ids);
    } catch (e) {
      fail(e);
    }
  };

  const inFlow = (id: Node["_id"], action: "add" | "remove" | "earlier" | "later") => {
    const ordered = flow.map((f) => f._id);
    const i = ordered.indexOf(id);
    if (action === "add") canvas.change([{ id, order: ordered.length + 1 }]).catch(fail);
    else if (action === "remove") canvas.change([{ id, order: null }]).catch(fail);
    else {
      const j = action === "earlier" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= ordered.length) return;
      const next = [...ordered];
      [next[i], next[j]] = [next[j]!, next[i]!];
      canvas.change(next.map((fid, k) => ({ id: fid, order: k + 1 }))).catch(fail);
    }
  };

  const nudge = (dx: number, dy: number) => {
    const updates = selectedNodes.map((n) => ({ id: n._id, x: n.x + dx, y: n.y + dy }));
    if (updates.length > 0) canvas.change(updates).catch(fail);
  };

  // Frames given titles that fit what is on them. A name asked for is a step
  // to undo; one made in the background isn't.
  const askNames = useAction(api.ai.frames.name);
  const [naming, setNaming] = useState(false);
  const nameFrames = async (frames: Array<{ id: NodeId; momentIds: Array<Id<"moments">> }>, asked: boolean) => {
    const titles = await askNames({ eventId: event._id, frames });
    const updates = titles.map((t) => ({ id: t.id as NodeId, text: t.title }));
    if (updates.length > 0) await (asked ? canvas.change(updates) : canvas.settle(updates));
    return updates.length;
  };
  // Every frame that has moments on it, with them.
  const framesWithMoments = () =>
    (treeRef.current.kids.get("") ?? []).flatMap((f) => {
      if (f.kind !== "frame") return [];
      const momentIds = (treeRef.current.kids.get(f._id) ?? []).flatMap((k) => (k.kind === "moment" && k.momentId !== undefined ? [k.momentId] : []));
      return momentIds.length === 0 ? [] : [{ id: f._id, momentIds }];
    });
  const nameAll = async () => {
    setNaming(true);
    try {
      const n = await nameFrames(framesWithMoments(), true);
      toast.success(n === 0 ? "Nothing to name yet." : `Named ${n === 1 ? "a frame" : `${n} frames`}.`);
    } catch (e) {
      fail(e);
    } finally {
      setNaming(false);
    }
  };

  // The moments and photos on a frame, in reading order: what arranging moves.
  const arrangeable = (frame: Node | undefined) =>
    frame?.kind !== "frame" ? [] : (tree.kids.get(frame._id) ?? []).filter((k) => k.kind === "moment" || k.kind === "photo").sort((a, b) => a.y - b.y || a.x - b.x);

  // Lays a frame's moments and photos out again so none touch, keeping their order.
  const arrangeFrame = (mode: Arrangement) => {
    const frame = selectedNodes[0];
    const pieces = arrangeable(frame);
    if (frame === undefined || pieces.length === 0) return;
    const kids = tree.kids.get(frame._id) ?? [];
    const top = topMargin(kids.filter((k) => k.kind === "scrap" || k.kind === "ransom"), frame.h);
    const placed = arrange(pieces.map((p) => ({ id: p._id, w: p.w, h: p.h })), frame, top, mode, frame._id);
    canvas.change(placed.map((p) => ({ id: p.id as NodeId, x: p.x, y: p.y, w: p.w, h: p.h, rotation: p.rotation }))).catch(fail);
  };

  // Sets every frame in rows with a gap between, in the order they play.
  const tidyFrames = () => {
    const frames = (tree.kids.get("") ?? []).filter((n) => n.kind === "frame").sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.x - b.x || a.y - b.y);
    if (frames.length < 2) return;
    const all = union(frames.map((f) => worldRect(f, tree.byId)))!;
    const spots = packFrames(frames, { x: all.x, y: all.y });
    canvas.change(frames.map((f, i) => ({ id: f._id, x: spots[i]!.x, y: spots[i]!.y }))).then(() => void fly(everything(), 700)).catch(fail);
  };

  const keys = (e: KeyboardEvent) => {
    if (typing(e)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (at !== null) {
      if (e.key === "Escape") stopFlow();
      else if (e.key === "ArrowRight") setAt((a) => Math.min(flow.length - 1, (a ?? 0) + 1));
      else if (e.key === "ArrowLeft") setAt((a) => Math.max(-1, (a ?? 0) - 1));
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else return;
      setPlaying((p) => p && e.key === " ");
      return;
    }
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      void (e.shiftKey ? canvas.redo() : canvas.undo()).catch(fail);
    } else if (mod && e.key.toLowerCase() === "d" && canEdit) {
      e.preventDefault();
      void duplicate();
    } else if ((e.key === "Delete" || e.key === "Backspace") && canEdit && selected.length > 0) {
      e.preventDefault();
      remove();
    } else if (e.key === "Escape") {
      if (selected.length > 0) setSelected([]);
      else setScope(undefined);
    } else if (e.key.startsWith("Arrow") && canEdit && selected.length > 0) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      nudge(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
    } else if (canEdit && e.key === "]") restack("front");
    else if (canEdit && e.key === "[") restack("back");
    else if (e.key === "+" || e.key === "=") zoomBy(1.25);
    else if (e.key === "-") zoomBy(0.8);
    else if (e.key === "0") void fly(everything(), 600);
  };

  // ---- The page ----------------------------------------------------------------------

  const placed = useMemo(() => new Set(shown.flatMap((n) => (n.momentId === undefined ? [] : [n.momentId as string]))), [shown]);
  const flowPlace = selectedNodes[0]?.kind === "frame" ? (flow.findIndex((f) => f._id === selectedNodes[0]!._id) >= 0 ? flow.findIndex((f) => f._id === selectedNodes[0]!._id) : undefined) : undefined;
  const desk = at !== null && frameInFlow !== undefined ? frameLook(frameInFlow.look).surround : DESK.color;
  const editing = canEdit && at === null;
  const scoped = scope === undefined ? undefined : tree.byId.get(scope);
  const only = selectedNodes.length === 1 ? selectedNodes[0] : undefined;

  return (
    <div
      ref={wrap}
      tabIndex={0}
      onKeyDown={keys}
      aria-label="Collage canvas"
      className="paper-scope relative flex h-[calc(100svh-15rem)] min-h-[34rem] overflow-hidden rounded-xl border border-stone-300 bg-[#efe9dc] text-stone-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {editing && (
        <div className={trayOpen ? "absolute inset-y-0 left-0 z-20 flex" : "hidden md:flex"}>
          <Tray
            moments={moments ?? []}
            placedMoments={placed}
            onAdd={(item) => { void addPiece(item, spotsFor(item.what === "scrap" || item.what === "photo" || item.what === "moment" ? PIECE_SIZE[item.what] : undefined)[0]!); setTrayOpen(false); }}
            onTitle={(text) => void addTitle(text)}
            upload={
              <QuickAddButton event={event} size="sm" onMoment={(id) => { setArriving((list) => [...list, id]); setTrayOpen(false); }}>
                Add photos
              </QuickAddButton>
            }
          />
        </div>
      )}

      <div className="@container relative min-w-0 flex-1" onDragOver={(e) => canEdit && e.dataTransfer.types.includes(DRAG_TYPE) && (e.preventDefault(), (e.dataTransfer.dropEffect = "copy"))} onDrop={onDrop}>
        <Canvas
          camera={camera}
          onCamera={moveCamera}
          onView={setView}
          boxRef={box}
          desk={desk}
          className="size-full cursor-default"
          onDeskDown={() => {
            wrap.current?.focus({ preventScroll: true });
            if (editing) {
              setSelected([]);
              setScope(undefined);
            }
          }}
        >
          <div className="contents" onPointerDown={press} onDoubleClick={doublePress}>
            <NodeTree tree={tree} moments={momentById} />
          </div>
          {guides?.x !== undefined && (
            <div aria-hidden className="pointer-events-none absolute bg-[#2f6df6]" style={{ left: guides.x, top: guides.page.y, width: "calc(1px / var(--zoom))", height: guides.page.h }} />
          )}
          {guides?.y !== undefined && (
            <div aria-hidden className="pointer-events-none absolute bg-[#2f6df6]" style={{ left: guides.page.x, top: guides.y, width: guides.page.w, height: "calc(1px / var(--zoom))" }} />
          )}
          {editing && scoped !== undefined && <Outline node={scoped} tree={tree} dashed />}
          {editing && selectedNodes.length > 1 && selectedNodes.map((n) => <Outline key={n._id} node={n} tree={tree} />)}
          {editing && only !== undefined && (
            <TransformBox
              box={{ ...worldRect(only, tree.byId), rotation: only.rotation }}
              resizable={only.kind !== "ransom"}
              turnable={TURNS.has(only.kind)}
              onHandle={beginResize}
              onTurn={beginTurn}
            />
          )}
        </Canvas>

        {/* A canvas with nothing on it yet. */}
        {canvas.ready && canvas.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
            <div className="pointer-events-auto max-w-sm rounded-2xl border border-stone-300 bg-[#fbf7ec]/95 p-5 text-center text-stone-900 shadow-lg">
              <div className="text-2xl" style={{ fontFamily: "var(--font-hand)" }}>{canEdit ? "Start a collage" : "No collage yet"}</div>
              <p className="mt-1 text-sm text-stone-600">
                {canEdit
                  ? "Add a frame, then drop your moments and photos on it. Tape things down, cut a title from letters, and write on scraps."
                  : "The person who made this experience hasn't put a collage together yet."}
              </p>
              {canEdit && (
                <Button className="mt-3" onClick={() => void addFrame({ what: "frame", size: "poster", look: "peach" })}>
                  <PlusIcon aria-hidden /> Add a frame
                </Button>
              )}
            </div>
          </div>
        )}

        {editing && (
          <Inspector
            nodes={selectedNodes}
            flow={{ place: flowPlace, count: flow.length }}
            focusWords={focusWords}
            onChange={(updates) => canvas.change(updates).catch(fail)}
            onRemove={remove}
            onDuplicate={() => void duplicate()}
            onRestack={restack}
            onBreakApart={() => void breakApart()}
            onFlow={inFlow}
            onZoomTo={(id) => { const n = tree.byId.get(id); if (n !== undefined) zoomToFrame(n); }}
            arrangeable={arrangeable(selectedNodes[0]).length}
            onArrange={arrangeFrame}
          />
        )}

        {/* The corner controls. */}
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-xl border border-stone-300 bg-[#f6f1e6]/95 p-1 shadow-md backdrop-blur">
          {editing && (
            <>
              <Button size="icon-sm" variant="ghost" aria-label="Undo" title="Undo (⌘Z)" disabled={!canvas.canUndo} onClick={() => void canvas.undo().catch(fail)}><Undo2Icon aria-hidden /></Button>
              <Button size="icon-sm" variant="ghost" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!canvas.canRedo} onClick={() => void canvas.redo().catch(fail)}><Redo2Icon aria-hidden /></Button>
              <span aria-hidden className="mx-0.5 h-5 w-px bg-stone-300" />
              <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setTrayOpen((o) => !o)}>{trayOpen ? "Close" : "Add"}</Button>
            </>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(0.8)}><MinusIcon aria-hidden /></Button>
          <span className="w-10 text-center font-mono text-xs tabular-nums" aria-label="Zoom">{Math.round(camera.zoom * 100)}%</span>
          <Button size="icon-sm" variant="ghost" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.25)}><PlusIcon aria-hidden /></Button>
          {editing && (
            <Button size="icon-sm" variant="ghost" aria-label="Space the frames out" title="Space the frames out" disabled={(tree.kids.get("") ?? []).filter((n) => n.kind === "frame").length < 2} onClick={tidyFrames}><LayoutGridIcon aria-hidden /></Button>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="See everything" title="See everything (0)" onClick={() => void fly(everything(), 600)}><MaximizeIcon aria-hidden /></Button>
        </div>

        {canEdit && <CanvasAsk event={event} canName={framesWithMoments().length > 0} naming={naming} onName={() => void nameAll()} />}

        {/* The flow: play the frames in order, zooming from one to the next. */}
        <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-stone-300 bg-[#f6f1e6]/95 p-1 shadow-md backdrop-blur md:top-auto md:right-3 md:bottom-3 md:left-auto md:translate-x-0">
          {at === null ? (
            <Button size="sm" variant="ghost" disabled={flow.length === 0} title={flow.length === 0 ? "Put frames in the flow to play them" : "Play the flow"} onClick={startFlow}>
              <PlayIcon aria-hidden /> Play{flow.length > 0 ? ` · ${flow.length}` : ""}
            </Button>
          ) : (
            <>
              <Button size="icon-sm" variant="ghost" aria-label="Back" onClick={() => { setPlaying(false); setAt((a) => Math.max(-1, (a ?? 0) - 1)); }}><SkipBackIcon aria-hidden /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>{playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}</Button>
              <Button size="icon-sm" variant="ghost" aria-label="Next" disabled={at >= flow.length - 1} onClick={() => { setPlaying(false); setAt((a) => Math.min(flow.length - 1, (a ?? 0) + 1)); }}><SkipForwardIcon aria-hidden /></Button>
              <span className="mx-1 min-w-24 text-center text-xs" role="status">
                {frameInFlow === undefined ? "Everything" : `${at + 1} of ${flow.length} · ${frameInFlow.text ?? "Frame"}`}
              </span>
              <Button size="icon-sm" variant="ghost" aria-label="Leave the flow" onClick={stopFlow}><XIcon aria-hidden /></Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// A box round a thing, to show where you are or what is selected with others.
function Outline({ node, tree, dashed = false }: { node: Node; tree: ReturnType<typeof indexNodes>; dashed?: boolean }) {
  const r = worldRect(node, tree.byId);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: r.x,
        top: r.y,
        width: r.w,
        height: r.h,
        transform: node.rotation === 0 ? undefined : `rotate(${node.rotation}deg)`,
        outline: `calc(1.5px / var(--zoom)) ${dashed ? "dashed" : "solid"} #2f6df6`,
        outlineOffset: dashed ? "calc(4px / var(--zoom))" : 0,
      }}
    />
  );
}

