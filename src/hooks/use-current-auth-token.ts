import { useAuthToken } from "@convex-dev/auth/react";
import { useCallback, useEffect, useRef } from "react";

export const useCurrentAuthToken = () => {
  const token = useAuthToken();
  const latest = useRef(token);
  useEffect(() => {
    latest.current = token;
  }, [token]);
  return useCallback(() => latest.current ?? undefined, []);
};
