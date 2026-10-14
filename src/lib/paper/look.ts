// How paper looks on a story page: pages with a colour, scraps, taped prints.
// Everything here is a name and a few colours; the page draws the rest.

// ---- Random that stays put ---------------------------------------------------

// A repeatable stream of numbers in [0, 1) from any string. A torn edge or a
// print's tilt comes from the moment's id, so it looks the same every time it
// is drawn, on every screen, in a shared link too.
export const seeded = (seed: string): (() => number) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---- Pages -----------------------------------------------------------------------

export type FrameLook = {
  id: string;
  name: string;
  // The page, the ink on it, and the one loud colour (a block, a dot).
  page: string;
  ink: string;
  accent: string;
};

export const FRAME_LOOKS: FrameLook[] = [
  { id: "peach", name: "Peach book", page: "#f6d3ac", ink: "#201a16", accent: "#e8987a" },
  { id: "cream", name: "Cream gallery", page: "#f7f1e2", ink: "#1c1917", accent: "#e8805a" },
  { id: "slate", name: "Slate blue", page: "#5b769a", ink: "#f6f0e1", accent: "#f0a9b9" },
  { id: "sky", name: "Sky ledger", page: "#cfe4f3", ink: "#1b2430", accent: "#e5584b" },
  { id: "kraft", name: "Kraft paper", page: "#cba978", ink: "#2a1e12", accent: "#2f4a3a" },
  { id: "plum", name: "Plum plate", page: "#6b5b87", ink: "#f4eee3", accent: "#f2c14e" },
];

export const frameLook = (id: string | undefined): FrameLook =>
  FRAME_LOOKS.find((l) => l.id === id) ?? FRAME_LOOKS[1]!;

// ---- Paper scraps -------------------------------------------------------------

export type PaperLook = { id: string; name: string; page: string; ink: string };

export const PAPERS: PaperLook[] = [
  { id: "paper", name: "Paper", page: "#fbf7ec", ink: "#231d17" },
  { id: "kraft", name: "Kraft", page: "#d9be92", ink: "#2a1e12" },
  { id: "news", name: "Newsprint", page: "#e9e4d6", ink: "#1c1b19" },
  { id: "sky", name: "Sky", page: "#a9c7e4", ink: "#14202c" },
  { id: "rose", name: "Rose", page: "#f0b9c6", ink: "#2c1419" },
  { id: "sun", name: "Sun", page: "#f4de8a", ink: "#2a2208" },
];

export const paperLook = (id: string | undefined): PaperLook =>
  PAPERS.find((p) => p.id === id) ?? PAPERS[0]!;

// ---- Prints --------------------------------------------------------------------

export const PRINTS = [
  { id: "print", name: "Print" },
  { id: "torn", name: "Torn" },
  { id: "cutout", name: "Cutout" },
  { id: "plain", name: "Plain" },
] as const;
export type PrintId = (typeof PRINTS)[number]["id"];
export const printLook = (id: string | undefined): PrintId =>
  PRINTS.find((p) => p.id === id)?.id ?? "print";

// ---- Tape ----------------------------------------------------------------------

export const TAPES = [
  { id: "tape", name: "Masking", color: "rgba(236, 222, 176, 0.78)", stripe: false },
  { id: "washi-red", name: "Red washi", color: "rgba(214, 84, 70, 0.72)", stripe: true },
  { id: "washi-blue", name: "Blue washi", color: "rgba(86, 134, 188, 0.72)", stripe: true },
  { id: "washi-yellow", name: "Yellow washi", color: "rgba(240, 196, 72, 0.78)", stripe: true },
] as const;
export const tapeLook = (id: string | undefined) => TAPES.find((t) => t.id === id) ?? TAPES[0];

// ---- Torn edges ---------------------------------------------------------------

// A CSS polygon for a rectangle with an uneven, torn edge on the sides in
// `edges`, as percentages so it fits any size. `roughness` is how far a point
// strays, in percent of the side.
export const tornPolygon = (
  seed: string,
  edges: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean } = {
    top: true,
    right: true,
    bottom: true,
    left: true,
  },
  roughness = 1.8,
  steps = 14,
): string => {
  const rnd = seeded(seed);
  const wobble = (on: boolean | undefined) => (on ? rnd() * roughness : 0);
  const pts: string[] = [];
  const pct = (n: number) => `${n.toFixed(2)}%`;
  // Clockwise from the top-left corner.
  for (let i = 0; i <= steps; i++) pts.push(`${pct((i / steps) * 100)} ${pct(wobble(edges.top))}`);
  for (let i = 1; i <= steps; i++)
    pts.push(`${pct(100 - wobble(edges.right))} ${pct((i / steps) * 100)}`);
  for (let i = steps - 1; i >= 0; i--)
    pts.push(`${pct((i / steps) * 100)} ${pct(100 - wobble(edges.bottom))}`);
  for (let i = steps - 1; i >= 1; i--)
    pts.push(`${pct(wobble(edges.left))} ${pct((i / steps) * 100)}`);
  return `polygon(${pts.join(", ")})`;
};

// The jagged ends of a strip of tape.
export const TAPE_ENDS =
  "polygon(0 0, 100% 0, 98% 20%, 100% 40%, 98% 60%, 100% 80%, 98% 100%, 0 100%, 2% 80%, 0 60%, 2% 40%, 0 20%)";
