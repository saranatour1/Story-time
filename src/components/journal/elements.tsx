import { PlayIcon, SquareIcon } from "lucide-react";
import {
  lazy,
  Suspense,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type JournalElement, readLink } from "../../../convex/lib/journal";
import { seeded } from "../../../convex/lib/seeded";
import type { StoryMoment } from "@/components/event/types";
import type { MapStop } from "@/components/story/memoir/sticky-map";

// MapLibre stays out of the journal, moments and share graphs until a map is shown.
const StickyMap = lazy(() =>
  import("@/components/story/memoir/sticky-map").then((m) => ({ default: m.StickyMap })),
);
import { tornPolygon, TAPE_ENDS } from "@/lib/paper/look";
import { placeLabel, stopsOf } from "@/lib/story-steps";
import { useMediaUrl, useWhenSeen } from "@/lib/use-media-url";
import { cn } from "@/lib/utils";
import { GINGHAM, MoreSticker } from "./stickers";
import {
  DIE_CUT,
  DISTRESS,
  DRAW_WIDTH,
  FONTS,
  GRAIN,
  INK,
  LIFT,
  MUSTARD,
  NAVY,
  ROSE,
  RUST,
  TEAL,
  TONE_FILTER,
} from "./look";

// Everything that can sit on a journal page, drawn to fill the box it is
// given. Randomness comes from the element's id, so a page looks the same on
// every screen and in an exported PDF.

// The biggest type that fits `text` on `lines` lines in a w×h box, for a font
// whose letters are about `perChar` of the size wide.
const fitSize = (
  text: string,
  w: number,
  h: number,
  perChar: number,
  lineHeight = 1.15,
  maxLines = 3,
) => {
  const len = Math.max(1, [...text].length);
  let best = 8;
  for (let lines = 1; lines <= maxLines; lines++) {
    best = Math.max(best, Math.min(h / (lines * lineHeight), (w * lines) / (len * perChar)));
  }
  return Math.min(best, h * 0.9);
};

// Type for a paragraph that fills a box about `fill` full.
const paragraphSize = (
  text: string,
  w: number,
  h: number,
  perChar: number,
  lineHeight: number,
  min = 12,
  max = 42,
) => {
  const len = Math.max(20, text.length);
  return Math.max(min, Math.min(max, Math.sqrt((w * h * 0.62) / (len * perChar * lineHeight))));
};

// ---- Titles ----------------------------------------------------------------------------

type LetterPaper = { bg: string; fg: string; font: string; weight: number; italic?: boolean };
const LETTERS: LetterPaper[] = [
  { bg: "#1b1714", fg: "#f4ecda", font: FONTS.dada, weight: 700 },
  { bg: "#f6efdd", fg: "#1b1714", font: FONTS.caslon, weight: 700 },
  { bg: RUST, fg: "#fbf3e4", font: FONTS.dada, weight: 600 },
  { bg: "#2f6da3", fg: "#f6efde", font: FONTS.caslon, weight: 400, italic: true },
  { bg: MUSTARD, fg: "#1c1710", font: FONTS.dada, weight: 700 },
  { bg: TEAL, fg: "#f7f1e1", font: FONTS.typewriter, weight: 400 },
  { bg: "#ece4cf", fg: RUST, font: FONTS.caslon, weight: 700, italic: true },
  { bg: ROSE, fg: "#2c1419", font: FONTS.typewriter, weight: 400 },
];

const Ransom = ({ id, text, w, h }: { id: string; text: string; w: number; h: number }) => {
  const size = fitSize(text, w, h, 0.86, 1.25);
  let i = 0;
  return (
    <div
      className="flex size-full flex-wrap content-center items-center justify-center"
      style={{ gap: `${size * 0.1}px ${size * 0.32}px` }}
    >
      {text
        .split(/\s+/)
        .filter(Boolean)
        .map((word, wi) => (
          <span
            key={wi}
            className="inline-flex flex-nowrap items-center"
            style={{ gap: size * 0.04 }}
          >
            {[...word].map((char) => {
              const n = i++;
              const rnd = seeded(`${id}:${n}`);
              const look = LETTERS[Math.floor(rnd() * LETTERS.length)]!;
              const scale = 0.84 + rnd() * 0.24;
              return (
                <span
                  key={n}
                  className="inline-grid place-items-center leading-none"
                  style={{
                    background: look.bg,
                    color: look.fg,
                    fontFamily: look.font,
                    fontWeight: look.weight,
                    fontStyle: look.italic ? "italic" : undefined,
                    fontSize: size * 0.78 * scale,
                    padding: `${size * 0.08}px ${size * 0.1}px`,
                    minWidth: size * 0.62,
                    transform: `rotate(${Math.round((rnd() - 0.5) * 12)}deg) translateY(${Math.round((rnd() - 0.5) * size * 0.12)}px)`,
                    clipPath: tornPolygon(`${id}:${n}`, undefined, 3.5, 4),
                    ...LIFT,
                  }}
                >
                  {/* Always a capital: mixed case read as a typo, not a cut-out. */}
                  {char.toUpperCase()}
                </span>
              );
            })}
          </span>
        ))}
    </div>
  );
};

const Typewriter = ({ id, text, w, h }: { id: string; text: string; w: number; h: number }) => {
  const size = fitSize(text, w, h, 0.66, 1.6);
  return (
    <div
      className="flex size-full flex-wrap content-center items-center justify-center"
      style={{ gap: `${size * 0.22}px ${size * 0.18}px` }}
    >
      {text
        .split(/\s+/)
        .filter(Boolean)
        .map((word, i) => {
          const rnd = seeded(`${id}:w${i}`);
          return (
            <span
              key={i}
              className="leading-none whitespace-nowrap"
              style={{
                background: "#f8f4e8",
                color: INK,
                fontFamily: FONTS.typewriter,
                fontSize: size,
                padding: `${size * 0.16}px ${size * 0.22}px`,
                transform: `rotate(${((rnd() - 0.5) * 3).toFixed(1)}deg)`,
                boxShadow: "0 1px 2px rgba(40,28,10,.25)",
              }}
            >
              {word}
            </span>
          );
        })}
    </div>
  );
};

// Tall condensed capitals, one size, like a poster's. (Letters of two sizes,
// MoUvEmEnT, read as broken type in a title.)
const Dada = ({ text, w, h, ink }: { text: string; w: number; h: number; ink: string }) => {
  return (
    <div
      className="grid size-full place-items-center text-center leading-[1.02]"
      style={{
        color: ink,
        fontFamily: FONTS.dada,
        fontWeight: 600,
        fontSize: fitSize(text, w, h, 0.5, 1.02),
      }}
    >
      <span className="text-balance">{text.toUpperCase()}</span>
    </div>
  );
};

const Plain = ({
  text,
  w,
  h,
  style,
  perChar,
  lineHeight = 1.1,
}: {
  text: string;
  w: number;
  h: number;
  style: CSSProperties;
  perChar: number;
  lineHeight?: number;
}) => {
  return (
    <div
      className="grid size-full place-items-center text-center"
      style={{ fontSize: fitSize(text, w, h, perChar, lineHeight), lineHeight, ...style }}
    >
      <span className="text-balance">{text}</span>
    </div>
  );
};

const Label = ({ text, w, h }: { text: string; w: number; h: number }) => {
  const size = Math.min(h * 0.5, w / (Math.max(1, text.length) * 0.78));
  return (
    <div className="grid size-full place-items-center" style={{ padding: `${h * 0.12}px 0` }}>
      <div
        className="grid h-full w-full place-items-center rounded-[3px] whitespace-nowrap"
        style={{
          background: "linear-gradient(#262422, #121110)",
          color: "#f5f1e8",
          fontFamily: FONTS.dada,
          fontWeight: 500,
          fontSize: size,
          letterSpacing: "0.14em",
          textShadow: "0 1px 0 rgba(255,255,255,.35), 0 -1px 0 rgba(0,0,0,.6)",
          boxShadow: "0 2px 3px rgba(0,0,0,.3)",
        }}
      >
        {text.toUpperCase()}
      </div>
    </div>
  );
};

const Stamp = ({ text, w, h }: { text: string; w: number; h: number }) => {
  const size = fitSize(text, w * 0.86, h * 0.62, 0.62, 1.05, 2);
  return (
    <div
      className="grid size-full place-items-center text-center uppercase"
      style={{
        color: RUST,
        border: `${Math.max(2, h * 0.05)}px double ${RUST}`,
        borderRadius: h * 0.08,
        fontFamily: FONTS.typewriter,
        fontSize: size,
        lineHeight: 1.05,
        letterSpacing: "0.06em",
        opacity: 0.86,
        mixBlendMode: "multiply",
        maskImage: DISTRESS,
      }}
    >
      {text}
    </div>
  );
};

export const Title = ({ e, ink }: { e: JournalElement; ink: string }) => {
  const text = e.text?.trim() || "Your title";
  const { w, h } = e;
  switch (e.style) {
    case "ransom":
      return <Ransom id={e.id} text={text} w={w} h={h} />;
    case "dada":
      return <Dada text={text} w={w} h={h} ink={ink} />;
    case "caslon":
      return (
        <Plain
          text={text}
          w={w}
          h={h}
          perChar={0.46}
          style={{ fontFamily: FONTS.caslon, fontStyle: "italic", color: ink }}
        />
      );
    case "hand":
      return (
        <Plain
          text={text}
          w={w}
          h={h}
          perChar={0.4}
          lineHeight={1}
          style={{ fontFamily: FONTS.hand, color: ink === INK ? RUST : ink }}
        />
      );
    case "label":
      return <Label text={text} w={w} h={h} />;
    case "stamp":
      return <Stamp text={text} w={w} h={h} />;
    default:
      return <Typewriter id={e.id} text={text} w={w} h={h} />;
  }
};

// ---- Notes -------------------------------------------------------------------------------

export const Note = ({ e }: { e: JournalElement }) => {
  const text = e.text?.trim() || "Write something here…";
  const { w, h } = e;
  const style = e.style ?? "typed";
  const typed = style === "typed" || style === "kraft" || style === "receipt";
  const perChar = typed ? 0.6 : 0.42;
  const lineHeight = typed ? 1.45 : 1.15;
  const size = paragraphSize(
    text,
    w * 0.84,
    h * 0.76,
    perChar,
    lineHeight,
    style === "receipt" ? 11 : 13,
    typed ? 26 : 38,
  );
  const paper: Record<string, CSSProperties> = {
    typed: { background: "#fbf8ef" },
    hand: { background: "#fdf3df" },
    lined: {
      background: "#fdfbf4",
      backgroundImage: `linear-gradient(90deg, transparent ${w * 0.1}px, rgba(200,70,70,.4) ${w * 0.1}px, rgba(200,70,70,.4) ${w * 0.1 + 1.5}px, transparent ${w * 0.1 + 1.5}px), repeating-linear-gradient(transparent 0 ${size * lineHeight - 1}px, rgba(70,110,170,.28) ${size * lineHeight - 1}px ${size * lineHeight}px)`,
      backgroundPosition: `0 ${h * 0.12}px`,
    },
    kraft: { background: "#d8bd91" },
    receipt: { background: "#fbfaf5" },
  };
  const edge =
    style === "receipt"
      ? `polygon(0 0, 100% 0, 100% 96%, ${Array.from({ length: 21 }, (_, i) => `${100 - i * 5}% ${i % 2 ? 100 : 96}%`).join(", ")})`
      : tornPolygon(e.id, { top: true, bottom: true }, 2.2);
  return (
    <div className="size-full" style={LIFT}>
      <div
        className="relative size-full overflow-hidden"
        style={{
          ...paper[style],
          clipPath: edge,
          color: INK,
          fontFamily: typed ? FONTS.typewriter : FONTS.hand,
          textTransform: style === "receipt" ? "uppercase" : undefined,
          fontSize: size,
          lineHeight,
          padding: `${h * 0.12}px ${w * (style === "lined" ? 0.14 : 0.08)}px`,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: GRAIN, mixBlendMode: "multiply", opacity: 0.5 }}
        />
        <span className={cn("relative", !e.text?.trim() && "opacity-50")}>{text}</span>
      </div>
    </div>
  );
};

// ---- Photos and stickers ----------------------------------------------------------------

const Picture = ({
  mediaId,
  tone,
  contain = false,
  className,
  style,
  width,
  height,
}: {
  mediaId: string;
  tone?: string;
  contain?: boolean;
  className?: string;
  style?: CSSProperties;
  width?: number;
  height?: number;
}) => {
  const [ref, seen] = useWhenSeen();
  const { url, failed } = useMediaUrl(seen ? mediaId : undefined);
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
      {url ? (
        <img
          src={url}
          alt=""
          width={width}
          height={height}
          sizes={width ? `${Math.round(width)}px` : undefined}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={cn("block size-full", contain ? "object-contain" : "object-cover")}
          style={{ filter: tone ? TONE_FILTER[tone] : undefined }}
        />
      ) : (
        failed && (
          <span className="grid size-full place-items-center text-xs text-stone-600">
            This photo was removed
          </span>
        )
      )}
    </div>
  );
};

// A regular wavy edge, like a photo's deckle-cut border.
const deckle = (steps = 18, depth = 1.4) => {
  const pts: string[] = [];
  const at = (t: number) => (t % 2 === 0 ? 0 : depth);
  for (let i = 0; i <= steps; i++) pts.push(`${(i / steps) * 100}% ${at(i)}%`);
  for (let i = 1; i <= steps; i++) pts.push(`${100 - at(i)}% ${(i / steps) * 100}%`);
  for (let i = steps - 1; i >= 0; i--) pts.push(`${(i / steps) * 100}% ${100 - at(i)}%`);
  for (let i = steps - 1; i >= 1; i--) pts.push(`${at(i)}% ${(i / steps) * 100}%`);
  return `polygon(${pts.join(", ")})`;
};
const DECKLE = deckle();

// The heart, for a heart-cut photo (see HeartClip).
export const HeartClip = () => {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <defs>
        <clipPath id="journal-heart" clipPathUnits="objectBoundingBox">
          <path d="M0.5,0.95 C0.2,0.72 0,0.52 0,0.3 C0,0.13 0.13,0 0.29,0 C0.39,0 0.46,0.05 0.5,0.13 C0.54,0.05 0.61,0 0.71,0 C0.87,0 1,0.13 1,0.3 C1,0.52 0.8,0.72 0.5,0.95 Z" />
        </clipPath>
      </defs>
    </svg>
  );
};

export const Photo = ({ e }: { e: JournalElement }) => {
  if (e.mediaId === undefined) return null;
  const { w, h } = e;
  const tone = e.tone;
  const paper = "#fffdf6";
  const caption = e.text?.trim();
  switch (e.style) {
    // Photos on paper (polaroid, print, deckle) show the whole photo: a frame's
    // shape comes from the page's layout, not the photo, so filling it would
    // cut a tall photo's top and bottom. The paper fills the rest. Stamps and
    // cut-out shapes (postage, torn, round, heart, plain) fill theirs.
    case "print":
      return (
        <div
          className="size-full"
          style={{ background: paper, padding: Math.max(5, w * 0.035), ...LIFT }}
        >
          <Picture mediaId={e.mediaId} width={e.w} height={e.h} tone={tone} contain />
        </div>
      );
    case "deckle":
      return (
        <div className="size-full" style={LIFT}>
          <div
            className="size-full"
            style={{ background: paper, padding: Math.max(8, w * 0.06), clipPath: DECKLE }}
          >
            <Picture mediaId={e.mediaId} width={e.w} height={e.h} tone={tone} contain />
          </div>
        </div>
      );
    case "torn":
      return (
        <div className="size-full" style={LIFT}>
          <div className="size-full" style={{ clipPath: tornPolygon(e.id, undefined, 2.6) }}>
            <Picture mediaId={e.mediaId} width={e.w} height={e.h} tone={tone} />
          </div>
        </div>
      );
    case "round":
      return (
        <div className="size-full" style={LIFT}>
          <div
            className="size-full overflow-hidden rounded-full"
            style={{ border: `${Math.max(4, w * 0.03)}px solid ${paper}` }}
          >
            <Picture mediaId={e.mediaId} width={e.w} height={e.h} tone={tone} />
          </div>
        </div>
      );
    case "heart":
      return (
        <div className="size-full" style={LIFT}>
          <div className="size-full" style={{ clipPath: "url(#journal-heart)" }}>
            <Picture mediaId={e.mediaId} width={e.w} height={e.h} tone={tone} />
          </div>
        </div>
      );
    case "postage": {
      const hole = Math.max(3, Math.min(w, h) * 0.022);
      const step = hole * 3.4;
      return (
        <div className="size-full" style={LIFT}>
          <div
            className="size-full"
            style={{
              background: paper,
              padding: step * 0.62,
              maskImage: `linear-gradient(#000 0 0), radial-gradient(circle, transparent ${hole}px, #000 ${hole + 0.5}px)`,
              maskClip: "content-box, border-box",
              maskSize: `auto, ${step}px ${step}px`,
              maskPosition: `0 0, ${-step / 2}px ${-step / 2}px`,
            }}
          >
            <div className="size-full" style={{ outline: `1px solid rgba(40,28,10,.18)` }}>
              <Picture mediaId={e.mediaId} width={e.w} height={e.h} tone={tone} />
            </div>
          </div>
        </div>
      );
    }
    case "plain":
      return (
        <div className="size-full" style={LIFT}>
          <Picture mediaId={e.mediaId} width={e.w} height={e.h} tone={tone} />
        </div>
      );
    default: {
      // A polaroid: wide white bottom, where its caption is written.
      const edge = Math.max(8, w * 0.055);
      const foot = Math.max(edge * 3, h * 0.17);
      return (
        <div
          className="relative size-full"
          style={{ background: paper, padding: `${edge}px ${edge}px ${foot}px`, ...LIFT }}
        >
          <Picture mediaId={e.mediaId} width={e.w} height={e.h} tone={tone} contain />
          {caption && (
            <div
              className="absolute inset-x-0 bottom-0 grid place-items-center truncate px-2"
              style={{
                height: foot,
                fontFamily: FONTS.hand,
                fontSize: Math.min(foot * 0.55, w / Math.max(6, caption.length * 0.42)),
                color: INK,
              }}
            >
              {caption}
            </div>
          )}
        </div>
      );
    }
  }
};

export const Sticker = ({ e }: { e: JournalElement }) => {
  if (e.mediaId === undefined) return null;
  return (
    <Picture mediaId={e.mediaId} width={e.w} height={e.h} tone={e.tone} contain style={DIE_CUT} />
  );
};

// ---- Bits of ephemera ---------------------------------------------------------------------

const TAPE_COLORS: Record<string, { color: string; pattern?: string }> = {
  tape: { color: "rgba(234,220,176,.82)" },
  "tape-rose": {
    color: "rgba(232,163,166,.8)",
    pattern: "repeating-linear-gradient(90deg, rgba(255,255,255,.45) 0 6px, transparent 6px 14px)",
  },
  "tape-teal": {
    color: "rgba(95,158,151,.78)",
    pattern:
      "radial-gradient(circle, rgba(255,255,255,.55) 2px, transparent 2.5px) 0 0 / 10px 10px",
  },
  "tape-mustard": {
    color: "rgba(224,172,58,.8)",
    pattern: "repeating-linear-gradient(45deg, rgba(255,255,255,.35) 0 4px, transparent 4px 10px)",
  },
  "tape-gingham": { color: "rgba(250,244,232,.85)", pattern: GINGHAM },
};

const Ticket = ({ e }: { e: JournalElement }) => {
  const { w, h } = e;
  const words = e.text?.trim() || "ADMIT ONE";
  const notch = h * 0.16;
  return (
    <div className="size-full" style={LIFT}>
      <div
        className="relative flex size-full items-center"
        style={{
          background: "#f1e2c2",
          maskImage: `radial-gradient(circle at 0 50%, transparent ${notch}px, #000 ${notch + 0.5}px), radial-gradient(circle at 100% 50%, transparent ${notch}px, #000 ${notch + 0.5}px)`,
          maskComposite: "intersect",
          color: "#3b2a1d",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: GRAIN, mixBlendMode: "multiply", opacity: 0.55 }}
        />
        <div
          className="relative flex h-[78%] flex-1 flex-col items-center justify-center border-y border-dashed border-[#3b2a1d]/40"
          style={{ marginLeft: notch * 1.4 }}
        >
          <span
            style={{ fontFamily: FONTS.typewriter, fontSize: h * 0.13, letterSpacing: "0.2em" }}
          >
            TICKET
          </span>
          <span
            className="leading-none whitespace-nowrap"
            style={{
              fontFamily: FONTS.dada,
              fontWeight: 600,
              fontSize: fitSize(words, w * 0.6, h * 0.42, 0.5, 1, 1),
            }}
          >
            {words.toUpperCase()}
          </span>
        </div>
        <div
          className="relative grid h-full place-items-center border-l border-dashed border-[#3b2a1d]/50"
          style={{
            width: w * 0.16,
            marginRight: notch * 1.2,
            color: RUST,
            fontFamily: FONTS.typewriter,
            fontSize: h * 0.13,
          }}
        >
          <span style={{ writingMode: "vertical-rl" }}>
            Nº {String(Math.floor(seeded(e.id)() * 900000) + 100000)}
          </span>
        </div>
      </div>
    </div>
  );
};

const Postmark = ({ e }: { e: JournalElement }) => {
  const words = e.text?.trim() || "STORY-TIME";
  return (
    <svg
      viewBox="0 0 200 200"
      className="size-full overflow-visible"
      style={{ mixBlendMode: "multiply", opacity: 0.8 }}
    >
      <defs>
        <path id={`pm-${e.id}`} d="M 100,100 m -70,0 a 70,70 0 1,1 140,0 a 70,70 0 1,1 -140,0" />
      </defs>
      <g fill="none" stroke={NAVY} strokeWidth="4">
        <circle cx="100" cy="100" r="88" />
        <circle cx="100" cy="100" r="54" strokeWidth="2.5" />
      </g>
      <text fill={NAVY} fontFamily={FONTS.typewriter} fontSize="17" letterSpacing="3">
        <textPath href={`#pm-${e.id}`} startOffset="2%">
          ✶ STORY-TIME ✶ STORY-TIME ✶ STORY-TIME
        </textPath>
      </text>
      <text
        x="100"
        y="108"
        textAnchor="middle"
        fill={NAVY}
        fontFamily={FONTS.typewriter}
        fontSize={Math.min(22, 220 / Math.max(6, words.length))}
      >
        {words}
      </text>
    </svg>
  );
};

const SHAPES = new Set([
  "circle-teal",
  "circle-mustard",
  "circle-rust",
  "triangles",
  "dots",
  "star",
  "flower",
  "butterfly",
  "arrow",
]);

const Shape = ({ name }: { name: string }) => {
  switch (name) {
    case "circle-teal":
    case "circle-mustard":
    case "circle-rust": {
      const color = name === "circle-teal" ? TEAL : name === "circle-mustard" ? MUSTARD : RUST;
      return (
        <div
          className="relative size-full overflow-hidden rounded-full"
          style={{ background: color }}
        >
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ backgroundImage: GRAIN, mixBlendMode: "multiply", opacity: 0.7 }}
          />
        </div>
      );
    }
    case "triangles":
      return (
        <svg viewBox="0 0 100 140" className="size-full" preserveAspectRatio="none">
          {[0, 1, 2].map((i) => (
            <polygon
              key={i}
              points={`50,${i * 44} 92,${i * 44 + 44} 8,${i * 44 + 44}`}
              fill={TEAL}
              opacity={0.92 - i * 0.12}
            />
          ))}
        </svg>
      );
    case "dots":
      return (
        <svg viewBox="0 0 100 100" className="size-full">
          {Array.from({ length: 25 }, (_, i) => (
            <circle
              key={i}
              cx={10 + (i % 5) * 20}
              cy={10 + Math.floor(i / 5) * 20}
              r="4.2"
              fill={MUSTARD}
            />
          ))}
        </svg>
      );
    case "star":
      return (
        <svg viewBox="0 0 100 100" className="size-full">
          <polygon
            points="50,4 61,38 97,38 68,59 79,94 50,73 21,94 32,59 3,38 39,38"
            fill={MUSTARD}
            stroke={INK}
            strokeWidth="1.5"
          />
        </svg>
      );
    case "flower":
      return (
        <svg viewBox="0 0 100 100" className="size-full" style={LIFT}>
          {Array.from({ length: 12 }, (_, i) => (
            <ellipse
              key={i}
              cx="50"
              cy="24"
              rx="9"
              ry="22"
              fill="#fffdf6"
              stroke="#e7dcc4"
              strokeWidth="1"
              transform={`rotate(${i * 30} 50 50)`}
            />
          ))}
          <circle cx="50" cy="50" r="13" fill={MUSTARD} />
        </svg>
      );
    case "butterfly":
      return (
        <svg viewBox="0 0 120 100" className="size-full" style={LIFT}>
          <path
            d="M60,48 C40,8 6,6 10,34 C13,54 40,56 58,52 Z"
            fill="#b7793f"
            stroke={INK}
            strokeWidth="1.5"
          />
          <path
            d="M60,48 C80,8 114,6 110,34 C107,54 80,56 62,52 Z"
            fill="#b7793f"
            stroke={INK}
            strokeWidth="1.5"
          />
          <path
            d="M58,54 C40,60 22,80 34,90 C44,98 56,76 59,58 Z"
            fill="#8f5a2c"
            stroke={INK}
            strokeWidth="1.5"
          />
          <path
            d="M62,54 C80,60 98,80 86,90 C76,98 64,76 61,58 Z"
            fill="#8f5a2c"
            stroke={INK}
            strokeWidth="1.5"
          />
          <circle cx="28" cy="28" r="5" fill="#f3ead6" />
          <circle cx="92" cy="28" r="5" fill="#f3ead6" />
          <rect x="57.5" y="34" width="5" height="38" rx="2.5" fill={INK} />
        </svg>
      );
    case "arrow":
      return (
        <svg viewBox="0 0 160 80" className="size-full overflow-visible">
          <path
            d="M6,60 C40,10 90,10 140,34"
            fill="none"
            stroke={INK}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M122,18 L142,35 L118,44"
            fill="none"
            stroke={INK}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return null;
  }
};

export const Deco = ({ e }: { e: JournalElement }) => {
  const name = e.style ?? "tape";
  const tape = TAPE_COLORS[name];
  if (tape) {
    return (
      <div className="size-full" style={{ filter: "drop-shadow(0 1px 1px rgba(40,28,10,.2))" }}>
        <div
          className="size-full"
          style={{
            clipPath: TAPE_ENDS,
            backgroundColor: tape.color,
            background: tape.pattern ? `${tape.pattern}, ${tape.color}` : tape.color,
          }}
        />
      </div>
    );
  }
  if (name === "ticket") return <Ticket e={e} />;
  if (name === "postmark") return <Postmark e={e} />;
  return SHAPES.has(name) ? <Shape name={name} /> : <MoreSticker e={e} />;
};

// ---- A moment's stops on a map -------------------------------------------------------------

const STEP_MS = 1700;

// The stops of a moment, numbered, on a light map in a postcard frame. Play
// walks it stop by stop, the way the story does.
export const MapCard = ({
  e,
  moment,
  interactive,
}: {
  e: JournalElement;
  moment: StoryMoment | undefined;
  interactive: boolean;
}) => {
  const stops = useMemo<MapStop[]>(() => {
    if (moment === undefined) return [];
    return stopsOf(moment).flatMap((s, i) =>
      s.geo
        ? [
            {
              step: i,
              number: i + 1,
              name: placeLabel(s, i),
              transport: s.transport,
              lng: s.geo.lng,
              lat: s.geo.lat,
            },
          ]
        : [],
    );
  }, [moment]);
  const [focus, setFocus] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const at = focus === null ? -1 : stops.findIndex((s) => s.step === focus);
    const next = stops[at + 1];
    const timer = setTimeout(
      () => {
        if (next === undefined) {
          setPlaying(false);
          setFocus(null);
        } else setFocus(next.step);
      },
      focus === null ? 200 : STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [playing, focus, stops]);
  const at = stops.findIndex((s) => s.step === focus);
  const from = at > 0 ? stops[at - 1] : undefined;
  const here = at >= 0 ? stops[at] : undefined;
  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      className="relative size-full bg-[#fffdf6]"
      style={{ padding: Math.max(6, e.w * 0.035), ...LIFT }}
    >
      {stops.length === 0 ? (
        <div
          className="grid size-full place-items-center bg-[#e9e1cd] text-center text-sm text-stone-600"
          style={{ fontFamily: FONTS.hand, fontSize: 22 }}
        >
          No places on the map yet
        </div>
      ) : (
        <div className={cn("size-full", !interactive && "pointer-events-none")}>
          <Suspense fallback={<div className="size-full bg-[#e9e1cd]" />}>
            <StickyMap
              stops={stops}
              focus={focus}
              leg={
                here && from
                  ? {
                      from: { lat: from.lat, lng: from.lng },
                      to: { lat: here.lat, lng: here.lng },
                      transport: here.transport ?? "walk",
                    }
                  : undefined
              }
              reduced={reduced}
              className="size-full"
              onPick={setFocus}
              light
              printable
            />
          </Suspense>
        </div>
      )}
      {stops.length > 1 && (
        <button
          type="button"
          data-no-drag
          aria-label={playing ? "Stop" : "Play the stops"}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => {
            ev.stopPropagation();
            setPlaying((p) => !p);
            if (!playing) setFocus(null);
          }}
          className="absolute right-3 bottom-3 z-10 grid size-9 place-items-center rounded-full bg-[#1f1a16] text-[#f3ead6] shadow-md hover:bg-[#3a312a]"
          data-export-hide
        >
          {playing ? (
            <SquareIcon className="size-3.5 fill-current" />
          ) : (
            <PlayIcon className="size-4 fill-current" />
          )}
        </button>
      )}
    </div>
  );
};

// ---- Drawings ---------------------------------------------------------------------------

// A drawing is kept as text: its first line the area of the page it was
// drawn in (x y w h), then a line for each stroke: what drew it, its ink, and
// its path in page units. Drawn into its box, it moves and scales with it.
export type Stroke = { style: string; color: string; d: string };
export type DrawingData = { x: number; y: number; w: number; h: number; strokes: Stroke[] };

export const readDrawing = (text: string | undefined): DrawingData | undefined => {
  const [head, ...lines] = (text ?? "").split("\n");
  const nums = (head ?? "").split(" ").map(Number);
  const [x, y, w, h] = nums.length >= 4 ? nums : [0, 0, nums[0], nums[1]];
  if (!w || !h || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  const strokes = lines.flatMap((line): Stroke[] => {
    const [style, color, ...rest] = line.split(" ");
    return style && color && rest.length > 0 ? [{ style, color, d: rest.join(" ") }] : [];
  });
  return { x: x!, y: y!, w, h, strokes };
};

export const writeDrawing = ({ x, y, w, h, strokes }: DrawingData) =>
  [
    `${Math.round(x)} ${Math.round(y)} ${Math.round(w)} ${Math.round(h)}`,
    ...strokes.map((s) => `${s.style} ${s.color} ${s.d}`),
  ].join("\n");

// A smooth path through points, rounded to tenths.
export const pathThrough = (points: Array<{ x: number; y: number }>): string => {
  const r = (n: number) => Math.round(n * 10) / 10;
  const [first, ...rest] = points;
  if (!first) return "";
  if (rest.length === 0) return `M${r(first.x)} ${r(first.y)}l0.1 0`;
  let d = `M${r(first.x)} ${r(first.y)}`;
  for (let i = 0; i < rest.length - 1; i++) {
    const p = rest[i]!;
    const q = rest[i + 1]!;
    d += `Q${r(p.x)} ${r(p.y)} ${r((p.x + q.x) / 2)} ${r((p.y + q.y) / 2)}`;
  }
  const last = rest.at(-1)!;
  return `${d}L${r(last.x)} ${r(last.y)}`;
};

export const StrokePath = ({ stroke }: { stroke: Stroke }) => {
  const look = DRAW_WIDTH[stroke.style] ?? DRAW_WIDTH.pen!;
  return (
    <path
      d={stroke.d}
      fill="none"
      stroke={stroke.color}
      strokeWidth={look.width}
      strokeOpacity={look.opacity}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={stroke.style === "highlighter" ? { mixBlendMode: "multiply" } : undefined}
    />
  );
};

export const Drawing = ({ e }: { e: JournalElement }) => {
  const drawing = readDrawing(e.text);
  if (!drawing) return null;
  return (
    <svg
      viewBox={`${drawing.x} ${drawing.y} ${drawing.w} ${drawing.h}`}
      preserveAspectRatio="none"
      className="size-full overflow-visible"
    >
      {drawing.strokes.map((s, i) => (
        <StrokePath key={i} stroke={s} />
      ))}
    </svg>
  );
};

// ---- Links ------------------------------------------------------------------------------

// A link as a little card: its picture, its title in Caslon, a line about it,
// and where it is from, typed. Opens in a new tab when the journal is read.
export const LinkCard = ({ e, open }: { e: JournalElement; open: boolean }) => {
  const link = readLink(e.text);
  if (!link) return null;
  const { w, h } = e;
  const site = link.site ?? "";
  const body =
    e.style === "tag" ? (
      <svg viewBox="0 0 240 110" className="size-full overflow-visible" style={LIFT}>
        <path d="M46,6 H232 V104 H46 L8,74 V36 Z" fill="#e8d3a8" stroke={INK} strokeWidth="2" />
        <circle cx="34" cy="55" r="7" fill="#f6ecd6" stroke={INK} strokeWidth="2" />
        <text
          x="140"
          y="44"
          textAnchor="middle"
          fontFamily={FONTS.caslon}
          fontStyle="italic"
          fontSize={Math.min(24, 300 / Math.max(8, (link.title ?? site).length))}
          fill={INK}
        >
          {(link.title ?? site).slice(0, 40)}
        </text>
        <text
          x="140"
          y="78"
          textAnchor="middle"
          fontFamily={FONTS.typewriter}
          fontSize="13"
          fill={RUST}
        >
          {site}
        </text>
      </svg>
    ) : (
      <div
        className="flex size-full flex-col overflow-hidden bg-[#fffdf6]"
        style={{ ...LIFT, padding: Math.max(6, w * 0.035) }}
      >
        {link.image && (
          <img
            src={link.image}
            alt=""
            width={Math.round(w)}
            height={Math.round(h * 0.55)}
            loading="lazy"
            decoding="async"
            draggable={false}
            referrerPolicy="no-referrer"
            className="min-h-0 w-full flex-1 object-cover"
            style={{ maxHeight: h * 0.55, filter: "saturate(.9)" }}
            onError={(ev) => (ev.currentTarget.style.display = "none")}
          />
        )}
        <div className="flex min-h-0 flex-col gap-1 pt-2 text-[#1f1a16]">
          <span
            className="line-clamp-2 font-bold"
            style={{
              fontFamily: FONTS.caslon,
              fontSize: Math.max(13, Math.min(26, w / 15)),
              lineHeight: 1.15,
            }}
          >
            {link.title ?? link.url}
          </span>
          {link.description && (
            <span
              className="line-clamp-2 text-stone-600"
              style={{ fontSize: Math.max(11, Math.min(16, w / 26)), lineHeight: 1.3 }}
            >
              {link.description}
            </span>
          )}
          <span
            className="truncate"
            style={{
              fontFamily: FONTS.typewriter,
              fontSize: Math.max(11, Math.min(15, w / 28)),
              color: RUST,
            }}
          >
            ↗ {site}
          </span>
        </div>
      </div>
    );
  return open ? (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block size-full"
      title={link.url}
    >
      {body}
    </a>
  ) : (
    body
  );
};

// ---- One element, whatever it is --------------------------------------------------------

export const ElementView = ({
  e,
  ink,
  moment,
  interactive = false,
}: {
  e: JournalElement;
  ink: string;
  moment?: StoryMoment;
  interactive?: boolean;
}): ReactNode => {
  switch (e.kind) {
    case "photo":
      return <Photo e={e} />;
    case "sticker":
      return <Sticker e={e} />;
    case "title":
      return <Title e={e} ink={ink} />;
    case "note":
      return <Note e={e} />;
    case "map":
      return <MapCard e={e} moment={moment} interactive={interactive} />;
    case "drawing":
      return <Drawing e={e} />;
    case "link":
      return <LinkCard e={e} open={interactive} />;
    default:
      return <Deco e={e} />;
  }
};

// Where an element sits: moved and turned by one transform, so the editor's
// handles can change both while it is dragged.
export const placeOf = (e: Pick<JournalElement, "x" | "y" | "rotation">) =>
  `translate(${e.x}px, ${e.y}px) rotate(${e.rotation}deg)`;

export const elementBox = (e: JournalElement): CSSProperties => ({
  position: "absolute",
  left: 0,
  top: 0,
  width: e.w,
  height: e.h,
  transform: placeOf(e),
  zIndex: e.z,
});
