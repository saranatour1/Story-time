import { useId, useSyncExternalStore } from "react";
import { transportOf } from "@/components/event/transport";
import { layoutPlaces, legDuration, legPath, placeNames, sheetSize, type DrawnName, type MapPoint, type Orientation } from "@/lib/story-map";
import type { StoryStep } from "@/lib/story-steps";

type Leg = Extract<StoryStep, { kind: "travel" }>;

const INK = "#5b4a3a";
const ACCENT = "#c2410c";
const PAPER = "#f3e9d6";

const PORTRAIT = "(orientation: portrait)";
// A phone held upright gets a tall sheet, so the map fills its screen.
const useOrientation = (): Orientation => {
  const portrait = useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(PORTRAIT);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(PORTRAIT).matches,
    () => false,
  );
  return portrait ? "portrait" : "landscape";
};

// A drawn map of the trip. Every place sits at a fixed spot; legs already
// travelled are faint, and the current one draws itself while its transport
// crosses it. `idle` is the scene waiting further down the page: nothing
// travelled yet, the transport parked at the start.
export const MapScene = ({
  places,
  legs,
  current,
  animate,
  idle = false,
}: {
  places: string[];
  legs: Leg[];
  current: number;
  animate: boolean;
  idle?: boolean;
}) => {
  const leg = legs[current];
  const orientation = useOrientation();
  const { w, h } = sheetSize(orientation);
  const points = layoutPlaces(places, orientation);
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
  // Names that would crowd another are left out; their places keep a dot.
  const names = placeNames(points, { sheet: w, portrait: orientation === "portrait", active: leg.to, origin: places[0], visited });

  return (
    <section aria-label={`${transport?.phrase ?? "Travelling"} from ${leg.from} to ${leg.to}`} className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
      <p className="text-xs tracking-[0.25em] text-amber-200/80 uppercase">
        {Icon && <Icon aria-hidden className="mr-1.5 inline size-3.5 align-[-2px]" />}
        {transport?.phrase}
      </p>
      <h2 className="font-serif text-2xl font-semibold tracking-tight text-balance text-center sm:text-3xl">
        {leg.from} <span aria-hidden className="text-white/40">→</span> {leg.to}
      </h2>
      {/* As wide as fits, but never taller than 60% of the screen. */}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full rounded-md shadow-2xl"
        style={{ maxWidth: `min(56rem, ${(60 * w) / h}svh)` }}
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
        <rect width={w} height={h} fill={PAPER} filter={`url(#paper-${uid})`} />
        <rect width={w} height={h} fill={`url(#grid-${uid})`} />
        <rect x="1" y="1" width={w - 2} height={h - 2} fill="none" stroke={INK} strokeOpacity="0.4" strokeWidth="0.3" />
        <Compass x={w - 7} y={7} />

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
          strokeDashoffset={animate || idle ? 1 : 0}
        >
          {animate && (
            <animate attributeName="stroke-dashoffset" from="1" to="0" dur={`${seconds}s`} fill="freeze" calcMode="spline" keySplines="0.4 0 0.2 1" />
          )}
        </path>

        {[...points.entries()].map(([label, p]) => (
          <Place
            key={label}
            p={p}
            name={names.get(label)}
            visited={visited.has(label)}
            active={label === leg.to}
            origin={label === places[0]}
          />
        ))}

        {Icon && (
          <g>
            {animate ? (
              <animateMotion dur={`${seconds}s`} fill="freeze" path={d} calcMode="spline" keySplines="0.4 0 0.2 1" keyTimes="0;1" keyPoints="0;1" />
            ) : (
              <animateMotion dur="0.01s" fill="freeze" path={d} keyPoints={idle ? "0;0" : "1;1"} keyTimes="0;1" />
            )}
            <circle r="3.2" fill={PAPER} stroke={ACCENT} strokeWidth="0.4" />
            <Icon x={-2} y={-2} width={4} height={4} color={ACCENT} strokeWidth={2.2} />
          </g>
        )}
      </svg>
    </section>
  );
};

// The leg itself, styled by how it was travelled.
const LegPath = ({ d, transport, faint = false }: { d: string; transport: string; faint?: boolean }) => {
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
};

// A place's dot, and its name where the sheet has room for it (see placeNames).
const Place = ({
  p,
  name,
  visited,
  active,
  origin,
}: {
  p: MapPoint;
  name?: DrawnName;
  visited: boolean;
  active: boolean;
  origin: boolean;
}) => {
  return (
    <g>
      {active && <circle cx={p.x} cy={p.y} r="2.2" fill={ACCENT} fillOpacity="0.15" />}
      {origin ? (
        <rect x={p.x - 1} y={p.y - 1} width="2" height="2" fill={visited ? INK : PAPER} stroke={INK} strokeWidth="0.3" transform={`rotate(45 ${p.x} ${p.y})`} />
      ) : (
        <circle cx={p.x} cy={p.y} r="1.1" fill={visited ? (active ? ACCENT : INK) : PAPER} stroke={active ? ACCENT : INK} strokeWidth="0.3" />
      )}
      {name && (
        <text
          x={name.left ? p.x - name.gap : p.x + name.gap}
          y={p.y + 0.9}
          textAnchor={name.left ? "end" : "start"}
          fontSize="2.6"
          fontFamily="ui-serif, Georgia, serif"
          fontStyle={origin ? "italic" : "normal"}
          fontWeight={active ? 700 : 500}
          fill={active ? ACCENT : INK}
          fillOpacity={visited ? 1 : 0.6}
        >
          {name.text}
        </text>
      )}
    </g>
  );
};

const Compass = ({ x, y }: { x: number; y: number }) => {
  return (
    <g stroke={INK} strokeOpacity="0.5" fill="none" strokeWidth="0.25">
      <circle cx={x} cy={y} r="3.5" />
      <path d={`M ${x} ${y - 3} L ${x + 0.9} ${y} L ${x} ${y + 3} L ${x - 0.9} ${y} Z`} fill={INK} fillOpacity="0.5" />
      <text x={x} y={y - 4.2} textAnchor="middle" fontSize="1.8" fill={INK} fillOpacity="0.6" stroke="none" fontFamily="ui-serif, Georgia, serif">
        N
      </text>
    </g>
  );
};
