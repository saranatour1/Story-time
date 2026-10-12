import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/lib/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PAGE } from "../../../convex/lib/journal";
import type { EventView, MomentView } from "@/components/event/types";
import { JournalPage } from "./page";

// One saved page, small: the picked moment's, else the cover. A page that was
// taken out is not drawn from the moment again.
export function JournalPreview({ event, momentId, scale }: { event: EventView; momentId?: string; scale: number }) {
  const page = useQuery(api.journal.pageForMoment, {
    eventId: event._id,
    momentId: momentId as Id<"moments"> | undefined,
  });
  const moments = useQuery(api.moments.list, { eventId: event._id });
  const byId = useMemo(() => new Map<string, MomentView>((moments ?? []).map((m) => [m._id, m])), [moments]);
  const frame = { width: PAGE.w * scale, height: PAGE.h * scale };
  if (page === undefined || moments === undefined) return <div className="animate-pulse rounded-sm bg-muted" style={frame} />;
  if (page === null) {
    return (
      <div className="grid place-items-center rounded-sm bg-[#e9dfcb] px-4 text-center text-sm text-stone-600" style={frame}>
        {momentId ? "This moment has no page yet." : "No journal yet."}
      </div>
    );
  }
  return <JournalPage page={page} moments={byId} scale={scale} live={false} className="shadow-[0_14px_36px_rgba(40,28,10,.28)]" />;
}
