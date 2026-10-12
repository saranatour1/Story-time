import { createFileRoute } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { LogOutIcon } from "lucide-react";
import { SettingsBlock, SettingsPage } from "@/components/settings/section";
import { Button } from "@/components/ui/button";
import { clearMediaCache } from "@/lib/use-media-url";

const Account = () => {
  const { signOut } = useAuthActions();

  return (
    <SettingsPage title="Account" description="How you sign in to Story-time.">
      <div className="space-y-10">
        <SettingsBlock
          title="Signing in"
          description="You sign in with GitHub or Google, so there is no password to manage here."
        >
          <Button
            variant="outline"
            onClick={() => {
              clearMediaCache();
              void signOut();
            }}
          >
            <LogOutIcon /> Sign out
          </Button>
        </SettingsBlock>
      </div>
    </SettingsPage>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/_app/settings/account")({ component: Account });
