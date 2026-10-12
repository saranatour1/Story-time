import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AvatarField } from "@/components/avatar-field";
import { ProfileForm } from "@/components/settings/profile-form";
import { SettingsBlock, SettingsPage } from "@/components/settings/section";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/errors";

const Profile = () => {
  const user = useQuery(api.users.getCurrentUser);

  return (
    <SettingsPage
      title="Profile"
      description="A confirmed email from sign-in is saved here. Your name and photo are not."
    >
      {user === undefined ? (
        <Skeleton className="h-80 w-full" />
      ) : user === null ? null : (
        <div className="space-y-10">
          <SettingsBlock title="Photo" description="Shown next to your name.">
            <AvatarField
              mediaId={user.imageMediaId}
              name={user.displayName?.trim() || user.username}
            />
          </SettingsBlock>
          <hr />
          <SettingsBlock title="About you" description="Everything is optional.">
            <ProfileForm user={user} />
          </SettingsBlock>
          <hr />
          <OnThisDay emailVerified={user.emailVerified} on={user.onThisDay} />
        </div>
      )}
    </SettingsPage>
  );
};

const OnThisDay = ({ emailVerified, on }: { emailVerified: boolean; on: boolean }) => {
  const set = useMutation(api.users.setOnThisDay);
  return (
    <SettingsBlock
      title="On this day"
      description="Once a day, if a past year has this date, we email that a memory is waiting. The message has a link and nothing about the memory."
    >
      <div className="flex items-center gap-3">
        <Switch
          checked={on}
          disabled={!emailVerified}
          aria-label="Email me on this day"
          onCheckedChange={(next) => {
            void set({ on: next }).catch((e: unknown) => toast.error(errorMessage(e)));
          }}
        />
        <span className="text-sm">{emailVerified ? "Email me" : "Confirm your email first"}</span>
      </div>
    </SettingsBlock>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/_app/settings/profile")({ component: Profile });
