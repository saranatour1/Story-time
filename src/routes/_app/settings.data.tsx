import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { RegionForm } from "@/components/settings/region-form";
import { SettingsBlock, SettingsPage } from "@/components/settings/section";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/settings/data")({ component: DataSettings });

function DataSettings() {
  const user = useQuery(api.users.getCurrentUser);

  return (
    <SettingsPage
      title="Data & region"
      description="Choose where your experiences are stored, and see what we keep."
    >
      <div className="space-y-10">
        <SettingsBlock title="Region">
          {user === undefined ? (
            <Skeleton className="h-32 w-full" />
          ) : user === null ? null : (
            <RegionForm region={user.region} />
          )}
        </SettingsBlock>
        <hr />
        <SettingsBlock title="What we store">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Only what you type in: profile fields, moments, notes and links.</li>
            <li>Place, notes and links are encrypted before they are saved.</li>
            <li>Photos are encrypted in storage and visible only to people you share with.</li>
            <li>Nothing is copied from your GitHub or Google account.</li>
          </ul>
        </SettingsBlock>
      </div>
    </SettingsPage>
  );
}
