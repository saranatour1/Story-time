import { BotIcon, CogIcon, UserRoundIcon } from "lucide-react";
import { describeActor, type ActorView } from "@/lib/actors";
import { cn } from "@/lib/utils";

// Who did it, at a glance: a person is plain text with a person icon, an agent
// is a violet pill with a robot and the word "agent", the system a cog. Colour
// never carries the meaning alone: the icon and the word do too.
export const ActorBadge = ({
  actor,
  className,
  // "You" for the signed-in person's own work.
  you = false,
}: {
  actor: ActorView;
  className?: string;
  you?: boolean;
}) => {
  const label = describeActor(actor);
  if (actor.kind === "agent") {
    return (
      <span
        title={label}
        aria-label={label}
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-violet-900 dark:bg-violet-500/20 dark:text-violet-200",
          className,
        )}
      >
        <BotIcon aria-hidden className="size-3 shrink-0" />
        <span className="truncate">{actor.name}</span>
        <span className="font-normal opacity-70">agent</span>
      </span>
    );
  }
  const Icon = actor.kind === "system" ? CogIcon : UserRoundIcon;
  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground",
        className,
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{actor.kind === "human" && you ? "You" : label}</span>
    </span>
  );
};
