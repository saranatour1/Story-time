import { Suspense, lazy } from "react";
import { MapScene } from "@/components/story/map-scene";
import type { LatLng, StoryStep } from "@/lib/story-steps";

type Leg = Extract<StoryStep, { kind: "travel" }>;

// MapLibre only loads when a leg needs it.
const RealMapScene = lazy(() =>
  import("@/components/story/real-map-scene").then((m) => ({ default: m.RealMapScene })),
);

export type TravelSceneProps = {
  leg: Leg;
  // Every leg of the story, in order.
  legs: Leg[];
  // Every place name in story order, for the drawn map.
  places: string[];
  // The places picked on a map, for the real one.
  located: Array<{ name: string; geo: LatLng }>;
  // False when the viewer asked for less motion.
  animate: boolean;
  // The scene in view.
  active: boolean;
  // The scene lies further down the story than the one in view.
  idle: boolean;
  // MapLibre needs WebGL; without it the drawn map is all there is.
  webgl: boolean;
};

// One leg of the journey, on a real map when it can be and on the drawn one
// otherwise. The film player only mounts the scenes next to the one in view.
export const TravelScene = ({
  leg,
  legs,
  places,
  located,
  animate,
  active,
  idle,
  webgl,
}: TravelSceneProps) => {
  const current = legs.indexOf(leg);
  const drawn = (
    <MapScene
      key={active ? "on" : "off"}
      places={places}
      legs={legs}
      current={current}
      animate={animate && active}
      idle={idle}
    />
  );
  // Any leg whose stop is on the map gets the real map, even when where it set
  // off from isn't: that one arrives instead.
  if (!webgl || !leg.toGeo) return drawn;
  return (
    <Suspense fallback={null}>
      <RealMapScene
        leg={leg}
        from={leg.fromGeo}
        to={leg.toGeo}
        legs={legs}
        current={current}
        places={located}
        animate={animate}
        active={active}
        fallback={drawn}
      />
    </Suspense>
  );
};
