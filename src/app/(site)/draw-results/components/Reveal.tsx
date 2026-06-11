"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Adds the `.in` class once the element scrolls into view (or immediately if it
 * is already on-screen / IntersectionObserver is unavailable). The entrance
 * transition itself is defined in draw-results.css and only animates when the
 * user has not requested reduced motion.
 */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fire = () => el.classList.add("in");

    if (!("IntersectionObserver" in window)) {
      fire();
      return;
    }
    // Already in view on mount → reveal straight away.
    if (el.getBoundingClientRect().top < (window.innerHeight || 800) * 0.94) {
      fire();
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            fire();
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.01, rootMargin: "0px 0px -5% 0px" }
    );
    io.observe(el);
    // Safety net so content never stays hidden if the observer never fires.
    const t = setTimeout(fire, 2600);
    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, []);
  return ref;
}

interface RevealProps {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function Reveal({ className = "", style, children }: RevealProps) {
  const ref = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal ${className}`} style={style}>
      {children}
    </div>
  );
}

/** Like Reveal, but staggers the entrance of its direct children. */
export function Stagger({ className = "", style, children }: RevealProps) {
  const ref = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`lp-stagger ${className}`} style={style}>
      {children}
    </div>
  );
}
