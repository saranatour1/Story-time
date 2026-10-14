import type { CSSProperties } from "react";

// What a journal looks like: papers, inks and the type it is set in. Taken from
// old type specimens, Dada letterheads, newsprint and scrapbooks: cream paper,
// black and rust ink, teal and mustard shapes.

export const INK = "#1f1a16";
export const RUST = "#c4552f";
export const TEAL = "#5f9e97";
export const MUSTARD = "#e0ac3a";
export const ROSE = "#e8a3a6";
export const NAVY = "#2f3b63";

export const FONTS = {
  typewriter: "'Special Elite', 'Courier New', monospace",
  caslon: "'Libre Caslon Text', 'Newsreader Variable', Georgia, serif",
  dada: "'Oswald Variable', Impact, 'Arial Narrow', sans-serif",
  hand: "var(--font-hand)",
  serif: "var(--font-serif)",
} as const;

// The fibre of paper, drawn once and laid over anything.
export const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.25  0 0 0 0 0.18  0 0 0 0 0.1  0 0 0 .5 0'/></filter><rect width='100%' height='100%' fill='transparent' filter='url(#n)'/></svg>",
)}")`;

// Lines of small grey type, as on a page of newsprint behind a collage.
const NEWS = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='120'><g fill='#3a332b' fill-opacity='.13'>" +
    Array.from({ length: 10 }, (_, i) => {
      const y = 6 + i * 11.5;
      // Words of uneven length, so it reads as type and not as stripes.
      let x = 4;
      let out = "";
      let k = i * 7;
      while (x < 232) {
        const w = 8 + ((k * 37) % 26);
        out += `<rect x='${x}' y='${y}' width='${Math.min(w, 236 - x)}' height='5' rx='1'/>`;
        x += w + 4;
        k++;
      }
      return out;
    }).join("") +
    "</g></svg>",
)}")`;

// Worn ink, for a rubber stamp: mostly there, with flecks missing.
export const DISTRESS = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='d'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.9'/></filter><rect width='100%' height='100%' filter='url(#d)'/></svg>",
)}")`;

export type PaperLook = { name: string; color: string; ink: string; style: CSSProperties };

const vignette = "radial-gradient(ellipse at center, transparent 55%, rgba(90,60,20,.16) 100%)";

export const PAPER_LOOKS: Record<string, PaperLook> = {
  cream: {
    name: "Cream",
    color: "#f3ead6",
    ink: INK,
    style: { backgroundColor: "#f3ead6", backgroundImage: `${vignette}, ${GRAIN}` },
  },
  newsprint: {
    name: "Newsprint",
    color: "#ebe5d5",
    ink: INK,
    style: {
      backgroundColor: "#ebe5d5",
      backgroundImage: `${vignette}, ${NEWS}, ${GRAIN}`,
      backgroundSize: "auto, 240px 120px, auto",
    },
  },
  kraft: {
    name: "Kraft",
    color: "#c8a77a",
    ink: INK,
    style: { backgroundColor: "#c8a77a", backgroundImage: `${vignette}, ${GRAIN}, ${GRAIN}` },
  },
  grid: {
    name: "Graph",
    color: "#f6f2e6",
    ink: INK,
    style: {
      backgroundColor: "#f6f2e6",
      backgroundImage: `${vignette}, linear-gradient(rgba(70,120,160,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(70,120,160,.18) 1px, transparent 1px), ${GRAIN}`,
      backgroundSize: "auto, 26px 26px, 26px 26px, auto",
    },
  },
  lined: {
    name: "Lined",
    color: "#faf6ea",
    ink: INK,
    style: {
      backgroundColor: "#faf6ea",
      backgroundImage: `${vignette}, linear-gradient(90deg, transparent 78px, rgba(200,70,70,.35) 78px, rgba(200,70,70,.35) 80px, transparent 80px), repeating-linear-gradient(transparent 0 33px, rgba(70,110,170,.22) 33px 34px), ${GRAIN}`,
    },
  },
  blush: {
    name: "Blush",
    color: "#f2d8cf",
    ink: INK,
    style: { backgroundColor: "#f2d8cf", backgroundImage: `${vignette}, ${GRAIN}` },
  },
  sky: {
    name: "Sky",
    color: "#d8e6ea",
    ink: INK,
    style: { backgroundColor: "#d8e6ea", backgroundImage: `${vignette}, ${GRAIN}` },
  },
  ink: {
    name: "Ink",
    color: "#26221d",
    ink: "#f3ead6",
    style: {
      backgroundColor: "#26221d",
      backgroundImage: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,.35) 100%), ${GRAIN}`,
    },
  },
};

export const paperLook = (name: string | undefined): PaperLook =>
  PAPER_LOOKS[name ?? "cream"] ?? PAPER_LOOKS.cream!;

// A cut-out's lift off the page: a hard edge shadow and a soft one.
export const LIFT: CSSProperties = {
  filter: "drop-shadow(1px 2px 0 rgba(40,28,10,.18)) drop-shadow(0 6px 8px rgba(40,28,10,.18))",
};

// The white die-cut edge round a sticker.
export const DIE_CUT: CSSProperties = {
  filter:
    "drop-shadow(2.5px 0 0 #fffdf6) drop-shadow(-2.5px 0 0 #fffdf6) drop-shadow(0 2.5px 0 #fffdf6) drop-shadow(0 -2.5px 0 #fffdf6) drop-shadow(0 4px 5px rgba(40,28,10,.28))",
};

// A photo's tone: as it is, or aged.
export const TONE_FILTER: Record<string, string> = {
  sepia: "sepia(.7) saturate(.85) contrast(1.05) brightness(1.02)",
  mono: "grayscale(1) contrast(1.08)",
};

// Labels for the pickers.
export const TITLE_NAMES: Record<string, string> = {
  ransom: "Ransom",
  typewriter: "Typewriter",
  dada: "Dada",
  caslon: "Caslon",
  hand: "Handwritten",
  label: "Label tape",
  stamp: "Rubber stamp",
};
export const PRINT_NAMES: Record<string, string> = {
  polaroid: "Polaroid",
  print: "Print",
  deckle: "Deckle edge",
  torn: "Torn",
  round: "Circle",
  heart: "Heart",
  postage: "Postage stamp",
  plain: "Plain",
};
export const NOTE_NAMES: Record<string, string> = {
  typed: "Typed",
  hand: "Handwritten",
  lined: "Notebook",
  kraft: "Kraft",
  receipt: "Receipt",
};
export const DECO_NAMES: Record<string, string> = {
  tape: "Masking tape",
  "tape-rose": "Rose washi",
  "tape-teal": "Teal washi",
  "tape-mustard": "Mustard washi",
  ticket: "Ticket",
  postmark: "Postmark",
  "circle-teal": "Teal circle",
  "circle-mustard": "Mustard circle",
  "circle-rust": "Rust circle",
  triangles: "Triangles",
  dots: "Dots",
  star: "Star",
  flower: "Daisy",
  butterfly: "Butterfly",
  arrow: "Arrow",
  airmail: "Par avion label",
  "luggage-tag": "Luggage tag",
  camera: "Camera",
  suitcase: "Suitcase",
  plane: "Little plane",
  film: "Film strip",
  heart: "Heart",
  sun: "Sun",
  moon: "Moon",
  cloud: "Cloud",
  leaf: "Leaf",
  coffee: "Coffee cup",
  paperclip: "Paper clip",
  pin: "Map pin",
  compass: "Compass",
  ribbon: "Ribbon banner",
  speech: "Speech bubble",
  "tape-gingham": "Gingham tape",
  sushi: "Sushi",
  ramen: "Ramen",
  onigiri: "Onigiri",
  dumpling: "Dumpling",
  boba: "Bubble tea",
  "ice-cream": "Ice cream",
  croissant: "Croissant",
  pretzel: "Pretzel",
  beer: "Beer",
  pizza: "Pizza slice",
  sakura: "Cherry blossom",
  mountains: "Mountains",
  tram: "Tram",
  tier: "Tier row",
};

// The inks a drawing can be made in.
export const INKS = [
  { name: "Ink", color: "#1f1a16" },
  { name: "Rust", color: "#c4552f" },
  { name: "Teal", color: "#3f8a82" },
  { name: "Mustard", color: "#d29a1f" },
  { name: "Rose", color: "#d9707a" },
  { name: "Navy", color: "#2f3b63" },
  { name: "White", color: "#fffdf6" },
] as const;

export const DRAW_NAMES: Record<string, string> = {
  pen: "Pen",
  marker: "Marker",
  highlighter: "Highlighter",
};
// How thick each makes a line, in page units, and how see-through.
export const DRAW_WIDTH: Record<string, { width: number; opacity: number }> = {
  pen: { width: 3.5, opacity: 1 },
  marker: { width: 10, opacity: 0.95 },
  highlighter: { width: 26, opacity: 0.35 },
};
