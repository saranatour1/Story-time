import { useId } from "react";
import { SunsetPhoto } from "@/components/landing/paper";
import { cn } from "@/lib/utils";

// Made-up photos from the sample week in Portugal, drawn rather than
// shipped: each is a few shapes in a 60×45 (4:3) box. Decorative.

export type PhotoKind = "ferry" | "tram" | "tiles" | "palace" | "pastries" | "coast";

export const PHOTOS: Array<{ kind: PhotoKind; place: string; time: string; note: string }> = [
  { kind: "ferry", place: "Cacilhas", time: "7:52 PM", note: "Ferry back at sunset. Nobody wanted to get off." },
  { kind: "tram", place: "Alfama", time: "10:14 AM", note: "Tram 28, standing room only, all the way up." },
  { kind: "tiles", place: "Baixa", time: "12:40 PM", note: "We counted tiles instead of steps." },
  { kind: "palace", place: "Sintra", time: "11:20 AM", note: "Palaces in the fog, then suddenly sun." },
  { kind: "pastries", place: "Belém", time: "5:20 PM", note: "Pastéis for the train home. Two each, officially." },
  { kind: "coast", place: "Cabo da Roca", time: "6:05 PM", note: "The end of Europe, and very windy." },
];

export const DrawnPhoto = ({ kind, className }: { kind: PhotoKind; className?: string }) => {
  return (
    <svg
      aria-hidden
      viewBox={kind === "ferry" ? "0 7.5 60 45" : "0 0 60 45"}
      preserveAspectRatio="xMidYMid slice"
      className={cn("block", className)}
    >
      {kind === "ferry" && <SunsetPhoto />}
      {kind === "tram" && <Tram />}
      {kind === "tiles" && <Tiles />}
      {kind === "palace" && <Palace />}
      {kind === "pastries" && <Pastries />}
      {kind === "coast" && <Coast />}
    </svg>
  );
};

const Tram = () => {
  return (
    <g>
      <rect width="60" height="45" fill="#bfe0ef" />
      <rect y="6" width="16" height="30" fill="#f3c9a8" />
      <rect x="16" y="3" width="14" height="30" fill="#e9a3a0" />
      <rect x="30" y="1" width="16" height="28" fill="#f5e1a4" />
      <rect x="46" width="14" height="25" fill="#cfe1c7" />
      <g fill="#3d5a6c" fillOpacity="0.5">
        <rect x="3" y="10" width="3" height="4" />
        <rect x="9" y="10" width="3" height="4" />
        <rect x="19" y="7" width="3" height="4" />
        <rect x="24" y="7" width="3" height="4" />
        <rect x="33" y="5" width="3" height="4" />
        <rect x="39" y="5" width="3" height="4" />
        <rect x="49" y="4" width="3" height="4" />
        <rect x="54" y="4" width="3" height="4" />
      </g>
      <path d="M0 33 L60 21 V45 H0 Z" fill="#8f979c" />
      <path d="M0 14 L60 2" stroke="#2b2b2b" strokeWidth="0.4" />
      <g transform="rotate(-11 30 30)">
        <path d="M30 23 L34 14" stroke="#2b2b2b" strokeWidth="0.6" />
        <rect x="14" y="22" width="32" height="13" rx="2" fill="#f2c230" />
        <rect x="14" y="31" width="32" height="2.4" fill="#c0392b" />
        <g fill="#dff1fb">
          <rect x="17" y="24.5" width="5" height="4.2" rx="0.6" />
          <rect x="24" y="24.5" width="5" height="4.2" rx="0.6" />
          <rect x="31" y="24.5" width="5" height="4.2" rx="0.6" />
          <rect x="38" y="24.5" width="5" height="4.2" rx="0.6" />
        </g>
        <circle cx="20" cy="36" r="1.6" fill="#2b2b2b" />
        <circle cx="40" cy="36" r="1.6" fill="#2b2b2b" />
      </g>
    </g>
  );
};

const Tiles = () => {
  const uid = useId().replace(/:/g, "");
  return (
    <g>
      <defs>
        <pattern id={`${uid}-tile`} width="15" height="15" patternUnits="userSpaceOnUse">
          <rect width="15" height="15" fill="#f7f4ec" stroke="#d6d0c2" strokeWidth="0.3" />
          <circle cx="7.5" cy="7.5" r="3.6" fill="none" stroke="#1e4fa3" strokeWidth="1.1" />
          <circle cx="7.5" cy="7.5" r="1" fill="#1e4fa3" />
          <g fill="#1e4fa3">
            <path d="M0 0 H3.4 A3.4 3.4 0 0 1 0 3.4 Z" />
            <path d="M15 0 V3.4 A3.4 3.4 0 0 1 11.6 0 Z" />
            <path d="M0 15 V11.6 A3.4 3.4 0 0 1 3.4 15 Z" />
            <path d="M15 15 H11.6 A3.4 3.4 0 0 1 15 11.6 Z" />
          </g>
          <path d="M7.5 1.5 V3 M7.5 12 V13.5 M1.5 7.5 H3 M12 7.5 H13.5" stroke="#5b86c9" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect width="60" height="45" fill={`url(#${uid}-tile)`} />
      <rect width="60" height="45" fill="#fff" fillOpacity="0.06" />
    </g>
  );
};

const Palace = () => {
  const uid = useId().replace(/:/g, "");
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fc2e6" />
          <stop offset="1" stopColor="#eef4f9" />
        </linearGradient>
      </defs>
      <rect width="60" height="45" fill={`url(#${uid}-sky)`} />
      <g fill="#fff" fillOpacity="0.85">
        <ellipse cx="12" cy="9" rx="7" ry="2.4" />
        <ellipse cx="48" cy="6" rx="6" ry="2" />
      </g>
      <path d="M0 38 C10 31 18 30 30 31 S50 33 60 29 V45 H0 Z" fill="#3f6e3a" />
      <path d="M0 42 C14 38 30 39 60 36 V45 H0 Z" fill="#2f5a2c" />
      <rect x="18" y="18" width="18" height="14" fill="#f4c542" />
      <path d="M18 18 v-1.6 h2 v1.6 h2 v-1.6 h2 v1.6 h2 v-1.6 h2 v1.6 h2 v-1.6 h2 v1.6 h2 v-1.6 h2 V18 Z" fill="#f4c542" />
      <rect x="35" y="13" width="7" height="19" fill="#c0392b" />
      <path d="M34 13 Q38.5 6 43 13 Z" fill="#d9534f" />
      <rect x="12" y="21" width="6" height="11" fill="#b9b6c9" />
      <path d="M11.5 21 Q15 15 18.5 21 Z" fill="#8e8aa6" />
      <g fill="#7a4b1f" fillOpacity="0.55">
        <rect x="21" y="22" width="2" height="3" />
        <rect x="26" y="22" width="2" height="3" />
        <rect x="31" y="22" width="2" height="3" />
        <rect x="37.5" y="17" width="2" height="3" />
      </g>
    </g>
  );
};

const Pastries = () => {
  const tarts = [
    { x: 23, y: 17 },
    { x: 37, y: 18 },
    { x: 30, y: 29 },
  ];
  return (
    <g>
      <rect width="60" height="45" fill="#6b3f26" />
      <g stroke="#8a5536" strokeWidth="0.5" strokeOpacity="0.6">
        <path d="M0 6 C20 8 40 4 60 7" />
        <path d="M0 18 C20 16 40 21 60 17" />
        <path d="M0 33 C22 35 38 30 60 34" />
      </g>
      <circle cx="30" cy="23" r="18" fill="#e9e1d2" />
      <circle cx="30" cy="23" r="15.5" fill="#f6f1e7" />
      {tarts.map((t) => (
        <g key={`${t.x}-${t.y}`}>
          <circle cx={t.x} cy={t.y} r="6.4" fill="#cf8a3d" />
          <circle cx={t.x} cy={t.y} r="4.8" fill="#f2c45a" />
          <ellipse cx={t.x - 1.4} cy={t.y - 1} rx="1.6" ry="1.1" fill="#6b3a1a" fillOpacity="0.85" />
          <ellipse cx={t.x + 1.8} cy={t.y + 1.4} rx="1.1" ry="0.8" fill="#6b3a1a" fillOpacity="0.7" />
        </g>
      ))}
      <g fill="#7a4a24">
        <circle cx="26" cy="23" r="0.35" />
        <circle cx="33" cy="24" r="0.35" />
        <circle cx="29" cy="20" r="0.35" />
      </g>
    </g>
  );
};

const Coast = () => {
  const uid = useId().replace(/:/g, "");
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6c48e" />
          <stop offset="1" stopColor="#9cc6e0" />
        </linearGradient>
      </defs>
      <rect width="60" height="45" fill={`url(#${uid}-sky)`} />
      <rect y="25" width="60" height="20" fill="#2a6f97" />
      <path d="M0 29 H60 M0 33 H60" stroke="#fff" strokeOpacity="0.25" strokeWidth="0.4" />
      <path d="M26 45 L30 22 C34 19 44 18 60 17 V45 Z" fill="#7c5a3e" />
      <path d="M30 22 C34 19 44 18 60 17 V20 C46 21 37 22 31 25 Z" fill="#5c7a3a" />
      <path d="M26 45 C28 40 27 34 30 30" stroke="#fff" strokeOpacity="0.7" strokeWidth="0.6" fill="none" />
      <rect x="47" y="10" width="3" height="8" fill="#f7f4ef" />
      <rect x="47" y="8" width="3" height="2.4" fill="#c0392b" />
      <path d="M46.6 8 L48.5 6 L50.4 8 Z" fill="#c0392b" />
    </g>
  );
};
