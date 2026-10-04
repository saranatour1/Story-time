import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation } from "convex/react";
import {
  useSignInWithGithub,
  useSignInWithGoogle,
} from "@convex-dev/auth/providers/oauth/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/invite/$token")({ component: Invite });

function Invite() {
  const { token } = Route.useParams();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const accept = useMutation(api.invites.accept);
  const { signInGithub } = useSignInWithGithub(api.auth);
  const { signInGoogle } = useSignInWithGoogle(api.auth);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || started.current) return;
    started.current = true; // an invite works once, so never retry
    accept({ token })
      .then((r) => navigate({ to: "/e/$id", params: { id: r.eventId } }))
      .catch((e) => setError(errorMessage(e)));
  }, [isAuthenticated, accept, token, navigate]);

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-bold tracking-tight">You're invited</h1>
      {error ? (
        <p role="alert" className="text-destructive">{error}</p>
      ) : isAuthenticated ? (
        <p className="text-muted-foreground">Opening the experience…</p>
      ) : (
        <>
          <p className="text-muted-foreground">Sign in to open this shared experience.</p>
          <Button disabled={isLoading} onClick={() => void signInGithub({ redirectTo: window.location.href }).catch(() => {})}>
            Continue with GitHub
          </Button>
          <Button variant="outline" disabled={isLoading} onClick={() => void signInGoogle({ redirectTo: window.location.href }).catch(() => {})}>
            Continue with Google
          </Button>
        </>
      )}
    </main>
  );
}
