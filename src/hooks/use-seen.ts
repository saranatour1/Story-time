import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "@/lib/api";
import type { Id } from "../../convex/_generated/dataModel";

export const SEEN_PING_MS = 5 * 60 * 1000;

export const useSeen = (eventId: Id<"events"> | undefined) => {
  const seen = useMutation(api.sessions.seen);
  useEffect(() => {
    if (eventId === undefined) return;
    const ping = () => {
      if (document.visibilityState === "visible") seen({ eventId }).catch(() => undefined);
    };
    ping();
    const timer = setInterval(ping, SEEN_PING_MS);
    return () => clearInterval(timer);
  }, [eventId, seen]);
};
