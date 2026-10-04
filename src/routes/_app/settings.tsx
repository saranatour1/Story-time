import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SettingsForm } from "@/components/settings-form";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/settings")({ component: Settings });

function Settings() {
  const user = useQuery(api.users.getCurrentUser);
  if (user === undefined) return <Skeleton className="h-64 max-w-md" />;
  if (user === null) return null;
  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <SettingsForm user={user} />
    </div>
  );
}
