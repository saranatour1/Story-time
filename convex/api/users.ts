import { usersApi } from "../model/users";

// Written in convex/model/users.ts.
export const {
  getCurrentUser,
  updateSettings,
  verifyEmail,
  resendEmailVerification,
  setOnThisDay,
  usage,
} = usersApi;
