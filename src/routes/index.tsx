import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { LoginForm } from "@/components/login-form";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const { isAuthenticated } = useConvexAuth();

  if (isAuthenticated) return <Navigate to="/home" />;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <Logo className="size-6" />
          Story-time
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
