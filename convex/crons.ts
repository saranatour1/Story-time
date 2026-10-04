import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Backstop for the per-invite expiry timers.
crons.daily(
  "sweep expired invites",
  { hourUTC: 3 },
  internal.invites.sweepExpired,
);

export default crons;
