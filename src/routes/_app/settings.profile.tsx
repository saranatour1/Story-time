import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { AvatarField } from "@/components/avatar-field";
import { ProfileForm } from "@/components/settings/profile-form";
import { SettingsBlock, SettingsPage } from "@/components/settings/section";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/settings/profile")({ component: Profile });

function Profile() {
  const user = useQuery(api.users.getCurrentUser);

  return (
    <SettingsPage
      title="Profile"
      description="You decide what we know. Nothing here is copied from your sign-in account."
    >
      {user === undefined ? (
        <Skeleton className="h-80 w-full" />
      ) : user === null ? null : (
        <div className="space-y-10">
          <SettingsBlock title="Photo" description="Shown next to your name.">
            <AvatarField
              mediaId={user.imageMediaId}
              initial={(user.displayName?.trim() || user.username || "?")[0]!.toUpperCase()}
            />
          </SettingsBlock>
          <hr />
          <SettingsBlock title="About you" description="Everything is optional.">
            <ProfileForm user={user} />
          </SettingsBlock>
        </div>
      )}
    </SettingsPage>
  );
}
