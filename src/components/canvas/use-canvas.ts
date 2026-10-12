import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { History } from "@/lib/canvas/history";
import { indexNodes, type Change, type Node, withChange, withDescendants } from "@/lib/canvas/model";
import { type NewNode, snapshotOf } from "@/lib/canvas/make";

type NodeId = Id<"canvasNodes">;
export type Update = { id: NodeId } & Change;

// The canvas of an experience and every edit to it, one thing at a time. Edits
// show at once, are saved in the background, and can be undone and redone.
export function useCanvas(eventId: Id<"events">) {
  const data = useQuery(api.canvas.get, { eventId });
  const ensure = useMutation(api.canvas.ensure);
  const addNodes = useMutation(api.canvas.add);
  const patchNodes = useMutation(api.canvas.patch).withOptimisticUpdate((store, args) => {
    const now = store.getQuery(api.canvas.get, { eventId });
    if (now === undefined) return;
    const by = new Map<string, Update>(args.updates.map((u) => [u.id, u]));
    store.setQuery(api.canvas.get, { eventId }, { ...now, nodes: now.nodes.map((n) => { const u = by.get(n._id); return u === undefined ? n : withChange(n, u); }) });
  });
  const removeNodes = useMutation(api.canvas.remove).withOptimisticUpdate((store, args) => {
    const now = store.getQuery(api.canvas.get, { eventId });
    if (now === undefined) return;
    const gone = withDescendants(indexNodes(now.nodes), args.ids);
    store.setQuery(api.canvas.get, { eventId }, { ...now, nodes: now.nodes.filter((n) => !gone.has(n._id)) });
  });

  const nodes: Node[] = useMemo(() => data?.nodes ?? [], [data]);
  const tree = useMemo(() => indexNodes(nodes), [nodes]);
  // The latest tree, for steps that run later.
  const latest = useRef(tree);
  latest.current = tree;

  // Things put back after a removal get new ids; later steps find them here.
  const aliases = useRef(new Map<NodeId, NodeId>());
  const now = useCallback((id: NodeId): NodeId => aliases.current.get(id) ?? id, []);
  const history = useRef(new History());
  const [, bump] = useState(0);
  const record = (step: Parameters<History["push"]>[0]) => {
    history.current.push(step);
    bump((n) => n + 1);
  };

  const canvasId = useRef(data?.canvasId ?? null);
  canvasId.current = data?.canvasId ?? canvasId.current;
  const canvas = useCallback(async () => canvasId.current ?? (canvasId.current = await ensure({ eventId })), [ensure, eventId]);

  // New things. Parents that were re-made since are followed to where they are now.
  const put = useCallback(
    async (specs: NewNode[], filled?: number): Promise<NodeId[]> => {
      const fresh = specs.map((s) => (typeof s.parent === "string" ? { ...s, parent: now(s.parent) } : s));
      return addNodes({ canvasId: await canvas(), nodes: fresh, filled });
    },
    [addNodes, canvas, now],
  );

  const add = useCallback(
    async (specs: NewNode[]): Promise<NodeId[]> => {
      const first = await put(specs);
      record({
        undo: async () => void (await removeNodes({ ids: first.map(now) })),
        redo: async () => {
          const again = await put(specs);
          first.forEach((old, i) => aliases.current.set(old, again[i]!));
        },
      });
      return first;
    },
    [put, removeNodes, now],
  );

  // The pages made for new moments. Not something to undo: it is how the canvas
  // starts, and `upTo` marks those moments as done so they aren't made again.
  const fill = useCallback((specs: NewNode[], upTo: number) => put(specs, upTo), [put]);

  // Moves, sizes, restyles or rewrites things. Undoing puts back what was there.
  const change = useCallback(
    async (updates: Update[]) => {
      if (updates.length === 0) return;
      const before: Update[] = updates.map(({ id, ...c }) => {
        const node = latest.current.byId.get(id);
        const was: Change = {};
        if (node !== undefined) {
          if (c.x !== undefined) was.x = node.x;
          if (c.y !== undefined) was.y = node.y;
          if (c.w !== undefined) was.w = node.w;
          if (c.h !== undefined) was.h = node.h;
          if (c.rotation !== undefined) was.rotation = node.rotation;
          if (c.z !== undefined) was.z = node.z;
          if (c.text !== undefined) was.text = node.text ?? "";
          if (c.look !== undefined && node.look !== undefined) was.look = node.look;
          if (c.parentId !== undefined) was.parentId = node.parentId ?? null;
          if (c.order !== undefined) was.order = node.order ?? null;
        }
        return { id, ...was };
      });
      await patchNodes({ updates });
      const send = (list: Update[]) => patchNodes({ updates: list.map((u) => ({ ...u, id: now(u.id) })) }).then(() => undefined);
      record({ undo: () => send(before), redo: () => send(updates) });
    },
    [patchNodes, now],
  );

  // A change made for you in the background, like a name: shown and saved, but
  // not a step to undo.
  const settle = useCallback((updates: Update[]) => patchNodes({ updates: updates.map((u) => ({ ...u, id: now(u.id) })) }).then(() => undefined), [patchNodes, now]);

  // Takes things off, with what's inside them. Undoing puts them all back.
  const remove = useCallback(
    async (ids: NodeId[]) => {
      const snap = snapshotOf(ids, latest.current);
      if (snap.ids.length === 0) return;
      await removeNodes({ ids });
      record({
        undo: async () => {
          const again = await put(snap.specs);
          snap.ids.forEach((old, i) => aliases.current.set(old, again[i]!));
        },
        redo: async () => void (await removeNodes({ ids: snap.ids.map(now) })),
      });
    },
    [removeNodes, put, now],
  );

  const undo = useCallback(async () => {
    const did = await history.current.undo();
    bump((n) => n + 1);
    return did;
  }, []);
  const redo = useCallback(async () => {
    const did = await history.current.redo();
    bump((n) => n + 1);
    return did;
  }, []);

  return {
    ready: data !== undefined,
    canEdit: data?.canEdit ?? false,
    nodes,
    tree,
    pending: data?.pending ?? null,
    add,
    fill,
    settle,
    change,
    remove,
    undo,
    redo,
    canUndo: history.current.canUndo,
    canRedo: history.current.canRedo,
  };
}
