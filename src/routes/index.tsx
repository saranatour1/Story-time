import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  CheckIcon,
  GalleryHorizontalIcon,
  ImagePlusIcon,
  LockIcon,
  MapIcon,
  PlaneIcon,
  PlayIcon,
  RouteIcon,
  TrainFrontIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { DuskScene, useScrollDepth } from "@/components/landing/dusk";
import { FilmDemo } from "@/components/landing/film-demo";
import { MapFrame } from "@/components/landing/frames";
import {
  CameraRollFragment,
  InviteFragment,
  LinkFragment,
  MomentsFragment,
} from "@/components/landing/fragments";
import { useInView, useReducedMotion } from "@/components/landing/paper";
import { SwipeDeck } from "@/components/landing/swipe-deck";
import { SignInButtons } from "@/components/login-form";
import { Logo, LogoSplash } from "@/components/logo";
import { CONTAINER } from "@/components/sign-in-screen";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// MapLibre is heavy, so the globe arrives only when its band comes near.
const LiveGlobe = lazy(() => import("@/components/landing/live-globe").then((m) => ({ default: m.LiveGlobe })));

const Landing = () => {
  const { isLoading, isAuthenticated } = useConvexAuth();

  if (isAuthenticated) return <Navigate to="/home" replace />;
  // Until auth settles a returning visitor looks signed out; don't flash
  // the sign-in at them on the way to /home.
  if (isLoading) return <LogoSplash className="bg-[#141210]" />;

  // Always story mode's dark room: `dark` gives the app's own buttons and
  // cards their dark colours inside.
  return (
    <div className="dark relative flex min-h-svh flex-col overflow-x-clip bg-[#141210] text-stone-100 [color-scheme:dark]">
      <Nav />
      <main className="flex flex-1 flex-col">
        <Hero />
        <Photos />
        <Maps />
        <StoryMode />
        <Privacy />
        <Closing />
      </main>
      <Footer />
    </div>
  );
};

// The page's frame: thin rails either side of the column, a rule between
// bands, and a small cross where they meet.
const RAILS = cn(CONTAINER, "relative sm:border-x sm:border-white/10");
const EYEBROW = "font-mono text-[11px] font-medium tracking-[0.22em] text-amber-300 uppercase";
const H2 = "mt-4 font-display text-[2rem] leading-[1.06] tracking-[-0.02em] text-balance text-stone-50 sm:text-5xl";
const LEAD = "mx-auto mt-5 max-w-[56ch] text-base leading-relaxed text-pretty text-stone-400 sm:text-[1.0625rem]";

const SECTIONS: Array<{ id: string; label: string; short: [string, string]; icon: LucideIcon }> = [
  { id: "photos", label: "Photos", short: ["Add from", "your photos"], icon: ImagePlusIcon },
  { id: "maps", label: "Maps", short: ["Every stop", "on a map"], icon: MapIcon },
  { id: "story-mode", label: "Story mode", short: ["Play it", "like a film"], icon: PlayIcon },
  { id: "privacy", label: "Privacy", short: ["Private", "by default"], icon: LockIcon },
];

const SectionLink = ({ id, className, children }: { id: string; className?: string; children: ReactNode }) => {
  const reduced = useReducedMotion();
  return (
    <Link to="/" hash={id} hashScrollIntoView={reduced ? true : { behavior: "smooth" }} className={className}>
      {children}
    </Link>
  );
};

// "Sign in" brings the hero's buttons into view and focuses the first,
// rather than going anywhere.
const goToSignIn = (e: React.MouseEvent<HTMLAnchorElement>) => {
  const target = document.getElementById("sign-in");
  if (!target) return;
  e.preventDefault();
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
  target.querySelector("button")?.focus({ preventScroll: true });
};

const Nav = () => {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className={cn(CONTAINER, "flex h-16 items-center gap-4")}>
        <Link to="/" className="flex items-center gap-2 font-display text-xl tracking-tight text-white">
          <Logo className="size-6" />
          Story-time
        </Link>
        <nav aria-label="Page" className="hidden flex-1 justify-center md:flex">
          <ul className="flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-1.5 py-1 backdrop-blur-md">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <SectionLink
                  id={s.id}
                  className="block rounded-full px-3 py-1.5 text-[13px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {s.label}
                </SectionLink>
              </li>
            ))}
          </ul>
        </nav>
        <Button size="sm" asChild className="ml-auto h-8 px-3 md:ml-0">
          <a href="#sign-in" onClick={goToSignIn}>
            Sign in
          </a>
        </Button>
      </div>
    </header>
  );
};

// Short single words: the first line never changes how it wraps.
const WORDS = ["sunset", "photo", "detour", "picnic", "ferry", "toast"];

// The headline's changing word, in italics. Its box eases to each word's
// width, so the line closes up around short words instead of leaving gaps.
const Rotating = ({ words }: { words: string[] }) => {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const sizes = useRef<Array<HTMLSpanElement | null>>([]);
  const [widths, setWidths] = useState<number[]>([]);

  useLayoutEffect(() => {
    const measure = () => setWidths(sizes.current.map((el) => el?.offsetWidth ?? 0));
    measure();
    void document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [words]);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setShown((n) => (n + 1) % words.length), 2600);
    return () => clearInterval(timer);
  }, [reduced, words.length]);

  const width = widths[shown];
  const before = (shown - 1 + words.length) % words.length;
  return (
    <span
      className="relative inline-block text-left align-bottom whitespace-nowrap transition-[width] duration-500 ease-out"
      style={width ? { width } : undefined}
    >
      <span className="invisible italic">{words[shown]}</span>
      {words.map((w, i) => (
        <span
          key={w}
          ref={(el) => {
            sizes.current[i] = el;
          }}
          className={cn(
            "absolute top-0 left-0 pr-[0.08em] text-amber-200 italic transition-[opacity,transform,filter] duration-500 ease-out",
            i === shown ? "translate-y-0 opacity-100 blur-none" : i === before ? "-translate-y-[0.45em] opacity-0 blur-sm" : "translate-y-[0.45em] opacity-0 blur-sm",
          )}
        >
          {w}
        </span>
      ))}
    </span>
  );
};

const Hero = () => {
  const ref = useRef<HTMLElement>(null);
  useScrollDepth(ref);
  return (
    <section ref={ref} id="top" aria-labelledby="hero-title" className="relative isolate">
      <DuskScene />
      <div className={cn(CONTAINER, "flex flex-col items-center pt-28 text-center sm:pt-36")}>
        <div
          className="flex flex-col items-center"
          style={{ opacity: "calc(1 - var(--p, 0) * 1.6)", transform: "translate3d(0, calc(var(--p, 0) * -70px), 0)" }}
        >
          <SectionLink
            id="story-mode"
            className="group inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] py-1 pr-3 pl-1 text-[13px] text-white/80 backdrop-blur-sm transition-colors hover:bg-white/10 hover:text-white"
          >
            <span className="rounded-full bg-amber-200 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.15em] text-stone-950 uppercase">
              New
            </span>
            Swipe through a story, stop by stop
            <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </SectionLink>
          <h1
            id="hero-title"
            className="mt-7 font-display text-[2.6rem] leading-[1.02] tracking-[-0.03em] text-balance text-white sm:text-6xl lg:text-[5.5rem]"
          >
            <span className="sr-only">Every moment from the trip, in the order it happened.</span>
            <span aria-hidden>
              <span className="block lg:whitespace-nowrap">
                Every <Rotating words={WORDS} /> from the trip,
              </span>
              <span className="block">in the order it happened.</span>
            </span>
          </h1>
          <p className="mt-6 max-w-[50ch] text-base leading-relaxed text-pretty text-white/70 sm:text-lg">
            Everyone who was there adds what they caught. Story-time puts it in order and plays it back as a little
            film, with your route drawn on a map.
          </p>
          <div id="sign-in" className="mt-9 w-full max-w-md [text-shadow:0_1px_10px_rgb(20_18_16/0.8)]">
            <SignInButtons prominent groupClassName="sm:flex-row sm:justify-center" />
          </div>
          <p className="mt-4 text-sm text-white/60 [text-shadow:0_1px_10px_rgb(20_18_16/0.8)]">
            New here? Signing in creates your account. It's private until you share it.
          </p>
        </div>

        <div className="mt-16 w-full max-w-5xl sm:mt-24">
          <FilmDemo />
          <p className="mt-4 text-sm text-stone-500">A sample story, playing on its own. Tap either side to step through it.</p>
        </div>

        <nav aria-label="On this page" className="mt-16 w-full max-w-5xl sm:mt-20">
          <ul className="grid grid-cols-5 border-y border-white/10 sm:divide-x sm:divide-white/10">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <SectionLink
                  id={s.id}
                  className="group flex h-full flex-col items-center gap-2 px-1 py-5 text-[11px] leading-tight text-stone-400 transition-colors hover:bg-white/[0.03] hover:text-white sm:text-[13px]"
                >
                  <s.icon aria-hidden className="size-5 text-stone-300 transition-colors group-hover:text-amber-200" />
                  <span>
                    {s.short[0]}
                    <br />
                    {s.short[1]}
                  </span>
                </SectionLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
};

const Cross = ({ className }: { className: string }) => {
  return (
    <span aria-hidden className={cn("pointer-events-none absolute hidden size-[11px] sm:block", className)}>
      <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-white/40" />
      <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-white/40" />
    </span>
  );
};

// Fades a band's heading up the first time it scrolls into view.
const Reveal = ({ className, children }: { className?: string; children: ReactNode }) => {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={cn("transition duration-700 ease-out", !reduced && !inView && "translate-y-4 opacity-0", className)}>
      {children}
    </div>
  );
};

// One band of the page: a small label, a heading and a line, then what it shows.
const Band = ({ id, eyebrow, title, lead, children }: { id: string; eyebrow: string; title: string; lead: string; children: ReactNode }) => {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 border-t border-white/10">
      <div className={cn(RAILS, "py-20 sm:py-28")}>
        <Cross className="-top-[6px] -left-[6px]" />
        <Cross className="-top-[6px] -right-[6px]" />
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className={EYEBROW}>{eyebrow}</p>
          <h2 id={`${id}-title`} className={H2}>
            {title}
          </h2>
          <p className={LEAD}>{lead}</p>
        </Reveal>
        <div className="mt-12 sm:mt-16">{children}</div>
      </div>
    </section>
  );
};

// Side-by-side panels split by a rule, each with a title and a line under it.
const Split = ({ children }: { children: ReactNode }) => {
  return <div className="grid border-y border-white/10 md:grid-cols-2 md:divide-x md:divide-white/10">{children}</div>;
};

const Panel = ({ title, text, children }: { title: string; text: string; children: ReactNode }) => {
  return (
    <figure className="flex flex-col gap-8 border-b border-white/10 px-1 py-10 last:border-b-0 sm:px-10 md:border-b-0">
      <div className="flex flex-1 items-center justify-center">{children}</div>
      <figcaption className="text-center">
        <h3 className="font-display text-xl text-stone-100">{title}</h3>
        <p className="mx-auto mt-2 max-w-[42ch] text-[0.9375rem] leading-relaxed text-stone-400">{text}</p>
      </figcaption>
    </figure>
  );
};

const FACTS: Array<[string, string]> = [
  ["When", "From the photo itself, in the time zone where you took it."],
  ["Where", "From the photo's location, or a place you search for."],
  ["What", "A first line, drafted for you. It never overwrites what you wrote."],
];

const Photos = () => {
  return (
    <Band
      id="photos"
      eyebrow="Add photos"
      title="Add photos. The dates and places fill themselves in."
      lead="Pick them from your camera roll. Story-time reads the time and place saved in each photo and groups them into moments, one stop per place. It drafts a first line for each one too. You never have to type a thing, though you can."
    >
      <div className="mx-auto grid max-w-5xl items-center gap-6 lg:grid-cols-[minmax(0,19rem)_auto_minmax(0,1fr)] lg:gap-8">
        <div className="mx-auto w-full max-w-[19rem]">
          <CameraRollFragment />
        </div>
        <div aria-hidden className="flex flex-col items-center gap-2 text-stone-500">
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase">Add</span>
          <ArrowRightIcon className="hidden size-5 lg:block" />
          <ArrowDownIcon className="size-5 lg:hidden" />
        </div>
        <MomentsFragment />
      </div>
      <dl className="mt-12 grid border-y border-white/10 sm:mt-16 sm:grid-cols-3 sm:divide-x sm:divide-white/10">
        {FACTS.map(([term, text]) => (
          <div key={term} className="border-b border-white/10 px-1 py-6 last:border-b-0 sm:border-b-0 sm:px-8">
            <dt className={EYEBROW}>{term}</dt>
            <dd className="mt-2 text-[0.9375rem] leading-relaxed text-stone-400">{text}</dd>
          </div>
        ))}
      </dl>
    </Band>
  );
};

// The globe's trip, leg by leg (live-globe.tsx draws the same stops).
const LEGS = [
  { from: "Porto", to: "Lisbon", by: "By train", icon: TrainFrontIcon, time: "2h 58m" },
  { from: "Lisbon", to: "Marrakech", by: "By plane", icon: PlaneIcon, time: "1h 25m" },
  { from: "Marrakech", to: "Istanbul", by: "By plane", icon: PlaneIcon, time: "4h 50m" },
  { from: "Istanbul", to: "Kyoto", by: "By plane", icon: PlaneIcon, time: "11h 40m" },
  { from: "Kyoto", to: "Tokyo", by: "By train", icon: TrainFrontIcon, time: "2h 15m" },
];

// Asks for a context and gives it straight back: browsers allow only a few.
const supportsWebGL = (): boolean => {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
};

// The live globe once the band is near, turning only while it's on screen.
// Without WebGL, the drawn map stands in.
const Globe = () => {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [webgl] = useState(supportsWebGL);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const hit = Boolean(entry?.isIntersecting);
        setOnScreen(hit);
        if (hit) setNear(true);
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden className="relative mx-auto aspect-square w-full max-w-[34rem]">
      <div className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle,rgb(242_166_90/0.22),transparent_68%)] blur-2xl" />
      {!webgl ? (
        <div className="mx-auto w-[min(100%,20rem)] pt-[6%]">
          <MapFrame />
        </div>
      ) : (
        near && (
          <Suspense fallback={null}>
            <LiveGlobe turning={onScreen && !reduced} />
          </Suspense>
        )
      )}
    </div>
  );
};

const Maps = () => {
  return (
    <Band
      id="maps"
      eyebrow="Maps"
      title="Every stop, on a real map."
      lead="Each leg follows the actual streets and train lines between your stops, with an icon for how you got there. Flights and ferries get a curved line instead."
    >
      <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Globe />
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-2">
          <div className="px-3 pt-3 pb-2">
            <p className="font-display text-xl text-stone-100">Six weeks, Porto to Tokyo</p>
            <p className="mt-1 font-mono text-[11px] tracking-[0.18em] text-stone-500 uppercase">6 stops · 5 legs</p>
          </div>
          <ol aria-label="Legs of the trip" className="relative">
            <span aria-hidden className="absolute top-8 bottom-8 left-[1.875rem] border-l border-dashed border-white/15" />
            {LEGS.map((leg) => (
              <li key={leg.from + leg.to} className="relative flex items-center gap-4 px-3 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-[#1c1916] text-amber-200">
                  <leg.icon aria-hidden className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[1.0625rem] text-stone-100">
                    {leg.from} <span className="text-stone-500">→</span> {leg.to}
                  </span>
                  <span className="font-mono text-[10.5px] tracking-[0.18em] text-stone-500 uppercase">{leg.by}</span>
                </span>
                <span className="font-mono text-xs text-stone-400 tabular-nums">{leg.time}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Band>
  );
};

const FILM = [
  { icon: TypeIcon, title: "A title page, typed out", text: "The name, the dates and a line about the trip, on paper." },
  { icon: RouteIcon, title: "The route, leg by leg", text: "The map draws each leg as the story reaches it." },
  { icon: GalleryHorizontalIcon, title: "Prints you can swipe", text: "Left or up for the next, right or down for the one before." },
  { icon: PlayIcon, title: "Or let it play", text: "Leave it and it moves on by itself. The arrow keys step through it." },
];

const StoryMode = () => {
  return (
    <Band
      id="story-mode"
      eyebrow="Story mode"
      title="Press play and watch the trip again."
      lead="It starts with a title page typed out on paper. Then it follows your route, and at every stop it deals out the photos like a stack of prints."
    >
      <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[radial-gradient(80%_60%_at_50%_0%,rgb(242_166_90/0.1),transparent)] px-6 py-10">
          <p className="mb-9 text-center font-mono text-[11px] tracking-[0.22em] text-amber-300 uppercase">Try it · drag a print</p>
          <SwipeDeck />
        </div>
        <ul className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2">
          {FILM.map((f) => (
            <li key={f.title} className="bg-[#141210] p-6">
              <f.icon aria-hidden className="size-5 text-amber-200" />
              <h3 className="mt-4 font-display text-lg text-stone-100">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-400">{f.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </Band>
  );
};

// Each line checked against the code: access checks, invites, encryption,
// media serving, archive and delete.
const PROMISES = [
  "Only the people you invite, or anyone holding a link you switch on, can open an experience.",
  "An invite link works for the first person who opens it and expires after 7 days.",
  "You decide whether each guest can only watch or can add moments too.",
  "You can take someone's access away at any time.",
  "We encrypt places, notes, links and feelings with a key that belongs to that one experience.",
  "We store photos and videos encrypted and only send them to people with access or a link you switch on.",
  "Archiving an experience closes it to new moments and invites.",
  "Deleting an experience removes its moments and everyone's access along with it.",
];

const Privacy = () => {
  return (
    <Band
      id="privacy"
      eyebrow="Private by default"
      title="Yours until you share it."
      lead="An experience stays closed until you invite someone to it or switch on a link."
    >
      <Split>
        <Panel
          title="Invite the people who were there"
          text="An invite works once, for the first person who opens it. Choose whether they can watch or add moments too."
        >
          <div className="w-full max-w-sm">
            <InviteFragment />
          </div>
        </Panel>
        <Panel title="Or share a link" text="Anyone holding it can watch the story, without an account. Switch it off and it stops working.">
          <div className="w-full max-w-sm">
            <LinkFragment />
          </div>
        </Panel>
      </Split>
      <ul className="mx-auto mt-12 grid max-w-4xl gap-x-12 sm:mt-16 sm:grid-cols-2">
        {PROMISES.map((p) => (
          <li key={p} className="flex gap-3 border-t border-white/10 py-4 text-[0.9375rem] leading-relaxed text-stone-300">
            <CheckIcon aria-hidden className="mt-1 size-4 shrink-0 text-amber-300" />
            {p}
          </li>
        ))}
      </ul>
    </Band>
  );
};

const Closing = () => {
  return (
    <section aria-labelledby="closing-title" className="relative isolate overflow-hidden border-t border-white/10">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(55%_60%_at_50%_100%,rgb(242_166_90/0.28),transparent_70%)]"
      />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-px bg-gradient-to-r from-transparent via-amber-200/50 to-transparent" />
      <div className={cn(RAILS, "flex flex-col items-center py-24 text-center sm:py-32")}>
        <Cross className="-top-[6px] -left-[6px]" />
        <Cross className="-top-[6px] -right-[6px]" />
        <p className={EYEBROW}>Your turn</p>
        <h2 id="closing-title" className={cn(H2, "max-w-[22ch]")}>
          Start a story for your next trip, or the last one.
        </h2>
        <div className="mt-9 w-full max-w-md">
          <SignInButtons prominent showError={false} groupClassName="sm:flex-row sm:justify-center" />
        </div>
      </div>
    </section>
  );
};

const Footer = () => {
  return (
    <footer className="border-t border-white/10">
      <div className={cn(RAILS, "grid gap-10 py-14 sm:grid-cols-[minmax(0,1fr)_auto]")}>
        <Cross className="-top-[6px] -left-[6px]" />
        <Cross className="-top-[6px] -right-[6px]" />
        <div className="space-y-3">
          <span className="flex items-center gap-2 font-display text-xl tracking-tight text-white">
            <Logo className="size-6" />
            Story-time
          </span>
          <p className="max-w-[36ch] text-sm leading-relaxed text-stone-400">
            Trip stories for the people who were there. Private by default.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm text-stone-400 sm:grid-cols-3">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <SectionLink id={s.id} className="transition-colors hover:text-stone-100">
                  {s.label}
                </SectionLink>
              </li>
            ))}
            <li>
              <a href="#sign-in" onClick={goToSignIn} className="transition-colors hover:text-stone-100">
                Sign in
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className={cn(RAILS, "flex flex-wrap items-center justify-between gap-2 border-t border-white/10 py-6 text-xs text-stone-500")}>
        <span>© {new Date().getFullYear()} Story-time</span>
        <SectionLink id="top" className="font-mono tracking-[0.18em] uppercase transition-colors hover:text-stone-300">
          Back to top ↑
        </SectionLink>
      </div>
    </footer>
  );
};

// Last, so the components it names are defined above it.
export const Route = createFileRoute("/")({ component: Landing });
