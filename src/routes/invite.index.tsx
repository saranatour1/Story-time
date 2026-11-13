import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { INVITE_STASH, InvitePage } from "@/components/invite-page";
import { readStored, writeStored } from "@/lib/storage";

const readToken = (): string => {
  if (typeof window === "undefined") return "";
  const fromLink = window.location.hash.slice(1);
  if (!fromLink) return readStored("session", INVITE_STASH) ?? "";
  writeStored("session", INVITE_STASH, fromLink);
  return fromLink;
};

const kept = (token: string): boolean =>
  token !== "" && readStored("session", INVITE_STASH) === token;

const Invite = () => {
  const [token, setToken] = useState(readToken);
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash.length > 1) setToken(readToken());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const returnTo =
    typeof window !== "undefined" && kept(token) ? `${window.location.origin}/invite` : undefined;
  return <InvitePage key={token} token={token} returnTo={returnTo} />;
};

export const Route = createFileRoute("/invite/")({ component: Invite });
