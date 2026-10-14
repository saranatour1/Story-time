import { useQuery } from "@tanstack/react-query";
import { useMutation, usePaginatedQuery } from "convex/react";
import { CopyIcon, Link2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { queries } from "@/lib/queries";
import type { Id } from "../../../convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/errors";

type Role = "viewer" | "contributor";
// What each role may do, in the words a person would use.
const ROLE_LABEL: Record<Role, string> = { viewer: "Can watch", contributor: "Can add moments" };

const day = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const initials = (name: string | undefined) =>
  (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase() ?? "")
    .join("");

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Couldn't copy: select the link and copy it");
  }
};

// A section of the tab: an icon, a title, a sentence on what it does, then its controls.
const Card = ({
  icon,
  title,
  lead,
  aside,
  children,
}: {
  icon: ReactNode;
  title: string;
  lead: string;
  aside?: ReactNode;
  children?: ReactNode;
}) => {
  return (
    <section aria-label={title} className="space-y-4 rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-pretty text-muted-foreground">{lead}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
};

export const SharedTab = ({ eventId, archived }: { eventId: Id<"events">; archived: boolean }) => {
  const people = usePaginatedQuery(api.sessions.listForEvent, { eventId }, { initialNumItems: 25 });
  const { data: invites } = useQuery(queries.invites.listForEvent({ eventId }));
  // The switched-on link, or null. Undefined while it loads.
  const { data: publicLink } = useQuery(queries.share.link({ eventId }));
  const { data: hidePhotos } = useQuery(queries.share.hidePhotos({ eventId }));
  const enableLink = useMutation(api.share.enable);
  const setHidePhotos = useMutation(api.share.setHidePhotos);
  const disableLink = useMutation(api.share.disable);
  const rotateLink = useMutation(api.share.rotate);
  const emailShare = useMutation(api.share.emailLink);
  const revoke = useMutation(api.sessions.revoke);
  const createInvite = useMutation(api.invites.create);
  const dismiss = useMutation(api.invites.dismiss);
  const [role, setRole] = useState<Role>("viewer");
  const [email, setEmail] = useState("");
  const [shareTo, setShareTo] = useState("");
  const [sendingLink, setSendingLink] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [inviting, setInviting] = useState(false);
  // The person whose access is about to be taken away, while they confirm.
  const [removing, setRemoving] = useState<{ id: Id<"sessions">; name: string } | null>(null);

  const setLinkOn = async (on: boolean) => {
    try {
      if (on) {
        await enableLink({ eventId });
        toast.success("Link on: anyone with it can watch");
      } else {
        await disableLink({ eventId });
        toast.success("Link off: the old link no longer opens");
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const sendLink = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setSendingLink(true);
    try {
      const res = await emailShare({ eventId, to: shareTo.trim() });
      setShareTo("");
      toast.success(res.emailed ? "Link emailed" : "Email isn't set up: copy the link instead");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSendingLink(false);
    }
  };

  const invite = async () => {
    setInviting(true);
    try {
      const res = await createInvite({ eventId, role, sendTo: email.trim() || undefined });
      setLink(res.link);
      setEmail("");
      // `emailed` is false when email isn't set up on the server.
      toast.success(res.emailed ? "Invite emailed" : "Invite link ready: copy it below");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card
        icon={<Link2Icon />}
        title="Share a link"
        lead={
          hidePhotos
            ? "Anyone with the link can read the story, without an account. Photos, videos and stickers stay off the link."
            : "Anyone with the link can watch the story, without an account. They see the moments and photos, not who added them."
        }
        aside={
          <Switch
            aria-label="Anyone with the link can watch"
            checked={Boolean(publicLink)}
            disabled={publicLink === undefined || (archived && !publicLink)}
            onCheckedChange={(on) => void setLinkOn(on)}
            className="mt-1"
          />
        }
      >
        {archived && !publicLink && (
          <p className="text-sm text-muted-foreground">
            Archived experiences can't switch on a link.
          </p>
        )}
        {publicLink && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                readOnly
                aria-label="Share link"
                value={publicLink}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button variant="outline" onClick={() => void copy(publicLink)}>
                <CopyIcon /> Copy
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <div className="min-w-0">
                <Label htmlFor="hide-photos" className="text-sm">
                  Hide photos
                </Label>
                <p className="text-xs text-muted-foreground">
                  The link keeps the words. Pictures never load for someone who only has it.
                </p>
              </div>
              <Switch
                id="hide-photos"
                aria-label="Hide photos on the share link"
                checked={hidePhotos === true}
                disabled={hidePhotos === undefined}
                onCheckedChange={(hide) => {
                  void setHidePhotos({ eventId, hide }).catch((e: unknown) =>
                    toast.error(errorMessage(e)),
                  );
                }}
              />
            </div>
            <form
              onSubmit={(e) => void sendLink(e)}
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <div className="grid min-w-0 flex-1 gap-2">
                <Label htmlFor="share-email">Email the link</Label>
                <Input
                  id="share-email"
                  type="email"
                  autoComplete="email"
                  placeholder="friend@example.com"
                  value={shareTo}
                  onChange={(e) => setShareTo(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={sendingLink || shareTo.trim() === ""}
              >
                Send
              </Button>
            </form>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Switch it off and the link stops working.
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={archived}
                onClick={() => setRotating(true)}
              >
                Make a new link
              </Button>
            </div>
          </div>
        )}
        <ConfirmDialog
          open={rotating}
          onOpenChange={setRotating}
          title="Make a new link?"
          description="The current link stops working straight away. Anyone who has it will need the new one."
          confirmLabel="Make a new link"
          onConfirm={async () => {
            await rotateLink({ eventId });
            toast.success("New link ready");
          }}
        />
      </Card>

      <Card
        icon={<UserPlusIcon />}
        title="Invite someone"
        lead="An invite works once, for the first person who opens it. Choose what they can do."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void invite();
          }}
          className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-end"
        >
          {/* gap, not space-y: inside a form the Select adds a hidden <select> after
              its trigger, and space-y would push the trigger up by a margin. */}
          <div className="grid gap-2">
            <Label htmlFor="invite-role">Access</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v === "contributor" ? "contributor" : "viewer")}
            >
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                <SelectItem value="contributor">{ROLE_LABEL.contributor}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="invite-email">Email them (optional)</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={archived || inviting}>
            <UserPlusIcon /> {inviting ? "Making it…" : "Create invite"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          The email address is used to send the invite and isn't stored.
        </p>
        {link && (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <div className="flex gap-2">
              <Input
                readOnly
                aria-label="Invite link"
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs"
              />
              <Button variant="outline" onClick={() => void copy(link)}>
                <CopyIcon /> Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Shown only now. It works for the first person who opens it.
            </p>
          </div>
        )}
        {invites && invites.length > 0 && (
          <ul aria-label="Invites waiting to be opened" className="divide-y rounded-lg border">
            {invites.map((i) => (
              <li
                key={i.inviteId}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium">{ROLE_LABEL[i.role]}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · waiting, until {day(i.expiresAt)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void dismiss({ eventId, inviteId: i.inviteId })}
                >
                  Cancel invite
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        icon={<UsersIcon />}
        title="People with access"
        lead="Everyone you've invited who opened their invite."
      >
        {people.status !== "LoadingFirstPage" && people.results.length === 0 ? (
          <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
            Nobody yet. Only you can see this experience.
          </p>
        ) : (
          <div className="space-y-3">
            <ul aria-label="People with access" className="divide-y rounded-lg border">
              {people.results.map((s) => {
                const name = s.displayName ?? "Anonymous";
                return (
                  <li key={s._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                    >
                      {initials(s.displayName) || <UsersIcon className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ROLE_LABEL[s.role]} · since {day(s.grantedAt)}
                      </p>
                    </div>
                    {s.revokedAt ? (
                      <Badge variant="secondary">Removed</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRemoving({ id: s._id, name })}
                      >
                        Remove access
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            {people.status === "CanLoadMore" && (
              <Button variant="outline" onClick={() => people.loadMore(25)}>
                Show more people
              </Button>
            )}
          </div>
        )}
        <ConfirmDialog
          open={removing !== null}
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
          title={`Remove ${removing?.name ?? "this person"}'s access?`}
          description="They can't open this experience any more. What they added stays. You can invite them again later."
          confirmLabel="Remove access"
          onConfirm={async () => {
            if (removing === null) return;
            try {
              await revoke({ sessionId: removing.id });
              toast.success("Access removed");
            } catch (e) {
              toast.error(errorMessage(e));
            }
          }}
        />
      </Card>
    </div>
  );
};
