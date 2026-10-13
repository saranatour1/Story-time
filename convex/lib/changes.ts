import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { vChangeAction, vChangeEntity } from "../schema";
import { limitWrites } from "./rateLimit";

type Snapshot = Record<string, string | number | boolean | null>;

// Call inside the same mutation as the write so the change and its record
// commit together. Never put sensitive values in `before`/`after`; list the
// field names in `fields` instead.
export const recordChange = async (
  ctx: MutationCtx,
  change: {
    eventId: Id<"events">;
    entity: Infer<typeof vChangeEntity>;
    entityId: string;
    actorId?: Id<"users">;
    // The agent that made the change, when one did (`actorId` is then the
    // person it acts for). See `changeFields` in ./actors.
    agent?: string;
    action: Infer<typeof vChangeAction>;
    fields: string[];
    before?: Snapshot;
    after?: Snapshot;
  },
): Promise<void> => {
  // Every change a person makes passes here, so it's where a runaway client
  // is stopped. An agent's change is counted against the AI allowance instead.
  if (change.actorId !== undefined && change.agent === undefined) await limitWrites(ctx, change.actorId);
  await ctx.db.insert("changes", { ...change, at: Date.now() });
};
