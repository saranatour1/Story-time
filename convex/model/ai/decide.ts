import { v } from "convex/values";
import type { Infer } from "convex/values";
import {
  experimental_decide,
  type Experimental_DecisionAnswer,
  type Experimental_DecisionQuestion,
} from "ai";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalAction, internalQuery } from "../../_generated/server";
import { decryptGeo, decryptText, type Encrypted, type Geo } from "../../lib/crypto";
import { distanceMeters } from "../../lib/geo";
import { momentsToRead } from "../../lib/limits";
import { vTransport } from "../../schema";
import { JEV, jevModel, skipReason } from "../../lib/ai/models";
import { metered } from "../../lib/ai/budget";

type Transport = Infer<typeof vTransport>;

const TRANSPORTS: Transport[] = ["walk", "bike", "car", "bus", "train", "plane", "boat", "other"];

// Past this a leg on the road or on foot is really a flight: photos taken a
// day apart make a flight's average speed look like a drive (Amman to Hanover,
// 3,125 km in 24 hours, is 130 km/h). Trains and boats can go this far.
const FLIGHT_KM = 1000;
// Past this nobody walked or cycled it between two photos.
const ROAD_KM = 80;

// The times between stops are between their first photos, so they include the
// stay at the earlier stop: every speed is a lower bound.
const TRANSPORT_CRITERIA: Record<Transport, string> = {
  walk: `Short distance, under about 6 km/h, and under ${ROAD_KM} km.`,
  bike: `Up to about 25 km/h, and under ${ROAD_KM} km.`,
  car: `Road speeds, door to door, and under about ${FLIGHT_KM} km.`,
  bus: "Road speeds between stops in town.",
  train: "Station names, or 60 to 250 km/h between towns.",
  plane: `Over 300 km, or over 400 km/h. Almost anything over ${FLIGHT_KM} km.`,
  boat: "Water: ferry or harbour names.",
  other: "None of these.",
};

// A moment starting this soon after another continues the same journey.
const PREVIOUS_WINDOW_MS = 12 * 60 * 60_000;

const vLeg = v.object({
  id: v.string(),
  // 0 is the moment's own first stop; n is `stops[n - 1]`.
  stopIndex: v.number(),
  fromPlace: v.optional(v.string()),
  toPlace: v.optional(v.string()),
  km: v.optional(v.number()),
  minutes: v.optional(v.number()),
  kmh: v.optional(v.number()),
});
type Leg = Infer<typeof vLeg>;

const vLegs = v.object({
  eventId: v.id("events"),
  // Who added the moment: the person its transport guess is metered to.
  authorId: v.id("users"),
  // The places of the moment's stops in order: context for the label question.
  route: v.array(v.string()),
  labels: v.array(v.string()),
  legs: v.array(vLeg),
});
type LegsOf = Infer<typeof vLegs>;

const vDecided = v.object({
  transports: v.record(v.string(), vTransport),
  label: v.optional(v.string()),
});
type Decided = Infer<typeof vDecided>;

type Point = { place?: string; geo?: Geo; time?: number };

const pointOf = async (
  eventId: Id<"events">,
  stop: { place?: Encrypted; geo?: Encrypted; startsAt?: number },
): Promise<Point> => {
  return {
    place: stop.place ? await decryptText(eventId, stop.place) : undefined,
    geo: stop.geo ? await decryptGeo(eventId, stop.geo) : undefined,
    time: stop.startsAt,
  };
};

// A moment's stops in journey order: its own first stop, then `stops`.
const pointsOf = async (eventId: Id<"events">, moment: Doc<"moments">): Promise<Point[]> => {
  return Promise.all([
    pointOf(eventId, moment),
    ...(moment.stops ?? []).map((stop) => pointOf(eventId, stop)),
  ]);
};

// Distances and times only when both ends have them, so nothing is guessed.
const legBetween = (stopIndex: number, from: Point, to: Point): Leg => {
  const leg: Leg = { id: String(stopIndex), stopIndex };
  if (from.place !== undefined) leg.fromPlace = from.place;
  if (to.place !== undefined) leg.toPlace = to.place;
  if (from.geo !== undefined && to.geo !== undefined) {
    leg.km = Math.round(distanceMeters(from.geo, to.geo) / 100) / 10;
  }
  if (from.time !== undefined && to.time !== undefined && to.time > from.time) {
    const minutes = Math.max(1, Math.round((to.time - from.time) / 60_000));
    leg.minutes = minutes;
    if (leg.km !== undefined) leg.kmh = Math.round(leg.km / (minutes / 60));
  }
  return leg;
};

export const legsOf = internalQuery({
  args: { momentId: v.id("moments") },
  returns: vLegs,
  handler: async (ctx, args): Promise<LegsOf> => {
    const moment = await ctx.db.get("moments", args.momentId);
    if (moment === null) throw new Error("Moment not found");
    const event = await ctx.db.get("events", moment.eventId);
    if (event === null) throw new Error("Event not found");

    const everyMoment = await ctx.db
      .query("moments")
      .withIndex("by_event_and_startsAt", (q) => q.eq("eventId", event._id))
      .take(momentsToRead(event.momentCount));
    const labels = new Set<string>();
    for (const m of everyMoment) {
      for (const label of m.labels ?? []) labels.add(await decryptText(event._id, label));
    }

    const points = await pointsOf(event._id, moment);
    const legs: Leg[] = [];
    // The moment just before this one, within the window, leads into its first stop.
    const previous = await ctx.db
      .query("moments")
      .withIndex("by_event_and_startsAt", (q) =>
        q
          .eq("eventId", event._id)
          .gte("startsAt", moment.startsAt - PREVIOUS_WINDOW_MS)
          .lt("startsAt", moment.startsAt),
      )
      .order("desc")
      .first();
    if (previous !== null) {
      const before = (await pointsOf(event._id, previous)).at(-1);
      if (before !== undefined) legs.push(legBetween(0, before, points[0]));
    }
    for (let i = 1; i < points.length; i++) {
      legs.push(legBetween(i, points[i - 1], points[i]));
    }

    const route = points.flatMap((p) => (p.place !== undefined ? [p.place] : []));
    return {
      eventId: event._id,
      authorId: moment.authorId,
      route,
      labels: [...labels].sort(),
      legs,
    };
  },
});

const isTransport = (value: string): value is Transport => {
  return TRANSPORTS.some((t) => t === value);
};

// Raises a guess that the distance rules out, since speeds only ever read low:
// a road or foot leg over FLIGHT_KM is a flight, a walk or ride over ROAD_KM a
// drive. Trains, boats, planes and "other" stand as they are.
export const withDistance = (transport: Transport, km: number | undefined): Transport => {
  if (km === undefined) return transport;
  const ground =
    transport === "walk" || transport === "bike" || transport === "car" || transport === "bus";
  if (ground && km > FLIGHT_KM) return "plane";
  if ((transport === "walk" || transport === "bike") && km > ROAD_KM) return "car";
  return transport;
};

// ponytail: speed alone is a rough guess (it can't tell a bus from a car), so this
// only answers when Jev can't.
export const transportFromSpeed = (kmh: number): Transport => {
  if (kmh < 7) return "walk";
  if (kmh < 25) return "bike";
  if (kmh < 160) return "car";
  return "plane";
};

const heuristic = (legs: Leg[]): Decided => {
  const transports: Record<string, Transport> = {};
  for (const leg of legs) {
    const key = String(leg.stopIndex);
    if (leg.kmh !== undefined) transports[key] = withDistance(transportFromSpeed(leg.kmh), leg.km);
    // No time between the stops: only a distance this long says anything.
    else if (leg.km !== undefined && leg.km > FLIGHT_KM) transports[key] = "plane";
  }
  return { transports };
};

// The state is plain JSON, so unknown values are left out, never set to undefined.
const legState = (leg: Leg): Record<string, string | number> => {
  return {
    id: leg.id,
    stopIndex: leg.stopIndex,
    ...(leg.fromPlace !== undefined && { fromPlace: leg.fromPlace }),
    ...(leg.toPlace !== undefined && { toPlace: leg.toPlace }),
    ...(leg.km !== undefined && { km: leg.km }),
    ...(leg.minutes !== undefined && { minutes: leg.minutes }),
    ...(leg.kmh !== undefined && { kmh: leg.kmh }),
  };
};

// The chosen option, if Jev gives it at least even odds.
const choiceOf = (
  answer: Experimental_DecisionAnswer<Experimental_DecisionQuestion> | undefined,
): string | undefined => {
  if (answer?.type !== "choice") return undefined;
  return (answer.probabilities?.[answer.choice] ?? 0) >= 0.5 ? answer.choice : undefined;
};

export const readDecisions = (
  found: Omit<LegsOf, "authorId">,
  answers: Record<string, Experimental_DecisionAnswer<Experimental_DecisionQuestion>>,
): Decided => {
  const transports: Record<string, Transport> = {};
  for (const leg of found.legs) {
    const choice = choiceOf(answers[`transport_${leg.id}`]);
    if (choice !== undefined && isTransport(choice))
      transports[String(leg.stopIndex)] = withDistance(choice, leg.km);
    // Unsure, Jev says nothing; a leg this long is a flight all the same, as
    // the fallback would say.
    else if (leg.km !== undefined && leg.km > FLIGHT_KM)
      transports[String(leg.stopIndex)] = "plane";
  }
  const label = choiceOf(answers.label);
  return {
    transports,
    label:
      label !== undefined && label !== "none" && found.labels.includes(label) ? label : undefined,
  };
};

export const decideTransport = internalAction({
  args: { momentId: v.id("moments") },
  returns: vDecided,
  handler: async (ctx, args): Promise<Decided> => {
    const found: LegsOf = await ctx.runQuery(internal.model.ai.decide.legsOf, {
      momentId: args.momentId,
    });

    const questions: Record<string, Experimental_DecisionQuestion> = {};
    // A leg with no distance and no names is a blind guess; it stays unanswered.
    const judgeable = found.legs.filter(
      (leg) => leg.km !== undefined || (leg.fromPlace !== undefined && leg.toPlace !== undefined),
    );
    for (const leg of judgeable) {
      questions[`transport_${leg.id}`] = {
        type: "choice",
        instructions: `Judge leg ${leg.id}: how the person got there, from the route, distances and times in the state.`,
        criteria: TRANSPORT_CRITERIA,
      };
    }
    if (found.labels.length > 0) {
      const options: Array<[string, string | null]> = [
        ["none", "No label fits."],
        ...found.labels.map((label): [string, string | null] => [label, null]),
      ];
      questions.label = {
        type: "choice",
        instructions:
          "Which label from this experience fits the moment best? Its route is in the state.",
        criteria: Object.fromEntries(options),
      };
    }
    if (Object.keys(questions).length === 0) return { transports: {} };

    let decided: Decided;
    try {
      const answers = await metered(
        ctx,
        { userId: found.authorId, feature: "transport", model: JEV },
        async () => {
          const out = await experimental_decide({
            model: jevModel(),
            state: { route: found.route, legs: found.legs.map(legState) },
            questions,
          });
          return { result: out.answers, usage: out.usage, providerMetadata: out.providerMetadata };
        },
      );
      decided = readDecisions(found, answers);
    } catch (error) {
      console.warn("Jev skipped the transport decision:", skipReason(error));
      decided = heuristic(found.legs);
    }

    if (Object.keys(decided.transports).length > 0 || decided.label !== undefined) {
      await ctx.runMutation(internal.model.ai.apply.apply, {
        momentId: args.momentId,
        transports: decided.transports,
        labels: decided.label === undefined ? undefined : [decided.label],
      });
    }
    // The workflow keeps each step's result, so the label (decrypted, and saved
    // above) stays out of it: transports aren't anyone's words.
    return { transports: decided.transports };
  },
});
