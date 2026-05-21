"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface LazyMountProps {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
}

/**
 * Defers mounting `children` until the wrapper enters the viewport (with `rootMargin` slack),
 * rendering `fallback` until then. Use to keep below-the-fold sections out of the initial
 * render/hydration cost while still painting a stable placeholder for layout/scroll.
 */
export function LazyMount({ children, fallback = null, rootMargin = "300px" }: LazyMountProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!ref.current || shown) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          obs.disconnect();
        }
      },
      { rootMargin }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [shown, rootMargin]);
  return <div ref={ref}>{shown ? children : fallback}</div>;
}
