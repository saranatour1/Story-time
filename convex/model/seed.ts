import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { recordChange } from "../lib/changes";
import { encryptText } from "../lib/crypto";
import { createMoment, type MomentCreate } from "./moments";

const PROD_DEPLOYMENT = "strong-stoat-772";

const readEnv = (name: string): string | undefined => {
  // eslint-disable-next-line @convex-dev/no-process-env -- CONVEX_DEPLOYMENT is not declared in convex.config.ts
  const value = (process.env as Record<string, string | undefined>)[name];
  return typeof value === "string" && value !== "" ? value : undefined;
};

const assertDevDeployment = (): void => {
  const site = readEnv("CONVEX_SITE_URL") ?? "";
  const cloud = readEnv("CONVEX_CLOUD_URL") ?? "";
  if (site.includes(PROD_DEPLOYMENT) || cloud.includes(PROD_DEPLOYMENT)) {
    throw new Error("seed:japan does not run on the production deployment.");
  }
  const deployment = readEnv("CONVEX_DEPLOYMENT");
  if (deployment === undefined || !deployment.startsWith("dev:")) {
    throw new Error(
      "seed:japan only runs on a dev deployment. Set CONVEX_DEPLOYMENT to dev:<name> there, and pass userId.",
    );
  }
};

const JST = 9 * 60;
const at = (day: number, hour: number, minute = 0) => Date.UTC(2025, 3, day, hour - 9, minute);

type Moment = Omit<MomentCreate, "eventId">;

const TRIP: Moment[] = [
  {
    startsAt: at(1, 7, 10),
    place: "Haneda Airport, Tokyo",
    geo: { lat: 35.5494, lng: 139.7798 },
    transport: "plane",
    blocks: [
      {
        type: "note",
        text: "Landed just after seven. The train into the city was so quiet you could hear the doors breathe.",
      },
    ],
    stops: [
      {
        startsAt: at(1, 9, 30),
        place: "Shinjuku, Tokyo",
        geo: { lat: 35.6896, lng: 139.7006 },
        transport: "train",
        blocks: [{ type: "feeling", text: "Jet-lagged, starving and very happy.", mood: "😴" }],
      },
    ],
    labels: ["arrival", "tokyo"],
  },
  {
    startsAt: at(1, 20, 40),
    place: "Shibuya Crossing, Tokyo",
    geo: { lat: 35.6595, lng: 139.7005 },
    transport: "train",
    blocks: [
      { type: "feeling", text: "We crossed it four times just to feel it again.", mood: "😍" },
      {
        type: "note",
        text: "Watched the lights change from the station window first, like everyone else does.",
      },
    ],
    labels: ["tokyo", "night"],
  },
  {
    startsAt: at(2, 7, 30),
    place: "Tsukiji Outer Market, Tokyo",
    geo: { lat: 35.6655, lng: 139.7707 },
    transport: "train",
    blocks: [
      {
        type: "note",
        text: "Tamagoyaki on a stick, still warm, then tuna over rice at a counter for six. Breakfast of the year.",
      },
      {
        type: "link",
        url: "https://en.wikipedia.org/wiki/Tsukiji_fish_market",
        title: "Tsukiji fish market",
      },
    ],
    labels: ["food", "tokyo"],
  },
  {
    startsAt: at(2, 16, 15),
    place: "Sensō-ji, Asakusa",
    geo: { lat: 35.7148, lng: 139.7967 },
    transport: "train",
    blocks: [
      {
        type: "note",
        text: 'Drew a fortune: "small luck". Tied it to the rack anyway, just in case.',
      },
    ],
    stops: [
      {
        startsAt: at(2, 17, 30),
        place: "Sumida River, Tokyo",
        geo: { lat: 35.7101, lng: 139.8016 },
        transport: "walk",
        blocks: [
          {
            type: "feeling",
            text: "Cherry blossoms on the water, everyone on the bank with a can of something cold.",
            mood: "😌",
          },
        ],
      },
    ],
    labels: ["temples", "tokyo", "sakura"],
  },
  {
    startsAt: at(4, 8, 5),
    place: "Hakone-Yumoto",
    geo: { lat: 35.2326, lng: 139.105 },
    transport: "train",
    blocks: [{ type: "note", text: "The Romancecar out of Shinjuku, front seats, the whole way." }],
    stops: [
      {
        startsAt: at(4, 11, 20),
        place: "Ōwakudani, Hakone",
        geo: { lat: 35.244, lng: 139.0198 },
        transport: "other",
        blocks: [
          {
            type: "note",
            text: "Up by ropeway over the steam. Black eggs: seven years each, supposedly. We had two.",
          },
        ],
      },
      {
        startsAt: at(4, 14, 0),
        place: "Lake Ashi, Hakone",
        geo: { lat: 35.2047, lng: 139.0249 },
        transport: "boat",
        blocks: [
          {
            type: "feeling",
            text: "A pirate ship across a mountain lake. Fuji stayed behind the clouds.",
            mood: "😂",
          },
        ],
      },
      {
        startsAt: at(4, 18, 30),
        place: "Gōra, Hakone",
        geo: { lat: 35.2502, lng: 139.0473 },
        transport: "train",
        blocks: [
          {
            type: "note",
            text: "Ryokan dinner in yukata, eleven small dishes, then the outdoor bath under a cold sky.",
          },
        ],
      },
    ],
    labels: ["onsen", "day trip"],
  },
  {
    startsAt: at(5, 10, 3),
    place: "Kyoto Station",
    geo: { lat: 34.9858, lng: 135.7588 },
    transport: "train",
    blocks: [
      {
        type: "note",
        text: "Shinkansen west. Fuji finally showed up, on the right side, for about eleven minutes.",
      },
      { type: "feeling", text: "Bento on our knees at 285 km/h.", mood: "😊" },
    ],
    labels: ["kyoto", "shinkansen"],
  },
  {
    startsAt: at(6, 6, 20),
    place: "Fushimi Inari Taisha, Kyoto",
    geo: { lat: 34.9671, lng: 135.7727 },
    transport: "train",
    blocks: [
      {
        type: "feeling",
        text: "Up before the crowds. Just us, the crows and ten thousand orange gates.",
        mood: "🥹",
      },
      {
        type: "link",
        url: "https://en.wikipedia.org/wiki/Fushimi_Inari-taisha",
        title: "Fushimi Inari-taisha",
      },
    ],
    labels: ["temples", "kyoto"],
  },
  {
    startsAt: at(6, 13, 0),
    place: "Arashiyama Bamboo Grove, Kyoto",
    geo: { lat: 35.017, lng: 135.6713 },
    transport: "train",
    blocks: [
      { type: "note", text: "The bamboo creaks when the wind moves it. Nobody tells you that." },
    ],
    stops: [
      {
        startsAt: at(6, 15, 10),
        place: "Tenryū-ji, Kyoto",
        geo: { lat: 35.0157, lng: 135.6738 },
        transport: "walk",
        blocks: [
          {
            type: "note",
            text: "Sat on the veranda by the pond garden for an hour and did nothing at all.",
          },
        ],
      },
    ],
    labels: ["kyoto", "gardens"],
  },
  {
    startsAt: at(7, 18, 45),
    place: "Gion, Kyoto",
    geo: { lat: 35.0037, lng: 135.775 },
    transport: "walk",
    blocks: [
      {
        type: "note",
        text: "Lanterns on Hanamikoji, matcha soft serve, and a very serious debate about which shrine was best.",
      },
    ],
    labels: ["kyoto", "night"],
  },
  {
    startsAt: at(8, 10, 30),
    place: "Nara Park",
    geo: { lat: 34.6851, lng: 135.843 },
    transport: "train",
    blocks: [
      {
        type: "feeling",
        text: "The deer bow if you bow first. One of them also ate a map.",
        mood: "😂",
      },
      {
        type: "note",
        text: "Tōdai-ji's Buddha is bigger than any photo of it. We just stood there.",
      },
    ],
    stops: [
      {
        startsAt: at(8, 14, 0),
        place: "Tōdai-ji, Nara",
        geo: { lat: 34.6889, lng: 135.8398 },
        transport: "walk",
        blocks: [
          {
            type: "note",
            text: "Watched a kid squeeze through the hole in the pillar. Enlightenment, apparently.",
          },
        ],
      },
    ],
    labels: ["day trip", "deer"],
  },
  {
    startsAt: at(9, 19, 30),
    place: "Dōtonbori, Osaka",
    geo: { lat: 34.6687, lng: 135.5013 },
    transport: "train",
    blocks: [
      {
        type: "note",
        text: "Takoyaki from three stalls to compare (the one with the long queue won), then okonomiyaki cooked at the table.",
      },
      {
        type: "feeling",
        text: "Took the photo with the running man like it was our job.",
        mood: "😊",
      },
    ],
    labels: ["food", "osaka", "night"],
  },
  {
    startsAt: at(10, 9, 0),
    place: "Kuromon Market, Osaka",
    geo: { lat: 34.6656, lng: 135.5064 },
    transport: "walk",
    blocks: [
      {
        type: "note",
        text: "Strawberry daifuku for breakfast. We bought one more box of KitKats than we have friends.",
      },
    ],
    stops: [
      {
        startsAt: at(10, 13, 40),
        place: "Kansai International Airport",
        geo: { lat: 34.432, lng: 135.2304 },
        transport: "train",
        blocks: [
          {
            type: "feeling",
            text: "Already planning the next one. Hokkaido in winter?",
            mood: "🥹",
          },
        ],
      },
    ],
    labels: ["osaka", "home"],
  },
];

export const japan = internalMutation({
  args: { userId: v.id("users") },
  returns: v.id("events"),
  handler: async (ctx, args): Promise<Id<"events">> => {
    assertDevDeployment();
    const user = await ctx.db.get("users", args.userId);
    if (user === null)
      throw new Error(
        "That account does not exist. Pass the userId of someone who has signed in on this dev deployment.",
      );
    const title = "Spring in Japan";
    const eventId = await ctx.db.insert("events", {
      ownerId: user._id,
      title,
      status: "draft",
      visibility: "private",
      momentCount: 0,
      keyVersion: 1,
      startsAt: Date.UTC(2025, 3, 1),
      endsAt: Date.UTC(2025, 3, 10),
    });
    await ctx.db.patch("events", eventId, {
      description: await encryptText(
        eventId,
        1,
        "Ten days from Tokyo to Osaka in cherry blossom season: markets, temples, a mountain lake and far too much food.",
      ),
    });
    await recordChange(ctx, {
      eventId,
      entity: "event",
      entityId: eventId,
      actorId: user._id,
      action: "create",
      fields: ["title", "status", "visibility"],
      after: { title, status: "draft", visibility: "private" },
    });
    // One at a time, so each sees the count the last one left.
    for (const moment of TRIP) {
      await createMoment(ctx, {
        userId: user._id,
        actor: { kind: "human", userId: user._id },
        input: { ...moment, eventId, tzOffsetMinutes: JST },
      });
    }
    return eventId;
  },
});
