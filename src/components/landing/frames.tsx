import { ShipIcon } from "lucide-react";
import { PAPER, RUST, useInView, useReducedMotion } from "@/components/landing/paper";
import { cn } from "@/lib/utils";

// Pictures of the real screens, drawn rather than captured, so they work in
// both themes and never go stale. All are decorative: the text around each
// one says what it shows.

export const STAGE =
  "overflow-hidden rounded-xl bg-[#141210] text-stone-100 ring-1 ring-stone-900/10 dark:ring-white/10";

// A leg as story mode shows it now: a dark street map (the Tagus, Lisbon
// above, Almada below) with the crossing to Cacilhas. The route draws itself
// in amber and the ferry rides it once the frame is in view.
const ROUTE = "M31 41.5 C32 49 39 57 45 64.5";
const ROUTE_S = 3;
const LAND = "#1b1b1b";
const WATER = "#10161b";
const STREET = "#2a2a2a";
const AVENUE = "#383838";
const SERIF = "ui-serif, Georgia, serif";
// Small grey district names, the way the basemap letters them.
const DISTRICTS = [
  { name: "ESTRELA", x: 12, y: 22 },
  { name: "BAIXA", x: 40, y: 27 },
  { name: "ALFAMA", x: 62, y: 21 },
  { name: "ALMADA", x: 28, y: 84 },
  { name: "PRAGAL", x: 62, y: 90 },
];

export const MapFrame = () => {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  // Before it's seen, the ferry waits at the quay; without motion it has
  // arrived.
  const phase = reduced ? "done" : inView ? "play" : "wait";

  return (
    <div ref={ref} aria-hidden className={cn(STAGE, "relative aspect-[4/5]")}>
      {/* Keyed so each phase gets a fresh SVG timeline: SMIL animations run
          from when their outermost <svg> is inserted. */}
      <svg
        key={phase}
        viewBox="0 0 80 100"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        <rect width="80" height="100" fill={WATER} />
        <path
          d="M0 0 H80 V37 C72 39 64 37 56 40 C48 43 40 41 32 42 C22 43 12 42 0 45 Z"
          fill={LAND}
        />
        <path
          d="M0 68 C10 65 20 66 30 64.5 C36 63.5 40 65.5 45 65 C56 63 68 64 80 60 V100 H0 Z"
          fill={LAND}
        />
        <g fill="none" stroke={STREET} strokeWidth="0.3">
          <path d="M0 8 L80 4 M0 15 L80 12 M0 29 L80 24 M0 36 L56 33" />
          <path d="M6 0 L9 44 M18 0 L20 43 M30 0 L31 42 M50 0 L49 41 M62 0 L61 38 M72 0 L71 38" />
          <path d="M0 76 L80 70 M0 92 L80 86 M12 100 L14 66 M38 100 L40 65 M54 100 L55 64 M70 100 L70 62" />
        </g>
        <g fill="none" stroke={AVENUE} strokeWidth="0.6">
          <path d="M0 21 C20 19 50 20 80 16" />
          <path d="M24 0 C26 14 25 30 27 42" />
          <path d="M0 84 C20 80 50 81 80 76" />
          <path d="M46 100 C45 88 46 76 45 65" />
          {/* The bridge, upriver. */}
          <path d="M7 44 L11 67" strokeWidth="0.8" />
        </g>
        <text x="60" y="53" className="font-sans" fontSize="2.4" fontStyle="italic" fill="#3b4a55">
          Rio Tejo
        </text>
        {DISTRICTS.map((d) => (
          <text
            key={d.name}
            x={d.x}
            y={d.y}
            textAnchor="middle"
            className="font-sans"
            fontSize="1.9"
            letterSpacing="0.35"
            fill="#6b6b6b"
          >
            {d.name}
          </text>
        ))}

        {/* The way still to go, then the way travelled. */}
        <path
          d={ROUTE}
          fill="none"
          stroke="#e7e5e4"
          strokeOpacity="0.3"
          strokeWidth="0.5"
          strokeDasharray="0.5 1"
        />
        <path
          d={ROUTE}
          pathLength={1}
          fill="none"
          stroke="#fde68a"
          strokeWidth="1"
          strokeLinecap="round"
          strokeDasharray="1"
          strokeDashoffset={phase === "done" ? 0 : 1}
        >
          {phase === "play" && (
            <animate
              attributeName="stroke-dashoffset"
              from="1"
              to="0"
              dur={`${ROUTE_S}s`}
              fill="freeze"
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.4 0 0.2 1"
            />
          )}
        </path>

        <circle cx="31" cy="41.5" r="0.8" fill="#d6d3d1" stroke="#1c1917" strokeWidth="0.3" />
        <text
          x="29.5"
          y="38.5"
          textAnchor="end"
          fontFamily={SERIF}
          fontSize="2.6"
          fill="#d6d3d1"
          stroke="#141210"
          strokeWidth="0.6"
          paintOrder="stroke"
        >
          Cais do Sodré
        </text>
        <circle cx="45" cy="64.5" r="1.2" fill="#fde68a" stroke={RUST} strokeWidth="0.35" />
        <text
          x="45"
          y="72"
          textAnchor="middle"
          fontFamily={SERIF}
          fontSize="3.2"
          fontWeight="600"
          fill="#fde68a"
          stroke="#141210"
          strokeWidth="0.6"
          paintOrder="stroke"
        >
          Cacilhas
        </text>

        <g>
          {phase === "play" ? (
            <animateMotion
              dur={`${ROUTE_S}s`}
              fill="freeze"
              path={ROUTE}
              calcMode="spline"
              keyTimes="0;1"
              keyPoints="0;1"
              keySplines="0.4 0 0.2 1"
            />
          ) : (
            <animateMotion
              dur="0.01s"
              fill="freeze"
              path={ROUTE}
              keyTimes="0;1"
              keyPoints={phase === "done" ? "1;1" : "0;0"}
            />
          )}
          <circle r="3.2" fill={PAPER} stroke={RUST} strokeWidth="0.55" />
          <ShipIcon x={-1.8} y={-1.8} width={3.6} height={3.6} color={RUST} strokeWidth={2.2} />
        </g>
      </svg>
      {/* The edges fade into the stage, darkest at the top behind the caption. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,#141210_100%),linear-gradient(to_bottom,#141210_0%,rgb(20_18_16/0.7)_18%,transparent_40%,transparent_85%,#141210_100%)]" />
      <div className="absolute inset-x-0 top-0 space-y-1 px-4 pt-4 text-center [text-shadow:0_1px_6px_#141210]">
        <p className="text-[0.625rem] tracking-[0.25em] text-amber-200/90 uppercase">
          <ShipIcon className="mr-1 inline size-3 align-[-2px]" />
          By boat
        </p>
        <p className="font-serif text-lg font-semibold">
          Cais do Sodré <span className="text-white/50">→</span> Cacilhas
        </p>
      </div>
    </div>
  );
};
