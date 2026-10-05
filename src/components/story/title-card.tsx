import { useEffect, useState } from "react";
import type { EventView, MomentView } from "@/components/event/types";
import { stopsOf } from "@/lib/story-steps";

const day = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// The date range: what the owner set, or the span of the moments.
export function dateRange(event: EventView, moments: MomentView[]): string | null {
  const times = moments.map((m) => m.startsAt);
  const from = event.startsAt ?? (times.length ? Math.min(...times) : undefined);
  const to = event.endsAt ?? (times.length ? Math.max(...times) : undefined);
  if (from === undefined) return null;
  if (to === undefined || day(to) === day(from)) return day(from);
  return `${day(from)} – ${day(to)}`;
}

export function countStops(moments: MomentView[]) {
  return moments.reduce((n, m) => n + stopsOf(m).length, 0);
}

const TYPEWRITER = { fontFamily: '"Courier New", Courier, monospace' };
const CHAR_MS = 35;
// Long descriptions type faster, so the page never takes longer than this.
const MAX_TYPING_MS = 4000;
// A carriage return's pause between lines, in characters.
const LINE_GAP = 8;

// The page's lines, in typing order: date, title, description, counts.
function titleLines(event: EventView, moments: MomentView[]): string[] {
  const stops = countStops(moments);
  const counts =
    moments.length === 0
      ? "There are no moments to show yet."
      : `${moments.length} ${moments.length === 1 ? "moment" : "moments"}` +
        (stops > moments.length ? ` · ${stops} stops` : "");
  return [dateRange(event, moments) ?? "", event.title, event.description ?? "", counts];
}

// Where each line starts typing, and the typing's length, in characters.
function timeline(lines: string[]) {
  const starts: number[] = [];
  let total = 0;
  for (const line of lines) {
    starts.push(total);
    if (line) total += line.length + LINE_GAP;
  }
  return { starts, total, charMs: Math.min(CHAR_MS, MAX_TYPING_MS / Math.max(total, 1)) };
}

// How long the title page takes to type out, for autoplay.
export function typingMs(event: EventView, moments: MomentView[]): number {
  const { total, charMs } = timeline(titleLines(event, moments));
  return total * charMs;
}

// The opening page, typed out line by line like a typewriter on paper.
export function TitleCard({
  event,
  moments,
  animate,
}: {
  event: EventView;
  moments: MomentView[];
  animate: boolean;
}) {
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
    <section aria-label="Title" className="flex flex-1 items-center justify-center px-4 py-6">
      <div
        style={TYPEWRITER}
        className="w-full max-w-2xl -rotate-[0.4deg] bg-[#f3e9d6] px-8 py-10 text-stone-900 shadow-2xl [text-shadow:0_0_1px_rgb(28_25_23/0.4)] sm:px-14 sm:py-16"
      >
        {lines[0] && <p className="text-sm text-stone-600">{line(0)}</p>}
        <h1 className="mt-6 text-3xl leading-tight font-bold text-balance sm:text-4xl">{line(1)}</h1>
        {lines[2] && <p className="mt-6 text-base leading-relaxed whitespace-pre-wrap">{line(2)}</p>}
        <p className="mt-8 text-sm text-stone-600">{line(3)}</p>
      </div>
    </section>
  );
}

// Text typed up to `shown` characters. The untyped rest keeps its place, so
// the page doesn't reflow as it types; screen readers get the whole text.
function Typed({ text, shown, caret }: { text: string; shown: number; caret: boolean }) {
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
}
