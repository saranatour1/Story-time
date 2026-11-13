import { localParts } from "./monthDay";
import { seeded } from "./seeded";

export const PAGE = { w: 794, h: 1123 } as const;

export const ELEMENT_KINDS = [
  "photo",
  "sticker",
  "title",
  "note",
  "deco",
  "map",
  "drawing",
  "link",
] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

export const PAPERS = [
  "cream",
  "newsprint",
  "kraft",
  "grid",
  "lined",
  "blush",
  "sky",
  "ink",
] as const;
export type Paper = (typeof PAPERS)[number];

export const TITLE_STYLES = [
  "ransom",
  "typewriter",
  "dada",
  "caslon",
  "hand",
  "label",
  "stamp",
] as const;
export const PRINT_STYLES = [
  "polaroid",
  "print",
  "deckle",
  "torn",
  "round",
  "heart",
  "postage",
  "plain",
] as const;
export const NOTE_STYLES = ["typed", "hand", "lined", "kraft", "receipt"] as const;
export const DECOS = [
  "tape",
  "tape-rose",
  "tape-teal",
  "tape-mustard",
  "ticket",
  "postmark",
  "circle-teal",
  "circle-mustard",
  "circle-rust",
  "triangles",
  "dots",
  "star",
  "flower",
  "butterfly",
  "arrow",
  "airmail",
  "luggage-tag",
  "camera",
  "suitcase",
  "plane",
  "film",
  "heart",
  "sun",
  "moon",
  "cloud",
  "leaf",
  "coffee",
  "paperclip",
  "pin",
  "compass",
  "ribbon",
  "speech",
  "tape-gingham",
  "sushi",
  "ramen",
  "onigiri",
  "dumpling",
  "boba",
  "ice-cream",
  "croissant",
  "pretzel",
  "beer",
  "pizza",
  "sakura",
  "mountains",
  "tram",
  "tier",
] as const;
export const TONES = ["sepia", "mono"] as const;
export const DRAW_STYLES = ["pen", "marker", "highlighter"] as const;
export const LINK_STYLES = ["card", "tag"] as const;

export const DECO_WORDS = new Set<string>([
  "ticket",
  "postmark",
  "luggage-tag",
  "ribbon",
  "speech",
  "tier",
]);

export { MAX_JOURNAL_PAGES } from "./limits";
export const MAX_PAGE_ELEMENTS = 120;
export const MAX_ELEMENT_TEXT = 1000;
export const MAX_DRAWING_TEXT = 40_000;
export const MAX_LINK_TEXT = 4000;

export type JournalElement = {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  z: number;
  style?: string;
  text?: string;
  tone?: string;
  color?: string;
  mediaId?: string;
  momentId?: string;
  locked?: boolean;
  own?: boolean;
};

export type PageSpec = { paper: Paper; momentId?: string; elements: JournalElement[] };

type LayoutBlock = { type: string; mediaId?: string; text?: string };
type LayoutStop = {
  place?: string;
  geo?: { lat: number; lng: number };
  transport?: string;
  blocks: LayoutBlock[];
};
export type LayoutMoment = {
  _id: string;
  startsAt: number;
  tzOffsetMinutes?: number;
  place?: string;
  geo?: { lat: number; lng: number };
  transport?: string;
  blocks: LayoutBlock[];
  stops: LayoutStop[];
};

const LIGHT_PAPERS: Paper[] = ["cream", "newsprint", "kraft", "grid", "lined", "blush", "sky"];
const COVER_TITLES = ["ransom", "dada"] as const;
const PAGE_TITLES = ["typewriter", "dada", "caslon", "hand", "label", "stamp", "ransom"] as const;
const TAPES = ["tape", "tape-rose", "tape-teal", "tape-mustard"] as const;
const SHAPES = [
  "circle-teal",
  "circle-mustard",
  "circle-rust",
  "triangles",
  "dots",
  "star",
  "flower",
  "butterfly",
] as const;

const pick = <T>(rnd: () => number, list: readonly T[]): T =>
  list[Math.floor(rnd() * list.length)]!;
const tilt = (rnd: () => number, max: number) => Math.round((rnd() - 0.5) * 2 * max);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const dayLabel = (ms: number, offset?: number): string => {
  const { weekdayIndex, day, monthIndex } = localParts(ms, offset);
  return `${DAYS[weekdayIndex]} ${day} ${MONTHS[monthIndex]}`;
};

export const postmarkDate = (ms: number, offset?: number): string => {
  const { day, monthIndex, year } = localParts(ms, offset);
  return `${day} ${MONTHS[monthIndex]!.toUpperCase()} ${year}`;
};

export const rangeLabel = (from: number, to: number): string => {
  const a = new Date(from);
  const b = new Date(to);
  const day = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  if (a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10))
    return `${day(a)} ${a.getUTCFullYear()}`;
  return `${day(a)} – ${day(b)} ${b.getUTCFullYear()}`;
};

type Dated = { startsAt: number; tzOffsetMinutes?: number };

export const tripDates = (
  trip: { startsAt?: number; endsAt?: number },
  first?: Dated,
  last?: Dated,
): string | undefined => {
  const day = 86_400_000;
  const thirteenHours = 13 * 3_600_000;
  const tripDay = (ms: number) => {
    const utcMidnight = Math.floor(ms / day) * day;
    const next = utcMidnight + day;
    return next - ms <= thirteenHours ? next : utcMidnight;
  };
  const momentDay = (m: Dated) => m.startsAt + (m.tzOffsetMinutes ?? 0) * 60_000;
  const from = trip.startsAt !== undefined ? tripDay(trip.startsAt) : first && momentDay(first);
  if (from === undefined) return undefined;
  const to =
    trip.endsAt !== undefined ? tripDay(trip.endsAt) : last !== undefined ? momentDay(last) : from;
  return rangeLabel(from, to);
};

const shortPlace = (place: string | undefined) => place?.split(",")[0]?.trim() || undefined;

const contentOf = (m: LayoutMoment) => {
  const blocks = [m.blocks, ...m.stops.map((s) => s.blocks)].flat();
  const photos = blocks.flatMap((b) =>
    b.type === "photo" && b.mediaId !== undefined ? [b.mediaId] : [],
  );
  const words = blocks.flatMap((b) =>
    (b.type === "note" || b.type === "feeling") && b.text ? [b.text] : [],
  );
  const places = [m.place, ...m.stops.map((s) => s.place)].flatMap((p) =>
    shortPlace(p) ? [shortPlace(p)!] : [],
  );
  const pinned = (m.geo ? 1 : 0) + m.stops.filter((s) => s.geo).length;
  const transport = m.stops.find((s) => s.transport)?.transport ?? m.transport;
  return { photos, words, places: [...new Set(places)], pinned, transport };
};

const photoBoxes = (
  n: number,
  rnd: () => number,
  top: number,
  bottom: number,
): Array<Omit<JournalElement, "id" | "kind" | "z">> => {
  const room = bottom - top;
  const box = (x: number, y: number, w: number, h: number, max: number) => ({
    x,
    y,
    w,
    h,
    rotation: tilt(rnd, max),
  });
  if (n === 0) return [];
  if (n === 1) return [box(150, top + 10, 494, Math.min(560, room - 20), 3)];
  if (n === 2)
    return [
      box(60, top + 10, 380, Math.min(440, room - 120), 4),
      box(354, top + 150, 380, Math.min(440, room - 160), 4),
    ];
  if (n === 3) {
    return [
      box(56, top + 10, 420, Math.min(470, room - 40), 3),
      box(470, top + 20, 268, Math.min(300, room / 2 - 10), 6),
      box(452, top + 30 + Math.min(300, room / 2 - 10), 286, Math.min(300, room / 2 - 30), 5),
    ];
  }
  const w = 320;
  const h = Math.min(330, room / 2 - 20);
  return [
    box(70, top + 10, w, h, 4),
    box(404, top + 30, w, h, 4),
    box(84, top + h + 40, w, h, 4),
    box(390, top + h + 60, w, h, 4),
  ];
};

export const momentPage = (m: LayoutMoment, index: number): PageSpec => {
  const rnd = seeded(m._id);
  const { photos, words, places, pinned, transport } = contentOf(m);
  const elements: JournalElement[] = [];
  let n = 0;
  const id = () => `${m._id.slice(-6)}-${n++}`;
  const add = (e: Omit<JournalElement, "id">) => elements.push({ id: id(), ...e });

  const shape = pick(rnd, SHAPES);
  add({
    kind: "deco",
    style: shape,
    x: rnd() < 0.5 ? -60 : 560,
    y: rnd() < 0.5 ? 120 : 760,
    w: 300,
    h: 300,
    rotation: tilt(rnd, 20),
    z: 1,
  });

  const title = places[0] ?? dayLabel(m.startsAt, m.tzOffsetMinutes);
  add({
    kind: "title",
    style: PAGE_TITLES[(index + Math.floor(rnd() * 3)) % PAGE_TITLES.length],
    text: title,
    x: 56,
    y: 54,
    w: 520,
    h: 120,
    rotation: tilt(rnd, 3),
    z: 20,
  });
  add({
    kind: "deco",
    style: "postmark",
    text: postmarkDate(m.startsAt, m.tzOffsetMinutes),
    x: 600,
    y: 40,
    w: 150,
    h: 150,
    rotation: 8 + tilt(rnd, 8),
    z: 21,
  });

  const hasMap = pinned >= 2;
  const bottom = words.length > 0 || hasMap ? 820 : 1060;
  const shown = photos.slice(0, 4);
  for (const [i, b] of photoBoxes(shown.length, rnd, 200, bottom).entries()) {
    add({
      kind: "photo",
      style: i === 0 ? "polaroid" : pick(rnd, ["polaroid", "print", "deckle", "postage"] as const),
      mediaId: shown[i],
      ...b,
      z: 10 + i * 2,
    });
    add({
      kind: "deco",
      style: pick(rnd, TAPES),
      x: b.x + b.w / 2 - 70,
      y: b.y - 16,
      w: 140,
      h: 36,
      rotation: b.rotation + tilt(rnd, 10),
      z: 11 + i * 2,
    });
  }

  const word = words[0];
  const bare = shown.length === 0;
  if (word !== undefined) {
    add({
      kind: "note",
      style: pick(rnd, ["typed", "hand", "lined", "kraft"] as const),
      text: word.length > 400 ? `${word.slice(0, 397)}…` : word,
      ...(bare
        ? hasMap
          ? { x: 56, y: 250, w: 330, h: 320 }
          : { x: 90, y: 260, w: 610, h: 320 }
        : hasMap
          ? { x: 70, y: 850, w: 380, h: 200 }
          : { x: 70, y: 850, w: 640, h: 200 }),
      rotation: tilt(rnd, 2),
      z: 30,
    });
  }
  if (hasMap) {
    const box = bare
      ? word === undefined
        ? { x: 150, y: 250, w: 494, h: 520 }
        : { x: 404, y: 236, w: 340, h: 420 }
      : { x: 470, y: 840, w: 270, h: 240 };
    add({ kind: "map", momentId: m._id, ...box, rotation: tilt(rnd, 2), z: 31 });
  }
  if (transport && transport !== "other" && (bare || !hasMap)) {
    const at = bare ? { x: 420, y: 730 } : { x: 540, y: 1000 };
    add({
      kind: "deco",
      style: "ticket",
      text: `BY ${transport.toUpperCase()}`,
      ...at,
      w: 250,
      h: 100,
      rotation: tilt(rnd, 6),
      z: 32,
    });
  }
  if (bare) {
    add({
      kind: "deco",
      style: pick(rnd, ["butterfly", "flower", "arrow"] as const),
      x: 110,
      y: 690,
      w: 190,
      h: 160,
      rotation: tilt(rnd, 14),
      z: 33,
    });
  }

  return {
    paper: LIGHT_PAPERS[(index + Math.floor(rnd() * LIGHT_PAPERS.length)) % LIGHT_PAPERS.length]!,
    momentId: m._id,
    elements,
  };
};

export const layoutPrefix = (momentId: string): string => {
  return `${momentId.slice(-6)}-`;
};

export const catchUpElements = <T extends { id: string; locked?: boolean; own?: boolean }>(
  existing: readonly T[],
  fresh: readonly T[],
  momentId: string,
): T[] => {
  const prefix = layoutPrefix(momentId);
  const kept = existing.filter(
    (e) => e.locked === true || e.own === true || !e.id.startsWith(prefix),
  );
  const keptIds = new Set(kept.map((e) => e.id));
  return [...fresh.filter((e) => !keptIds.has(e.id)), ...kept];
};

export const coverPage = (trip: {
  id: string;
  title: string;
  dates?: string;
  photo?: string;
}): PageSpec => {
  const rnd = seeded(trip.id);
  const elements: JournalElement[] = [];
  let n = 0;
  const add = (e: Omit<JournalElement, "id">) => elements.push({ id: `cover-${n++}`, ...e });
  add({ kind: "deco", style: "circle-teal", x: 360, y: 560, w: 460, h: 460, rotation: 0, z: 1 });
  add({
    kind: "deco",
    style: "triangles",
    x: 60,
    y: 820,
    w: 160,
    h: 220,
    rotation: tilt(rnd, 6),
    z: 2,
  });
  add({ kind: "deco", style: "dots", x: 520, y: 140, w: 220, h: 220, rotation: 0, z: 2 });
  add({
    kind: "title",
    style: pick(rnd, COVER_TITLES),
    text: trip.title.slice(0, 60) || "Our trip",
    x: 60,
    y: 210,
    w: 674,
    h: 240,
    rotation: tilt(rnd, 2),
    z: 20,
  });
  if (trip.dates)
    add({
      kind: "title",
      style: "typewriter",
      text: trip.dates,
      x: 150,
      y: 480,
      w: 494,
      h: 70,
      rotation: tilt(rnd, 2),
      z: 21,
    });
  if (trip.photo) {
    add({
      kind: "photo",
      style: "polaroid",
      mediaId: trip.photo,
      x: 170,
      y: 600,
      w: 420,
      h: 440,
      rotation: -4 + tilt(rnd, 2),
      z: 10,
    });
    add({
      kind: "deco",
      style: "tape-mustard",
      x: 310,
      y: 584,
      w: 140,
      h: 36,
      rotation: tilt(rnd, 8),
      z: 11,
    });
  }
  add({
    kind: "deco",
    style: "postmark",
    text: "STORY-TIME",
    x: 590,
    y: 40,
    w: 150,
    h: 150,
    rotation: 10,
    z: 22,
  });
  return { paper: "cream", elements };
};

const MAX_PAGE_REACH = 5000;
export const withinPageReach = (n: number) => Number.isFinite(n) && Math.abs(n) <= MAX_PAGE_REACH;

export type LinkCard = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  site?: string;
};

export const readLink = (text: string | undefined): LinkCard | undefined => {
  try {
    const p: unknown = JSON.parse(text ?? "");
    if (typeof p !== "object" || p === null) return undefined;
    const field = (k: string) => {
      const value: unknown = Reflect.get(p, k);
      return typeof value === "string" && value.trim() ? value : undefined;
    };
    const url = new URL(field("url") ?? "");
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    const image = field("image");
    return {
      url: url.href,
      title: field("title"),
      description: field("description"),
      image: image?.startsWith("https://") ? image : undefined,
      site: field("site") ?? url.hostname.replace(/^www\./, ""),
    };
  } catch {
    return undefined;
  }
};
