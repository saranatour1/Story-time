import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { INVITE_STASH, InvitePage } from "@/components/invite-page";

const readToken = (): string => {
  if (typeof window === "undefined") return "";
  const fromLink = window.location.hash.slice(1);
  try {
    if (!fromLink) return sessionStorage.getItem(INVITE_STASH) ?? "";
    sessionStorage.setItem(INVITE_STASH, fromLink);
  } catch {
    // No storage: see returnTo below.
  }
  return fromLink;
};

// Whether the token is waiting in this tab, so sign-in can come back without it.
const kept = (token: string): boolean => {
  try {
    return token !== "" && sessionStorage.getItem(INVITE_STASH) === token;
  } catch {
    return false;
  }
};

const Invite = () => {
  const [token, setToken] = useState(readToken);
  // Another invite pasted into this tab only changes the "#" part, which
  // doesn't reload the page.
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash.length > 1) setToken(readToken());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  // Without storage the token has to travel in the address, or the invite is lost.
  const returnTo = typeof window !== "undefined" && kept(token) ? `${window.location.origin}/invite` : undefined;
  return <InvitePage key={token} token={token} returnTo={returnTo} />;
};

// /invite#<token>: browsers don't send what follows "#" to any server. The
// link stays as it was, so it can be reloaded, copied or opened in another
// browser; sign-in, which hands its return address to the sign-in backend,
// is given /invite without the token, and the token waits in this tab.
export const Route = createFileRoute("/invite/")({ component: Invite });
