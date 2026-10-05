import { useId } from "react";
import { transportOf } from "@/components/event/transport";
import { MAP_HEIGHT, MAP_WIDTH, layoutPlaces, legDuration, legPath, type MapPoint } from "@/lib/story-map";
import type { StoryStep } from "@/lib/story-steps";

type Leg = Extract<StoryStep, { kind: "travel" }>;

const INK = "#5b4a3a";
const ACCENT = "#c2410c";
const PAPER = "#f3e9d6";

// A drawn map of the trip. Every place sits at a fixed spot; legs already
// travelled are faint, and the current one draws itself while its transport
// crosses it.
export function MapScene({
  places,
  legs,
  current,
  animate,
}: {
  places: string[];
  legs: Leg[];
  current: number;
  animate: boolean;
}) {
  const leg = legs[current];
  const points = layoutPlaces(places);
  const uid = useId().replace(/:/g, "");
  if (!leg) return null;
  const from = points.get(leg.from);
  const to = points.get(leg.to);
  if (!from || !to) return null;
  const d = legPath(from, to, leg.transport);
  const seconds = legDuration(leg.transport);
  const transport = transportOf(leg.transport);
  const Icon = transport?.icon;
  const visited = new Set<string>();
  for (let i = 0; i <= current; i++) {
    const l = legs[i];
    if (l) {
      visited.add(l.from);
      visited.add(l.to);
    }
  }

  return (
    <section aria-label={`${transport?.phrase ?? "Travelling"} from ${leg.from} to ${leg.to}`} className="flex flex-1 flex-col items-center justify-center gap-4 px-4 animate-in fade-in duration-700">
      <p className="text-xs tracking-[0.25em] text-amber-200/80 uppercase">
        {Icon && <Icon aria-hidden className="mr-1.5 inline size-3.5 align-[-2px]" />}
        {transport?.phrase}
      </p>
      <h2 className="font-serif text-2xl font-semibold tracking-tight text-balance text-center sm:text-3xl">
        {leg.from} <span aria-hidden className="text-white/40">→</span> {leg.to}
      </h2>
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="max-h-[60svh] w-full max-w-4xl rounded-md shadow-2xl"
        role="img"
        aria-hidden
      >
        <defs>
          <pattern id={`grid-${uid}`} width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke={INK} strokeOpacity="0.08" strokeWidth="0.15" />
          </pattern>
          <filter id={`paper-${uid}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="noise" />
            <feColorMatrix in="noise" type="saturate" values="0" result="grey" />
            <feComponentTransfer in="grey" result="faint">
              <feFuncA type="linear" slope="0.12" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" in2="faint" mode="multiply" />
          </filter>
        </defs>
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill={PAPER} filter={`url(#paper-${uid})`} />
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill={`url(#grid-${uid})`} />
        <rect x="1" y="1" width={MAP_WIDTH - 2} height={MAP_HEIGHT - 2} fill="none" stroke={INK} strokeOpacity="0.4" strokeWidth="0.3" />
        <Compass x={MAP_WIDTH - 7} y={7} />

        {legs.slice(0, current).map((l, i) => {
          const a = points.get(l.from);
          const b = points.get(l.to);
          if (!a || !b) return null;
          return <LegPath key={i} d={legPath(a, b, l.transport)} transport={l.transport} faint />;
        })}

        <LegPath d={d} transport={leg.transport} />
        {/* The travelled part of the leg, drawing itself. */}
        <path
          d={d}
          pathLength={1}
          fill="none"
          stroke={ACCENT}
          strokeWidth="0.7"
          strokeLinecap="round"
          strokeDasharray="1"
          strokeDashoffset={animate ? 1 : 0}
        >
          {animate && (
            <animate attributeName="stroke-dashoffset" from="1" to="0" dur={`${seconds}s`} fill="freeze" calcMode="spline" keySplines="0.4 0 0.2 1" />
          )}
        </path>

        {[...points.entries()].map(([label, p]) => (
          <Place key={label} label={label} p={p} visited={visited.has(label)} active={label === leg.to} origin={label === places[0]} />
        ))}

        {Icon && (
          <g>
            {animate ? (
              <animateMotion dur={`${seconds}s`} fill="freeze" path={d} calcMode="spline" keySplines="0.4 0 0.2 1" keyTimes="0;1" keyPoints="0;1" />
            ) : (
              <animateMotion dur="0.01s" fill="freeze" path={d} keyPoints="1;1" keyTimes="0;1" />
            )}
            <circle r="3.2" fill={PAPER} stroke={ACCENT} strokeWidth="0.4" />
            <Icon x={-2} y={-2} width={4} height={4} color={ACCENT} strokeWidth={2.2} />
          </g>
        )}
      </svg>
    </section>
  );
}

// The leg itself, styled by how it was travelled.
function LegPath({ d, transport, faint = false }: { d: string; transport: string; faint?: boolean }) {
  const opacity = faint ? 0.25 : 0.7;
  switch (transport) {
    case "walk":
      return <path d={d} fill="none" stroke={INK} strokeOpacity={opacity} strokeWidth="0.6" strokeLinecap="round" strokeDasharray="0.1 1.2" />;
    case "bike":
      return <path d={d} fill="none" stroke={INK} strokeOpacity={opacity} strokeWidth="0.4" strokeDasharray="1.5 1" />;
    case "train":
      return (
        <>
          <path d={d} fill="none" stroke={INK} strokeOpacity={opacity} strokeWidth="1.4" strokeLinecap="round" />
          <path d={d} fill="none" stroke={PAPER} strokeOpacity={faint ? 0.5 : 0.9} strokeWidth="0.8" strokeDasharray="0.5 1.2" />
        </>
      );
    case "car":
    case "bus":
      return (
        <>
          <path d={d} fill="none" stroke={INK} strokeOpacity={opacity} strokeWidth="1.3" strokeLinecap="round" />
          <path d={d} fill="none" stroke={PAPER} strokeOpacity={faint ? 0.5 : 0.9} strokeWidth="0.15" strokeDasharray="1.2 1" />
        </>
      );
    case "plane":
      return <path d={d} fill="none" stroke={INK} strokeOpacity={opacity} strokeWidth="0.35" strokeDasharray="2 1.2" />;
    case "boat":
      return <path d={d} fill="none" stroke="#1d4ed8" strokeOpacity={opacity} strokeWidth="0.5" strokeLinecap="round" strokeDasharray="0.1 1" />;
    default:
      return <path d={d} fill="none" stroke={INK} strokeOpacity={opacity} strokeWidth="0.4" strokeDasharray="1 1" />;
  }
}

function Place({ label, p, visited, active, origin }: { label: string; p: MapPoint; visited: boolean; active: boolean; origin: boolean }) {
  // Labels above places on the lower half, below on the upper half.
  const below = p.y < MAP_HEIGHT / 2;
  const short = label.length > 22 ? `${label.slice(0, 21)}…` : label;
  return (
    <g>
      {active && <circle cx={p.x} cy={p.y} r="2.2" fill={ACCENT} fillOpacity="0.15" />}
      {origin ? (
        <rect x={p.x - 1} y={p.y - 1} width="2" height="2" fill={visited ? INK : PAPER} stroke={INK} strokeWidth="0.3" transform={`rotate(45 ${p.x} ${p.y})`} />
      ) : (
        <circle cx={p.x} cy={p.y} r="1.1" fill={visited ? (active ? ACCENT : INK) : PAPER} stroke={active ? ACCENT : INK} strokeWidth="0.3" />
      )}
      <text
        x={p.x}
        y={below ? p.y + 4.2 : p.y - 2.6}
        textAnchor="middle"
        fontSize="2.6"
        fontFamily="ui-serif, Georgia, serif"
        fontStyle={origin ? "italic" : "normal"}
        fontWeight={active ? 700 : 500}
        fill={active ? ACCENT : INK}
        fillOpacity={visited ? 1 : 0.6}
      >
        {short}
      </text>
    </g>
  );
}

function Compass({ x, y }: { x: number; y: number }) {
  return (
    <g stroke={INK} strokeOpacity="0.5" fill="none" strokeWidth="0.25">
      <circle cx={x} cy={y} r="3.5" />
      <path d={`M ${x} ${y - 3} L ${x + 0.9} ${y} L ${x} ${y + 3} L ${x - 0.9} ${y} Z`} fill={INK} fillOpacity="0.5" />
      <text x={x} y={y - 4.2} textAnchor="middle" fontSize="1.8" fill={INK} fillOpacity="0.6" stroke="none" fontFamily="ui-serif, Georgia, serif">
        N
      </text>
    </g>
  );
}
