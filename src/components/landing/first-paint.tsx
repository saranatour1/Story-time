import { DuskScene } from "@/components/landing/dusk";
import { Logo } from "@/components/logo";

// sign-in-screen's CONTAINER. Importing it from there would pull the sign-in
// form into every page's first load.
const CONTAINER = "mx-auto w-full max-w-[1168px] px-4 sm:px-6";

export const HERO_LEAD =
  "Everyone who was there adds what they caught. Story-time puts it in order and plays it back as a little film, with your route drawn on a map.";
export const HERO_NOTE = "New here? Signing in creates your account. It's private until you share it.";

// The landing page's first screen as plain markup. Server rendering is off, so
// the server sends this in the HTML and the page shows before its script has
// loaded; the real page then takes its place, laid out the same. Someone who is
// already signed in is on their way to /home: the inline script in __root.tsx
// marks the page, and styles.css keeps this hidden for them.
export const LandingFirstPaint = () => {
  return (
    <div className="dark relative flex min-h-svh flex-col overflow-x-clip bg-[#141210] text-stone-100 [color-scheme:dark]">
      <div data-first-paint>
        <header className="absolute inset-x-0 top-0 z-20">
          <div className={`${CONTAINER} flex h-16 items-center gap-2 font-display text-xl tracking-tight text-white`}>
            <Logo className="size-6" />
            Story-time
          </div>
        </header>
        <section aria-labelledby="first-paint-title" className="relative isolate">
          <DuskScene />
          <div className={`${CONTAINER} flex flex-col items-center pt-28 text-center sm:pt-36`}>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] py-1 pr-3 pl-1 text-[13px] text-white/80">
              <span className="rounded-full bg-amber-200 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-stone-950 uppercase">
                New
              </span>
              Swipe through a story, stop by stop
            </span>
            <h1
              id="first-paint-title"
              className="mt-7 font-display text-[2.6rem] leading-[1.02] tracking-[-0.03em] text-balance text-white sm:text-6xl lg:text-[5.5rem]"
            >
              <span className="block lg:whitespace-nowrap">
                Every <span className="text-amber-200 italic">sunset</span> from the trip,
              </span>
              <span className="block">in the order it happened.</span>
            </h1>
            <p className="mt-6 max-w-[50ch] text-base leading-relaxed text-pretty text-white/70 sm:text-lg">{HERO_LEAD}</p>
            {/* Where the sign-in buttons go, at their height, so nothing moves. */}
            <div aria-hidden className="mt-9 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
              <div className="h-11 rounded-md bg-white sm:w-56" />
              <div className="h-11 rounded-md border border-white/15 sm:w-56" />
            </div>
            <p className="mt-4 text-sm text-white/60">{HERO_NOTE}</p>
          </div>
        </section>
      </div>
    </div>
  );
};
