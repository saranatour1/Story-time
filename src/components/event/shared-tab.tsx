import { useQuery } from "@tanstack/react-query";
import { useMutation, usePaginatedQuery } from "convex/react";
import { CopyIcon, Link2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { queries } from "@/lib/queries";
import type { Id } from "../../../convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { localDay, localEndOfDay } from "@/components/event/event-dates";
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
import { initials } from "@/components/user-avatar";
import { SEEN_PING_MS } from "@/hooks/use-seen";
import { errorMessage } from "@/lib/errors";

type Role = "viewer" | "contributor";
type GrantRole = Role | "owner";
export const ROLE_LABEL: Record<GrantRole, string> = {
  viewer: "Can watch",
  contributor: "Can add moments",
  owner: "Co-owner",
};
const grantRole = (v: string): GrantRole => (v === "owner" || v === "contributor" ? v : "viewer");

const day = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Couldn't copy: select the link and copy it");
  }
};

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

const DAY_MS = 24 * 60 * 60 * 1000;

const LOOKING_MS = SEEN_PING_MS + 60 * 1000;
const lastSeen = (at: number | undefined, now: number) => {
  if (at === undefined) return "Hasn't opened it yet";
  if (now - at < LOOKING_MS) return "Looking now";
  const when = new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Last here ${when}`;
};

const PARTS = [
  {
    part: "photos",
    label: "Photos and videos",
    hint: "Off, the link keeps the words and no picture loads.",
  },
  {
    part: "film",
    label: "Play and map",
    hint: "Off, there's no film to play and no map pins leave.",
  },
] as const;

export const SharedTab = ({ eventId, archived }: { eventId: Id<"events">; archived: boolean }) => {
  const people = usePaginatedQuery(api.sessions.listForEvent, { eventId }, { initialNumItems: 25 });
  const { data: invites } = useQuery(queries.invites.listForEvent({ eventId }));
  const { data: publicLink } = useQuery(queries.share.link({ eventId }));
  const { data: shown } = useQuery(queries.share.shown({ eventId }));
  const enableLink = useMutation(api.share.enable);
  const setShown = useMutation(api.share.setShown);
  const disableLink = useMutation(api.share.disable);
  const rotateLink = useMutation(api.share.rotate);
  const emailShare = useMutation(api.share.emailLink);
  const revoke = useMutation(api.sessions.revoke);
  const setGrantRole = useMutation(api.sessions.setRole);
  const createInvite = useMutation(api.invites.create);
  const dismiss = useMutation(api.invites.dismiss);
  const [role, setRole] = useState<Role>("viewer");
  const [expires, setExpires] = useState(() => localDay(Date.now() + 7 * DAY_MS));
  const [email, setEmail] = useState("");
  const [shareTo, setShareTo] = useState("");
  const [sendingLink, setSendingLink] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<{ id: Id<"sessions">; name: string } | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

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
      const res = await createInvite({
        eventId,
        role,
        expiresAt: localEndOfDay(expires),
        sendTo: email.trim() || undefined,
      });
      setLink(res.link);
      setEmail("");
      toast.success(res.emailed ? "Invite emailed" : "Invite link ready: copy it below");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setInviting(false);
    }
  };

  const waiting = invites ?? [];
  const nobody =
    people.status !== "LoadingFirstPage" && people.results.length === 0 && waiting.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card
        icon={<Link2Icon />}
        title="Public link"
        lead="Anyone with the link can read the story, without an account. They never see who added what. You choose what it shows."
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
          <div className="space-y-4">
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
            <ul aria-label="What the link shows" className="divide-y rounded-lg border">
              {PARTS.map(({ part, label, hint }) => (
                <li key={part} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <Label htmlFor={`show-${part}`} className="text-sm">
                      {label}
                    </Label>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                  <Switch
                    id={`show-${part}`}
                    checked={shown?.[part] === true}
                    disabled={shown === undefined}
                    onCheckedChange={(show) => {
                      void setShown({ eventId, part, show }).catch((e: unknown) =>
                        toast.error(errorMessage(e)),
                      );
                    }}
                  />
                </li>
              ))}
            </ul>
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
        icon={<UsersIcon />}
        title="People and invites"
        lead="An invite works once, for the first person who opens it, until the day you pick. Then they're listed here, with when they were last looking. A co-owner can do all you can."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void invite();
          }}
          className="grid gap-3 sm:grid-cols-[10rem_10rem_minmax(0,1fr)] sm:items-end"
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
          <div className="grid gap-2">
            <Label htmlFor="invite-expires">Link expires</Label>
            <Input
              id="invite-expires"
              type="date"
              required
              min={localDay(now)}
              max={localDay(now + 365 * DAY_MS)}
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
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
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
            <p className="text-xs text-muted-foreground">
              The email address is used to send the invite and isn't stored.
            </p>
            <Button type="submit" disabled={archived || inviting}>
              <UserPlusIcon /> {inviting ? "Making it…" : "Create invite"}
            </Button>
          </div>
        </form>
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
        {nobody ? (
          <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
            Nobody yet. Only you can see this experience.
          </p>
        ) : (
          <div className="space-y-3">
            <ul aria-label="People and invites" className="divide-y rounded-lg border">
              {waiting.map((i) => (
                <li key={i.inviteId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed text-muted-foreground"
                  >
                    <UserPlusIcon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Invite not opened yet</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABEL[i.role]} · expires {day(i.expiresAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void dismiss({ eventId, inviteId: i.inviteId })}
                  >
                    Cancel invite
                  </Button>
                </li>
              ))}
              {people.results.map((s) => {
                const name = s.displayName ?? "Anonymous";
                const looking = !s.revokedAt && lastSeen(s.lastSeenAt, now) === "Looking now";
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
                      <p
                        className={
                          looking
                            ? "text-xs font-medium text-emerald-700 dark:text-emerald-400"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {s.revokedAt
                          ? `${ROLE_LABEL[s.role]} · removed ${day(s.revokedAt)}`
                          : `${lastSeen(s.lastSeenAt, now)} · joined ${day(s.grantedAt)}`}
                      </p>
                    </div>
                    {s.revokedAt ? (
                      <Badge variant="secondary">Removed</Badge>
                    ) : (
                      <Select
                        value={s.role}
                        onValueChange={(v) => {
                          setGrantRole({ sessionId: s._id, role: grantRole(v) }).then(
                            () => toast.success(`${name}: ${ROLE_LABEL[grantRole(v)]}`),
                            (e: unknown) => toast.error(errorMessage(e)),
                          );
                        }}
                      >
                        <SelectTrigger aria-label={`What ${name} can do`} className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                          <SelectItem value="contributor">{ROLE_LABEL.contributor}</SelectItem>
                          <SelectItem value="owner">{ROLE_LABEL.owner}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {!s.revokedAt && (
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
          description="They can't open this experience any more, straight away. What they added stays. You can invite them again later."
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

export const PeopleOnTrip = ({ eventId }: { eventId: Id<"events"> }) => {
  const people = usePaginatedQuery(api.sessions.members, { eventId }, { initialNumItems: 25 });
  return (
    <Card icon={<UsersIcon />} title="People on this experience" lead="Everyone who can open it.">
      <ul aria-label="People on this experience" className="divide-y rounded-lg border">
        {people.results.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
            >
              {initials(m.displayName) || <UsersIcon className="size-3.5" />}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              {m.displayName ?? "Anonymous"}
            </p>
            <span className="text-xs text-muted-foreground">
              {m.sessionId === null ? "Owner" : ROLE_LABEL[m.role]}
            </span>
          </li>
        ))}
      </ul>
      {people.status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => people.loadMore(25)}>
          Show more people
        </Button>
      )}
    </Card>
  );
};
