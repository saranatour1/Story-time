import { Suspense, lazy } from "react";
import { MapScene } from "@/components/story/map-scene";
import type { LatLng, StoryStep } from "@/lib/story-steps";

type Leg = Extract<StoryStep, { kind: "travel" }>;

const RealMapScene = lazy(() =>
  import("@/components/story/real-map-scene").then((m) => ({ default: m.RealMapScene })),
);

export type TravelSceneProps = {
  leg: Leg;
  legs: Leg[];
  places: string[];
  located: Array<{ name: string; geo: LatLng }>;
  animate: boolean;
  active: boolean;
  idle: boolean;
  webgl: boolean;
};

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
