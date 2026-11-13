import type { FunctionReturnType } from "convex/server";
import type { api } from "@/lib/api";
import { transportOf } from "../components/event/transport";
import type { MomentView } from "@/components/event/types";
import { formatDateTime, formatDay } from "./local-time";

export type PlanOp = Extract<
  FunctionReturnType<typeof api.ai.command.propose>,
  { kind: "plan" }
>["ops"][number];

export type PlanLine = { heading: string; changes: string[]; destructive: boolean };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const when = (ms: number, offset: number | undefined) =>
  formatDateTime(ms, offset, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const nameOf = (m: MomentView) =>
  `${m.place ?? "A moment"} · ${formatDay(m.startsAt, m.tzOffsetMinutes, { month: "short", day: "numeric" })}`;

const photosIn = (blocks: MomentView["blocks"]) =>
  blocks.filter((b) => b.type === "photo" || b.type === "video").length;

const quoted = (text: string) => `"${text.length > 60 ? `${text.slice(0, 57)}…` : text}"`;

const transportChange = (transport: PlanOp["transport"]): string[] => {
  if (transport === undefined) return [];
  return [
    transport === null
      ? "no transport"
      : (transportOf(transport)?.phrase.toLowerCase() ?? transport),
  ];
};

const describeRemoval = (m: MomentView, stop: number | undefined): PlanLine => {
  if (stop === undefined) {
    const photos = photosIn(m.blocks) + m.stops.reduce((n, s) => n + photosIn(s.blocks), 0);
    return {
      heading: nameOf(m),
      changes: [
        `delete the whole moment${photos > 0 ? `, with its ${plural(photos, "photo")}` : ""}`,
      ],
      destructive: true,
    };
  }
  const gone = m.stops[stop - 2];
  const photos = gone === undefined ? 0 : photosIn(gone.blocks);
  return {
    heading: nameOf(m),
    changes: [
      `remove stop ${stop}${gone?.place ? ` (${gone.place})` : ""}${photos > 0 ? `, with its ${plural(photos, "photo")}` : ""}`,
    ],
    destructive: true,
  };
};

export const describeOp = (op: PlanOp, moments: MomentView[]): PlanLine => {
  if (op.op === "add") {
    return {
      heading: op.place ? `New moment in ${op.place}` : "New moment",
      changes: [
        ...(op.note ? [quoted(op.note)] : []),
        op.startsAt === undefined ? "now" : when(op.startsAt, op.tzOffsetMinutes),
        ...transportChange(op.transport),
        ...(op.labels && op.labels.length > 0 ? [`labels: ${op.labels.join(", ")}`] : []),
      ],
      destructive: false,
    };
  }

  const m = moments.find((x) => x._id === op.momentId);
  if (m === undefined)
    return { heading: "A moment that is no longer here", changes: [], destructive: false };
  const stop = op.stop ?? 1;
  const offset = m.tzOffsetMinutes;

  if (op.op === "edit") {
    const place = stop === 1 ? m.place : m.stops[stop - 2]?.place;
    return {
      heading: stop === 1 ? nameOf(m) : `${nameOf(m)}, stop ${stop}${place ? ` (${place})` : ""}`,
      changes: [
        ...(op.startsAt === undefined ? [] : [`time: ${when(op.startsAt, offset)}`]),
        ...(op.place === undefined ? [] : [op.place === "" ? "no place" : `place: ${op.place}`]),
        ...transportChange(op.transport),
        ...(op.note ? [`add a note ${quoted(op.note)}`] : []),
        ...(op.labels === undefined
          ? []
          : [op.labels.length === 0 ? "no labels" : `labels: ${op.labels.join(", ")}`]),
      ],
      destructive: false,
    };
  }

  if (op.op === "addStop") {
    return {
      heading: nameOf(m),
      changes: [
        `add a stop${op.place ? `: ${op.place}` : ""}${op.after === undefined ? "" : ` after stop ${op.after}`}`,
        ...(op.startsAt === undefined ? [] : [`time: ${when(op.startsAt, offset)}`]),
        ...transportChange(op.transport),
        ...(op.note ? [quoted(op.note)] : []),
      ],
      destructive: false,
    };
  }

  return describeRemoval(m, op.stop);
};

export const placesToFind = (ops: PlanOp[]): string[] => {
  return [...new Set(ops.flatMap((op) => (op.place && op.geo === undefined ? [op.place] : [])))];
};

export const withPins = (
  ops: PlanOp[],
  found: ReadonlyMap<string, { lat: number; lng: number }>,
): PlanOp[] => {
  return ops.map((op) => {
    const geo = op.place === undefined ? undefined : found.get(op.place);
    return geo === undefined ? op : { ...op, geo };
  });
};
