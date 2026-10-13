import { api as generated } from "../../convex/_generated/api";

// Every function the app calls lives in convex/api/, so `api.moments.list`
// here is Convex's own `api.api.moments.list`. Sign-in is the one exception:
// it stays at convex/auth.ts, where @convex-dev/auth sets it up.
export const api = generated.api;
export const authApi = generated.auth;
