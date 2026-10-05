import { Map, MapControls } from "@/components/ui/map";

// Minimal mapcn example: default CARTO tiled basemap with zoom controls.
// Use this pattern anywhere streets / labels / geographic context are needed.
// For data-only choropleths, switch to `<Map blank>` + `MapGeoJSON` instead.
export function MapExample({
  className = "h-[320px] overflow-hidden rounded-lg",
}: {
  className?: string;
}) {
  return (
    <div className={className}>
      <Map center={[-74.006, 40.7128]} zoom={11}>
        <MapControls />
      </Map>
    </div>
  );
}
