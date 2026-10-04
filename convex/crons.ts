import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Backstop for the per-invite expiry timers.
crons.cron(
  "sweep expired invites",
  "17 3 * * *",
  internal.invites.sweepExpired,
  {},
);

export default crons;
