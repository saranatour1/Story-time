import { createRouter } from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultNotFoundComponent: () => (
      <p className="p-8 text-muted-foreground">Page not found.</p>
    ),
    Wrap: ({ children }) => (
      <ConvexAuthProvider client={convex} api={api.auth}>
        {children}
      </ConvexAuthProvider>
    ),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
