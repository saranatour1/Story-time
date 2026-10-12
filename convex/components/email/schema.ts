import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // The recipient and body are only kept until the message is sent (or has
  // permanently failed); then they are cleared and only the status remains.
  outbox: defineTable({
    to: v.optional(v.string()),
    replyTo: v.optional(v.string()),
    subject: v.optional(v.string()),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    error: v.optional(v.string()),
    messageId: v.optional(v.string()),
  }).index("by_status", ["status"]),
});
