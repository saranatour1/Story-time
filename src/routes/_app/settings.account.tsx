import { createFileRoute } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "@tanstack/react-query";
import { LogOutIcon } from "lucide-react";
import { SettingsBlock, SettingsPage } from "@/components/settings/section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { queries } from "@/lib/queries";
import { clearMediaCache } from "@/lib/use-media-url";

const bytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`);

// One allowance: what it is, how much is used, and a bar.
const Meter = ({ label, used, limit, text }: { label: string; used: number; limit: number; text: string }) => {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{text}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
        <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
      </div>
    </div>
  );
};

// What's left of the day's AI uses and the account's room, from users.usage.
const Usage = () => {
  const { data: usage } = useQuery(queries.users.usage());
  if (!usage) return <Skeleton className="h-36 w-full max-w-md" />;
  // Past midnight UTC the day's uses are back, even before anything refreshes this.
  const fresh = Date.now() >= usage.ai.resetsAt;
  const aiLeft = fresh ? usage.ai.limit : usage.ai.left;
  const backAt = new Date(usage.ai.resetsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return (
    <div className="max-w-md space-y-5">
      <Meter
        label="AI today"
        used={usage.ai.limit - aiLeft}
        limit={usage.ai.limit}
        text={`${aiLeft} of ${usage.ai.limit} left${aiLeft < usage.ai.limit ? ` · back at ${backAt}` : ""}`}
      />
      <Meter label="Photos and videos" used={usage.storage.used} limit={usage.storage.limit} text={`${bytes(usage.storage.used)} of ${bytes(usage.storage.limit)}`} />
      <Meter label="Experiences" used={usage.experiences.used} limit={usage.experiences.limit} text={`${usage.experiences.used} of ${usage.experiences.limit}`} />
    </div>
  );
};

const Account = () => {
  const { signOut } = useAuthActions();

  return (
    <SettingsPage title="Account" description="How you sign in to Story-time, and what you've used.">
      <div className="space-y-10">
        <SettingsBlock
          title="Usage"
          description="Each person gets 10 AI uses a day, shared by everything that uses AI: notes written for your photos, the box, voice, and journal titles. Moments still save without them."
        >
          <Usage />
        </SettingsBlock>
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
