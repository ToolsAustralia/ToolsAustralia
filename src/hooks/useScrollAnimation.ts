"use client";

import { useEffect, useRef } from "react";

/**
 * Custom hook for scroll-triggered animations using IntersectionObserver
 *
 * Features:
 * - Progressive enhancement: Falls back gracefully if IntersectionObserver is not available
 * - Automatically adds 'visible' class when element enters viewport
 * - Clean cleanup on unmount
 *
 * Browser compatibility:
 * - Modern browsers: Uses IntersectionObserver API
 * - Older browsers: Falls back to immediate visibility (graceful degradation)
 */
export function useScrollAnimation() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    // Capture ref.current in a variable at the start of the effect
    // This ensures we use the same element reference throughout
    const element = ref.current;

    // Feature detection: Check if IntersectionObserver is available
    if (typeof IntersectionObserver === "undefined") {
      // Fallback for browsers without IntersectionObserver support
      // Immediately show the element (graceful degradation)
      if (element) {
        element.classList.add("visible");
      }

      // Log warning in development mode only
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "IntersectionObserver is not supported in this browser. " +
            "Animation will be applied immediately as fallback."
        );
      }
      return;
    }

    // Create IntersectionObserver with configuration
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px",
      }
    );

    // Start observing the element
    if (element) {
      observer.observe(element);
    }

    // Cleanup: Disconnect observer on unmount
    return () => {
      if (element) {
        observer.unobserve(element);
      }
      observer.disconnect();
    };
  }, []);

  return ref;
}
