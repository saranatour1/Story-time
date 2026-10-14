import { forwardRef, useEffect, type ReactNode } from "react";
import { type JournalElement, PAGE } from "../../../convex/lib/journal";
import type { StoryMoment } from "@/components/event/types";
import { placeLabel, stopsOf } from "@/lib/story-steps";
import { cn } from "@/lib/utils";
import { ElementView, elementBox, HeartClip } from "./elements";
import journalFonts from "./journal-fonts.css?url";
import { FONTS, paperLook } from "./look";

// Caveat, Special Elite, Libre Caslon and Oswald are only needed once a page
// is on screen. The landing keeps Manrope and Newsreader.
const useJournalFonts = () => {
  useEffect(() => {
    const id = "journal-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = journalFonts;
    document.head.appendChild(link);
  }, []);
};

export type PageData = {
  _id: string;
  paper: string;
  locked: boolean;
  momentId?: string;
  elements: JournalElement[];
};

// One A4 page, drawn at `scale`: its paper and everything on it, back to front.
// `children` sit on top in page units (the editor's handles and text box).
export const JournalPage = forwardRef<
  HTMLDivElement,
  {
    page: Pick<PageData, "paper" | "elements">;
    moments: ReadonlyMap<string, StoryMoment>;
    scale: number;
    // Maps can be played and photos shown at full size; off in thumbnails.
    live?: boolean;
    // Paper export: photos stay, maps print as place names. Tiles are
    // cross-origin and would come out blank.
    print?: boolean;
    pageKey?: string;
    // Being read: links open.
    reading?: boolean;
    className?: string;
    children?: ReactNode;
  }
>(function JournalPage(
  {
    page,
    moments,
    scale,
    live = true,
    print = false,
    pageKey,
    reading = false,
    className,
    children,
  },
  ref,
) {
  useJournalFonts();
  const look = paperLook(page.paper);
  const elements = [...page.elements].sort((a, b) => a.z - b.z);
  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: PAGE.w * scale, height: PAGE.h * scale }}
    >
      <div
        ref={ref}
        data-journal-page
        data-page-id={pageKey}
        className="paper-scope absolute top-0 left-0 overflow-hidden"
        style={{
          ...look.style,
          width: PAGE.w,
          height: PAGE.h,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          color: look.ink,
        }}
      >
        <HeartClip />
        {elements.map((e) => {
          const moment = e.momentId ? moments.get(e.momentId) : undefined;
          const names = e.kind === "map" && (!live || print);
          const stub = (e.kind === "photo" || e.kind === "sticker") && !live && !print;
          return (
            <div key={e.id} data-el={e.id} style={elementBox(e)}>
              {names ? (
                <MapNames moment={moment} />
              ) : stub ? (
                <div className="size-full bg-[#e6dcc6]" />
              ) : (
                <ElementView e={e} ink={look.ink} moment={moment} interactive={reading && live} />
              )}
            </div>
          );
        })}
        {children}
      </div>
    </div>
  );
});

// Place names in the postcard frame, for a thumbnail or a printed page.
const MapNames = ({ moment }: { moment: StoryMoment | undefined }) => {
  const names =
    moment === undefined
      ? []
      : stopsOf(moment)
          .map((stop, i) => placeLabel(stop, i))
          .filter((name) => name !== "");
  return (
    <div className="size-full bg-[#fffdf6] p-2">
      <div
        className="flex size-full flex-col items-center justify-center gap-1 bg-[#dfe7df] px-3 text-center text-stone-600"
        style={{ fontFamily: FONTS.hand, fontSize: 22 }}
      >
        {names.length === 0
          ? "No places on the map yet"
          : names.map((name) => <span key={name}>{name}</span>)}
      </div>
    </div>
  );
};
