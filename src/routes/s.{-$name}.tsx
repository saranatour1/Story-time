import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { queries } from "@/lib/queries";
import { SignedOutPage } from "@/components/sign-in-screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { MediaAuthContext } from "@/lib/use-media-url";

const StoryPlayer = lazy(() =>
  import("@/components/story/story-player").then((m) => ({ default: m.StoryPlayer })),
);
const StoryScroll = lazy(() =>
  import("@/components/story/story-scroll").then((m) => ({ default: m.StoryScroll })),
);

const search = z.object({
  // The scene in view, kept up to date as the film plays or the story scrolls.
  step: z.number().int().min(0).default(0).catch(0),
  // The story to read, or the film to watch.
  mode: z.enum(["read", "film"]).default("read").catch("read"),
});

const readToken = (): string => {
  return typeof window === "undefined" ? "" : window.location.hash.slice(1);
};

const SharedStoryPage = () => {
  const { step, mode } = Route.useSearch();
  const { name } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const [token] = useState(readToken);
  const { data: shared } = useQuery(queries.share.get(token ? { token } : "skip"));
  useDocumentTitle(shared ? `${shared.event.title} · Story-time` : undefined);
  const slug = shared?.slug;
  useEffect(() => {
    if (slug === undefined || slug === name) return;
    void navigate({
      params: { name: slug },
      search: (prev) => prev,
      hash: true,
      replace: true,
      resetScroll: false,
    });
  }, [slug, name, navigate]);

  // `hash: true` keeps the token in the fragment, which navigation would
  // otherwise drop.
  const onStep = useCallback(
    (next: number) =>
      void navigate({
        search: (prev) => ({ ...prev, step: next }),
        hash: true,
        replace: true,
        resetScroll: false,
      }),
    [navigate],
  );
  const playFilm = useCallback(
    (next: number) => void navigate({ search: { step: next, mode: "film" }, hash: true }),
    [navigate],
  );
  const closeFilm = useCallback(
    (next: number) =>
      void navigate({
        search: { step: next, mode: "read" },
        hash: true,
        replace: true,
        resetScroll: false,
      }),
    [navigate],
  );

  if (!token || shared === null) return <NotShared />;
  if (shared === undefined) return <Skeleton className="h-svh w-full rounded-none" />;
  return (
    <MediaAuthContext.Provider value={{ kind: "share", token }}>
      <Suspense fallback={<Skeleton className="h-svh w-full rounded-none" />}>
        {mode === "film" && shared.film ? (
          <StoryPlayer
            event={shared.event}
            moments={shared.moments}
            meId={undefined}
            step={step}
            onStep={onStep}
            onClose={closeFilm}
          />
        ) : (
          <StoryScroll
            event={shared.event}
            moments={shared.moments}
            step={step}
            onStep={onStep}
            onPlayFilm={shared.film ? playFilm : undefined}
          />
        )}
      </Suspense>
    </MediaAuthContext.Provider>
  );
};

const NotShared = () => {
  return (
    <SignedOutPage className="items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="font-display text-3xl tracking-tight">This story isn't shared</h1>
        <p className="text-stone-600 dark:text-stone-400">
          The link may have been switched off or replaced. Ask whoever sent it for a new one.
        </p>
        <Button variant="outline" asChild>
          <Link to="/">Go to Story-time</Link>
        </Button>
      </div>
    </SignedOutPage>
  );
};

// A story anyone can read with its link, so there's no sign-in gate. The path
// carries the link's name, which is only a name; the token is the URL's
// fragment, which browsers never send to a server, and search engines are
// kept out. Play opens the film.
export const Route = createFileRoute("/s/{-$name}")({
  validateSearch: search,
  // The link is the key, so this doesn't wait for sign-in.
  loader: ({ context: { queryClient } }) => {
    const token = readToken();
    if (token) void queryClient.prefetchQuery(queries.share.get({ token }));
  },
  component: SharedStoryPage,
});
