import { cn } from "@/lib/utils";

// A tilted photo print with the sun going down in it: the last photo of the
// day. Fixed brand colours, so it looks the same in light and dark mode;
// public/favicon.svg is the same drawing.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("size-8", className)}>
      <rect width="64" height="64" rx="16" fill="#141210" />
      <g transform="rotate(-8 32 32)">
        <rect x="15.5" y="12.5" width="33" height="39" rx="2.5" fill="#F6F1E7" />
        <rect x="19" y="16" width="26" height="15.5" fill="#C2410C" />
        <rect x="19" y="31.5" width="26" height="9" fill="#1C1917" />
        <path d="M25.5 31.5a6.5 6.5 0 0 1 13 0Z" fill="#FDE68A" />
        <path d="M29 35.5h6" stroke="#FDE68A" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// The first paint, and the moment before we know whether someone is signed
// in: an empty screen, so nothing flashes or spins before the page is ready.
export function LogoSplash({ className }: { className?: string }) {
  return <div role="status" aria-label="Loading" className={cn("min-h-svh", className)} />;
}
