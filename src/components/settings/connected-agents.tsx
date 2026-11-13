import { useQuery } from "@tanstack/react-query";
import { useAction, useMutation } from "convex/react";
import { CopyIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { can, READ_SCOPE, WRITE_SCOPE } from "@/lib/agents";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { queries } from "@/lib/queries";

// Convex serves HTTP from the deployment's .convex.site address.
const SITE_URL: string =
  import.meta.env.VITE_CONVEX_SITE_URL ??
  String(import.meta.env.VITE_CONVEX_URL).replace(".convex.cloud", ".convex.site");
const MCP_URL = `${SITE_URL.replace(/\/+$/, "")}/mcp`;

const day = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const Copyable = ({ text, label }: { text: string; label: string }) => {
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap">
        {text}
      </code>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
        onClick={() =>
          void navigator.clipboard.writeText(text).then(
            () => toast.success("Copied"),
            () => toast.error("Couldn't copy. Select it and copy by hand."),
          )
        }
      >
        <CopyIcon aria-hidden />
      </Button>
    </div>
  );
};

export const ConnectedAgents = () => {
  const { data: connections } = useQuery(queries.mcp.listConnections());
  const revoke = useMutation(api.mcp.revokeConnection);
  const createKey = useAction(api.mcp.createApiKey);
  const [name, setName] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { apiKey } = await createKey({
        name: name.trim() || "API key",
        scopes: readOnly ? [READ_SCOPE] : [READ_SCOPE, WRITE_SCOPE],
      });
      setMade(apiKey);
      setName("");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (id: string, label: string) => {
    try {
      await revoke({ id });
      toast.success(`Disconnected ${label}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-2">
        <p className="text-sm">
          Paste this address into Claude, ChatGPT, Cursor or another AI agent. It sends you back
          here to approve it.
        </p>
        <Copyable text={MCP_URL} label="the address" />
      </div>

      {connections === undefined ? (
        <Skeleton className="h-16 w-full" />
      ) : connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agents are connected.</p>
      ) : (
        <ul className="divide-y rounded-lg border" aria-label="Connected agents">
          {connections.map((c) => (
            <li key={c.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="flex items-center gap-2 font-medium">
                  <span className="truncate">{c.name}</span>
                  <Badge variant="secondary">{c.kind === "apiKey" ? "Key" : "Agent"}</Badge>
                </p>
                <p className="text-muted-foreground">
                  {can(c.scopes)} · connected {day(c.createdAt)}
                  {c.lastUsedAt === undefined
                    ? " · never used"
                    : ` · last used ${day(c.lastUsedAt)}`}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void disconnect(c.id, c.name)}>
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(e) => void create(e)} className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">A key for agents that can't open a browser</p>
          <p className="text-sm text-muted-foreground">
            Some agents run in a terminal and take a key instead of a sign-in. The key works like a
            password to your stories, so keep it to yourself.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label htmlFor="agent-key-name">Name</Label>
            <Input
              id="agent-key-name"
              value={name}
              maxLength={100}
              placeholder="Claude Code on my laptop"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex h-9 items-center gap-2">
            <Switch id="agent-key-read-only" checked={readOnly} onCheckedChange={setReadOnly} />
            <Label htmlFor="agent-key-read-only">Read only</Label>
          </div>
          <Button type="submit" variant="outline" disabled={busy}>
            {busy ? "Creating…" : "Create key"}
          </Button>
        </div>
      </form>

      {made !== null && (
        <div role="status" className="space-y-3 rounded-lg border bg-card p-3 text-sm">
          <p className="font-medium">Copy your key now. It won't be shown again.</p>
          <Copyable text={made} label="the key" />
          <p className="text-muted-foreground">For Claude Code, run:</p>
          <Copyable
            text={`claude mcp add --transport http story-time ${MCP_URL} --header "Authorization: Bearer ${made}"`}
            label="the command"
          />
          <Button size="sm" variant="ghost" onClick={() => setMade(null)}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
};
