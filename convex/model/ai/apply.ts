import { v } from "convex/values";
import type { Infer } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { MAX_BLOCKS_PER_MOMENT, MAX_LABEL_LENGTH, MAX_LABELS_PER_MOMENT } from "../../lib/limits";
import { viewMoment, writeMomentUpdate, type MomentEdit } from "../moments";
import { vTransport } from "../../schema";

type Transport = Infer<typeof vTransport>;

// The name the AI that drafts notes goes by in the activity log and on moments.
const SCRIBE = "Scribe";

// Writes what the AI produced, into gaps only: anything a person typed stays.
export const apply = internalMutation({
  args: {
    momentId: v.id("moments"),
    // Written as a note, or as a feeling when there is a mood.
    note: v.optional(v.string()),
    mood: v.optional(v.string()),
    labels: v.optional(v.array(v.string())),
    // Keyed by stop index: 0 is the moment's own first stop, n is `stops[n - 1]`.
    transports: v.optional(v.record(v.string(), vTransport)),
    linkTitles: v.optional(
      v.array(v.object({ stopIndex: v.number(), blockIndex: v.number(), title: v.string() })),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const moment = await ctx.db.get("moments", args.momentId);
    if (moment === null) return null;
    const event = await ctx.db.get("events", moment.eventId);
    // Archived experiences take no changes, the AI's included.
    if (event === null || event.status === "archived") return null;

    // Edit the decrypted copy, then write it back through the same path as an edit.
    const view = await viewMoment(ctx, event, moment);
    const blocks = view.blocks;
    const stops = view.stops;
    const edit: MomentEdit = {};
    let blocksChanged = false;
    let stopsChanged = false;

    // The diary line goes on the first stop, and only when nothing is written yet.
    const written = [blocks, ...stops.map((s) => s.blocks)].some((list) =>
      list.some((b) => b.type === "note" || b.type === "feeling"),
    );
    const text = args.note?.trim();
    if (text && !written && blocks.length < MAX_BLOCKS_PER_MOMENT) {
      blocks.push(args.mood ? { type: "feeling", text, mood: args.mood } : { type: "note", text });
      blocksChanged = true;
    }

    // A title fills a link that has none.
    for (const { stopIndex, blockIndex, title } of args.linkTitles ?? []) {
      const list = stopIndex === 0 ? blocks : stops[stopIndex - 1]?.blocks;
      const block = list?.[blockIndex];
      if (list === undefined || block?.type !== "link" || block.title !== undefined || title.trim() === "") continue;
      list[blockIndex] = { ...block, title };
      if (stopIndex === 0) blocksChanged = true;
      else stopsChanged = true;
    }

    // Each stop's transport is filled only where it is empty.
    let transport = view.transport;
    const transports: Record<string, Transport> = args.transports ?? {};
    for (const key of Object.keys(transports)) {
      const stopIndex = Number(key);
      if (stopIndex === 0) {
        transport ??= transports[key];
        continue;
      }
      const stop = stops[stopIndex - 1];
      if (stop !== undefined && stop.transport === undefined) {
        stop.transport = transports[key];
        stopsChanged = true;
      }
    }
    if (transport !== view.transport) edit.transport = transport;

    // Labels only when the moment has none.
    const labels = (args.labels ?? [])
      .map((label) => label.trim())
      .filter((label) => label !== "" && label.length <= MAX_LABEL_LENGTH)
      .slice(0, MAX_LABELS_PER_MOMENT);
    if (view.labels.length === 0 && labels.length > 0) edit.labels = labels;

    if (blocksChanged) edit.blocks = blocks;
    if (stopsChanged) edit.stops = stops;
    if (Object.keys(edit).length === 0) return null;

    // No person made this edit: Scribe did, for no one in particular. Every
    // photo already sits on this moment, so the uploader check never applies
    // and the author stands in as the editor.
    await writeMomentUpdate(ctx, {
      event,
      moment,
      userId: moment.authorId,
      actor: { kind: "agent", name: SCRIBE },
      patch: edit,
    });
    return null;
  },
});
