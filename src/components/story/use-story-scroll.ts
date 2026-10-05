import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useState } from "react";

let registered = false;
function ensureGsap() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

// Scrubs 0→1 as `trigger` scrolls through the viewport. Reduced motion snaps
// to 1 once the section is mostly on screen.
export function useScrollProgress(trigger: HTMLElement | null, reduced: boolean) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!trigger) return;
    ensureGsap();
    if (reduced) {
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry && entry.intersectionRatio > 0.4) setProgress(1);
        },
        { threshold: [0, 0.4, 1] },
      );
      io.observe(trigger);
      return () => io.disconnect();
    }
    const st = ScrollTrigger.create({
      trigger,
      start: "top 75%",
      end: "bottom 35%",
      scrub: 0.6,
      onUpdate: (self) => setProgress(self.progress),
    });
    return () => st.kill();
  }, [trigger, reduced]);

  return progress;
}

// True once the element has entered the viewport enough to start reveals.
export function useInView(el: HTMLElement | null, amount = 0.35) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!el) return;
    ensureGsap();
    const st = ScrollTrigger.create({
      trigger: el,
      start: `top ${100 - amount * 100}%`,
      onEnter: () => setActive(true),
      onEnterBack: () => setActive(true),
    });
    if (el.getBoundingClientRect().top < window.innerHeight * (1 - amount)) {
      setActive(true);
    }
    return () => st.kill();
  }, [el, amount]);
  return active;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
