import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  invites: defineTable({
    eventId: v.string(),
    invitedBy: v.string(),
    role: v.union(v.literal("viewer"), v.literal("contributor")),
    tokenHash: v.string(),
    expiresAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_event", ["eventId"])
    .index("by_expiresAt", ["expiresAt"]),
});
