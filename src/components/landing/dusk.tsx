import { useEffect, useId, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useReducedMotion } from "@/components/landing/paper";

// The hero's backdrop: dusk over the sea between two headlands, the sun going
// down behind the story player, and a week in Portugal lit along the shores.
// Drawn in layers that drift apart as the page scrolls (the sun sets as you
// go), so it is sharp at any size and weighs nothing. Decorative.

const W = 1440;
const H = 900;
// Where the sea meets the sky.
const HORIZON = 772;

// The same sky on every visit: positions from a fixed hash, not Math.random.
const hash = (i: number, n: number) => {
  const s = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const STARS = Array.from({ length: 90 }, (_, i) => ({
  x: hash(i, 1) * W,
  y: hash(i, 2) * 560,
  r: 0.5 + hash(i, 3) * 1.1,
  opacity: 0.15 + hash(i, 4) * 0.65,
  twinkles: hash(i, 5) > 0.86,
}));
// The sun's reflection: short strokes on the water, wider nearer the shore.
const GLINTS = Array.from({ length: 13 }, (_, k) => ({
  y: HORIZON + 6 + k * 9,
  w: 40 + k * 14 + hash(k, 7) * 30,
  delay: hash(k, 8) * 3,
}));
// A week in Portugal, on the two shores either side of the player.
const LEFT_ROUTE = "M-10 862 C20 848 44 836 72 828 S128 806 170 800 S204 794 230 792";
const RIGHT_ROUTE = "M1210 798 C1240 795 1266 793 1290 790 S1352 778 1392 772 S1430 766 1460 764";
const STOPS = [
  { x: 72, y: 828, name: "Porto" },
  { x: 170, y: 800, name: "Lisbon" },
  { x: 1290, y: 790, name: "Cacilhas" },
  { x: 1392, y: 772, name: "Sintra" },
];

// Sets `--p` on the element: 0 at the top of the page, 1 once it has scrolled
// out of view. The layers read it to drift; nothing re-renders.
export const useScrollDepth = (ref: RefObject<HTMLElement | null>) => {
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const depth = Math.min(1, Math.max(0, window.scrollY / Math.max(1, el.offsetHeight)));
      el.style.setProperty("--p", depth.toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [ref, reduced]);
};

// One layer of the scene, moved down by `drift` pixels as `--p` goes to 1.
const Layer = ({ drift, children }: { drift: number; children: ReactNode }) => {
  const style: CSSProperties = { transform: `translate3d(0, calc(var(--p, 0) * ${drift}px), 0)` };
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice"
      className="absolute inset-0 size-full will-change-transform"
      style={style}
    >
      {children}
    </svg>
  );
};

// Fine film grain over the scene, from an SVG noise filter.
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

export const DuskScene = () => {
  const uid = useId().replace(/:/g, "");
  const reduced = useReducedMotion();
  const id = (name: string) => `${uid}-${name}`;

  return (
    <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[max(100svh,60rem)] overflow-hidden">
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id={id("sky")} x1="0" y1="0" x2="0" y2={HORIZON} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#04050d" />
            <stop offset="0.32" stopColor="#0c1132" />
            <stop offset="0.55" stopColor="#231a4a" />
            <stop offset="0.72" stopColor="#57295a" />
            <stop offset="0.84" stopColor="#a8455a" />
            <stop offset="0.93" stopColor="#e07a4a" />
            <stop offset="1" stopColor="#f6b066" />
          </linearGradient>
          <radialGradient id={id("glow")} cx="720" cy={HORIZON} r="700" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffd29a" stopOpacity="0.7" />
            <stop offset="0.3" stopColor="#f08a5a" stopOpacity="0.26" />
            <stop offset="1" stopColor="#f08a5a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id("sun")} cx="720" cy={HORIZON} r="150" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff8e6" />
            <stop offset="0.55" stopColor="#ffd890" />
            <stop offset="1" stopColor="#f7a23b" />
          </radialGradient>
          <linearGradient id={id("sea")} x1="0" y1={HORIZON} x2="0" y2={H} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7d3a52" />
            <stop offset="0.25" stopColor="#3b2246" />
            <stop offset="1" stopColor="#141210" />
          </linearGradient>
          <linearGradient id={id("far")} x1="0" y1="640" x2="0" y2={HORIZON} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#5a2f5e" />
            <stop offset="1" stopColor="#3b2147" />
          </linearGradient>
          <radialGradient id={id("halo")}>
            <stop offset="0" stopColor="#fde68a" stopOpacity="0.6" />
            <stop offset="1" stopColor="#fde68a" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>

      <Layer drift={50}>
        <rect width={W} height={H} fill={`url(#${id("sky")})`} />
        <g fill="#fff">
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.opacity} className={s.twinkles ? "motion-safe:animate-pulse" : undefined} />
          ))}
        </g>
        {/* Thin clouds catching the last light. */}
        <g fill="#ffb59a" fillOpacity="0.12">
          <ellipse cx="300" cy="628" rx="260" ry="6" />
          <ellipse cx="1130" cy="602" rx="300" ry="7" />
          <ellipse cx="760" cy="676" rx="380" ry="5" />
        </g>
      </Layer>

      <Layer drift={190}>
        <rect width={W} height={H} fill={`url(#${id("glow")})`} />
        <circle cx="720" cy={HORIZON} r="150" fill={`url(#${id("sun")})`} />
      </Layer>

      <Layer drift={24}>
        {/* Hazy far hills, then the two headlands down to the water. */}
        <path d="M0 720 L120 690 L230 706 L330 676 L430 700 L500 694 L560 772 L0 772 Z" fill={`url(#${id("far")})`} />
        <path d="M900 772 L940 704 L1030 684 L1130 700 L1240 668 L1340 690 L1440 676 V772 Z" fill={`url(#${id("far")})`} />
        <rect y={HORIZON} width={W} height={H - HORIZON} fill={`url(#${id("sea")})`} />
        <path d={`M560 ${HORIZON} H880`} stroke="#ffd29a" strokeOpacity="0.55" strokeWidth="1.5" />
        <g fill="#ffe2b0">
          {GLINTS.map((g) => (
            <rect
              key={g.y}
              x={720 - g.w / 2}
              y={g.y}
              width={g.w}
              height="1.6"
              rx="0.8"
              opacity={reduced ? 0.55 : undefined}
              style={reduced ? undefined : { animation: `landing-shimmer 3.2s ease-in-out ${g.delay}s infinite` }}
            />
          ))}
        </g>
        <path d="M0 780 C80 770 160 778 250 784 C330 790 400 772 470 770 L520 900 H0 Z" fill="#231733" />
        <path d="M1440 770 C1360 762 1280 774 1200 778 C1120 782 1060 768 980 770 L920 900 H1440 Z" fill="#231733" />
        <path d="M0 850 C120 826 240 836 380 846 L430 900 H0 Z" fill="#141210" />
        <path d="M1440 842 C1320 822 1200 830 1060 842 L1010 900 H1440 Z" fill="#141210" />
      </Layer>

      <Layer drift={0}>
        {[LEFT_ROUTE, RIGHT_ROUTE].map((d) => (
          <path key={d} d={d} fill="none" stroke="#fcd9a0" strokeOpacity="0.85" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="0.5 10" />
        ))}
        {STOPS.map((s) => (
          <g key={s.name}>
            <circle cx={s.x} cy={s.y} r="16" fill={`url(#${id("halo")})`} />
            <circle cx={s.x} cy={s.y} r="4.5" fill="#fde68a" stroke="#141210" strokeWidth="2" />
            <text x={s.x} y={s.y - 16} textAnchor="middle" className="font-serif" fontSize="16" fill="#fff" fillOpacity="0.78">
              {s.name}
            </text>
          </g>
        ))}
        {!reduced && (
          <g>
            <animateMotion dur="9s" repeatCount="indefinite" path={LEFT_ROUTE} />
            <circle r="12" fill={`url(#${id("halo")})`} />
            <circle r="3" fill="#fff7e6" />
          </g>
        )}
      </Layer>

      <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      {/* The scene fades into the page under the player. */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[#141210]" />
    </div>
  );
};
