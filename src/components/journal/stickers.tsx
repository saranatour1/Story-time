import type { ReactNode } from "react";
import type { JournalElement } from "../../../convex/lib/journal";
import { FONTS, INK, LIFT, MUSTARD, NAVY, ROSE, RUST, TEAL } from "./look";

// More bits to stick on a page, drawn like old travel ephemera and the
// cut-outs in a vintage collage pack: flat colours, an ink outline, a little
// lift off the paper. Some carry words (a luggage tag, a ribbon, a speech
// bubble). Each fills the box it is given.

const CREAM = "#f6ecd6";
const PAPER = "#fffdf6";

const Lifted = ({ children, view = "0 0 100 100" }: { children: ReactNode; view?: string }) => {
  return (
    <svg viewBox={view} className="size-full overflow-visible" style={LIFT}>
      {children}
    </svg>
  );
};

// A cut-out: drawn on, then trimmed with a white edge, the way food and
// flowers come in a sticker pack.
const Cutout = ({ children, view = "0 0 100 100" }: { children: ReactNode; view?: string }) => {
  return (
    <svg viewBox={view} className="size-full overflow-visible" style={{ filter: `drop-shadow(2.5px 0 0 ${PAPER}) drop-shadow(-2.5px 0 0 ${PAPER}) drop-shadow(0 2.5px 0 ${PAPER}) drop-shadow(0 -2.5px 0 ${PAPER}) ${LIFT.filter}` }}>
      {children}
    </svg>
  );
};

// Two dots and a smile, for the cuter ones.
const Face = ({ x, y }: { x: number; y: number }) => {
  return (
    <g>
      <circle cx={x - 8} cy={y} r="2.5" fill={INK} />
      <circle cx={x + 8} cy={y} r="2.5" fill={INK} />
      <path d={`M${x - 4},${y + 4} Q${x},${y + 8} ${x + 4},${y + 4}`} stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <ellipse cx={x - 13} cy={y + 5} rx="4" ry="2.5" fill={ROSE} opacity=".7" />
      <ellipse cx={x + 13} cy={y + 5} rx="4" ry="2.5" fill={ROSE} opacity=".7" />
    </g>
  );
};

// The rows of a tier list, best to worst.
const TIER_COLOURS: Record<string, string> = { S: "#e2725b", A: "#eea25a", B: "#efd06a", C: "#a9c97a", D: "#7fb2c9", F: "#c9a7d6" };

// Words set to fill a box, in a given type.
const Words = ({ text, x, y, w, size, font = FONTS.typewriter, color = INK, weight }: { text: string; x: number; y: number; w: number; size: number; font?: string; color?: string; weight?: number }) => {
  const fitted = Math.min(size, (w / Math.max(1, text.length)) * 1.7);
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontFamily={font} fontSize={fitted} fill={color} fontWeight={weight}>
      {text}
    </text>
  );
};

export const MoreSticker = ({ e }: { e: JournalElement }): ReactNode => {
  const words = e.text?.trim();
  switch (e.style) {
    case "airmail":
      return (
        <Lifted view="0 0 200 90">
          <defs>
            <pattern id={`air-${e.id}`} width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="10" height="34" fill={RUST} />
              <rect x="17" width="10" height="34" fill={NAVY} />
            </pattern>
          </defs>
          <rect width="200" height="90" fill={PAPER} />
          <rect width="200" height="90" fill={`url(#air-${e.id})`} />
          <rect x="14" y="14" width="172" height="62" fill={PAPER} />
          <Words text="PAR AVION" x={100} y={38} w={150} size={28} font={FONTS.dada} color={NAVY} weight={600} />
          <Words text="BY AIR MAIL" x={100} y={62} w={110} size={13} color={NAVY} />
        </Lifted>
      );
    case "luggage-tag":
      return (
        <Lifted view="0 0 200 100">
          <path d="M40,6 H192 V94 H40 L8,66 V34 Z" fill="#e8d3a8" stroke={INK} strokeWidth="2" />
          <circle cx="30" cy="50" r="7" fill={CREAM} stroke={INK} strokeWidth="2" />
          <path d="M23,50 C6,50 -8,30 4,16" fill="none" stroke={RUST} strokeWidth="3" />
          <line x1="56" y1="70" x2="182" y2="70" stroke={INK} strokeOpacity=".35" strokeDasharray="4 4" />
          <Words text={(words ?? "BON VOYAGE").toUpperCase()} x={119} y={44} w={130} size={26} font={FONTS.dada} weight={600} />
        </Lifted>
      );
    case "camera":
      return (
        <Lifted view="0 0 120 90">
          <rect x="6" y="20" width="108" height="64" rx="8" fill="#2a2522" stroke={INK} strokeWidth="2" />
          <rect x="6" y="36" width="108" height="30" fill="#b9885a" />
          <rect x="20" y="10" width="26" height="14" rx="3" fill="#3a332e" stroke={INK} strokeWidth="2" />
          <circle cx="62" cy="52" r="22" fill="#d9d2c4" stroke={INK} strokeWidth="3" />
          <circle cx="62" cy="52" r="13" fill="#30475e" />
          <circle cx="57" cy="47" r="4" fill="#fff" opacity=".7" />
          <circle cx="100" cy="30" r="4" fill={MUSTARD} />
        </Lifted>
      );
    case "suitcase":
      return (
        <Lifted view="0 0 120 100">
          <path d="M44,22 V12 H76 V22" fill="none" stroke={INK} strokeWidth="5" />
          <rect x="8" y="22" width="104" height="70" rx="9" fill="#a8643a" stroke={INK} strokeWidth="2.5" />
          <rect x="30" y="22" width="8" height="70" fill="#7c4526" />
          <rect x="82" y="22" width="8" height="70" fill="#7c4526" />
          <circle cx="22" cy="44" r="8" fill={MUSTARD} stroke={INK} />
          <rect x="54" y="56" width="22" height="16" rx="2" fill={CREAM} stroke={INK} transform="rotate(-8 65 64)" />
        </Lifted>
      );
    case "plane":
      return (
        <Lifted view="0 0 140 80">
          <path d="M8,44 C40,40 92,36 130,30 C138,29 138,38 130,40 C96,48 52,52 10,52 Z" fill={PAPER} stroke={INK} strokeWidth="2" />
          <path d="M62,40 L84,8 L96,10 L84,40 Z" fill={TEAL} stroke={INK} strokeWidth="2" />
          <path d="M66,48 L86,74 L98,72 L84,46 Z" fill={TEAL} stroke={INK} strokeWidth="2" />
          <path d="M12,44 L4,26 L14,26 L24,42 Z" fill={RUST} stroke={INK} strokeWidth="2" />
          {[44, 58, 72, 86, 100].map((x) => (
            <circle key={x} cx={x} cy="42" r="2.4" fill={NAVY} />
          ))}
        </Lifted>
      );
    case "film":
      return (
        <div className="size-full" style={LIFT}>
          <div className="relative size-full bg-[#1d1a17]" style={{ padding: "11% 3%" }}>
            <div aria-hidden className="absolute inset-x-0 top-[3%] h-[5%]" style={{ background: "repeating-linear-gradient(90deg, transparent 0 6px, #f3ead6 6px 12px, transparent 12px 18px)" }} />
            <div aria-hidden className="absolute inset-x-0 bottom-[3%] h-[5%]" style={{ background: "repeating-linear-gradient(90deg, transparent 0 6px, #f3ead6 6px 12px, transparent 12px 18px)" }} />
            <div className="grid size-full grid-cols-3 gap-[3%]">
              {[MUSTARD, TEAL, ROSE].map((c) => (
                <div key={c} style={{ background: `linear-gradient(160deg, ${c}, #3b2f26)` }} />
              ))}
            </div>
          </div>
        </div>
      );
    case "heart":
      return (
        <Lifted>
          <path d="M50,90 C20,70 4,52 4,32 C4,16 16,6 30,6 C40,6 46,12 50,20 C54,12 60,6 70,6 C84,6 96,16 96,32 C96,52 80,70 50,90 Z" fill={RUST} stroke={INK} strokeWidth="2.5" />
          <path d="M26,22 C20,26 18,32 19,38" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".6" />
        </Lifted>
      );
    case "sun":
      return (
        <Lifted>
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d="M50,4 L55,20 L45,20 Z" fill={MUSTARD} stroke={INK} strokeWidth="1.2" transform={`rotate(${i * 30} 50 50)`} />
          ))}
          <circle cx="50" cy="50" r="24" fill={MUSTARD} stroke={INK} strokeWidth="2" />
          <path d="M40,54 Q50,62 60,54" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          <circle cx="42" cy="45" r="2.4" fill={INK} />
          <circle cx="58" cy="45" r="2.4" fill={INK} />
        </Lifted>
      );
    case "moon":
      return (
        <Lifted>
          <path d="M62,8 C38,12 22,32 22,54 C22,78 42,94 66,92 C48,84 38,68 38,50 C38,32 48,16 62,8 Z" fill="#f2dc8c" stroke={INK} strokeWidth="2" />
          <circle cx="78" cy="22" r="3" fill={MUSTARD} />
          <circle cx="86" cy="44" r="2" fill={MUSTARD} />
        </Lifted>
      );
    case "cloud":
      return (
        <Lifted view="0 0 120 70">
          <path d="M22,60 C8,60 4,44 16,38 C14,22 34,16 44,26 C50,10 76,8 82,28 C98,24 112,38 104,52 C112,60 104,66 96,62 Z" fill={PAPER} stroke={INK} strokeWidth="2" />
        </Lifted>
      );
    case "leaf":
      return (
        <Lifted view="0 0 80 120">
          <path d="M40,114 C14,90 8,52 40,6 C72,52 66,90 40,114 Z" fill="#6f8f4e" stroke={INK} strokeWidth="2" />
          <path d="M40,112 V20 M40,48 L26,36 M40,64 L56,50 M40,80 L24,68 M40,94 L54,84" fill="none" stroke="#e9e3c9" strokeWidth="2" strokeLinecap="round" />
        </Lifted>
      );
    case "coffee":
      return (
        <Lifted view="0 0 110 110">
          <path d="M40,14 C34,24 46,26 40,36 M58,10 C52,22 64,24 58,34" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" opacity=".6" />
          <path d="M14,44 H86 L80,96 C79,102 74,106 68,106 H32 C26,106 21,102 20,96 Z" fill={PAPER} stroke={INK} strokeWidth="2.5" />
          <path d="M86,54 C104,54 104,82 82,82" fill="none" stroke={INK} strokeWidth="5" />
          <rect x="14" y="58" width="72" height="14" fill={RUST} />
        </Lifted>
      );
    case "paperclip":
      return (
        <svg viewBox="0 0 40 100" className="size-full overflow-visible" style={{ filter: "drop-shadow(1px 2px 1px rgba(40,28,10,.3))" }}>
          <path d="M28,30 V78 C28,90 12,90 12,78 V18 C12,6 32,6 32,18 V70 C32,76 22,76 22,70 V30" fill="none" stroke="#9aa3a6" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case "pin":
      return (
        <Lifted view="0 0 80 110">
          <path d="M40,106 C40,106 8,64 8,40 C8,20 22,6 40,6 C58,6 72,20 72,40 C72,64 40,106 40,106 Z" fill={RUST} stroke={INK} strokeWidth="2.5" />
          <circle cx="40" cy="40" r="13" fill={PAPER} stroke={INK} strokeWidth="2" />
        </Lifted>
      );
    case "compass":
      return (
        <Lifted>
          <circle cx="50" cy="50" r="44" fill={CREAM} stroke={INK} strokeWidth="3" />
          <circle cx="50" cy="50" r="36" fill="none" stroke={INK} strokeWidth="1" strokeDasharray="2 4" />
          <path d="M50,14 L58,50 L50,86 L42,50 Z" fill={RUST} stroke={INK} strokeWidth="1.5" />
          <path d="M50,50 L58,50 L50,86 Z" fill={NAVY} />
          <path d="M14,50 L50,44 L86,50 L50,56 Z" fill={MUSTARD} stroke={INK} strokeWidth="1" opacity=".85" />
          <text x="50" y="11" textAnchor="middle" fontFamily={FONTS.caslon} fontSize="9" fill={INK}>N</text>
        </Lifted>
      );
    case "ribbon":
      return (
        <Lifted view="0 0 240 70">
          <path d="M4,20 H34 L24,38 L34,56 H4 Z" fill="#a3402a" stroke={INK} strokeWidth="1.5" />
          <path d="M236,20 H206 L216,38 L206,56 H236 Z" fill="#a3402a" stroke={INK} strokeWidth="1.5" />
          <path d="M24,10 H216 V48 H24 Z" fill={RUST} stroke={INK} strokeWidth="2" />
          <Words text={(words ?? "HAPPY DAYS").toUpperCase()} x={120} y={30} w={170} size={24} font={FONTS.dada} color={CREAM} weight={600} />
        </Lifted>
      );
    case "speech":
      return (
        <Lifted view="0 0 160 110">
          <path d="M12,10 H148 C154,10 156,14 156,20 V70 C156,76 152,80 146,80 H62 L34,104 L40,80 H14 C8,80 4,76 4,70 V20 C4,14 8,10 12,10 Z" fill={PAPER} stroke={INK} strokeWidth="2.5" />
          <Words text={words ?? "Wish you were here!"} x={80} y={46} w={130} size={20} font={FONTS.hand} />
        </Lifted>
      );
    case "sushi":
      return (
        <Cutout view="0 0 120 80">
          <path d="M14,52 C14,38 30,34 60,34 C90,34 106,38 106,52 C106,64 90,70 60,70 C30,70 14,64 14,52 Z" fill={PAPER} stroke={INK} strokeWidth="2.5" />
          <path d="M30,60 h3 M48,64 h3 M70,62 h3 M88,58 h3" stroke={INK} strokeOpacity=".3" strokeWidth="2" strokeLinecap="round" />
          <path d="M8,40 C22,16 64,12 112,30 C116,42 104,48 90,48 C60,50 30,52 8,40 Z" fill="#f08a5d" stroke={INK} strokeWidth="2.5" />
          <path d="M32,24 C37,32 37,40 32,47 M54,19 C59,28 59,38 54,48 M76,20 C81,29 81,38 76,47 M96,25 C100,32 100,38 96,44" stroke="#fde3d4" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </Cutout>
      );
    case "ramen":
      return (
        <Cutout>
          <path d="M8,52 H92 C92,74 74,90 50,90 C26,90 8,74 8,52 Z" fill={RUST} stroke={INK} strokeWidth="2.5" />
          <path d="M14,66 H86" stroke={CREAM} strokeWidth="2.5" strokeDasharray="6 5" />
          <path d="M38,90 H62 V96 H38 Z" fill="#a3402a" stroke={INK} strokeWidth="2" />
          <ellipse cx="50" cy="52" rx="42" ry="12" fill="#e9b36a" stroke={INK} strokeWidth="2.5" />
          <path d="M16,52 q5,-5 10,0 t10,0 t10,0 t10,0 t10,0 t10,0 t10,0 M20,57 q5,-5 10,0 t10,0 t10,0 t10,0 t10,0 t10,0" stroke="#fbe7a1" strokeWidth="2.5" fill="none" />
          <rect x="44" y="38" width="12" height="15" fill="#2b3a2f" transform="rotate(-12 50 45)" />
          <circle cx="32" cy="49" r="6.5" fill={PAPER} stroke={INK} strokeWidth="1.5" />
          <path d="M32,49 m-3,0 a3,3 0 1,1 3,3" stroke={ROSE} strokeWidth="1.8" fill="none" />
          <ellipse cx="68" cy="49" rx="10" ry="6.5" fill={PAPER} stroke={INK} strokeWidth="1.5" />
          <circle cx="68" cy="49" r="4" fill={MUSTARD} />
          <path d="M10,40 L98,22 M12,46 L98,30" stroke="#b5834a" strokeWidth="4" strokeLinecap="round" />
        </Cutout>
      );
    case "onigiri":
      return (
        <Cutout>
          <path d="M50,8 C60,8 94,66 90,78 C86,90 14,90 10,78 C6,66 40,8 50,8 Z" fill={PAPER} stroke={INK} strokeWidth="2.5" />
          <path d="M34,60 H66 V88 C56,89 44,89 34,88 Z" fill="#2b3a2f" stroke={INK} strokeWidth="1.5" />
          <Face x={50} y={46} />
        </Cutout>
      );
    case "dumpling":
      return (
        <Cutout view="0 0 100 80">
          <path d="M8,56 C8,26 30,12 50,12 C70,12 92,26 92,56 C80,68 20,68 8,56 Z" fill="#f7e6c4" stroke={INK} strokeWidth="2.5" />
          <path d="M30,18 Q34,26 30,33 M42,13 Q46,22 42,30 M58,13 Q54,22 58,30 M70,18 Q66,26 70,33" stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M14,60 C32,68 68,68 86,60" stroke="#c48a3a" strokeWidth="4" fill="none" strokeLinecap="round" />
          <Face x={50} y={44} />
        </Cutout>
      );
    case "boba":
      return (
        <Cutout view="0 0 80 120">
          <rect x="42" y="0" width="8" height="40" fill={ROSE} stroke={INK} strokeWidth="1.5" transform="rotate(12 46 20)" />
          <path d="M10,34 H70 L62,112 H18 Z" fill="#d9b48a" stroke={INK} strokeWidth="2.5" />
          <path d="M13,52 H67 L65,66 H15 Z" fill={TEAL} />
          <path d="M14,34 C14,20 66,20 66,34 Z" fill={PAPER} fillOpacity=".85" stroke={INK} strokeWidth="2" />
          {[26, 36, 46, 56, 31, 41, 51].map((cx, i) => (
            <circle key={i} cx={cx} cy={i < 4 ? 104 : 96} r="4.5" fill="#3a2a20" />
          ))}
          <Face x={40} y={80} />
        </Cutout>
      );
    case "ice-cream":
      return (
        <Cutout view="0 0 80 120">
          <path d="M16,56 L40,116 L64,56 Z" fill="#d9a35f" stroke={INK} strokeWidth="2.5" />
          <path d="M24,66 L50,92 M32,58 L58,80 M48,58 L30,86 M58,64 L40,100" stroke="#a8743a" strokeWidth="1.5" />
          <circle cx="40" cy="26" r="17" fill="#a8d8c0" stroke={INK} strokeWidth="2.5" />
          <path d="M12,58 C6,42 20,34 40,34 C60,34 74,42 68,58 C62,63 56,56 50,62 C44,56 36,62 30,57 C24,63 18,56 12,58 Z" fill="#f2a7b5" stroke={INK} strokeWidth="2.5" />
          <circle cx="46" cy="9" r="5.5" fill="#c4412f" stroke={INK} strokeWidth="1.5" />
          <path d="M46,4 Q49,-4 56,-3" stroke={INK} strokeWidth="1.5" fill="none" />
        </Cutout>
      );
    case "croissant":
      return (
        <Cutout view="0 0 120 70">
          <path d="M6,50 C10,30 30,18 60,16 C90,18 110,30 114,50 C104,56 94,48 86,54 C76,60 70,52 60,58 C50,52 44,60 34,54 C26,48 16,56 6,50 Z" fill="#e3a857" stroke={INK} strokeWidth="2.5" />
          <path d="M34,54 C35,42 39,30 45,21 M60,58 V18 M86,54 C85,42 81,30 75,21" stroke="#b5762e" strokeWidth="2.5" fill="none" />
        </Cutout>
      );
    case "pretzel": {
      const knot = "M50,30 C40,10 10,12 10,40 C10,66 30,84 50,84 C70,84 90,66 90,40 C90,12 60,10 50,30 M30,72 L62,40 M70,72 L38,40";
      return (
        <Cutout view="0 0 100 90">
          <path d={knot} stroke={INK} strokeWidth="15" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={knot} stroke="#a8622c" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {[[22, 26], [16, 48], [38, 80], [64, 80], [84, 48], [78, 26], [50, 56]].map(([cx, cy]) => (
            <rect key={`${cx}-${cy}`} x={cx! - 1.5} y={cy! - 1.5} width="3" height="3" fill={PAPER} transform={`rotate(30 ${cx} ${cy})`} />
          ))}
        </Cutout>
      );
    }
    case "beer":
      return (
        <Cutout view="0 0 100 110">
          <path d="M72,44 H84 C92,44 94,50 94,58 V74 C94,82 90,86 82,86 H72" fill="none" stroke={INK} strokeWidth="10" />
          <path d="M72,44 H84 C92,44 94,50 94,58 V74 C94,82 90,86 82,86 H72" fill="none" stroke="#f6d48a" strokeWidth="5" />
          <rect x="14" y="32" width="60" height="72" rx="6" fill="#e9a23b" stroke={INK} strokeWidth="2.5" />
          <path d="M30,44 V94 M44,44 V94 M58,44 V94" stroke="#fbd38a" strokeWidth="3" strokeLinecap="round" />
          <path d="M10,36 C6,24 18,14 26,20 C30,8 48,8 52,18 C60,10 76,14 76,28 C82,32 80,44 72,44 C70,52 64,52 62,44 H18 C10,44 8,40 10,36 Z" fill={PAPER} stroke={INK} strokeWidth="2" />
        </Cutout>
      );
    case "pizza":
      return (
        <Cutout>
          <path d="M12,22 Q50,8 88,22 L50,96 Z" fill="#f6c453" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M8,20 Q50,2 92,20 Q93,30 86,31 Q50,16 14,31 Q7,30 8,20 Z" fill="#d48a3a" stroke={INK} strokeWidth="2" />
          <circle cx="38" cy="42" r="7" fill="#c4412f" stroke={INK} strokeWidth="1.5" />
          <circle cx="62" cy="44" r="6" fill="#c4412f" stroke={INK} strokeWidth="1.5" />
          <circle cx="50" cy="66" r="6" fill="#c4412f" stroke={INK} strokeWidth="1.5" />
          <ellipse cx="44" cy="56" rx="5" ry="2.5" fill={TEAL} transform="rotate(-30 44 56)" />
        </Cutout>
      );
    case "sakura":
      return (
        <Cutout>
          {[0, 72, 144, 216, 288].map((r) => (
            <path key={r} d="M50,50 C36,38 37,16 45,11 L50,18 L55,11 C63,16 64,38 50,50 Z" fill="#f6c6cf" stroke={INK} strokeWidth="1.5" transform={`rotate(${r} 50 50)`} />
          ))}
          <circle cx="50" cy="50" r="7" fill={ROSE} stroke={INK} strokeWidth="1.2" />
          {[0, 72, 144, 216, 288].map((r) => (
            <circle key={r} cx="50" cy="38" r="1.8" fill={MUSTARD} transform={`rotate(${r + 36} 50 50)`} />
          ))}
        </Cutout>
      );
    case "mountains":
      return (
        <Cutout view="0 0 120 80">
          <circle cx="92" cy="22" r="12" fill={MUSTARD} />
          <path d="M2,76 L42,18 L62,46 L80,26 L118,76 Z" fill={TEAL} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M42,18 L31,34 L37,31 L43,37 L50,30 Z M80,26 L72,37 L78,35 L83,39 L87,35 Z" fill={PAPER} />
        </Cutout>
      );
    case "tram":
      return (
        <Cutout view="0 0 120 80">
          <path d="M60,2 L44,12 M60,2 L76,12" stroke={INK} strokeWidth="2" />
          <rect x="16" y="10" width="88" height="8" rx="3" fill={NAVY} stroke={INK} strokeWidth="2" />
          <rect x="8" y="16" width="104" height="48" rx="8" fill={MUSTARD} stroke={INK} strokeWidth="2.5" />
          {[16, 40, 64, 88].map((x) => (
            <rect key={x} x={x} y="22" width="16" height="16" rx="2" fill={PAPER} stroke={INK} strokeWidth="1.5" />
          ))}
          <rect x="8" y="46" width="104" height="6" fill={PAPER} />
          <text x="60" y="61" textAnchor="middle" fontFamily={FONTS.typewriter} fontSize="7" fill={INK}>28</text>
          <circle cx="30" cy="68" r="7" fill={INK} />
          <circle cx="90" cy="68" r="7" fill={INK} />
        </Cutout>
      );
    case "tier": {
      const letter = (words ?? "S").slice(0, 3);
      return (
        <div className="flex size-full overflow-hidden border-2" style={{ ...LIFT, borderColor: INK, background: "rgba(255,253,246,.5)" }}>
          <div
            className="grid h-full shrink-0 place-items-center border-r-2"
            style={{ width: Math.min(e.h, e.w / 3), background: TIER_COLOURS[letter[0]!.toUpperCase()] ?? CREAM, borderColor: INK, fontFamily: FONTS.dada, fontSize: Math.min(e.h, e.w / 3) * 0.5, color: INK }}
          >
            {letter}
          </div>
        </div>
      );
    }
    default:
      return null;
  }
};

// Gingham, as a strip of tape.
export const GINGHAM = `repeating-linear-gradient(0deg, rgba(196,85,47,.45) 0 6px, transparent 6px 12px), repeating-linear-gradient(90deg, rgba(196,85,47,.45) 0 6px, transparent 6px 12px)`;

