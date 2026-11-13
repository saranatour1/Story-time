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

export type MapStop = {
  step: number;
  number: number;
  name: string;
  transport?: Transport;
  lng: number;
  lat: number;
};
export type MapLeg = { from: LatLng; to: LatLng; transport: Transport };

type Point = [number, number];

const LEG_MS = 1200;
const FLY_MS = 800;
const FRAME_PADDING = { top: 32, bottom: 32, left: 32, right: 64 };

const routeThrough = (stops: MapStop[], paths: Array<Path | undefined>): Point[] => {
  return stops.flatMap((s, i): Point[] => {
    const here: Point = [s.lng, s.lat];
    const prev = stops[i - 1];
    if (!prev) return [here];
    return (paths[i] ?? curve([prev.lng, prev.lat], here, bend(s.transport ?? "walk"))).slice(1);
  });
};

export const StickyMap = ({
  stops,
  focus,
  leg,
  reduced,
  className,
  onPick,
}: {
  stops: MapStop[];
  focus: number | null;
  leg?: MapLeg;
  reduced: boolean;
  className?: string;
  onPick: (step: number) => void;
}) => {
  const { resolvedTheme } = useTheme();

  const dark = resolvedTheme === "dark";
  const paths = useChainPaths(stops);
  const route = useMemo(() => routeThrough(stops, paths), [stops, paths]);
  const focused = stops.find((s) => s.step === focus);
  const framing = useMemo<Point[]>(() => {
    if (!focused) return stops.map((s): Point => [s.lng, s.lat]);
    return leg
      ? [
          [leg.from.lng, leg.from.lat],
          [focused.lng, focused.lat],
        ]
      : [[focused.lng, focused.lat]];
  }, [stops, focused, leg]);
  const framingKey = framing.map((p) => p.join(",")).join(";");
  const { path, settled } = useRoutePath(leg?.from, leg?.to, leg?.transport ?? "walk");
  const legLine = useMemo(
    () =>
      leg
        ? (path ??
          curve([leg.from.lng, leg.from.lat], [leg.to.lng, leg.to.lat], bend(leg.transport)))
        : undefined,
    [leg, path],
  );

  if (stops.length === 0) return null;

  const theme = resolvedTheme === "dark" || resolvedTheme === "light" ? resolvedTheme : undefined;
  return (
    <section aria-label="Map of the stops" className={className}>
      <MapView
        theme={theme}
        interactive={false}
        className="h-full w-full overflow-hidden rounded-xl border border-[#5b4a3a]/20"
      >
        <Camera framing={framing} framingKey={framingKey} reduced={reduced} />
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
            <MapMarker
              key={s.step}
              longitude={s.lng}
              latitude={s.lat}
              onClick={() => onPick(s.step)}
            >
              <MarkerContent>
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
        <MapControls position="bottom-right" showZoom />
      </MapView>
    </section>
  );
};

const Camera = ({
  framing,
  framingKey,
  reduced,
}: {
  framing: Point[];
  framingKey: string;
  reduced: boolean;
}) => {
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
