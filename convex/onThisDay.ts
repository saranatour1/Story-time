import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { appOrigin } from "./lib/appUrl";
import { emailConfigured } from "./lib/emailAddress";
import { localYear, monthDayOf } from "./lib/monthDay";

const BATCH = 100;
const SCAN = 500;

// Fills month-day on moments saved before the field existed, then sends.
// Skipped entirely when email is not configured, so nothing is queued to fail.
export const prepare = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!emailConfigured()) return null;
    const page = await ctx.db.query("moments").paginate({ numItems: BATCH, cursor: args.cursor ?? null });
    for (const moment of page.page) {
      const monthDay = monthDayOf(moment.startsAt, moment.tzOffsetMinutes);
      if (moment.monthDay !== monthDay) {
        await ctx.db.patch("moments", moment._id, { monthDay });
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.onThisDay.prepare, { cursor: page.continueCursor });
    } else {
      await ctx.scheduler.runAfter(0, internal.onThisDay.send, {});
    }
    return null;
  },
});

function utcDay(now: number): string {
  const d = new Date(now);
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}-${day}`;
}

// One note per owner per UTC day, and only when a past year has this date.
// The message names nothing about the memory.
export const send = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!emailConfigured()) return null;
    const now = Date.now();
    const monthDay = monthDayOf(now, 0);
    const year = new Date(now).getUTCFullYear();
    const moments = await ctx.db
      .query("moments")
      .withIndex("by_monthDay", (q) => q.eq("monthDay", monthDay))
      .take(SCAN);
    const owners = new Set<Id<"users">>();
    for (const moment of moments) {
      if (localYear(moment.startsAt, moment.tzOffsetMinutes) >= year) continue;
      const event = await ctx.db.get("events", moment.eventId);
      if (event !== null) owners.add(event.ownerId);
    }
    const day = utcDay(now);
    const home = `${appOrigin()}/home`;
    for (const userId of owners) {
      const user = await ctx.db.get("users", userId);
      if (user?.onThisDay !== true || user.emailVerified !== true || user.email === undefined) continue;
      const already = await ctx.db
        .query("memoryMails")
        .withIndex("by_user_and_day", (q) => q.eq("userId", userId).eq("day", day))
        .unique();
      if (already !== null) continue;
      await ctx.db.insert("memoryMails", { userId, day });
      await ctx.runMutation(components.email.lib.send, {
        to: user.email,
        subject: "A memory is waiting",
        html: `<p>A memory is waiting.</p><p><a href="${home}">Open Story-time</a></p>`,
        text: `A memory is waiting.\n${home}`,
      });
    }
    return null;
  },
});
