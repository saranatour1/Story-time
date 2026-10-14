import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Backstop for the per-invite expiry timers.
crons.cron("sweep expired invites", "17 3 * * *", internal.model.invites.sweepExpired, {});

// Abandoned upload reservations count toward an experience's cap until swept.
crons.interval(
  "sweep reserved uploads",
  { hours: 1 },
  internal.model.media.sweepReservedUploads,
  {},
);

// Pages still owed to moments. Opening the journal also cuts them; this
// catches a trip nobody has opened. Minute 23, off the hour.
crons.cron("backfill journal pages", "23 4 * * *", internal.model.journal.backfillWaiting, {});

// A memory from a past year, if the owner asked to hear about it.
// Minute 17, like the invite sweep, so it isn't on the hour.
crons.cron("on this day", "17 15 * * *", internal.model.onThisDay.prepare, {});

export default crons;
