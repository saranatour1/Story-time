import { usersApi } from "../model/users";

export const {
  getCurrentUser,
  updateSettings,
  verifyEmail,
  resendEmailVerification,
  setOnThisDay,
  usage,
} = usersApi;
