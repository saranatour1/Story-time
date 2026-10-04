import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import {
  useOauth,
  useSignInWithGithub,
  useSignInWithGoogle,
} from "@convex-dev/auth/providers/oauth/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signInGithub } = useSignInWithGithub(api.auth);
  const { signInGoogle } = useSignInWithGoogle(api.auth);
  const { flowError } = useOauth();

  if (isAuthenticated) return <Navigate to="/home" />;

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-8 px-6">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">Story-time</h1>
        <p className="text-muted-foreground">
          Share moments from experiences you had together. You choose what to
          add, and who can see it.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          disabled={isLoading}
          onClick={() => void signInGithub().catch(() => {})}
        >
          Continue with GitHub
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={isLoading}
          onClick={() => void signInGoogle().catch(() => {})}
        >
          Continue with Google
        </Button>
        {flowError !== null && (
          <p role="alert" className="text-sm text-destructive">
            {flowError.message ?? "Sign-in didn't complete. Please try again."}
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        We don't copy your name, email or photo from your account.
      </p>
    </main>
  );
}
