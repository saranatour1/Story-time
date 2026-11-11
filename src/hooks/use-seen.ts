import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "@/lib/api";
import type { Id } from "../../convex/_generated/dataModel";

const EVERY_MS = 5 * 60 * 1000;

// Tells the experience's owner this person is looking: once on opening, then
// every five minutes while the tab is in front. The owner's own visits stamp
// nothing (convex/model/sessions.ts).
export const useSeen = (eventId: Id<"events"> | undefined) => {
  const seen = useMutation(api.sessions.seen);
  useEffect(() => {
    if (eventId === undefined) return;
    const ping = () => {
      // A missed ping only leaves the last one showing.
      if (document.visibilityState === "visible") seen({ eventId }).catch(() => undefined);
    };
    ping();
    const timer = setInterval(ping, EVERY_MS);
    return () => clearInterval(timer);
  }, [eventId, seen]);
};
