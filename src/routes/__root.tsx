import { HeadContent, Scripts, ScriptOnce, createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import manropeLatin from "@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url";
import newsreaderLatin from "@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2?url";

// Runs before first paint so the chosen theme doesn't flash. next-themes
// stores "light" | "dark" | "system" under the "theme" key.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('theme')||'system';var dark=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);}catch(e){}})();`;

const TITLE = "Story-time";
const DESCRIPTION =
  "Everyone's photos from the trip, in the order it happened. Invite the people who were there, then play it back stop by stop on a map.";
// Crawlers need an absolute image URL, and the client has no other way to
// know the site's origin.
const APP_URL: string = import.meta.env.VITE_APP_URL ?? "";

const RootDocument = ({ children }: { children: React.ReactNode }) => {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Emitted once by the server, then removes itself before hydration. */}
        <ScriptOnce>{THEME_INIT_SCRIPT}</ScriptOnce>
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

// Last, so the components it names are defined above it.
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: TITLE },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: `${APP_URL}/og.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "preload", href: manropeLatin, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "preload", href: newsreaderLatin, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootDocument,
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
    </ThemeProvider>
  ),
});
