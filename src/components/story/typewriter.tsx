import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Types a string in place. The full text stays in the DOM for screen readers;
// the visible run is a progressive substring. Reduced motion shows everything
// at once.
export function Typewriter({
  text,
  active,
  className,
  as: Tag = "span",
  cps = 42,
  onDone,
}: {
  text: string;
  active: boolean;
  className?: string;
  as?: "span" | "h1" | "h2" | "h3" | "p";
  /** Characters per second. */
  cps?: number;
  onDone?: () => void;
}) {
  const [reduced, setReduced] = useState(false);
  const [n, setN] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!active) {
      setN(0);
      return;
    }
    if (reduced) {
      setN(text.length);
      onDone?.();
      return;
    }
    setN(0);
    const step = Math.max(1, Math.round(cps / 20));
    const id = window.setInterval(() => {
      setN((prev) => {
        const next = Math.min(text.length, prev + step);
        if (next >= text.length) {
          window.clearInterval(id);
          onDone?.();
        }
        return next;
      });
    }, 50);
    return () => window.clearInterval(id);
  }, [active, text, reduced, cps, onDone]);

  const visible = text.slice(0, n);
  const done = n >= text.length;

  return (
    <Tag className={cn(className)} aria-label={text}>
      <span aria-hidden="true">
        {visible}
        {!done && active && !reduced && (
          <span className="ml-0.5 inline-block h-[0.9em] w-[0.08em] translate-y-[0.1em] bg-current align-baseline opacity-70 motion-safe:animate-pulse" />
        )}
      </span>
      <span className="sr-only">{text}</span>
    </Tag>
  );
}
