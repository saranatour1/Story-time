import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { BotIcon, CheckIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { returnsTo } from "@/lib/agents";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { queries } from "@/lib/queries";

const Notice = ({ title, children }: { title: string; children: ReactNode }) => {
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
    </Card>
  );
};

const Connect = () => {
  const { request: requestId } = Route.useSearch();
  const { data: request, isPending } = useQuery(
    queries.mcp.getAuthRequest(requestId ? { requestId } : "skip"),
  );
  const authorize = useAction(api.mcp.authorize);
  const [sent, setSent] = useState<"allow" | "deny" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Inside another site's frame, a click here could be one the person never
  // meant to make.
  if (window.top !== window.self) {
    return (
      <Notice title="Open this page in its own tab">It can't be used inside another page.</Notice>
    );
  }
  if (!requestId) {
    return (
      <Notice title="Nothing to approve">
        This page opens when an AI agent asks to connect. To connect one, copy the address from{" "}
        <Link to="/settings/account" className="underline">
          Settings
        </Link>{" "}
        into your agent.
      </Notice>
    );
  }
  if (isPending) return <Skeleton className="mx-auto h-72 w-full max-w-md" />;
  if (request === null || request === undefined) {
    return (
      <Notice title="This request has expired">
        Start again from your agent to get a new one.
      </Notice>
    );
  }
  if (request.status !== "pending" && sent === null) {
    return (
      <Notice title="This request was already answered">
        Start again from your agent if it still needs to connect.
      </Notice>
    );
  }

  const decide = async (approve: boolean) => {
    setProblem(null);
    setSent(approve ? "allow" : "deny");
    try {
      const { redirectUrl } = await authorize({ requestId, approve });
      window.location.assign(redirectUrl);
    } catch (error) {
      setProblem(errorMessage(error));
      setSent(null);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <BotIcon aria-hidden className="size-6 text-muted-foreground" />
        <CardTitle>Let an AI agent use your Story-time?</CardTitle>
        <CardDescription>
          It calls itself{" "}
          <strong className="text-foreground">{request.clientName ?? "an agent"}</strong>.
          Story-time can't check that name. Allow it only if you just asked your own agent to
          connect.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-2">
          <p className="font-medium">It will be able to:</p>
          <ul className="space-y-1.5">
            {request.scopes.map((scope) => (
              <li key={scope.name} className="flex gap-2">
                <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {scope.description}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-muted-foreground">
          It acts as you, in every experience you can open. It can't delete anything, share anything
          or see your photos. Your answer goes to {returnsTo(request.redirectUri)}.
        </p>
        <p className="text-muted-foreground">
          You can disconnect it at any time in Settings, under Account.
        </p>
        {problem !== null && (
          <p role="alert" className="text-destructive">
            {problem}
          </p>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button disabled={sent !== null} onClick={() => void decide(true)}>
          {sent === "allow" ? "Connecting…" : "Allow"}
        </Button>
        <Button variant="ghost" disabled={sent !== null} onClick={() => void decide(false)}>
          {sent === "deny" ? "Sending…" : "Don't allow"}
        </Button>
      </CardFooter>
    </Card>
  );
};

export const Route = createFileRoute("/_app/connect")({
  validateSearch: (search: Record<string, unknown>) => ({
    request: typeof search.request === "string" ? search.request : undefined,
  }),
  component: Connect,
});
