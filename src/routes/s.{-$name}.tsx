import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileLockIcon, LoaderCircleIcon, PlayIcon } from "lucide-react";
import { toast } from "sonner";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { queries } from "@/lib/queries";
import { download, fileName } from "@/components/journal/export";
import { Reader } from "@/components/journal/reader";
import { SignedOutPage } from "@/components/sign-in-screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { MediaAuthContext } from "@/lib/use-media-url";

const StoryPlayer = lazy(() =>
  import("@/components/story/story-player").then((m) => ({ default: m.StoryPlayer })),
);

const search = z.object({
  step: z.number().int().min(0).default(0).catch(0),
  page: z.number().int().min(0).default(0).catch(0),
  mode: z.enum(["book", "film"]).default("book").catch("book"),
});

const readToken = (): string => {
  return typeof window === "undefined" ? "" : window.location.hash.slice(1);
};

const SharedStoryPage = () => {
  const { step, page, mode } = Route.useSearch();
  const { name } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const [token] = useState(readToken);
  const { data: shared } = useQuery(queries.share.get(token ? { token } : "skip"));
  const { data: book } = useQuery(queries.share.journal(token ? { token } : "skip"));
  const { data: pdf } = useQuery(queries.share.pdf(token ? { token } : "skip"));
  const [fetching, setFetching] = useState(false);
  useDocumentTitle(shared ? `${shared.event.title} · Story-time` : undefined);
  const moments = useMemo(
    () => new Map((shared?.moments ?? []).map((m) => [m._id, m])),
    [shared?.moments],
  );
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
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 900 });
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const report = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [shared, book, mode]);

  const onPage = useCallback(
    (next: number) =>
      void navigate({
        search: (prev) => ({ ...prev, page: next }),
        hash: true,
        replace: true,
        resetScroll: false,
      }),
    [navigate],
  );
  const playFilm = useCallback(
    () => void navigate({ search: (prev) => ({ ...prev, mode: "film" }), hash: true }),
    [navigate],
  );
  const closeFilm = useCallback(
    (next: number) =>
      void navigate({
        search: (prev) => ({ ...prev, step: next, mode: "book" }),
        hash: true,
        replace: true,
        resetScroll: false,
      }),
    [navigate],
  );
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

  if (!token || shared === null || book === null) return <NotShared />;
  if (shared === undefined || book === undefined)
    return <Skeleton className="h-svh w-full rounded-none" />;
  return (
    <MediaAuthContext.Provider value={{ kind: "share", token }}>
      {mode === "film" && shared.film ? (
        <Suspense fallback={<Skeleton className="h-svh w-full rounded-none" />}>
          <StoryPlayer
            event={shared.event}
            moments={shared.moments}
            meId={undefined}
            step={step}
            onStep={onStep}
            onClose={closeFilm}
          />
        </Suspense>
      ) : (
        <div className="flex h-svh flex-col bg-[#e9dfcb] text-[#1f1a16]">
          <header className="flex items-center justify-between gap-3 px-4 py-3">
            <h1 className="min-w-0 truncate font-serif text-xl">{shared.event.title}</h1>
            <div className="flex items-center gap-2">
              {pdf && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={fetching}
                  title="Opens with the password the person who shared it gave you"
                  onClick={() =>
                    void downloadPdf(token, pdf.mediaId, shared.event.title, setFetching)
                  }
                >
                  {fetching ? (
                    <LoaderCircleIcon aria-hidden className="animate-spin" />
                  ) : (
                    <FileLockIcon aria-hidden />
                  )}
                  PDF
                </Button>
              )}
              {shared.film && shared.moments.length > 0 && (
                <Button variant="outline" size="sm" onClick={playFilm}>
                  <PlayIcon aria-hidden />
                  Play
                </Button>
              )}
            </div>
          </header>
          <div ref={stage} className="min-h-0 flex-1">
            {book.pages.length === 0 ? (
              <div className="grid h-full place-items-center px-6 text-center">
                <p className="font-serif text-lg">This journal has no pages yet.</p>
              </div>
            ) : (
              <Reader
                pages={book.pages}
                moments={moments}
                size={size}
                start={page}
                onPage={onPage}
                shareToken={token}
              />
            )}
          </div>
        </div>
      )}
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

const downloadPdf = async (
  token: string,
  mediaId: string,
  title: string,
  busy: (on: boolean) => void,
) => {
  busy(true);
  try {
    const res = await fetch(`/api/media/${mediaId}`, {
      headers: { Authorization: `Share ${token}` },
    });
    if (!res.ok) throw new Error("The PDF couldn't be fetched. Try again in a moment.");
    download(await res.blob(), `${fileName(title)}.pdf`);
    toast.success("Saved. It opens with the password you were sent.");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "The PDF couldn't be fetched.");
  } finally {
    busy(false);
  }
};

export const Route = createFileRoute("/s/{-$name}")({
  validateSearch: search,
  loader: ({ context: { queryClient } }) => {
    const token = readToken();
    if (!token) return;
    void queryClient.prefetchQuery(queries.share.get({ token }));
    void queryClient.prefetchQuery(queries.share.journal({ token }));
    void queryClient.prefetchQuery(queries.share.pdf({ token }));
  },
  component: SharedStoryPage,
});
