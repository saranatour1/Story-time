import {
  experimental_decide,
  type Experimental_DecisionAnswer,
  type Experimental_DecisionQuestion,
} from "ai";
import { ConvexError, v, type Infer } from "convex/values";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { action, internalQuery, mutation, type MutationCtx } from "../../_generated/server";
import { assertNotArchived, requireEventAccess } from "../../lib/access";
import { invalid } from "../../lib/blocks";
import {
  MAX_BLOCKS_PER_MOMENT,
  MAX_COMMAND_CHARS,
  MAX_COMMAND_OPS,
  MAX_LABEL_LENGTH,
  MAX_LABELS_PER_MOMENT,
  MAX_STOPS_PER_MOMENT,
  MAX_TEXT_LENGTH,
} from "../../lib/limits";
import { AI_LIMIT_MESSAGE, creditAi, takeAi } from "../../lib/rateLimit";
import { TRANSPORTS, vGeo, vTransport } from "../../schema";
import {
  createMoment,
  deleteMoment,
  listForEvent,
  viewMoment,
  writeMomentUpdate,
  type MomentEdit,
  type PlainStop,
} from "../moments";
import { generateStructured } from "../../lib/ai/generate";
import { jevModel, skipReason } from "../../lib/ai/models";

const LIST_CAP = 60;
const MAX_OUTPUT_TOKENS = 900;
const NOTE_PREVIEW = 80;

export const vOp = v.object({
  op: v.union(v.literal("add"), v.literal("edit"), v.literal("addStop"), v.literal("remove")),
  momentId: v.optional(v.id("moments")),
  stop: v.optional(v.number()),
  after: v.optional(v.number()),
  startsAt: v.optional(v.number()),
  tzOffsetMinutes: v.optional(v.number()),
  place: v.optional(v.string()),
  geo: v.optional(vGeo),
  transport: v.optional(v.union(vTransport, v.null())),
  note: v.optional(v.string()),
  labels: v.optional(v.array(v.string())),
});
export type Op = Infer<typeof vOp>;

type Proposal = { kind: "new" } | { kind: "plan"; summary: string; needs?: string; ops: Op[] };

const vMomentLine = v.object({
  id: v.id("moments"),
  startsAt: v.number(),
  tzOffsetMinutes: v.optional(v.number()),
  place: v.optional(v.string()),
  transport: v.optional(vTransport),
  stops: v.array(
    v.object({
      startsAt: v.optional(v.number()),
      place: v.optional(v.string()),
      transport: v.optional(vTransport),
    }),
  ),
  labels: v.array(v.string()),
  note: v.optional(v.string()),
  editable: v.boolean(),
});

const vContext = v.object({
  userId: v.id("users"),
  title: v.string(),
  moments: v.array(vMomentLine),
  total: v.number(),
  open: v.optional(v.number()),
  zone: v.optional(v.number()),
});
type Context = Infer<typeof vContext>;
type Line = Context["moments"][number];

export const read = internalQuery({
  args: { eventId: v.id("events"), openMomentId: v.optional(v.string()) },
  returns: vContext,
  handler: async (ctx, args): Promise<Context> => {
    const { userId, event, role } = await requireEventAccess(ctx, args.eventId, "contributor");
    assertNotArchived(event);
    const all = await listForEvent(ctx, event, { userId, role });
    const openId =
      args.openMomentId === undefined ? null : ctx.db.normalizeId("moments", args.openMomentId);
    const anchor = all.find((m) => m._id === openId)?.startsAt ?? Date.now();
    const kept =
      all.length <= LIST_CAP
        ? all
        : [...all]
            .sort((a, b) => Math.abs(a.startsAt - anchor) - Math.abs(b.startsAt - anchor))
            .slice(0, LIST_CAP)
            .sort((a, b) => a.startsAt - b.startsAt);
    const moments = kept.map((m): Line => {
      const said = m.blocks.flatMap((b) =>
        b.type === "note" || b.type === "feeling" ? [b.text] : [],
      )[0];
      return {
        id: m._id,
        startsAt: m.startsAt,
        tzOffsetMinutes: m.tzOffsetMinutes,
        place: m.place,
        transport: m.transport,
        stops: m.stops.map((s) => ({
          startsAt: s.startsAt,
          place: s.place,
          transport: s.transport,
        })),
        labels: m.labels,
        note: said?.slice(0, NOTE_PREVIEW),
        editable: role === "owner" || m.authorId === userId,
      };
    });
    const open = moments.findIndex((m) => m.id === openId);
    const zoned =
      open >= 0
        ? moments[open]
        : [...moments].reverse().find((m) => m.tzOffsetMinutes !== undefined);
    return {
      userId,
      title: event.title,
      moments,
      total: all.length,
      open: open >= 0 ? open : undefined,
      zone: zoned?.tzOffsetMinutes,
    };
  },
});

const INTENTS = {
  new: "It tells what happened, or is a note to keep, and asks for nothing already saved to change.",
  change:
    "It asks to change something already saved: move or rename a moment or stop, set its time, place or transport, add a stop or a note, change labels.",
  remove:
    "It asks to delete or remove something already saved: a moment, a stop, a note or a label.",
  unclear: "It is too vague to act on, or is not about this experience.",
} as const;
type Intent = keyof typeof INTENTS;

const isIntent = (value: string): value is Intent => value in INTENTS;

export type Verdict = { intent: Intent | undefined; removes: number | undefined };

type Answers = Record<string, Experimental_DecisionAnswer<Experimental_DecisionQuestion>>;

export const readVerdict = (answers: Answers): Verdict => {
  const intent = answers.intent;
  const removes = answers.removes;
  return {
    intent:
      intent?.type === "choice" &&
      (intent.probabilities?.[intent.choice] ?? 0) >= 0.5 &&
      isIntent(intent.choice)
        ? intent.choice
        : undefined,
    removes: removes?.type === "boolean" ? removes.probability : undefined,
  };
};

const judge = async (text: string, open: boolean): Promise<Verdict> => {
  try {
    const { answers } = await experimental_decide({
      model: jevModel(),
      state: { text, momentOpenOnScreen: open },
      questions: {
        intent: {
          type: "choice",
          instructions: "What is the person asking for? Read `text`. Say which of these it is.",
          criteria: INTENTS,
        },
        removes: {
          type: "boolean",
          instructions:
            "Does `text` ask to delete or remove something that is already saved (a moment, a stop, a note or a label)?",
        },
      },
    });
    return readVerdict(answers);
  } catch (error) {
    console.warn("Jev skipped the intent check:", skipReason(error));
    return { intent: undefined, removes: undefined };
  }
};

const REMOVAL_WORDS = /\b(delete|remove|drop|erase|cancel|get rid of|take out|scrap)\b/i;

export const allowsRemoval = (verdict: Verdict, text: string): boolean => {
  if (verdict.removes !== undefined) return verdict.removes >= 0.5;
  return verdict.intent === "remove" || REMOVAL_WORDS.test(text);
};

const INSTRUCTIONS = [
  "You turn one sentence from the person into changes to their trip experience. Reply with the operations needed, in `ops`.",
  "Moments are numbered in the list. Refer to them by number, in `moment`. A moment's own place and time are its stop 1; the stops after it are 2, 3 and so on.",
  "The moment open on screen is the default: use it when the sentence says this, it, here, or names nothing.",
  "Operations:",
  "- add: a new moment. It needs a `note`, one short line in the author's voice, first person plural and past tense. It may have when, place, transport and labels.",
  "- edit: change moment `moment`, or its stop `stop` (default 1). Set only what the sentence changes: when, place, transport (null clears it), note (a note added to that stop; the existing text stays) and, for stop 1 only, labels (the full list after the change, keeping the existing ones unless told to drop them).",
  "- addStop: add a stop to moment `moment`, after stop `after` (default: at the end). It needs a place or a note, and may have when and transport.",
  "- remove: delete stop `stop` of moment `moment`, or the whole moment when `stop` is left out. Never remove stop 1 on its own; remove the moment instead. Remove only what the sentence asks to remove.",
  "Times are the clock where the moment happened, as YYYY-MM-DDTHH:mm. If only a date is given, give just YYYY-MM-DD and the existing clock time is kept. Dates like 'the next day' count from the date of the moment they are about.",
  "Use only what the sentence says. Never invent places, times or names. If you can't tell what to change, leave `ops` empty and say what you need in `needs`.",
  "`summary` is one short plain line saying what you will do, like 'Move Hanover to 21 Feb and add a stop in Berlin'. In `summary` and `needs` never use the moment or stop numbers: name moments by their place or date. No emojis, no exclamation marks.",
].join("\n");

const JSON_INSTRUCTIONS = `${INSTRUCTIONS}\nReply with JSON only: {"summary": string, "needs": optional string, "ops": [{"op": "add"|"edit"|"addStop"|"remove", "moment": optional number, "stop": optional number, "after": optional number, "when": optional string, "place": optional string, "transport": optional one of ${TRANSPORTS.join(", ")} or null, "note": optional string, "labels": optional string[]}]}.`;

const WHEN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

const rawPlan = z.object({
  summary: z.string().max(160),
  needs: z.string().max(200).optional(),
  ops: z.array(
    z.object({
      op: z.enum(["add", "edit", "addStop", "remove"]),
      moment: z.number().int().min(1).optional(),
      stop: z.number().int().min(1).max(MAX_STOPS_PER_MOMENT).optional(),
      after: z.number().int().min(1).max(MAX_STOPS_PER_MOMENT).optional(),
      when: z.string().regex(WHEN).optional(),
      place: z.string().max(200).optional(),
      transport: z.enum(TRANSPORTS).nullable().optional(),
      note: z.string().max(MAX_TEXT_LENGTH).optional(),
      labels: z.array(z.string().max(MAX_LABEL_LENGTH)).max(MAX_LABELS_PER_MOMENT).optional(),
    }),
  ),
});
export type RawPlan = z.infer<typeof rawPlan>;

const pad = (n: number) => String(n).padStart(2, "0");

export const localOf = (ms: number, offset: number): string => {
  const d = new Date(ms + offset * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

export const fromLocal = (when: string, offset: number, clock: string): number | undefined => {
  const full = when.length === 10 ? `${when}T${clock}` : when;
  const at = Date.parse(`${full}:00Z`);
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 16) !== full) return undefined;
  return at - offset * 60_000;
};

const describeLine = (line: Line, n: number, zone: number): string => {
  const offset = line.tzOffsetMinutes ?? zone;
  const route = [
    `${line.place ?? "no place"}${line.transport ? ` (by ${line.transport})` : ""}`,
    ...line.stops.map(
      (s) => `${s.place ?? "no place"}${s.transport ? ` (by ${s.transport})` : ""}`,
    ),
  ]
    .map((stop, i) => `${i + 1}) ${stop}`)
    .join(", ");
  const labels = line.labels.length > 0 ? ` labels: ${line.labels.join(", ")};` : "";
  const note = line.note === undefined ? "" : ` note: "${line.note}"`;
  return `${n}. ${localOf(line.startsAt, offset).replace("T", " ")} · stops ${route};${labels}${note}${line.editable ? "" : " (not yours to change)"}`;
};

export const promptFor = (c: Context, text: string, now: number, zone: number): string => {
  const shown =
    c.total > c.moments.length
      ? ` (the ${c.moments.length} nearest the open one, of ${c.total})`
      : "";
  return [
    `Experience: ${c.title}`,
    `Today: ${localOf(now, zone).slice(0, 10)}`,
    `Moments${shown}:`,
    ...c.moments.map((m, i) => describeLine(m, i + 1, zone)),
    c.open === undefined ? "Open on screen: nothing" : `Open on screen: moment ${c.open + 1}`,
    `The person says: ${text}`,
  ].join("\n");
};

const trimmed = (s: string | undefined) => {
  const t = s?.trim();
  return t === undefined || t === "" ? undefined : t;
};

const RANK = { add: 0, edit: 1, addStop: 2, remove: 4 };
const rank = (op: Op) => (op.op === "remove" && op.stop !== undefined ? 3 : RANK[op.op]);
export const orderOps = (ops: Op[]): Op[] => {
  return ops
    .map((op, i) => ({ op, i }))
    .sort((a, b) => rank(a.op) - rank(b.op) || a.i - b.i)
    .map(({ op }) => op);
};

export const resolvePlan = (
  raw: RawPlan,
  c: Context,
  o: { removesOk: boolean; zone: number },
): { ops: Op[]; needs?: string } => {
  const said: string[] = [];
  const ops: Op[] = [];
  const removed = new Set<string>();
  const structural = new Set<string>();
  if (raw.ops.length > MAX_COMMAND_OPS)
    said.push(`I did the first ${MAX_COMMAND_OPS} things; ask again for the rest.`);

  for (const r of raw.ops.slice(0, MAX_COMMAND_OPS)) {
    const place = trimmed(r.place);
    const note = trimmed(r.note);
    if (r.op === "add") {
      if (note === undefined) {
        said.push("A new moment needs a few words to go with it.");
        continue;
      }
      const startsAt = r.when === undefined ? undefined : fromLocal(r.when, o.zone, "12:00");
      if (r.when !== undefined && startsAt === undefined) {
        said.push(`I couldn't read the date ${r.when}.`);
        continue;
      }
      ops.push({
        op: "add",
        startsAt,
        tzOffsetMinutes: o.zone,
        place,
        transport: r.transport ?? undefined,
        note,
        labels: r.labels,
      });
      continue;
    }

    const m = r.moment === undefined ? undefined : c.moments[r.moment - 1];
    if (m === undefined) {
      said.push("I couldn't tell which moment you meant.");
      continue;
    }
    if (!m.editable) {
      said.push("You can only change moments you added yourself.");
      continue;
    }
    const stops = 1 + m.stops.length;
    const stop = r.stop ?? 1;
    const offset = m.tzOffsetMinutes ?? o.zone;
    const clockOf = (at: number | undefined) => localOf(at ?? m.startsAt, offset).slice(11);

    if (r.op === "edit") {
      if (stop > stops) {
        said.push(`That moment has only ${stops} ${stops === 1 ? "stop" : "stops"}.`);
        continue;
      }
      const target = stop === 1 ? m.startsAt : m.stops[stop - 2]?.startsAt;
      const startsAt =
        r.when === undefined ? undefined : fromLocal(r.when, offset, clockOf(target));
      if (r.when !== undefined && startsAt === undefined) {
        said.push(`I couldn't read the date ${r.when}.`);
        continue;
      }
      const edit: Op = {
        op: "edit",
        momentId: m.id,
        stop,
        startsAt,
        place,
        transport: r.transport,
        note,
        labels: stop === 1 ? r.labels : undefined,
      };
      if ([startsAt, place, r.transport, note, edit.labels].every((x) => x === undefined)) continue;
      ops.push(edit);
      continue;
    }

    if (r.op === "addStop") {
      if (place === undefined && note === undefined) {
        said.push("A new stop needs a place or a few words.");
        continue;
      }
      if (m.stops.length >= MAX_STOPS_PER_MOMENT - 1) {
        said.push("That moment can't take more stops.");
        continue;
      }
      if (structural.has(m.id)) {
        said.push("I changed one set of stops per moment at a time; ask again for the rest.");
        continue;
      }
      const startsAt =
        r.when === undefined ? undefined : fromLocal(r.when, offset, clockOf(undefined));
      if (r.when !== undefined && startsAt === undefined) {
        said.push(`I couldn't read the date ${r.when}.`);
        continue;
      }
      structural.add(m.id);
      ops.push({
        op: "addStop",
        momentId: m.id,
        after: r.after === undefined ? undefined : Math.min(r.after, stops),
        startsAt,
        place,
        transport: r.transport ?? undefined,
        note,
      });
      continue;
    }

    if (!o.removesOk) {
      said.push(`I left out a removal. If you meant it, say "delete" and what.`);
      continue;
    }
    if (r.stop === undefined) {
      removed.add(m.id);
      ops.push({ op: "remove", momentId: m.id });
      continue;
    }
    if (r.stop === 1 || r.stop > stops) {
      said.push("To remove a moment's first stop, remove the moment.");
      continue;
    }
    if (structural.has(m.id)) {
      said.push("I changed one set of stops per moment at a time; ask again for the rest.");
      continue;
    }
    structural.add(m.id);
    ops.push({ op: "remove", momentId: m.id, stop: r.stop });
  }

  const kept = ops.filter(
    (op) => op.op === "remove" || op.momentId === undefined || !removed.has(op.momentId),
  );
  const needs = trimmed([raw.needs, ...new Set(said)].filter(Boolean).join(" "))?.slice(0, 300);
  return { ops: orderOps(kept), needs };
};

const propose = action({
  args: {
    eventId: v.id("events"),
    text: v.string(),
    openMomentId: v.optional(v.string()),
    zone: v.number(),
  },
  handler: async (ctx, args): Promise<Proposal> => {
    const text = args.text.trim();
    if (text === "")
      throw new ConvexError({ code: "INVALID", message: "Say what to add or change." });
    if (text.length > MAX_COMMAND_CHARS) {
      throw new ConvexError({
        code: "INVALID",
        message: `Keep it under ${MAX_COMMAND_CHARS} characters.`,
      });
    }
    const started = Date.now();
    const found: Context = await ctx.runQuery(internal.model.ai.command.read, {
      eventId: args.eventId,
      openMomentId: args.openMomentId,
    });
    if (!(await takeAi(ctx, found.userId))) {
      throw new ConvexError({
        code: "RATE_LIMITED",
        message: `${AI_LIMIT_MESSAGE} You can still save it as a moment with "Add as a moment".`,
      });
    }

    const t0 = Date.now();
    const verdict = await judge(text, found.open !== undefined);
    const judged = Date.now() - t0;
    if (verdict.intent === "new") return { kind: "new" };
    if (verdict.intent === "unclear") {
      return {
        kind: "plan",
        summary: "",
        needs: 'Tell me what to change, like "move this to Friday" or "delete the second stop".',
        ops: [],
      };
    }

    const zone = found.zone ?? args.zone;
    const prompt = promptFor(found, text, Date.now(), zone);
    let plan: RawPlan;
    try {
      plan = await generateStructured({
        schema: rawPlan,
        instructions: INSTRUCTIONS,
        jsonInstructions: JSON_INSTRUCTIONS,
        messages: [{ role: "user", content: prompt }],
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
    } catch (error) {
      console.warn("Scribe couldn't plan a request:", skipReason(error));
      await creditAi(ctx, found.userId);
      throw new ConvexError({
        code: "AI_UNAVAILABLE",
        message:
          'I couldn\'t read that just now. Try again, or save it as a moment with "Add as a moment".',
      });
    }
    const { ops, needs } = resolvePlan(plan, found, {
      removesOk: allowsRemoval(verdict, text),
      zone,
    });
    console.log(
      `command: Jev ${judged} ms, Haiku ${Date.now() - t0 - judged} ms, total ${Date.now() - started} ms, intent ${verdict.intent ?? "unsure"}`,
    );
    return { kind: "plan", summary: plan.summary, needs, ops };
  },
});

const human = (userId: Id<"users">) => ({ kind: "human" as const, userId });

const changeableMoment = async (
  ctx: MutationCtx,
  eventId: Id<"events">,
  momentId: Id<"moments"> | undefined,
  userId: Id<"users">,
  role: string,
): Promise<Doc<"moments">> => {
  const moment = momentId === undefined ? null : await ctx.db.get("moments", momentId);
  if (moment === null || moment.eventId !== eventId) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "A moment in this change no longer exists.",
    });
  }
  if (role !== "owner" && moment.authorId !== userId) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You can only change moments you added yourself.",
    });
  }
  return moment;
};

const noMore = (what: string) =>
  new ConvexError({ code: "FULL", message: `That moment can't take any more ${what}.` });

const runOp = async (
  ctx: MutationCtx,
  args: { eventId: Id<"events">; userId: Id<"users">; role: string; op: Op },
): Promise<{ created?: Id<"moments">; removed: Id<"media">[] }> => {
  const { eventId, userId, role, op } = args;
  const event = await ctx.db.get("events", eventId);
  if (event === null) throw new ConvexError({ code: "NOT_FOUND", message: "Experience not found" });

  if (op.op === "add") {
    const note = trimmed(op.note);
    if (note === undefined) invalid("note", "A new moment needs a few words to go with it.");
    const created = await createMoment(ctx, {
      event,
      userId,
      actor: human(userId),
      input: {
        eventId,
        startsAt: op.startsAt ?? Date.now(),
        tzOffsetMinutes: op.tzOffsetMinutes,
        place: op.place,
        geo: op.geo,
        blocks: [{ type: "note", text: note }],
        transport: op.transport ?? undefined,
        labels: op.labels,
      },
    });
    return { created, removed: [] };
  }

  const moment = await changeableMoment(ctx, eventId, op.momentId, userId, role);
  if (op.op === "remove" && op.stop === undefined) {
    return { removed: (await deleteMoment(ctx, { event, moment, userId })).removedMediaIds };
  }

  const view = await viewMoment(ctx, event, moment);
  const stop = op.stop ?? 1;
  const patch: MomentEdit = {};
  const stops: PlainStop[] = view.stops;
  const note = trimmed(op.note);

  if (op.op === "edit") {
    if (stop === 1) {
      if (op.startsAt !== undefined) patch.startsAt = op.startsAt;
      if (op.place !== undefined) {
        patch.place = op.place;
        patch.geo = op.geo;
      }
      if (op.transport !== undefined) patch.transport = op.transport;
      if (op.labels !== undefined) patch.labels = op.labels;
      if (note !== undefined) {
        if (view.blocks.length >= MAX_BLOCKS_PER_MOMENT) throw noMore("items");
        patch.blocks = [...view.blocks, { type: "note", text: note }];
      }
    } else {
      const was = stops[stop - 2];
      if (was === undefined) invalid("stop", "That moment doesn't have that stop.");
      if (note !== undefined && was.blocks.length >= MAX_BLOCKS_PER_MOMENT) throw noMore("items");
      stops[stop - 2] = {
        startsAt: op.startsAt ?? was.startsAt,
        place: op.place === undefined ? was.place : op.place || undefined,
        geo: op.place === undefined ? was.geo : op.geo,
        transport: op.transport === undefined ? was.transport : (op.transport ?? undefined),
        blocks: note === undefined ? was.blocks : [...was.blocks, { type: "note", text: note }],
      };
      patch.stops = stops;
    }
  } else if (op.op === "addStop") {
    if (stops.length >= MAX_STOPS_PER_MOMENT - 1) throw noMore("stops");
    if (op.place === undefined && note === undefined)
      invalid("place", "A new stop needs a place or a few words.");
    const at = Math.max(
      0,
      Math.min(op.after === undefined ? stops.length : op.after - 1, stops.length),
    );
    stops.splice(at, 0, {
      startsAt: op.startsAt,
      place: op.place,
      geo: op.place === undefined ? undefined : op.geo,
      transport: op.transport ?? undefined,
      blocks: note === undefined ? [] : [{ type: "note", text: note }],
    });
    patch.stops = stops;
  } else {
    if (stop === 1 || stops[stop - 2] === undefined)
      invalid("stop", "That moment doesn't have that stop.");
    stops.splice(stop - 2, 1);
    patch.stops = stops;
  }

  const { removedMediaIds } = await writeMomentUpdate(ctx, {
    event,
    moment,
    userId,
    actor: human(userId),
    patch,
  });
  return { removed: removedMediaIds };
};

const summaryOf = (ops: Op[]): string => {
  const count = (pick: (op: Op) => boolean) => ops.filter(pick).length;
  const parts = [
    [count((o) => o.op === "add"), "added"],
    [count((o) => o.op === "edit" || o.op === "addStop"), "changed"],
    [count((o) => o.op === "remove"), "removed"],
  ] as const;
  return parts
    .filter(([n]) => n > 0)
    .map(([n, what]) => `${n} ${what}`)
    .join(", ");
};

const apply = mutation({
  args: { eventId: v.id("events"), ops: v.array(vOp) },
  handler: async (ctx, args) => {
    const { userId, event, role } = await requireEventAccess(ctx, args.eventId, "contributor");
    assertNotArchived(event);
    if (args.ops.length === 0) invalid("ops", "There is nothing to apply.");
    if (args.ops.length > MAX_COMMAND_OPS)
      invalid("ops", `A request can change at most ${MAX_COMMAND_OPS} things.`);

    const structural = new Set<string>();
    const going = new Set(
      args.ops.flatMap((o) =>
        o.op === "remove" && o.stop === undefined && o.momentId ? [o.momentId] : [],
      ),
    );
    for (const o of args.ops) {
      if (o.momentId === undefined) continue;
      const stopOp = o.op === "addStop" || (o.op === "remove" && o.stop !== undefined);
      if (stopOp && structural.has(o.momentId))
        invalid("ops", "Change one set of stops per moment at a time.");
      if (stopOp) structural.add(o.momentId);
      if (going.has(o.momentId) && !(o.op === "remove" && o.stop === undefined)) {
        invalid("ops", "A moment can't be changed and removed in the same request.");
      }
    }

    const created: Id<"moments">[] = [];
    const removedMediaIds: Id<"media">[] = [];
    for (const op of orderOps(args.ops)) {
      const done = await runOp(ctx, { eventId: args.eventId, userId, role, op });
      if (done.created !== undefined) created.push(done.created);
      removedMediaIds.push(...done.removed);
    }
    return { created, removedMediaIds, summary: summaryOf(args.ops) };
  },
});

export const commandApi = { propose, apply };
