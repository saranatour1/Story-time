import { LngLatBounds } from "maplibre-gl";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { transportOf } from "@/components/event/transport";
import { RUST } from "@/components/landing/paper";
import {
  Map as MapView,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerTooltip,
  RouteMarker,
  RouteProgress,
  useMap,
} from "@/components/ui/map";
import { bend, curve, ease } from "@/lib/map-route";
import type { LatLng, Transport } from "@/lib/story-steps";
import type { Path } from "@/lib/road-path";
import { useChainPaths, useRoutePath } from "@/lib/use-route-path";
import { cn } from "@/lib/utils";

// A located stop: its step in the story, its number, and where it is.
export type MapStop = { step: number; number: number; name: string; transport?: Transport; lng: number; lat: number };
// The leg into the stop in focus, when both of its ends are on the map.
export type MapLeg = { from: LatLng; to: LatLng; transport: Transport };

type Point = [number, number];

// How long the leg in focus takes to draw, and how long the camera flies to it.
const LEG_MS = 1200;
const FLY_MS = 800;
// The zoom buttons sit in the bottom-right corner, 42px in from the right edge.
// The wider right side keeps a framed stop, and its focus ring, clear of them.
const FRAME_PADDING = { top: 32, bottom: 32, left: 32, right: 64 };

// The stops joined in story order: each leg along its streets or tracks once
// they have come back, bowed the way the film bows it until then.
const routeThrough = (stops: MapStop[], paths: Array<Path | undefined>): Point[] => {
  return stops.flatMap((s, i): Point[] => {
    const here: Point = [s.lng, s.lat];
    const prev = stops[i - 1];
    if (!prev) return [here];
    return (paths[i] ?? curve([prev.lng, prev.lat], here, bend(s.transport ?? "walk"))).slice(1);
  });
};

// The story's stops on a map, numbered as their cards are and joined in story
// order. The stop in focus is marked, the leg into it draws itself, and the
// camera frames it; stops still to come are dimmed. The viewer scrolls the
// story, so the map itself doesn't take touches (it would hold the page).
export const StickyMap = ({
  stops,
  focus,
  leg,
  reduced,
  className,
  onPick,
  light = false,
  printable = false,
}: {
  stops: MapStop[];
  // The step in view, when it is a stop on the map.
  focus: number | null;
  leg?: MapLeg;
  reduced: boolean;
  className?: string;
  onPick: (step: number) => void;
  // Always the light map, as on a paper page.
  light?: boolean;
  // Drawn so it can be photographed into a PDF, with no zoom buttons.
  printable?: boolean;
}) => {
  const { resolvedTheme: appTheme } = useTheme();
  const resolvedTheme = light ? "light" : appTheme;
  // MapLibre needs the browser, so nothing draws until this has mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dark = resolvedTheme === "dark";
  const paths = useChainPaths(stops);
  const route = useMemo(() => routeThrough(stops, paths), [stops, paths]);
  const focused = stops.find((s) => s.step === focus);
  // Framed on the stop in focus with the place its leg set off from, else on
  // every stop. The camera compares framingKey, so a refresh that moves nothing
  // keeps the view where it is.
  const framing = useMemo<Point[]>(() => {
    if (!focused) return stops.map((s): Point => [s.lng, s.lat]);
    return leg ? [[leg.from.lng, leg.from.lat], [focused.lng, focused.lat]] : [[focused.lng, focused.lat]];
  }, [stops, focused, leg]);
  const framingKey = framing.map((p) => p.join(",")).join(";");
  // The leg in focus follows its streets or tracks when a router knows them (the
  // overview line behind stays the arcs it was). It draws once that is settled,
  // so the highlight never reshapes after it starts.
  const { path, settled } = useRoutePath(leg?.from, leg?.to, leg?.transport ?? "walk");
  const legLine = useMemo(
    () => (leg ? (path ?? curve([leg.from.lng, leg.from.lat], [leg.to.lng, leg.to.lat], bend(leg.transport))) : undefined),
    [leg, path],
  );

  if (stops.length === 0) return null;
  if (!mounted) return <div aria-hidden className={cn("rounded-xl border", className)} />;

  // The app's theme. Until next-themes knows it, mapcn reads the page's own.
  const theme = resolvedTheme === "dark" || resolvedTheme === "light" ? resolvedTheme : undefined;
  return (
    <section aria-label="Map of the stops" className={className}>
      <MapView
        theme={theme}
        interactive={false}
        canvasContextAttributes={printable ? { preserveDrawingBuffer: true } : undefined}
        className="h-full w-full overflow-hidden rounded-xl border border-[#5b4a3a]/20"
      >
        <Camera framing={framing} framingKey={framingKey} reduced={reduced} />
        {/* A line needs two stops; one stop is just its marker. */}
        {route.length > 1 && (
          <MapRoute
            id="memoir-route"
            coordinates={route}
            color={dark ? "#d6d3d1" : "#57534e"}
            width={2}
            opacity={0.9}
            dashArray={[2, 2]}
            interactive={false}
          />
        )}
        {leg && legLine && focus !== null && settled && (
          <LegRoute
            key={focus}
            id={`memoir-leg-${focus}`}
            coordinates={legLine}
            transport={leg.transport}
            color={dark ? "#fde68a" : RUST}
            reduced={reduced}
          />
        )}
        {stops.map((s) => {
          const current = s.step === focus;
          const ahead = focus !== null && s.step > focus;
          return (
            <MapMarker key={s.step} longitude={s.lng} latitude={s.lat} onClick={() => onPick(s.step)}>
              <MarkerContent>
                {/* A button, so the stops can be reached from the keyboard. */}
                <button
                  type="button"
                  aria-label={`Stop ${s.number}: ${s.name}`}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "grid size-6 place-items-center rounded-full border-2 border-background bg-foreground text-[11px] leading-none font-semibold text-background shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    ahead && "opacity-50",
                    current && "size-7 bg-[#c2410c] text-white ring-4 ring-[#c2410c]/30",
                  )}
                >
                  {s.number}
                </button>
              </MarkerContent>
              <MarkerTooltip>{s.name}</MarkerTooltip>
            </MapMarker>
          );
        })}
        {/* The map takes no gestures of its own, so these are its zoom, by mouse or touch. */}
        {!printable && <MapControls position="bottom-right" showZoom />}
      </MapView>
    </section>
  );
};

// Frames the stop in focus, or every stop. The first framing is at once; later
// ones fly, unless the viewer prefers no motion. A theme change reloads the
// basemap, which mustn't reset the view, so a framing is applied only once.
const Camera = ({ framing, framingKey, reduced }: { framing: Point[]; framingKey: string; reduced: boolean }) => {
  const { map, isLoaded } = useMap();
  const framed = useRef<string | null>(null);
  useEffect(() => {
    const [first] = framing;
    if (!isLoaded || !map || !first || framed.current === framingKey) return;
    const duration = framed.current === null || reduced ? 0 : FLY_MS;
    framed.current = framingKey;
    if (framing.length === 1) {
      map.flyTo({ center: first, zoom: Math.min(14, Math.max(12, map.getZoom())), duration });
      return;
    }
    const box = framing.reduce((b, p) => b.extend(p), new LngLatBounds(first, first));
    map.fitBounds(box, { padding: FRAME_PADDING, maxZoom: 14, duration });
  }, [isLoaded, map, framing, framingKey, reduced]);
  return null;
};

// The leg into the stop in focus: faint along its length, then drawn over
// LEG_MS with the transport riding its end. Mounted once per stop, so each
// leg starts over when the story reaches it.
const LegRoute = ({
  id,
  coordinates,
  transport,
  color,
  reduced,
}: {
  id: string;
  coordinates: Point[];
  transport: Transport;
  color: string;
  reduced: boolean;
}) => {
  const [progress, setProgress] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - t0) / LEG_MS);
      setProgress(ease(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const Icon = transportOf(transport)?.icon;
  return (
    <MapRoute
      id={id}
      coordinates={coordinates}
      color={color}
      width={2}
      opacity={0.35}
      dashArray={[1, 2]}
      progress={progress}
      interactive={false}
    >
      <RouteProgress color={color} width={4} opacity={1} />
      <RouteMarker at="progress">
        <MarkerContent>
          <span className="grid size-8 place-items-center rounded-full border-2 border-[#c2410c] bg-[#f3e9d6] shadow-lg">
            {Icon && <Icon aria-hidden className="size-4 text-[#c2410c]" />}
          </span>
        </MarkerContent>
      </RouteMarker>
    </MapRoute>
  );
};
