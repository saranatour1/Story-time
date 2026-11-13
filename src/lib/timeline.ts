import type { MomentView } from "@/components/event/types";
import { formatDay } from "./local-time";
import { allBlocks } from "./moment-filters";
import { dayKey } from "./photo-groups";

export type Day = { day: string; label: string; today: boolean; moments: MomentView[] };

export const groupByDay = (moments: MomentView[], today?: string): Day[] => {
  const days = new Map<string, Day>();
  for (const m of [...moments].sort((a, b) => a.startsAt - b.startsAt)) {
    const key = dayKey(m.startsAt, m.tzOffsetMinutes);
    const day = days.get(key) ?? {
      day: key,
      label: formatDay(m.startsAt, m.tzOffsetMinutes, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      today: key === today,
      moments: [],
    };
    day.moments.push(m);
    days.set(key, day);
  }
  return [...days.values()];
};

export const firstLine = (m: MomentView): string | undefined => {
  for (const b of allBlocks(m)) {
    if (b.type === "note" || b.type === "feeling")
      return b.text.split("\n")[0]!.trim() || undefined;
    if (b.type === "link") return b.title ?? b.url;
  }
  return m.place ?? m.stops.find((s) => s.place)?.place;
};

export const mediaOf = (
  m: MomentView,
): Array<{ mediaId: string; video: boolean; hidden: boolean }> =>
  allBlocks(m).flatMap((b) =>
    b.type === "photo" || b.type === "video"
      ? [{ mediaId: b.mediaId, video: b.type === "video", hidden: b.hidden === true }]
      : [],
  );

const count = (n: number, word: string) => (n === 0 ? "" : `${n} ${word}${n === 1 ? "" : "s"}`);

export const rowLabel = (m: MomentView): string => {
  const line = firstLine(m);
  if (line !== undefined) return line;
  const media = mediaOf(m);
  const videos = media.filter((x) => x.video).length;
  const holds = [count(media.length - videos, "photo"), count(videos, "video")].filter(Boolean);
  return holds.length > 0 ? holds.join(" · ") : "A moment";
};
