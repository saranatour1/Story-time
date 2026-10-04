import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { vChangeAction, vChangeEntity } from "../schema";

type Snapshot = Record<string, string | number | boolean | null>;

// Call inside the same mutation as the write so the change and its record
// commit together. Never put sensitive values in `before`/`after`; list the
// field names in `fields` instead.
export async function recordChange(
  ctx: MutationCtx,
  change: {
    eventId: Id<"events">;
    entity: Infer<typeof vChangeEntity>;
    entityId: string;
    actorId?: Id<"users">;
    action: Infer<typeof vChangeAction>;
    fields: string[];
    before?: Snapshot;
    after?: Snapshot;
  },
): Promise<void> {
  await ctx.db.insert("changes", { ...change, at: Date.now() });
}
