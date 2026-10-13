import { useEffect } from "react";
import { Map, MapArc, MapMarker, MarkerContent, useMap } from "@/components/ui/map";

// One story's route on a real, slowly swaying globe (mapcn on MapLibre):
// six weeks from Porto to Tokyo, each leg an arc between its stops. Loaded
// only when its band comes near, since MapLibre is heavy. Decorative.

export const TRIP = [
  { name: "Porto", at: [-8.61, 41.15] },
  { name: "Lisbon", at: [-9.14, 38.72] },
  { name: "Marrakech", at: [-7.99, 31.63] },
  { name: "Istanbul", at: [28.98, 41.01] },
  { name: "Kyoto", at: [135.77, 35.01] },
  { name: "Tokyo", at: [139.69, 35.69] },
] as const satisfies ReadonlyArray<{ name: string; at: readonly [number, number] }>;

const LEGS = TRIP.slice(1).map((stop, i) => ({
  id: stop.name,
  from: [TRIP[i]!.at[0], TRIP[i]!.at[1]] as [number, number],
  to: [stop.at[0], stop.at[1]] as [number, number],
}));

// The globe sways between Europe and Japan, so the trip is always in view:
// around this longitude, this far either way, once every PERIOD_S seconds.
const MID_LNG = 65;
const SWAY = 70;
const PERIOD_S = 40;
// The globe's radius as a share of its box's width.
const FILL = 0.42;

// Zooms so the globe fills its box at any width: at zoom z the world is
// 512·2^z pixels round, so its radius is that over 2π.
const Fit = () => {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!map || !isLoaded) return;
    const fit = () => map.setZoom(Math.log2((FILL * map.getContainer().clientWidth * 2 * Math.PI) / 512));
    fit();
    map.on("resize", fit);
    return () => {
      map.off("resize", fit);
    };
  }, [map, isLoaded]);
  return null;
};

const Turn = ({ active }: { active: boolean }) => {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!map || !isLoaded || !active) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      map.setCenter([MID_LNG + SWAY * Math.sin((2 * Math.PI * t) / PERIOD_S), 30]);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [map, isLoaded, active]);
  return null;
};

export const LiveGlobe = ({ turning }: { turning: boolean }) => {
  return (
    <Map theme="dark" projection={{ type: "globe" }} center={[MID_LNG, 30]} zoom={1.55} interactive={false} className="size-full">
      <MapArc
        data={LEGS}
        interactive={false}
        curvature={0.28}
        paint={{ "line-color": "#fcd34d", "line-width": 2, "line-opacity": 0.95 }}
      />
      {TRIP.map((stop) => (
        <MapMarker key={stop.name} longitude={stop.at[0]} latitude={stop.at[1]} opacityWhenCovered="0">
          <MarkerContent>
            <span className="relative block size-2.5 rounded-full border-2 border-[#141210] bg-amber-200 shadow-[0_0_12px_rgb(253_230_138/0.9)]">
              <span className="absolute top-1/2 left-4 -translate-y-1/2 font-serif text-xs whitespace-nowrap text-white/85 [text-shadow:0_1px_6px_#000]">
                {stop.name}
              </span>
            </span>
          </MarkerContent>
        </MapMarker>
      ))}
      <Fit />
      <Turn active={turning} />
    </Map>
  );
};
