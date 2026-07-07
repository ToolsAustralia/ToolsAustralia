"use client";
import { useEffect, useRef } from "react";

/**
 * Pointer-driven 3D tilt for cards / the partner-portal phone. No-op when the
 * user prefers reduced motion. Returns a ref to attach to the tilting element.
 */
export function useTilt<T extends HTMLElement = HTMLDivElement>(maxDeg = 5) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `perspective(900px) rotateY(${px * maxDeg * 2}deg) rotateX(${-py * maxDeg * 2}deg)`;
    };
    const onLeave = () => {
      el.style.transform = "";
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [maxDeg]);
  return ref;
}
