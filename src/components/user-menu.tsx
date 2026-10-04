import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ChevronsUpDownIcon, LogOutIcon } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { SettingsForm } from "@/components/settings-form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

// Footer card: shows who you are and opens settings in a modal.
export function UserMenu() {
  const user = useQuery(api.users.getCurrentUser);
  const { signOut } = useAuthActions();
  const [open, setOpen] = useState(false);

  const name = user?.displayName?.trim() || "Anonymous";
  const initial = user?.displayName?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <SidebarMenuButton size="lg" tooltip="Settings" disabled={user === undefined}>
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left leading-tight">
            {user === undefined ? (
              <Skeleton className="h-4 w-24" />
            ) : (
              <>
                <span className="truncate text-sm font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">Settings</span>
              </>
            )}
          </div>
          <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            You decide what we know. Nothing here is copied from your sign-in account.
          </DialogDescription>
        </DialogHeader>
        {user && <SettingsForm user={user} onSaved={() => setOpen(false)} />}
        <Separator />
        <DialogFooter className="sm:justify-start">
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOutIcon /> Sign out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
