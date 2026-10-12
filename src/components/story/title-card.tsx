import { useEffect, useState } from "react";
import type { StoryEvent, StoryMoment } from "@/components/event/types";
import { formatDay } from "../../lib/local-time";
import { stopsOf } from "../../lib/story-steps";

// A time to read as a day: a moment's carries the zone it happened in.
type When = { at: number; offset?: number };
const day = ({ at, offset }: When) => formatDay(at, offset, { month: "short", day: "numeric", year: "numeric" });

// The date range: what the owner set, or the span of the moments. The owner's
// dates have no zone; each moment's day reads in the zone it happened in.
export const dateRange = (event: StoryEvent, moments: StoryMoment[]): string | null => {
  const sorted = [...moments].sort((a, b) => a.startsAt - b.startsAt);
  const mark = (m: StoryMoment | undefined) => m && { at: m.startsAt, offset: m.tzOffsetMinutes };
  const from = event.startsAt !== undefined ? { at: event.startsAt } : mark(sorted[0]);
  const to = event.endsAt !== undefined ? { at: event.endsAt } : mark(sorted.at(-1));
  if (from === undefined) return null;
  if (to === undefined || day(to) === day(from)) return day(from);
  return `${day(from)} – ${day(to)}`;
};

export const countStops = (moments: StoryMoment[]) => {
  return moments.reduce((n, m) => n + stopsOf(m).length, 0);
};

const TYPEWRITER = { fontFamily: '"Courier New", Courier, monospace' };
const CHAR_MS = 35;
// Long descriptions type faster, so the page never takes longer than this.
const MAX_TYPING_MS = 4000;
// A carriage return's pause between lines, in characters.
const LINE_GAP = 8;

// The page's lines, in typing order: date, title, description, counts.
const titleLines = (event: StoryEvent, moments: StoryMoment[]): string[] => {
  const stops = countStops(moments);
  const counts =
    moments.length === 0
      ? "There are no moments to show yet."
      : `${moments.length} ${moments.length === 1 ? "moment" : "moments"}` +
        (stops > moments.length ? ` · ${stops} stops` : "");
  return [dateRange(event, moments) ?? "", event.title, event.description ?? "", counts];
};

// Where each line starts typing, and the typing's length, in characters.
const timeline = (lines: string[]) => {
  const starts: number[] = [];
  let total = 0;
  for (const line of lines) {
    starts.push(total);
    if (line) total += line.length + LINE_GAP;
  }
  return { starts, total, charMs: Math.min(CHAR_MS, MAX_TYPING_MS / Math.max(total, 1)) };
};

// How long the title page takes to type out, for autoplay.
export const typingMs = (event: StoryEvent, moments: StoryMoment[]): number => {
  const { total, charMs } = timeline(titleLines(event, moments));
  return total * charMs;
};

// The opening page, typed out line by line like a typewriter on paper.
export const TitleCard = ({
  event,
  moments,
  animate,
}: {
  event: StoryEvent;
  moments: StoryMoment[];
  animate: boolean;
}) => {
  const lines = titleLines(event, moments);
  const { starts, total, charMs } = timeline(lines);
  const [typed, setTyped] = useState(animate ? 0 : total);

  useEffect(() => {
    if (!animate) return;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const n = Math.floor((now - t0) / charMs);
      setTyped(n);
      if (n < total) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [animate, charMs, total]);

  // The caret sits on the line being typed, then rests at the end of the last.
  let caretLine = 0;
  lines.forEach((l, i) => {
    if (l && (starts[i] ?? 0) <= typed) caretLine = i;
  });
  const line = (i: number) => (
    <Typed text={lines[i] ?? ""} shown={typed - (starts[i] ?? 0)} caret={i === caretLine} />
  );

  return (
    <section aria-label="Title" className="flex flex-1 items-center justify-center px-6 py-10 sm:px-12 lg:px-20">
      {/* The page is the screen: paper from edge to edge, a little darker at
          its edges like a sheet under a lamp. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[#f3e9d6] bg-[radial-gradient(ellipse_at_50%_42%,transparent_50%,rgb(91_74_58/0.18)_100%)]"
      />
      <div
        style={TYPEWRITER}
        className="relative w-full max-w-5xl text-stone-900 [text-shadow:0_0_1px_rgb(28_25_23/0.35)]"
      >
        {lines[0] && <p className="text-sm tracking-wide text-stone-600 sm:text-base">{line(0)}</p>}
        <h1 className="mt-6 text-[clamp(2.25rem,6.5vw,5.75rem)] leading-[1.04] font-bold tracking-tight text-balance sm:mt-10">
          {line(1)}
        </h1>
        {lines[2] && (
          <p className="mt-6 max-w-[62ch] text-base leading-relaxed whitespace-pre-wrap sm:mt-10 sm:text-xl sm:leading-relaxed">
            {line(2)}
          </p>
        )}
        <p className="mt-8 text-sm text-stone-600 sm:mt-14 sm:text-base">{line(3)}</p>
      </div>
    </section>
  );
};

// Text typed up to `shown` characters. The untyped rest keeps its place, so
// the page doesn't reflow as it types; screen readers get the whole text.
const Typed = ({ text, shown, caret }: { text: string; shown: number; caret: boolean }) => {
  const n = Math.max(0, Math.min(text.length, shown));
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, n)}
        {caret && (
          <span className="relative">
            <span className="absolute left-0 animate-pulse">_</span>
          </span>
        )}
        <span className="invisible">{text.slice(n)}</span>
      </span>
    </>
  );
};
