import { LoaderCircleIcon, SparklesIcon, TypeIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CommandBar } from "@/components/event/command-bar";
import { canAddTo } from "@/components/event/quick-add";
import type { EventView } from "@/components/event/types";
import { Button } from "@/components/ui/button";

// The assistant, on the canvas itself: a button at the bottom middle that opens
// the same box as the one on the itinerary, so a sentence adds, changes or
// removes moments from here and they land on their day's page. It can also
// name the frames.
export function CanvasAsk({
  event,
  canName,
  naming,
  onName,
}: {
  event: EventView;
  // Whether any frame has moments to read a name from.
  canName: boolean;
  naming: boolean;
  onName: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panel.current?.querySelector("input")?.focus();
  }, [open]);
  if (!canAddTo(event)) return null;

  return (
    <>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Ask the assistant"
          // The box closes its own plan on Escape first; this is for when it has none.
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className="absolute right-3 bottom-[6.25rem] left-3 z-30 rounded-2xl border border-stone-300 bg-[#fbf7ec] p-3 text-stone-900 shadow-2xl @xl:right-auto @xl:bottom-16 @xl:left-1/2 @xl:w-[30rem] @xl:-translate-x-1/2"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xl leading-none" style={{ fontFamily: "var(--font-hand)" }}>
              Ask
            </span>
            <Button size="icon-xs" variant="ghost" aria-label="Close" onClick={() => setOpen(false)}>
              <XIcon aria-hidden />
            </Button>
          </div>
          <CommandBar event={event} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" disabled={!canName || naming} onClick={onName} title="Give each frame a title that fits what is on it">
              {naming ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <TypeIcon aria-hidden />} Name my frames
            </Button>
          </div>
        </div>
      )}
      <Button
        className="absolute bottom-14 left-3 z-20 rounded-full bg-stone-900 px-3.5 text-[#fbf7ec] shadow-lg ring-1 ring-black/10 hover:bg-stone-800 @xl:bottom-3 @xl:left-1/2 @xl:-translate-x-1/2"
        aria-expanded={open}
        aria-label={open ? "Close the assistant" : "Ask the assistant"}
        onClick={() => setOpen((o) => !o)}
      >
        <SparklesIcon aria-hidden /> {open ? "Close" : "Ask"}
      </Button>
    </>
  );
}
