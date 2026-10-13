import { useEffect, useRef, useState, type ReactNode } from "react";

// Pictures are fetched once they are within about a screen of the view, not
// all at once: a long story would otherwise pull every photo on arrival.
export const Near = ({ placeholder, children }: { placeholder: ReactNode; children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setNear(true);
        io.disconnect();
      },
      { rootMargin: "100% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref}>{near ? children : placeholder}</div>;
};
