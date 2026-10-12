import { Link } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ChevronsUpDownIcon, LogOutIcon, SettingsIcon } from "lucide-react";
import { api } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { clearMediaCache } from "@/lib/use-media-url";

// Footer card: shows who you are and opens a menu to the side with
// Settings and Sign out.
export const UserMenu = () => {
  const user = useQuery(api.users.getCurrentUser);
  const { signOut } = useAuthActions();
  const { isMobile } = useSidebar();

  const name = user?.displayName?.trim() || user?.username || "Anonymous";
  const detail = user?.username ? `@${user.username}` : (user?.email ?? "");

  const identity = (
    <>
      <UserAvatar mediaId={user?.imageMediaId} name={user?.displayName?.trim() || user?.username} className="size-8" />
      <div className="grid flex-1 text-left leading-tight">
        <span className="truncate text-sm font-medium">{name}</span>
        {detail && (
          <span className="truncate text-xs text-muted-foreground">{detail}</span>
        )}
      </div>
    </>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" tooltip={name} disabled={user === undefined}>
          {user === undefined ? <Skeleton className="h-8 w-full" /> : identity}
          <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={8}
        className="min-w-56"
      >
        <DropdownMenuLabel className="flex items-center gap-2 p-2 font-normal">
          {identity}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <SettingsIcon /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            clearMediaCache();
            void signOut();
          }}
        >
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
