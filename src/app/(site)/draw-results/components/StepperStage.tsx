"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Wraps the "how a winner is chosen" stepper. The activation animation runs once
 * each time the section scrolls into view (remounting the inner `.ta-stage` via
 * `key` re-fires the one-shot CSS animations). Respects reduced-motion (renders
 * the static end state).
 */
export default function StepperStage({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    setCycle((c) => c + 1); // play the sequence once each time it enters view
  }, [inView]);

  return (
    <div ref={ref} className={className}>
      <div key={cycle} className={`ta-stage ${inView ? "in" : ""}`}>
        {children}
      </div>
    </div>
  );
}
