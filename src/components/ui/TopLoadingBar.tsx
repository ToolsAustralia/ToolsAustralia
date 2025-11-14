"use client";

import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import NProgress from "nprogress";
import "nprogress/nprogress.css";

// Configure NProgress for optimal UX
NProgress.configure({
  showSpinner: false, // Hide spinner for cleaner look
  trickleSpeed: 200, // How fast the bar moves
  minimum: 0.08, // Minimum percentage shown
  easing: "ease", // CSS easing function
  speed: 400, // Animation speed in ms
});

/**
 * TopLoadingBar Component (Internal)
 *
 * Displays a progress bar at the top of the page during route transitions.
 * Uses useSearchParams which requires Suspense boundary.
 */
function TopLoadingBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Start progress bar on route change
    NProgress.start();

    // Complete progress bar after a short delay to ensure smooth transition
    const timer = setTimeout(() => {
      NProgress.done();
    }, 300);

    return () => {
      clearTimeout(timer);
      NProgress.done();
    };
  }, [pathname, searchParams]);

  return null;
}

/**
 * TopLoadingBar Component
 *
 * Displays a progress bar at the top of the page during route transitions.
 * Provides visual feedback to users that navigation is in progress.
 *
 * Uses nprogress library for smooth, non-intrusive loading indication.
 * Automatically triggers on route changes (pathname or searchParams).
 * Wrapped in Suspense to satisfy Next.js 15 requirements for useSearchParams.
 *
 * @example
 * // Add to root layout.tsx
 * <TopLoadingBar />
 */
export default function TopLoadingBar() {
  return (
    <Suspense fallback={null}>
      <TopLoadingBarInner />
    </Suspense>
  );
}
