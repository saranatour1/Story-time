import { createRouter, Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, type FetchQueryOptions, type QueryKey } from "@tanstack/react-query";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { useEffect } from "react";
import { authApi } from "@/lib/api";
import { signInGate } from "@/lib/queries";
import { routeTree } from "./routeTree.gen";
import { Logo, LogoSplash } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";

// What every route's beforeLoad and loader get.
export type RouterContext = {
  queryClient: QueryClient;
  // Starts a query for a signed-in page (see signInGate) without waiting on it.
  prefetch: <T, K extends QueryKey>(query: FetchQueryOptions<T, Error, T, K>) => void;
};

export const getRouter = () => {
  const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
  const convexQueries = new ConvexQueryClient(convex);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueries.hashFn(),
        queryFn: convexQueries.queryFn(),
        // Convex keeps each query live and reconnects by itself; a function
        // that threw will throw again, so retrying only delays the error.
        retry: false,
        // An error reaches the route's error screen, as convex/react's
        // useQuery did.
        throwOnError: true,
      },
    },
  });
  convexQueries.connect(queryClient);
  const gate = signInGate();
  const context: RouterContext = {
    queryClient,
    prefetch: (query) => gate.whenSignedIn(() => void queryClient.prefetchQuery(query)),
  };

  return createRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: "intent",
    // With SSR off, the server renders this inside the shell, so the first
    // paint shows the logo rather than a blank page.
    defaultPendingComponent: LogoSplash,
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: RouteError,
    Wrap: ({ children }) => (
      <ConvexAuthProvider client={convex} api={authApi}>
        <QueryClientProvider client={queryClient}>
          <TrackSignIn onChange={gate.set} />
          {children}
        </QueryClientProvider>
      </ConvexAuthProvider>
    ),
  });
};

// Tells the prefetch gate once Convex has confirmed who is signed in.
const TrackSignIn = ({ onChange }: { onChange: (signedIn: boolean) => void }) => {
  const { isLoading, isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (!isLoading) onChange(isAuthenticated);
  }, [isLoading, isAuthenticated, onChange]);
  return null;
};

// Fills the page at the root, and the content area inside the app's layout.
const Message = ({ title, children }: { title: string; children: React.ReactNode }) => {
  return (
    <main className="mx-auto flex min-h-[calc(100svh-6rem)] max-w-md flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <Logo className="size-10" />
      <h1 className="font-display text-3xl tracking-tight text-balance">{title}</h1>
      {children}
    </main>
  );
};

const NotFound = () => {
  return (
    <Message title="This page doesn't exist">
      <p className="text-muted-foreground">The link may be mistyped, or the page has moved.</p>
      <Button variant="outline" asChild>
        <Link to="/">Go home</Link>
      </Button>
    </Message>
  );
};

// Render errors land here too, like a malformed id in a link (Convex's
// validator throws inside useQuery).
const RouteError = ({ error, reset }: ErrorComponentProps) => {
  const router = useRouter();
  return (
    <Message title="Something went wrong">
      <p className="text-muted-foreground">{errorMessage(error)}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          onClick={() => {
            reset();
            void router.invalidate();
          }}
        >
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </Message>
  );
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
