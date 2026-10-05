import { useEffect, useMemo, useState } from "react";
import {
  Map,
  MapControls,
  MapMarker,
  MapRoute,
  MarkerContent,
  MarkerLabel,
  RouteMarker,
  RouteProgress,
} from "@/components/ui/map";
import { fitBounds, layoutLngLats, legCoordinates, type LngLat } from "@/lib/story-geo";
import { cn } from "@/lib/utils";

type Leg = {
  from: string;
  to: string;
  transport: string;
};

// A mapcn / MapLibre map that draws the story's places and animates the
// current leg with RouteProgress. Progress is driven by scroll (0–1).
export function StoryTravelMap({
  places,
  legs,
  current,
  progress,
  className,
}: {
  places: string[];
  legs: Leg[];
  current: number;
  progress: number;
  className?: string;
}) {
  const lngLats = useMemo(() => layoutLngLats(places), [places]);
  const allPoints = useMemo(() => [...lngLats.values()], [lngLats]);
  const view = useMemo(() => fitBounds(allPoints), [allPoints]);
  const currentLeg = legs[current];
  const routeCoords = useMemo(() => {
    if (!currentLeg) return [] as LngLat[];
    const from = lngLats.get(currentLeg.from);
    const to = lngLats.get(currentLeg.to);
    if (!from || !to) return [] as LngLat[];
    return legCoordinates(from, to, currentLeg.transport);
  }, [currentLeg, lngLats]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={cn("h-full w-full animate-pulse rounded-2xl bg-[#9ec7ef]", className)} aria-hidden />;
  }

  const t = Math.min(1, Math.max(0, progress));

  return (
    <div className={cn("relative h-full w-full overflow-hidden rounded-2xl border border-white/40 bg-[#d7ebff]", className)}>
      <Map
        key={`${current}-${routeCoords.length}`}
        center={view.center}
        zoom={view.zoom}
        theme="light"
        className="h-full w-full"
      >
        <MapControls position="bottom-right" showZoom showCompass={false} showLocate={false} showFullscreen={false} />
        {[...lngLats.entries()].map(([label, [lng, lat]]) => {
          const isActive = currentLeg?.to === label || currentLeg?.from === label;
          return (
            <MapMarker key={label} longitude={lng} latitude={lat}>
              <MarkerContent>
                <span
                  className={cn(
                    "block size-3 rounded-full border-2 border-white shadow",
                    isActive ? "bg-[#e85d32]" : "bg-[#1a4f8c]",
                  )}
                />
              </MarkerContent>
              <MarkerLabel className="text-[11px] font-medium text-[#1a2433]">{label}</MarkerLabel>
            </MapMarker>
          );
        })}
        {routeCoords.length >= 2 && (
          <MapRoute
            coordinates={routeCoords}
            color="#7aa0c8"
            width={3}
            opacity={0.55}
            progress={t}
            active
            activeColor="#e85d32"
            activeWidth={4}
            activeOpacity={0.95}
          >
            <RouteProgress color="#e85d32" width={4} opacity={1} />
            <RouteMarker at="progress">
              <MarkerContent>
                <span className="flex size-7 items-center justify-center rounded-full bg-[#1a4f8c] text-[10px] font-semibold tracking-wide text-white shadow-md">
                  go
                </span>
              </MarkerContent>
            </RouteMarker>
          </MapRoute>
        )}
      </Map>
      <p className="pointer-events-none absolute top-3 left-3 rounded-full bg-[#fff8eb]/92 px-3 py-1 text-xs font-medium tracking-wide text-[#1a4f8c] uppercase shadow-sm">
        {currentLeg ? `${currentLeg.from} → ${currentLeg.to}` : "The route"}
      </p>
    </div>
  );
}
