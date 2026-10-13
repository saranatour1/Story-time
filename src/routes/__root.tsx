import { HeadContent, Scripts, ScriptOnce, createRootRouteWithContext, Outlet, useRouterState } from "@tanstack/react-router";
import type { RouterContext } from "@/router";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Databuddy } from "@databuddy/sdk/react";
import { LandingFirstPaint } from "@/components/landing/first-paint";
import { LogoSplash } from "@/components/logo";
import { pageMeta } from "@/lib/seo";

import appCss from "../styles.css?url";
import manropeLatin from "@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url";
import newsreaderLatin from "@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2?url";

// Runs before first paint so the chosen theme doesn't flash. next-themes
// stores "light" | "dark" | "system" under the "theme" key.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme')||'system';var dark=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);}catch(e){}})();`;

// Marks the page when this browser holds a session (Convex Auth's refresh
// token), so the landing page's first screen stays hidden for someone on their
// way to /home.
const SESSION_SCRIPT = `(function(){try{for(var i=0;i<localStorage.length;i++){if((localStorage.key(i)||'').indexOf('__convexAuthRefreshToken')===0){document.documentElement.setAttribute('data-signed-in','');return}}}catch(e){}})();`;

// Production builds only (.env.production), so local work isn't counted.
const DATABUDDY_ID: string | undefined = import.meta.env.VITE_DATABUDDY_CLIENT_ID;

// Crawlers need an absolute image URL, and the client has no other way to
// know the site's origin.
const APP_URL: string = import.meta.env.VITE_APP_URL ?? "";

const RootDocument = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Emitted once by the server, then removes itself before hydration. */}
        <ScriptOnce>{THEME_INIT_SCRIPT}</ScriptOnce>
        <ScriptOnce>{SESSION_SCRIPT}</ScriptOnce>
        {/* HeadContent keeps one meta per name, so the light/dark pair lives here. */}
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0a0a" />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
};

// What the server sends before the app loads, since server rendering is off:
// the landing page's first screen on "/", else an empty screen.
const RootPending = () => {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return pathname === "/" ? <LandingFirstPaint /> : <LogoSplash />;
};

// Last, so the components it names are defined above it.
export const Route = createRootRouteWithContext<RouterContext>()({
  // Server rendering is off, so this is the only head link previews and
  // crawlers see: it picks the page's tags from the path (src/lib/seo.ts).
  head: ({ matches }) => {
    const pathname = matches.at(-1)?.pathname ?? "/";
    const page = pageMeta(pathname);
    const url = `${APP_URL}${pathname}`;
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: page.title },
        { name: "description", content: page.description },
        { name: "robots", content: page.index ? "index, follow" : "noindex" },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "Story-time" },
        { property: "og:locale", content: "en_US" },
        { property: "og:url", content: url },
        { property: "og:title", content: page.title },
        { property: "og:description", content: page.description },
        { property: "og:image", content: `${APP_URL}${page.image}` },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: page.imageAlt },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: page.title },
        { name: "twitter:description", content: page.description },
        { name: "twitter:image", content: `${APP_URL}${page.image}` },
        { name: "twitter:image:alt", content: page.imageAlt },
      ],
      links: [
        ...(page.index ? [{ rel: "canonical", href: url }] : []),
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/site.webmanifest" },
        { rel: "preload", href: manropeLatin, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
        { rel: "preload", href: newsreaderLatin, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
        { rel: "stylesheet", href: appCss },
      ],
    };
  },
  shellComponent: RootDocument,
  pendingComponent: RootPending,
  component: () => (
    // The root renders client-side, where next-themes' own inline script can
    // never run; a data type keeps React from warning about it. ScriptOnce in
    // the shell does the no-flash work instead.
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      scriptProps={{ type: "application/json" }}
    >
      <TooltipProvider>
        <Outlet />
        <Toaster />
      </TooltipProvider>
      {DATABUDDY_ID && (
        // Page views, page speed and errors, without cookies. Trip ids and
        // invite tokens in paths are masked, and the part after # (a share
        // link's key) is never read. Click and outgoing-link tracking stay
        // off: they send element labels and link text, which can name a trip.
        <Databuddy
          clientId={DATABUDDY_ID}
          trackWebVitals
          trackErrors
          trackInteractions={false}
          maskPatterns={["/e/*", "/invite/*"]}
        />
      )}
    </ThemeProvider>
  ),
});
