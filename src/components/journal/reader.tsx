import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { queries } from "@/lib/queries";
import type { Id } from "../../../convex/_generated/dataModel";
import { PAGE } from "../../../convex/lib/journal";
import type { StoryMoment } from "@/components/event/types";
import { Button } from "@/components/ui/button";
import { firstNote, noteWasCut } from "./play";
import { FONTS } from "./look";
import { JournalPage } from "./page";

const SpreadPage = ({
  pageId,
  moments,
  scale,
  token,
  eventId,
}: {
  pageId: string;
  moments: ReadonlyMap<string, StoryMoment>;
  scale: number;
  token?: string;
  eventId?: string;
}) => {
  const { data: member } = useQuery(queries.journal.page(token ? "skip" : { pageId: pageId as Id<"journalPages"> }));
  const { data: shared } = useQuery(queries.share.page(token ? { token, pageId: pageId as Id<"journalPages"> } : "skip"));
  const page = token ? shared : member;
  if (page === undefined || page === null) {
    return <div className="animate-pulse bg-[#efe6d2]" style={{ width: PAGE.w * scale, height: PAGE.h * scale }} />;
  }
  const moment = page.momentId === undefined ? undefined : moments.get(page.momentId);
  const cut = noteWasCut(page.elements.find((element) => element.kind === "note")?.text, firstNote(moment));
  return (
    <div className="flex flex-col items-center gap-2">
      <JournalPage page={page} moments={moments} scale={scale} reading />
      <PageNotice page={page} />
      {cut && eventId !== undefined && page.momentId !== undefined && (
        <Link
          to="/e/$id/story"
          params={{ id: eventId }}
          search={{ momentId: page.momentId, mode: "words" }}
          className="text-stone-700 underline"
          style={{ fontFamily: FONTS.hand, fontSize: 22 }}
        >
          Read the moment
        </Link>
      )}
    </div>
  );
};

// A page that no longer matches its moment. The words only; the button lives
// in make mode, where the owner can ask.
const PageNotice = ({ page }: { page: { gone: boolean; stale: boolean } }) => {
  const line = page.gone ? "This moment was taken out of the trip." : page.stale ? "The moment changed." : null;
  if (line === null) return null;
  return (
    <p className="max-w-sm text-center text-stone-700" style={{ fontFamily: FONTS.hand, fontSize: 22 }}>
      {line}
    </p>
  );
};

// Reading the journal like a book: the cover alone, then two pages at a time
// (one on a phone), turned with the arrows, the keyboard or a swipe.
export const Reader = ({
  pages,
  moments,
  size,
  start,
  onPage,
  token,
  eventId,
}: {
  pages: Array<{ _id: string }>;
  moments: ReadonlyMap<string, StoryMoment>;
  size: { w: number; h: number };
  start: number;
  onPage: (index: number) => void;
  // Set on a share link, which has no signed-in reader.
  token?: string;
  // Set when Play can offer the full note of a clipped page.
  eventId?: string;
}) => {
  const pair = size.w >= 900;
  // Spreads: the cover alone, then pages side by side.
  const spreads = pair ? [[0], ...Array.from({ length: Math.ceil((pages.length - 1) / 2) }, (_, i) => [1 + i * 2, 2 + i * 2].filter((n) => n < pages.length))] : pages.map((_, i) => [i]);
  const spreadOf = (page: number) => Math.max(0, spreads.findIndex((s) => s.includes(page)));
  const [at, setAt] = useState(() => spreadOf(start));
  const [turn, setTurn] = useState<"next" | "back">("next");
  const go = (step: number) => {
    const next = Math.max(0, Math.min(spreads.length - 1, at + step));
    if (next === at) return;
    setTurn(step > 0 ? "next" : "back");
    setAt(next);
    onPage(spreads[next]![0]!);
  };
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  });

  const shown = spreads[at] ?? [];
  const scale = Math.min((size.h - 70) / PAGE.h, (size.w - 120) / (PAGE.w * (pair ? 2 : 1)));
  let swipe = 0;
  return (
    <div
      className="flex size-full flex-col items-center justify-center gap-3"
      onPointerDown={(e) => (swipe = e.clientX)}
      onPointerUp={(e) => {
        if (Math.abs(e.clientX - swipe) > 60) go(e.clientX < swipe ? 1 : -1);
      }}
    >
      <div className="flex items-center gap-4">
        <Button size="icon" variant="ghost" aria-label="Turn back" disabled={at === 0} onClick={() => go(-1)}>
          <ChevronLeftIcon />
        </Button>
        <div
          key={at}
          className="flex shadow-[0_20px_50px_rgba(40,28,10,.35)]"
          style={{ animation: `${turn === "next" ? "journal-turn-in" : "journal-turn-back"} 420ms ease-out`, transformOrigin: turn === "next" ? "left center" : "right center", perspective: 1600 }}
        >
          {pair && shown.length === 1 && at > 0 && <div style={{ width: PAGE.w * scale, height: PAGE.h * scale }} className="bg-[#efe6d2]" />}
          {shown.map((i, k) => (
            <div key={pages[i]!._id} className="relative">
              <SpreadPage pageId={pages[i]!._id} moments={moments} scale={scale} token={token} eventId={eventId} />
              {/* The fold down the middle of a spread. */}
              {pair && shown.length === 2 && (
                <div aria-hidden className="pointer-events-none absolute inset-y-0 w-10" style={{ [k === 0 ? "right" : "left"]: 0, background: `linear-gradient(${k === 0 ? "to left" : "to right"}, rgba(60,40,15,.28), transparent)` }} />
              )}
            </div>
          ))}
        </div>
        <Button size="icon" variant="ghost" aria-label="Turn the page" disabled={at === spreads.length - 1} onClick={() => go(1)}>
          <ChevronRightIcon />
        </Button>
      </div>
      <p className="text-stone-600" style={{ fontFamily: FONTS.hand, fontSize: 22 }}>
        {shown.map((i) => (i === 0 ? "Cover" : `Page ${i}`)).join(" & ")} · {pages.length - 1} pages
      </p>
    </div>
  );
};
