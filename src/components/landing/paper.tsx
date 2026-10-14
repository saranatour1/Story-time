import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Story mode's typewriter and colours. The paper stays cream in both
// themes, as it does in story mode.
export const TYPEWRITER = { fontFamily: '"Courier New", Courier, monospace' };
export const INK = "#5b4a3a";
export const RUST = "#c2410c";
export const PAPER = "#f3e9d6";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Read once: a page that starts still stays still.
export const useReducedMotion = () => {
  const [reduced] = useState(prefersReducedMotion);
  return reduced;
};

// True once the element has scrolled into view, so a frame's motion starts
// where someone can see it.
export const useInView = <T extends Element>() => {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);
  return [ref, inView] as const;
};

// The sample experience every frame on the page shows.
export const SAMPLE = {
  dates: "May 2, 2026 – May 9, 2026",
  title: "A week in Portugal",
  description:
    "Inês and Tom got married in Porto. Most of us stayed on for a few slow days in Lisbon.",
  counts: "14 moments · 23 stops",
};

// Typing timing, as story mode's title page does it.
const CHAR_MS = 35;
const LINE_GAP = 8;

// Story mode's title page: dates, title, a line about it and the counts,
// typed out on paper when `animate` is on.
export const TitlePage = ({
  animate,
  size,
  className,
}: {
  animate: boolean;
  size: "sm" | "lg";
  className?: string;
}) => {
  const lines = [SAMPLE.dates, SAMPLE.title, SAMPLE.description, SAMPLE.counts];
  const starts: number[] = [];
  let total = 0;
  for (const line of lines) {
    starts.push(total);
    total += line.length + LINE_GAP;
  }
  const [typed, setTyped] = useState(animate ? 0 : total);

  useEffect(() => {
    if (!animate) return;
    const t0 = performance.now() + 300;
    let raf = requestAnimationFrame(function tick(now) {
      const n = Math.max(0, Math.floor((now - t0) / CHAR_MS));
      setTyped(n);
      if (n < total) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [animate, total]);

  // The caret shows only while typing, on the line being typed.
  let caret = -1;
  for (let i = 0; i < lines.length && typed < total; i++) {
    if ((starts[i] ?? 0) <= typed) caret = i;
  }
  const line = (i: number) => {
    const text = lines[i] ?? "";
    const n = Math.max(0, Math.min(text.length, typed - (starts[i] ?? 0)));
    return (
      <>
        {text.slice(0, n)}
        {caret === i && (
          <span className="relative">
            <span className="absolute left-0">_</span>
          </span>
        )}
        <span className="invisible">{text.slice(n)}</span>
      </>
    );
  };
  const lg = size === "lg";

  return (
    <div
      style={TYPEWRITER}
      className={cn(
        "w-full bg-[#f3e9d6] text-stone-900 [text-shadow:0_0_1px_rgb(28_25_23/0.4)]",
        lg ? "px-6 py-7 sm:px-10 sm:py-10" : "px-5 py-6",
        className,
      )}
    >
      <p className={cn("text-stone-600", lg ? "text-[0.6875rem] sm:text-xs" : "text-[0.625rem]")}>
        {line(0)}
      </p>
      <p
        className={cn("leading-tight font-bold", lg ? "mt-4 text-xl sm:text-3xl" : "mt-3 text-lg")}
      >
        {line(1)}
      </p>
      <p
        className={cn("leading-relaxed", lg ? "mt-4 text-xs sm:text-sm" : "mt-3 text-[0.6875rem]")}
      >
        {line(2)}
      </p>
      <p
        className={cn(
          "text-stone-600",
          lg ? "mt-5 text-[0.6875rem] sm:text-xs" : "mt-4 text-[0.625rem]",
        )}
      >
        {line(3)}
      </p>
    </div>
  );
};

// A made-up photo, drawn: the sun going down behind the bridge, seen from
// the ferry. In a 60×60 box.
export const SunsetPhoto = () => {
  const uid = useId().replace(/:/g, "");
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="0.5" stopColor="#fb923c" />
          <stop offset="1" stopColor="#be185d" />
        </linearGradient>
      </defs>
      <rect width="60" height="60" fill={`url(#${uid}-sky)`} />
      <circle cx="30" cy="33" r="8" fill="#fff7ed" fillOpacity="0.85" />
      <path d="M0 41 C10 37 18 39 26 39 S44 36 60 39 V46 H0 Z" fill="#7c2d12" fillOpacity="0.55" />
      <rect y="44" width="60" height="16" fill="#1e3a8a" fillOpacity="0.6" />
      <g fill="#431407">
        <rect x="16.5" y="20" width="1.8" height="27" />
        <rect x="41.7" y="20" width="1.8" height="27" />
        <rect y="40" width="60" height="1.4" />
      </g>
      <path
        d="M0 37 Q11 35 17.4 20.5 Q30 39 42.6 20.5 Q49 35 60 37"
        fill="none"
        stroke="#431407"
        strokeWidth="0.6"
      />
      <g fill="#fde68a" fillOpacity="0.7">
        <rect x="25" y="48.5" width="10" height="0.8" />
        <rect x="27" y="51.5" width="6" height="0.8" />
        <rect x="28.5" y="54.5" width="3" height="0.8" />
      </g>
    </g>
  );
};
