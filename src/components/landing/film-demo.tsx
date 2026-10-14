import { PauseIcon, PlayIcon, RotateCcwIcon, ShipIcon, TrainFrontIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { SAMPLE, TitlePage, useInView, useReducedMotion } from "@/components/landing/paper";
import { DrawnPhoto, PHOTOS } from "@/components/landing/photos";
import { cn } from "@/lib/utils";

// The sample story playing on its own, as story mode does: the title page
// types out, a leg draws itself on the map, a stop deals out its prints, and
// it ends on the contact sheet. Tap either side to step; it can be paused.

const SCENES = ["Title page", "The route", "A stop", "The end"] as const;
const SCENE_MS = [5600, 4600, 5200, 4200];

export const FilmDemo = () => {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const [scene, setScene] = useState(0);
  // Bumped on every scene change, so a scene's own motion starts over.
  const [take, setTake] = useState(0);
  const [playing, setPlaying] = useState(!reduced);
  const running = playing && inView;

  const go = (next: number) => {
    setScene((next + SCENES.length) % SCENES.length);
    setTake((t) => t + 1);
  };

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => {
      setScene((s) => (s + 1) % SCENES.length);
      setTake((t) => t + 1);
    }, SCENE_MS[scene]);
    return () => clearTimeout(timer);
  }, [running, scene, take]);

  return (
    <div ref={ref} className="relative">
      <div className="overflow-hidden rounded-2xl bg-[#0e0d0c] ring-1 ring-white/15 shadow-[0_40px_120px_-30px_rgb(242_166_90/0.45),inset_0_1px_0_rgb(255_255_255/0.08)]">
        <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
          <div className="flex flex-1 gap-1.5" aria-hidden>
            {SCENES.map((name, i) => (
              <span key={name} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
                {i < scene && <span className="block size-full bg-white/70" />}
                {i === scene && (
                  <span
                    key={take}
                    className="block size-full origin-left bg-amber-200"
                    style={
                      reduced
                        ? undefined
                        : {
                            animation: `landing-fill ${SCENE_MS[i]}ms linear forwards`,
                            animationPlayState: running ? "running" : "paused",
                          }
                    }
                  />
                )}
              </span>
            ))}
          </div>
          <span className="font-mono text-[11px] text-white/50 tabular-nums" aria-live="polite">
            {SCENES[scene]} · {scene + 1}/{SCENES.length}
          </span>
          <button
            type="button"
            onClick={() => {
              setPlaying((p) => !p);
              setTake((t) => t + 1);
            }}
            aria-label={playing ? "Pause the sample story" : "Play the sample story"}
            className="grid size-7 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:outline-none"
          >
            {playing ? (
              <PauseIcon className="size-3.5 fill-current" />
            ) : (
              <PlayIcon className="size-3.5 fill-current" />
            )}
          </button>
        </div>

        <div className="relative aspect-[4/5] sm:aspect-[16/9]">
          <Scene active={scene === 0}>
            <div className="flex size-full items-center justify-center px-5 sm:px-16">
              <TitlePage
                key={take}
                animate={scene === 0 && !reduced}
                size="lg"
                className="max-w-xl shadow-2xl"
              />
            </div>
          </Scene>
          <Scene active={scene === 1}>
            <Leg key={take} play={scene === 1 && !reduced} />
          </Scene>
          <Scene active={scene === 2}>
            <Deck dealt={scene === 2} reduced={reduced} />
          </Scene>
          <Scene active={scene === 3}>
            <ContactSheet onReplay={() => go(0)} />
          </Scene>
          {/* Like the real player: the left side goes back, the right goes on. */}
          <button
            type="button"
            aria-label="Previous scene"
            onClick={() => go(scene - 1)}
            className="absolute inset-y-0 left-0 w-1/4 focus-visible:bg-white/5 focus-visible:outline-none"
          />
          <button
            type="button"
            aria-label="Next scene"
            onClick={() => go(scene + 1)}
            className="absolute inset-y-0 right-0 w-1/4 focus-visible:bg-white/5 focus-visible:outline-none"
          />
        </div>
      </div>
    </div>
  );
};

const Scene = ({ active, children }: { active: boolean; children: React.ReactNode }) => {
  return (
    <div
      aria-hidden={!active}
      inert={!active}
      className={cn(
        "absolute inset-0 transition-opacity duration-700 ease-out",
        active ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {children}
    </div>
  );
};

// Porto to Lisbon by train on a dark street map, the way story mode draws a
// leg: the line fills in and the train rides it.
const RAIL = "M74 16 C80 30 79 44 70 57 S59 70 58 74";
const LAND = "#1b1b1b";

const Leg = ({ play }: { play: boolean }) => {
  return (
    <div className="relative size-full">
      <svg
        aria-hidden
        viewBox="0 0 160 90"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        <rect width="160" height="90" fill="#10161b" />
        <path
          d="M66 0 C63 10 61 22 62 32 C60 44 55 54 54 64 C52 72 50 80 51 90 H160 V0 Z"
          fill={LAND}
        />
        <g fill="none" stroke="#2a2a2a" strokeWidth="0.25">
          <path d="M70 8 L160 4 M64 26 L160 22 M60 44 L160 40 M56 62 L160 60 M52 80 L160 78" />
          <path d="M90 0 L86 90 M110 0 L108 90 M130 0 L131 90 M150 0 L148 90" />
        </g>
        <path d="M74 16 C96 22 118 18 140 24" fill="none" stroke="#383838" strokeWidth="0.5" />
        {[
          { name: "AVEIRO", x: 79, y: 31 },
          { name: "COIMBRA", x: 92, y: 41 },
          { name: "LEIRIA", x: 80, y: 55 },
          { name: "SANTARÉM", x: 92, y: 66 },
        ].map((d) => (
          <text
            key={d.name}
            x={d.x}
            y={d.y}
            textAnchor="middle"
            className="font-sans"
            fontSize="1.9"
            letterSpacing="0.35"
            fill="#6b6b6b"
          >
            {d.name}
          </text>
        ))}
        <text x="36" y="46" className="font-sans" fontSize="2.4" fontStyle="italic" fill="#3b4a55">
          Atlantic
        </text>
        <path
          d={RAIL}
          fill="none"
          stroke="#e7e5e4"
          strokeOpacity="0.25"
          strokeWidth="0.45"
          strokeDasharray="0.5 1"
        />
        <path
          d={RAIL}
          pathLength={1}
          fill="none"
          stroke="#fde68a"
          strokeWidth="0.9"
          strokeLinecap="round"
          strokeDasharray="1"
          strokeDashoffset={play ? 1 : 0}
        >
          {play && (
            <animate
              attributeName="stroke-dashoffset"
              from="1"
              to="0"
              dur="3s"
              begin="0.4s"
              fill="freeze"
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.4 0 0.2 1"
            />
          )}
        </path>
        <circle cx="74" cy="16" r="0.9" fill="#d6d3d1" stroke="#1c1917" strokeWidth="0.3" />
        <text
          x="76.5"
          y="14.6"
          className="font-serif"
          fontSize="2.8"
          fill="#d6d3d1"
          stroke="#141210"
          strokeWidth="0.5"
          paintOrder="stroke"
        >
          Porto
        </text>
        <circle cx="58" cy="74" r="1.2" fill="#fde68a" stroke="#c2410c" strokeWidth="0.35" />
        <text
          x="61"
          y="76.5"
          className="font-serif"
          fontSize="3.2"
          fontWeight="600"
          fill="#fde68a"
          stroke="#141210"
          strokeWidth="0.6"
          paintOrder="stroke"
        >
          Lisbon
        </text>
        <g>
          {play ? (
            <animateMotion
              dur="3s"
              begin="0.4s"
              fill="freeze"
              path={RAIL}
              calcMode="spline"
              keyTimes="0;1"
              keyPoints="0;1"
              keySplines="0.4 0 0.2 1"
            />
          ) : (
            <animateMotion dur="0.01s" fill="freeze" path={RAIL} keyTimes="0;1" keyPoints="1;1" />
          )}
          <circle r="2.6" fill="#f3e9d6" stroke="#c2410c" strokeWidth="0.45" />
          <TrainFrontIcon
            x={-1.5}
            y={-1.5}
            width={3}
            height={3}
            color="#c2410c"
            strokeWidth={2.4}
          />
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#0e0d0c_100%)]" />
      <div className="absolute inset-x-0 top-0 space-y-1 px-4 pt-5 text-center [text-shadow:0_1px_8px_#0e0d0c]">
        <p className="text-[0.625rem] tracking-[0.25em] text-amber-200/90 uppercase sm:text-[0.6875rem]">
          <TrainFrontIcon className="mr-1 inline size-3 align-[-2px]" />
          By train · 2h 58m
        </p>
        <p className="font-serif text-xl font-semibold text-stone-50 sm:text-2xl">
          Porto <span className="text-white/45">→</span> Lisbon
        </p>
      </div>
    </div>
  );
};

// A stop's photos dealt out as prints, the last one face up, with the caption
// story mode puts under them.
const DEALT = [
  { kind: "tram" as const, rest: "-rotate-[7deg] -translate-x-[18%]" },
  { kind: "tiles" as const, rest: "rotate-[6deg] translate-x-[16%]" },
  { kind: "ferry" as const, rest: "-rotate-1" },
];

const Deck = ({ dealt, reduced }: { dealt: boolean; reduced: boolean }) => {
  const ferry = PHOTOS[0]!;
  return (
    <div className="flex size-full flex-col items-center justify-center gap-5 px-6 sm:gap-6">
      <div className="relative grid w-[min(70%,22rem)] place-items-center">
        {DEALT.map((p, i) => (
          <div
            key={p.kind}
            className={cn(
              "col-start-1 row-start-1 w-full rounded-[3px] bg-[#fbf7ef] p-[3%] pb-[9%] shadow-2xl transition-all duration-700 ease-out",
              dealt || reduced ? cn(p.rest, "opacity-100") : "translate-y-10 rotate-0 opacity-0",
            )}
            style={{ transitionDelay: dealt && !reduced ? `${200 + i * 450}ms` : "0ms" }}
          >
            <DrawnPhoto kind={p.kind} className="aspect-[4/3] w-full" />
          </div>
        ))}
      </div>
      <div
        className={cn(
          "space-y-1 text-center transition-opacity duration-700",
          dealt || reduced ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDelay: dealt && !reduced ? "1500ms" : "0ms" }}
      >
        <p className="text-[0.625rem] tracking-[0.2em] text-amber-200/85 uppercase sm:text-[0.6875rem]">
          <ShipIcon className="mr-1 inline size-3 align-[-2px]" />
          By boat · {ferry.time} · by Sam
        </p>
        <p className="font-serif text-xl font-semibold text-stone-50 sm:text-2xl">{ferry.place}</p>
        <p className="text-sm text-white/75">{ferry.note}</p>
      </div>
    </div>
  );
};

const ContactSheet = ({ onReplay }: { onReplay: () => void }) => {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-6 px-6">
      <div className="grid w-[min(85%,30rem)] grid-cols-3 gap-2 sm:gap-3">
        {PHOTOS.map((p) => (
          <div key={p.kind} className="rounded-[2px] bg-[#fbf7ef] p-1 shadow-lg">
            <DrawnPhoto kind={p.kind} className="aspect-[4/3] w-full" />
          </div>
        ))}
      </div>
      <div className="space-y-1 text-center">
        <p className="font-serif text-2xl font-semibold text-stone-50">{SAMPLE.title}</p>
        <p className="font-mono text-[11px] tracking-[0.18em] text-white/50 uppercase">
          {SAMPLE.counts} · 4 people
        </p>
      </div>
      <button
        type="button"
        onClick={onReplay}
        className="relative z-10 flex items-center gap-1.5 rounded-full border border-white/20 px-3.5 py-1.5 text-xs text-white/85 transition-colors hover:bg-white/10"
      >
        <RotateCcwIcon className="size-3.5" /> Replay
      </button>
    </div>
  );
};
