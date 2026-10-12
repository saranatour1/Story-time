import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { JournalElement } from "../../../convex/lib/journal";
import { errorMessage } from "@/lib/errors";

type PageId = Id<"journalPages">;
type Step = { pageId: PageId; before: { paper: string; elements: JournalElement[] }; after: { paper: string; elements: JournalElement[] } };

// The journal of an experience and every change to it. A change shows at once
// (an optimistic update) and is saved in the background; undo and redo replay
// a page as it was. Pages for new moments are cut on the server; `pending`
// stays above zero until they arrive, or until the book is full.
export function useJournal(eventId: Id<"events">, index: number) {
  const data = useQuery(api.journal.outline, { eventId });
  const openId = data === undefined ? undefined : data.pages[Math.min(index, Math.max(0, data.pages.length - 1))]?._id;
  const open = useQuery(api.journal.page, openId ? { pageId: openId } : "skip");
  const savePage = useMutation(api.journal.savePage).withOptimisticUpdate((store, args) => {
    const now = store.getQuery(api.journal.page, { pageId: args.pageId });
    if (now === undefined || now === null) return;
    store.setQuery(api.journal.page, { pageId: args.pageId }, {
      ...now,
      paper: args.paper ?? now.paper,
      elements: args.elements.map((e) => ({ ...e, text: e.text })),
    });
  });
  const removePage = useMutation(api.journal.removePage).withOptimisticUpdate((store, args) => {
    const now = store.getQuery(api.journal.outline, { eventId });
    if (now !== undefined) store.setQuery(api.journal.outline, { eventId }, { ...now, pages: now.pages.filter((p) => p._id !== args.pageId) });
  });
  const addPage = useMutation(api.journal.addPage);
  const movePage = useMutation(api.journal.movePage);
  const setLock = useMutation(api.journal.setLock);
  const importPages = useMutation(api.journal.importPages);
  const refresh = useMutation(api.journal.refresh);
  const fill = useMutation(api.journal.fill);

  const fail = useCallback((e: unknown) => toast.error(errorMessage(e)), []);

  // An untouched page follows its moment the next time the book is open.
  // A page the owner has saved waits for "Update this page".
  const asked = useRef("");
  useEffect(() => {
    if (!data?.canEdit || data.locked) return;
    const ids = data.pages
      .filter((p) => p.stale && !p.edited && !p.gone)
      .map((p) => p._id)
      .join(" ");
    if (ids === "" || asked.current === ids) return;
    asked.current = ids;
    void refresh({ eventId }).catch(fail);
  }, [data, eventId, refresh, fail]);

  // Moments saved before paging ran still owe a page. Opening the book cuts
  // them; a full book is asked once, so it doesn't keep trying.
  const owed = useRef("");
  useEffect(() => {
    if (!data?.canEdit || data.locked || data.pending === 0) return;
    const key = `${eventId}:${data.pending}`;
    if (owed.current === key) return;
    owed.current = key;
    void fill({ eventId }).catch(fail);
  }, [data, eventId, fill, fail]);

  const openRef = useRef(open);
  openRef.current = open;

  const past = useRef<Step[]>([]);
  const future = useRef<Step[]>([]);
  const [, bump] = useState(0);

  // Writes a page, remembering how it was so it can be undone.
  const write = useCallback(
    (pageId: PageId, next: { paper?: string; elements: JournalElement[] }, record = true) => {
      const page = openRef.current;
      if (page === undefined || page === null || page._id !== pageId) return;
      if (record) {
        past.current.push({ pageId, before: { paper: page.paper, elements: page.elements }, after: { paper: next.paper ?? page.paper, elements: next.elements } });
        if (past.current.length > 100) past.current.shift();
        future.current = [];
        bump((n) => n + 1);
      }
      savePage({ pageId, paper: next.paper, elements: next.elements.map(asArg) }).catch(fail);
    },
    [savePage, fail],
  );

  const undo = useCallback(() => {
    const step = past.current.pop();
    if (step === undefined) return;
    future.current.push(step);
    bump((n) => n + 1);
    savePage({ pageId: step.pageId, paper: step.before.paper, elements: step.before.elements.map(asArg) }).catch(fail);
  }, [savePage, fail]);
  const redo = useCallback(() => {
    const step = future.current.pop();
    if (step === undefined) return;
    past.current.push(step);
    bump((n) => n + 1);
    savePage({ pageId: step.pageId, paper: step.after.paper, elements: step.after.elements.map(asArg) }).catch(fail);
  }, [savePage, fail]);

  return {
    ready: data !== undefined,
    pending: data?.pending ?? 0,
    canEdit: (data?.canEdit ?? false) && !(data?.locked ?? false),
    owner: data?.canEdit ?? false,
    locked: data?.locked ?? false,
    filling: (data?.pending ?? 0) > 0 && (data?.canEdit ?? false),
    pages: data?.pages ?? [],
    open: open === undefined || open === null ? undefined : open,
    write,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    addPage: (after?: PageId, paper?: string, elements?: JournalElement[]) =>
      addPage({ eventId, after, paper, elements: elements?.map(asArg) }).catch((e: unknown) => (fail(e), undefined)),
    removePage: (pageId: PageId) => removePage({ pageId }).catch(fail),
    movePage: (pageId: PageId, before: PageId | null) => movePage({ pageId, before }).catch(fail),
    lockPage: (pageId: PageId, locked: boolean) => setLock({ eventId, pageId, locked }).catch(fail),
    lockJournal: (locked: boolean) => setLock({ eventId, locked }).catch(fail),
    importPages: (list: Array<{ paper: string; elements: JournalElement[] }>) =>
      importPages({ eventId, pages: list.map((p) => ({ paper: p.paper, elements: p.elements.map(asArg) })) }),
    refreshPage: (pageId: PageId) => refresh({ eventId, pageId }).catch(fail),
  };
}

// An element as the server takes it: ids typed as the tables'.
export function asArg(e: JournalElement) {
  return { ...e, mediaId: e.mediaId as Id<"media"> | undefined, momentId: e.momentId as Id<"moments"> | undefined };
}

export type Journal = ReturnType<typeof useJournal>;
