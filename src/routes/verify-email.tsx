import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { LoginForm } from "@/components/login-form";
import { SignedOutPage } from "@/components/sign-in-screen";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";

// The token waits in this tab while its opener signs in, the same way an invite does.
const STASH = "storytime:email-verify";

const readToken = (): string => {
  if (typeof window === "undefined") return "";
  const fromLink = window.location.hash.slice(1);
  try {
    if (!fromLink) return sessionStorage.getItem(STASH) ?? "";
    sessionStorage.setItem(STASH, fromLink);
  } catch {
    // No storage: the return address has to carry the token.
  }
  return fromLink;
};

const kept = (token: string): boolean => {
  try {
    return token !== "" && sessionStorage.getItem(STASH) === token;
  } catch {
    return false;
  }
};

const forget = () => {
  try {
    sessionStorage.removeItem(STASH);
  } catch {
    // Nothing kept.
  }
};

const VerifyEmail = () => {
  const [token, setToken] = useState(readToken);
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash.length > 1) setToken(readToken());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const returnTo = typeof window !== "undefined" && kept(token) ? `${window.location.origin}/verify-email` : undefined;
  return <VerifyBody key={token} token={token} returnTo={returnTo} />;
};

const VerifyBody = ({ token, returnTo }: { token: string; returnTo?: string }) => {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const verify = useMutation(api.users.verifyEmail);
  const [error, setError] = useState<string | null>(token ? null : "This confirmation link is missing its code.");
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!token || !isAuthenticated || started.current) return;
    started.current = true;
    verify({ token })
      .then(() => {
        forget();
        setDone(true);
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [isAuthenticated, verify, token]);

  return (
    <SignedOutPage className="items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        {done ? (
          <div className="flex flex-col items-start gap-4">
            <h1 className="font-display text-3xl tracking-tight">Email confirmed</h1>
            <p>This address can be used for replies and reminders.</p>
            <Button variant="outline" asChild>
              <Link to="/settings/profile">Back to settings</Link>
            </Button>
          </div>
        ) : error ? (
          <div role="alert" className="flex flex-col items-start gap-4">
            <h1 className="font-display text-3xl tracking-tight">That link didn't confirm</h1>
            <p>{error}</p>
            <Button variant="outline" asChild>
              {isAuthenticated ? <Link to="/settings/profile">Back to settings</Link> : <Link to="/">Go to Story-time</Link>}
            </Button>
          </div>
        ) : isLoading || isAuthenticated ? (
          <p role="status" className="text-center text-stone-600 dark:text-stone-400">
            {isAuthenticated ? "Confirming…" : ""}
          </p>
        ) : (
          <LoginForm
            returnTo={returnTo}
            heading="Confirm your email"
            description="Sign in as the person this link was sent to."
          />
        )}
      </div>
    </SignedOutPage>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/verify-email")({ component: VerifyEmail });
