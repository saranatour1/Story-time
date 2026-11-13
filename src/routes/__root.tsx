import {
  HeadContent,
  Scripts,
  ScriptOnce,
  createRootRouteWithContext,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
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

const THEME_STORAGE_KEY = "theme";

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';var dark=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);}catch(e){}})();`;

const MARK_SIGNED_IN_IF_REFRESH_TOKEN_SCRIPT = `(function(){try{for(var i=0;i<localStorage.length;i++){if((localStorage.key(i)||'').indexOf('__convexAuthRefreshToken')===0){document.documentElement.setAttribute('data-signed-in','');return}}}catch(e){}})();`;

const DATABUDDY_ID: string | undefined = import.meta.env.VITE_DATABUDDY_CLIENT_ID;

const APP_URL: string = import.meta.env.VITE_APP_URL ?? "";

const DATABUDDY_PRIVACY = {
  trackInteractions: false,
  maskPatterns: ["/e/*", "/invite/*", "/s/*"],
};

const RootDocument = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ScriptOnce>{THEME_INIT_SCRIPT}</ScriptOnce>
        <ScriptOnce>{MARK_SIGNED_IN_IF_REFRESH_TOKEN_SCRIPT}</ScriptOnce>
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

const RootPending = () => {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return pathname === "/" ? <LandingFirstPaint /> : <LogoSplash />;
};

export const Route = createRootRouteWithContext<RouterContext>()({
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
        {
          rel: "preload",
          href: manropeLatin,
          as: "font",
          type: "font/woff2",
          crossOrigin: "anonymous",
        },
        {
          rel: "preload",
          href: newsreaderLatin,
          as: "font",
          type: "font/woff2",
          crossOrigin: "anonymous",
        },
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
      storageKey={THEME_STORAGE_KEY}
      enableSystem
      disableTransitionOnChange
      scriptProps={{ type: "application/json" }}
    >
      <TooltipProvider>
        <Outlet />
        <Toaster />
      </TooltipProvider>
      {DATABUDDY_ID && (
        <Databuddy
          clientId={DATABUDDY_ID}
          trackWebVitals
          trackErrors
          trackAttributes
          {...DATABUDDY_PRIVACY}
        />
      )}
    </ThemeProvider>
  ),
});
