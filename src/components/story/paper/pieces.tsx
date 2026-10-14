import type { CSSProperties, ReactNode } from "react";
import {
  type FrameLook,
  paperLook,
  printLook,
  tapeLook,
  TAPE_ENDS,
  tornPolygon,
} from "@/lib/paper/look";
import { useMediaUrl, useWhenSeen } from "@/lib/use-media-url";
import { cn } from "@/lib/utils";

// The things on a story page, drawn like a scrapbook: torn paper and taped
// prints. Every piece fills the box it is given, and its randomness comes from
// its id, so it looks the same everywhere.

const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0'/></filter><rect width='100%' height='100%' fill='transparent' filter='url(#n)'/></svg>",
)}")`;

// Paper fibre over whatever is under it.
export const Grain = ({ strength = 0.3 }: { strength?: number }) => {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ backgroundImage: GRAIN, mixBlendMode: "multiply", opacity: strength }}
    />
  );
};

// A shadow that follows a cut-out shape (box-shadow would stay a rectangle).
export const LIFT: CSSProperties = {
  filter: "drop-shadow(1px 2px 0 rgba(40,28,10,.16)) drop-shadow(0 5px 7px rgba(40,28,10,.14))",
};
const LIGHT_LIFT: CSSProperties = { filter: "drop-shadow(0 1px 1px rgba(40,28,10,.22))" };

// ---- Pages ---------------------------------------------------------------------

// A page: its colour and one loud shape, with what is on it as children.
export const FrameBoard = ({ look, children }: { look: FrameLook; children?: ReactNode }) => {
  return (
    <div
      className="relative size-full overflow-hidden"
      style={{
        background: look.page,
        boxShadow: "0 1px 0 rgba(0,0,0,.08), 0 12px 30px rgba(40,28,10,.22)",
      }}
    >
      <div
        aria-hidden
        className="absolute rounded-full"
        style={{
          left: "-5%",
          bottom: "-9%",
          width: "24%",
          aspectRatio: "1",
          background: look.accent,
          opacity: 0.92,
        }}
      />
      <Grain strength={0.28} />
      {children}
    </div>
  );
};

// ---- Scraps ---------------------------------------------------------------------

export const Scrap = ({
  id,
  w,
  h,
  look,
  text,
}: {
  id: string;
  w: number;
  h: number;
  look?: string;
  text?: string;
}) => {
  const paper = paperLook(look);
  const size = Math.max(16, Math.min(h * 0.24, w * 0.115));
  return (
    <div className="size-full" style={LIFT}>
      <div
        className="relative size-full overflow-hidden"
        style={{
          clipPath: tornPolygon(id, { top: true, bottom: true }, 2.4),
          background: paper.page,
          color: paper.ink,
          fontFamily: "var(--font-hand)",
          fontSize: size,
          lineHeight: 1.08,
          padding: `${h * 0.14}px ${w * 0.08}px`,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        <Grain strength={0.22} />
        <span className="relative">{text}</span>
      </div>
    </div>
  );
};

// ---- Prints ---------------------------------------------------------------------

const Picture = ({
  mediaId,
  w,
  h,
  className,
  style,
}: {
  mediaId: string;
  w: number;
  h: number;
  className?: string;
  style?: CSSProperties;
}) => {
  const [ref, seen] = useWhenSeen();
  const { url, failed } = useMediaUrl(seen ? mediaId : undefined, "thumb");
  return (
    <div
      ref={ref}
      className={cn(
        "size-full",
        !url && "bg-stone-300/70",
        !url && !failed && "animate-pulse",
        className,
      )}
      style={style}
    >
      {url && (
        <img
          src={url}
          alt=""
          width={Math.round(w)}
          height={Math.round(h)}
          sizes={`${Math.round(w)}px`}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-cover"
        />
      )}
      {failed && (
        <span className="grid size-full place-items-center text-[0.7em] text-stone-600">
          Photo unavailable
        </span>
      )}
    </div>
  );
};

export const Print = ({
  id,
  w,
  h,
  look,
  mediaId,
}: {
  id: string;
  w: number;
  h: number;
  look?: string;
  mediaId: string;
}) => {
  const style = printLook(look);
  if (style === "torn") {
    return (
      <div className="size-full" style={LIFT}>
        <div
          className="size-full"
          style={{
            clipPath: tornPolygon(id, { top: true, right: true, bottom: true, left: true }, 2.2),
          }}
        >
          <Picture mediaId={mediaId} w={w} h={h} />
        </div>
      </div>
    );
  }
  if (style === "cutout") {
    return (
      <div
        className="size-full"
        style={{
          border: `${Math.max(3, w * 0.018)}px solid #fffdf6`,
          boxShadow: `${w * 0.014}px ${w * 0.02}px 0 rgba(30,20,8,.3)`,
        }}
      >
        <Picture mediaId={mediaId} w={w} h={h} />
      </div>
    );
  }
  if (style === "plain") {
    return (
      <div className="size-full" style={LIFT}>
        <Picture mediaId={mediaId} w={w} h={h} />
      </div>
    );
  }
  // A print with its white border, wider along the bottom.
  const edge = Math.max(4, w * 0.045);
  return (
    <div
      className="relative size-full bg-[#fdfaf1]"
      style={{ ...LIFT, padding: `${edge}px ${edge}px ${Math.max(edge * 2.6, h * 0.12)}px` }}
    >
      <Picture mediaId={mediaId} w={w} h={h} />
    </div>
  );
};

// ---- Tape ------------------------------------------------------------------------

export const Tape = ({ look }: { look?: string }) => {
  const tape = tapeLook(look);
  return (
    <div className="size-full" style={LIGHT_LIFT}>
      <div
        className="size-full"
        style={{
          clipPath: TAPE_ENDS,
          background: tape.color,
          backgroundImage: tape.stripe
            ? "repeating-linear-gradient(90deg, rgba(255,255,255,.42) 0 7px, transparent 7px 14px)"
            : undefined,
        }}
      />
    </div>
  );
};
