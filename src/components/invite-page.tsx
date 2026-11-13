import { Link, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { LoginForm } from "@/components/login-form";
import { SignedOutPage } from "@/components/sign-in-screen";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { forgetStored } from "@/lib/storage";

export const INVITE_STASH = "storytime:invite";

const forgetStash = () => {
  forgetStored("session", INVITE_STASH);
};

export const InvitePage = ({ token, returnTo }: { token: string; returnTo?: string }) => {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const accept = useMutation(api.invites.accept);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(
    token ? null : "This invite link is missing its code.",
  );
  const acceptAttempted = useRef(false);

  useEffect(() => {
    if (!token || !isAuthenticated || acceptAttempted.current) return;
    acceptAttempted.current = true;
    accept({ token })
      .then((r) => {
        forgetStash();
        return navigate({ to: "/e/$id", params: { id: r.eventId } });
      })
      .catch((e) => setError(errorMessage(e)));
  }, [isAuthenticated, accept, token, navigate]);

  return (
    <SignedOutPage className="items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        {error ? (
          <div role="alert" className="flex flex-col items-start gap-4">
            <h1 className="font-display text-3xl tracking-tight">This invite didn't open</h1>
            <p>{error}</p>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Each invite link works for the first person who opens it, and only for a limited time.
              Ask whoever sent it for a new one.
            </p>
            <Button variant="outline" asChild>
              {isAuthenticated ? (
                <Link to="/home">Go to your experiences</Link>
              ) : (
                <Link to="/">Go to Story-time</Link>
              )}
            </Button>
          </div>
        ) : isLoading || isAuthenticated ? (
          <p role="status" className="text-center text-stone-600 dark:text-stone-400">
            {isAuthenticated ? "Opening the experience…" : ""}
          </p>
        ) : (
          <LoginForm
            returnTo={returnTo}
            heading="You're invited"
            description="Someone shared an experience with you on Story-time. It's where the people who were there put their photos together and play them back as a story. Sign in to open it."
          />
        )}
      </div>
    </SignedOutPage>
  );
};
