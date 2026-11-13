import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { vChangeAction, vChangeEntity } from "../schema";
import { changeCounts } from "./aggregates";
import { limitWrites } from "./rateLimit";

type Snapshot = Record<string, string | number | boolean | null>;

export const recordChange = async (
  ctx: MutationCtx,
  change: {
    eventId: Id<"events">;
    entity: Infer<typeof vChangeEntity>;
    entityId: string;
    actorId?: Id<"users">;
    agent?: string;
    action: Infer<typeof vChangeAction>;
    fields: string[];
    before?: Snapshot;
    after?: Snapshot;
  },
): Promise<void> => {
  if (change.actorId !== undefined && change.agent === undefined)
    await limitWrites(ctx, change.actorId);
  const id = await ctx.db.insert("changes", { ...change, at: Date.now() });
  const row = await ctx.db.get("changes", id);
  if (row !== null) await changeCounts.insert(ctx, row);
};
