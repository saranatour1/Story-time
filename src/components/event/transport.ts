import {
  BikeIcon,
  BusIcon,
  CarIcon,
  FootprintsIcon,
  PlaneIcon,
  RouteIcon,
  ShipIcon,
  TrainFrontIcon,
  type LucideIcon,
} from "lucide-react";
import type { MomentView } from "@/components/event/types";

export type Transport = NonNullable<MomentView["transport"]>;

export const TRANSPORT_VALUES = Object.keys({
  walk: true,
  bike: true,
  car: true,
  bus: true,
  train: true,
  plane: true,
  boat: true,
  other: true,
} satisfies Record<Transport, true>) as Transport[];

export const TRANSPORTS: Array<{
  value: Transport;
  label: string;
  phrase: string;
  icon: LucideIcon;
}> = [
  { value: "walk", label: "Walk", phrase: "On foot", icon: FootprintsIcon },
  { value: "bike", label: "Bike", phrase: "By bike", icon: BikeIcon },
  { value: "car", label: "Car", phrase: "By car", icon: CarIcon },
  { value: "bus", label: "Bus", phrase: "By bus", icon: BusIcon },
  { value: "train", label: "Train", phrase: "By train", icon: TrainFrontIcon },
  { value: "plane", label: "Plane", phrase: "By plane", icon: PlaneIcon },
  { value: "boat", label: "Boat", phrase: "By boat", icon: ShipIcon },
  { value: "other", label: "Something else", phrase: "Another way", icon: RouteIcon },
];

export const transportOf = (t: Transport | undefined) => TRANSPORTS.find((x) => x.value === t);

export const stopsOf = (m: MomentView) => {
  return [
    {
      startsAt: m.startsAt as number | undefined,
      place: m.place,
      geo: m.geo,
      transport: m.transport,
      blocks: m.blocks,
    },
    ...m.stops,
  ];
};
