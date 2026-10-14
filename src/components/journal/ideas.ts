import {
  type JournalElement,
  MAX_ELEMENT_TEXT,
  PAGE,
  type Paper,
  postmarkDate,
} from "../../../convex/lib/journal";
import { formatTime } from "@/lib/local-time";
import { allBlocks } from "@/lib/moment-filters";
import { type Day, firstLine } from "@/lib/timeline";
import { newId } from "./add";

// Pages to start from, after the references: an old type specimen, a Dada
// letterhead, a magazine spread, a wall of photos, a pile of ephemera, a
// postcard. Each uses the trip's own photos (when it has them) and its title,
// and words to write over.

export type Idea = {
  id: string;
  name: string;
  hint: string;
  paper: Paper;
  make: (trip: Trip) => JournalElement[];
  // Further pages when one page cannot hold it (a long tier list).
  more?: (trip: Trip) => JournalElement[][];
};
type Trip = { title: string; photos: string[]; dates?: string };

type Part = Omit<JournalElement, "id" | "z" | "rotation"> & { rotation?: number };

// Ids and stacking for a list of parts, back to front.
const page = (parts: Array<Part | false | undefined>): JournalElement[] =>
  parts
    .filter((p): p is Part => Boolean(p))
    .map((p, i) => ({ rotation: 0, ...p, id: newId(), z: i + 1 }));

const photo = (trip: Trip, i: number) => trip.photos[i % Math.max(1, trip.photos.length)];

export const IDEAS: Idea[] = [
  {
    id: "specimen",
    name: "Type specimen",
    hint: "Big Caslon letters and a line about the day",
    paper: "cream",
    make: (trip) =>
      page([
        { kind: "title", style: "caslon", text: "ABCD", x: 50, y: 60, w: 690, h: 220 },
        { kind: "title", style: "caslon", text: trip.title, x: 60, y: 300, w: 670, h: 110 },
        {
          kind: "deco",
          style: "ribbon",
          text: "DOUBLE PICA ROMAN",
          x: 210,
          y: 430,
          w: 370,
          h: 100,
        },
        {
          kind: "note",
          style: "typed",
          text: "Quietly, in the order it happened: where we went, what we ate, who laughed first.",
          x: 60,
          y: 560,
          w: 380,
          h: 240,
          rotation: -1,
        },
        trip.photos.length > 0 && {
          kind: "photo",
          style: "plain",
          tone: "sepia",
          mediaId: photo(trip, 0),
          x: 470,
          y: 560,
          w: 270,
          h: 340,
          rotation: 2,
        },
        {
          kind: "title",
          style: "hand",
          text: trip.dates ?? "the year we went",
          x: 80,
          y: 960,
          w: 640,
          h: 90,
        },
      ]),
  },
  {
    id: "dada",
    name: "Dada letterhead",
    hint: "Letters of two sizes, typed lines and a stamp",
    paper: "newsprint",
    make: (trip) =>
      page([
        {
          kind: "title",
          style: "dada",
          text: `Mouvement ${trip.title}`.slice(0, 40),
          x: 50,
          y: 50,
          w: 700,
          h: 240,
        },
        {
          kind: "title",
          style: "typewriter",
          text: "Berlin · Lisbon · Paris · home",
          x: 340,
          y: 310,
          w: 410,
          h: 60,
        },
        {
          kind: "title",
          style: "stamp",
          text: "Consultations: 10 frs",
          x: 60,
          y: 430,
          w: 250,
          h: 80,
          rotation: -4,
        },
        {
          kind: "note",
          style: "typed",
          text: "Dear friends, we went, we saw, we took far too many photos. What follows is all of it, more or less in order.",
          x: 330,
          y: 430,
          w: 410,
          h: 340,
        },
        trip.photos.length > 0 && {
          kind: "photo",
          style: "torn",
          tone: "mono",
          mediaId: photo(trip, 0),
          x: 70,
          y: 560,
          w: 240,
          h: 280,
          rotation: -3,
        },
        {
          kind: "title",
          style: "hand",
          text: "with love, us",
          x: 360,
          y: 820,
          w: 360,
          h: 90,
          rotation: -2,
        },
        {
          kind: "deco",
          style: "postmark",
          text: trip.dates?.split(" ").slice(-1)[0] ?? "HELLO",
          x: 590,
          y: 930,
          w: 150,
          h: 150,
          rotation: 12,
        },
      ]),
  },
  {
    id: "magazine",
    name: "Magazine spread",
    hint: "A big photo, a headline, two columns",
    paper: "cream",
    make: (trip) =>
      page([
        trip.photos.length > 0 && {
          kind: "photo",
          style: "plain",
          mediaId: photo(trip, 0),
          x: 0,
          y: 0,
          w: 794,
          h: 520,
        },
        { kind: "title", style: "caslon", text: trip.title, x: 50, y: 560, w: 694, h: 120 },
        {
          kind: "title",
          style: "typewriter",
          text: "a life, in a week",
          x: 230,
          y: 690,
          w: 330,
          h: 50,
        },
        {
          kind: "note",
          style: "typed",
          text: "The first thing we noticed was the light. Everything after that was coffee, trains and getting a little lost on purpose.",
          x: 50,
          y: 770,
          w: 335,
          h: 300,
        },
        {
          kind: "note",
          style: "typed",
          text: "Write the rest here: who was there, what you'd tell a friend, what you'd do again.",
          x: 409,
          y: 770,
          w: 335,
          h: 300,
        },
      ]),
  },
  {
    id: "wall",
    name: "Photo wall",
    hint: "A grid of prints on kraft, a little aged",
    paper: "kraft",
    make: (trip) => {
      const n = Math.min(9, Math.max(trip.photos.length, 1));
      const cols = n <= 4 ? 2 : 3;
      const w = cols === 2 ? 320 : 214;
      const h = cols === 2 ? 360 : 250;
      return page([
        {
          kind: "title",
          style: "label",
          text: trip.title.slice(0, 26),
          x: 170,
          y: 40,
          w: 454,
          h: 70,
        },
        ...Array.from({ length: trip.photos.length === 0 ? 0 : n }, (_, i): Part => ({
          kind: "photo",
          style: i % 3 === 1 ? "deckle" : "print",
          tone: "sepia",
          mediaId: photo(trip, i),
          x: 50 + (i % cols) * (w + 26),
          y: 140 + Math.floor(i / cols) * (h + 30),
          w,
          h,
          rotation: ((i * 37) % 7) - 3,
        })),
      ]);
    },
  },
  {
    id: "ephemera",
    name: "Bits and pieces",
    hint: "Tickets, airmail, a tag and a little sun",
    paper: "newsprint",
    make: (trip) =>
      page([
        { kind: "deco", style: "circle-mustard", x: 460, y: 80, w: 300, h: 300 },
        trip.photos.length > 0 && {
          kind: "photo",
          style: "polaroid",
          mediaId: photo(trip, 0),
          x: 90,
          y: 120,
          w: 340,
          h: 380,
          rotation: -5,
        },
        { kind: "deco", style: "tape-gingham", x: 190, y: 104, w: 150, h: 38, rotation: -8 },
        { kind: "deco", style: "airmail", x: 470, y: 420, w: 240, h: 108, rotation: 6 },
        {
          kind: "deco",
          style: "ticket",
          text: "TO ANYWHERE",
          x: 80,
          y: 560,
          w: 300,
          h: 120,
          rotation: -3,
        },
        {
          kind: "deco",
          style: "luggage-tag",
          text: trip.title.slice(0, 18).toUpperCase(),
          x: 400,
          y: 600,
          w: 300,
          h: 150,
          rotation: 4,
        },
        { kind: "deco", style: "sun", x: 600, y: 160, w: 120, h: 120 },
        {
          kind: "deco",
          style: "speech",
          text: "Remember this?",
          x: 110,
          y: 760,
          w: 300,
          h: 200,
          rotation: -2,
        },
        { kind: "deco", style: "butterfly", x: 520, y: 840, w: 180, h: 150, rotation: 12 },
      ]),
  },
  {
    id: "postcard",
    name: "Postcard",
    hint: "A photo, a stamp and a note home",
    paper: "blush",
    make: (trip) =>
      page([
        trip.photos.length > 0 && {
          kind: "photo",
          style: "print",
          mediaId: photo(trip, 0),
          x: 70,
          y: 90,
          w: 654,
          h: 440,
          rotation: -1,
        },
        {
          kind: "title",
          style: "hand",
          text: `Greetings from ${trip.title}`.slice(0, 40),
          x: 90,
          y: 560,
          w: 614,
          h: 110,
        },
        {
          kind: "note",
          style: "hand",
          text: "Dear you, wish you were here. The weather is lovely and we never want to leave.",
          x: 80,
          y: 700,
          w: 420,
          h: 300,
          rotation: -1,
        },
        trip.photos.length > 1 && {
          kind: "photo",
          style: "postage",
          mediaId: photo(trip, 1),
          x: 560,
          y: 700,
          w: 150,
          h: 180,
          rotation: 4,
        },
        {
          kind: "deco",
          style: "postmark",
          text: "PAR AVION",
          x: 500,
          y: 860,
          w: 150,
          h: 150,
          rotation: -10,
        },
      ]),
  },
];

// "What we did that day": the day's moments in order as a list on lined
// paper, a few of its photos down the side, and the day's postmark.
export const dayIdea = (day: Day): Idea => {
  const first = day.moments[0]!;
  const list = day.moments
    .map((m) => `${formatTime(m.startsAt, m.tzOffsetMinutes)}  ${firstLine(m) ?? "…"}`)
    .join("\n");
  const photos = day.moments
    .flatMap((m) => allBlocks(m).flatMap((b) => (b.type === "photo" ? [b.mediaId] : [])))
    .slice(0, 3);
  return {
    id: `day-${day.day}`,
    name: "What we did that day",
    hint: day.label,
    paper: "cream",
    make: () =>
      page([
        {
          kind: "title",
          style: "hand",
          text: "What we did that day",
          x: 60,
          y: 50,
          w: 674,
          h: 110,
        },
        {
          kind: "title",
          style: "label",
          text: day.label,
          x: 230,
          y: 175,
          w: 334,
          h: 70,
          rotation: -2,
        },
        {
          kind: "note",
          style: "lined",
          text: list.length > MAX_ELEMENT_TEXT ? `${list.slice(0, MAX_ELEMENT_TEXT - 1)}…` : list,
          x: 60,
          y: 290,
          w: photos.length > 0 ? 420 : 674,
          h: 640,
          rotation: -1,
        },
        ...photos.map((mediaId, i): Part => ({
          kind: "photo",
          style: i % 2 ? "polaroid" : "print",
          mediaId,
          x: 510,
          y: 290 + i * 245,
          w: 230,
          h: 215,
          rotation: i % 2 ? 3 : -3,
        })),
        photos.length > 0 && {
          kind: "deco",
          style: "tape-gingham",
          x: 560,
          y: 276,
          w: 130,
          h: 34,
          rotation: -6,
        },
        { kind: "deco", style: "coffee", x: 80, y: 960, w: 110, h: 110, rotation: -8 },
        {
          kind: "deco",
          style: "postmark",
          text: postmarkDate(first.startsAt, first.tzOffsetMinutes),
          x: 580,
          y: 950,
          w: 150,
          h: 150,
          rotation: 10,
        },
      ]),
  };
};

// A tier list: rows S to F, and below them what's still to rank (places as
// label-maker strips, moments as their first photo) to drag up into a row.
// What does not fit under the rows continues on the next page.
export type TierItem = { text: string; mediaId?: string };

const TIER_BOTTOM = PAGE.h - 12;

const packTier = (
  items: readonly TierItem[],
  startY: number,
): { placed: Part[]; rest: TierItem[] } => {
  const placed: Part[] = [];
  let x = 40;
  let y = startY;
  let tallest = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const w = item.mediaId ? 84 : 150;
    const h = item.mediaId ? 84 : 40;
    if (x + w > PAGE.w - 40) {
      x = 40;
      y += tallest + 8;
      tallest = 0;
    }
    if (y + h > TIER_BOTTOM) return { placed, rest: items.slice(i) };
    placed.push(
      item.mediaId
        ? {
            kind: "photo",
            style: "print",
            mediaId: item.mediaId,
            x,
            y,
            w,
            h,
            rotation: (placed.length % 3) - 1,
          }
        : { kind: "title", style: "label", text: item.text.slice(0, 22), x, y, w, h },
    );
    x += w + 8;
    tallest = Math.max(tallest, h);
  }
  return { placed, rest: [] };
};

const tierFollowUps = (items: readonly TierItem[]): JournalElement[][] => {
  const pages: JournalElement[][] = [];
  let rest = [...items];
  while (rest.length > 0 && pages.length < 8) {
    const packed = packTier(rest, 150);
    if (packed.placed.length === 0) break;
    pages.push(
      page([
        { kind: "title", style: "hand", text: "still to rank", x: 40, y: 36, w: 500, h: 80 },
        ...packed.placed,
      ]),
    );
    rest = packed.rest;
  }
  return pages;
};

export const tierIdea = (id: string, hint: string, items: TierItem[]): Idea => {
  const first = () => packTier(items, 788);
  return {
    id: `tier-${id}`,
    name: "Tier list",
    hint,
    paper: "newsprint",
    make: () =>
      page([
        ...["S", "A", "B", "C", "D", "F"].map((t, i): Part => ({
          kind: "deco",
          style: "tier",
          text: t,
          x: 40,
          y: 140 + i * 98,
          w: PAGE.w - 80,
          h: 92,
        })),
        { kind: "title", style: "dada", text: "Tier list", x: 40, y: 20, w: 400, h: 106 },
        { kind: "title", style: "hand", text: hint, x: 450, y: 46, w: 304, h: 80, rotation: -3 },
        {
          kind: "title",
          style: "hand",
          text: "still to rank ↓",
          x: 40,
          y: 734,
          w: 300,
          h: 48,
          rotation: -2,
        },
        ...first().placed,
      ]),
    more: () => tierFollowUps(first().rest),
  };
};
