import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron("sweep expired invites", "17 3 * * *", internal.model.invites.sweepExpired, {});

crons.interval(
  "sweep reserved uploads",
  { hours: 1 },
  internal.model.media.sweepReservedUploads,
  {},
);

crons.cron("backfill journal pages", "23 4 * * *", internal.model.journal.backfillWaiting, {});

crons.cron("on this day", "17 15 * * *", internal.model.onThisDay.prepare, {});

export default crons;
