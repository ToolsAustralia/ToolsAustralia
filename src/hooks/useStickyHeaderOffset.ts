"use client";

import { useEffect, useState } from "react";
import { useIsLgUp } from "@/hooks/useIsLgUp";

/**
 * Where a page's sticky control bar should dock — MEASURED off the real header, not read
 * from `--app-header-h`.
 *
 * That variable is a flat 86 / 106px reserved as top PADDING for the header alone. The site
 * also renders a dismissible announcement bar above the nav, so the header's actual bottom
 * edge moves between two values on the same page:
 *
 * | mobile               | bar up | bar dismissed |
 * | -------------------- | ------ | ------------- |
 * | real header bottom   | 85px   | 60px          |
 *
 * Both failure modes have shipped. Docking at a constant that is TOO SMALL (the shop's
 * `top-[60px]`) parks the bar UNDERNEATH the fixed header — measured at 60px against an
 * 85px header, which clipped 25px off the top of the search field and hid the category rail
 * completely. Docking at one that is TOO LARGE (the mini-draws' `var(--app-header-h)`)
 * leaves a transparent 26px strip once the bar is dismissed, and product cards scroll up
 * through the gap.
 *
 * Measuring the fixed header's `bottom` is the only value that is right in every
 * combination (bar up, bar dismissed, either breakpoint), and a ResizeObserver keeps it
 * right when the member dismisses the bar mid-scroll.
 *
 * `stickyTop` falls back to the constant for the first paint and for SSR, where nothing is
 * measurable yet — the constant is close enough for one frame and is what the page reserved
 * as padding anyway.
 *
 * NOTE: `/discount` (`src/app/(site)/discount/page-client.tsx`) carries its own inline copy
 * of this measurement because it also drives a "has it docked yet" IntersectionObserver off
 * the same number. If that page ever needs changing, fold it onto this hook rather than
 * growing a third variant.
 */
export function useStickyHeaderOffset(): { headerBottom: number | null; stickyTop: string } {
  const isLgUp = useIsLgUp();
  const [headerBottom, setHeaderBottom] = useState<number | null>(null);

  useEffect(() => {
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;
    // Held so the cleanup can actually remove it. The inline copy on /discount registers this
    // listener and never detaches it, which leaks one per mount.
    let onResize: (() => void) | null = null;

    // The wrapper is `static, h=0` by design (see the site layout) — only its FIXED child has
    // real height, so the child is what must be measured. It arrives after a Suspense
    // boundary resolves, and measuring the empty fallback yields 0, which docks the bar
    // behind the header instead of below it. Hence: wait for the child, then observe it.
    const attach = (): boolean => {
      const header = document.querySelector<HTMLElement>(".site-header header");
      if (!header) return false;
      const measure = () => setHeaderBottom(Math.round(header.getBoundingClientRect().bottom));
      measure();
      ro = new ResizeObserver(measure);
      ro.observe(header);
      onResize = measure;
      window.addEventListener("resize", measure);
      return true;
    };

    if (!attach()) {
      const wrapper = document.querySelector(".site-header");
      if (wrapper) {
        mo = new MutationObserver(() => {
          if (attach()) {
            mo?.disconnect();
            mo = null;
          }
        });
        mo.observe(wrapper, { childList: true, subtree: true });
      }
    }

    return () => {
      ro?.disconnect();
      mo?.disconnect();
      if (onResize) window.removeEventListener("resize", onResize);
    };
  }, []);

  const stickyTop =
    headerBottom !== null
      ? `${headerBottom}px`
      : isLgUp
        ? "var(--app-header-h-lg)"
        : "var(--app-header-h)";

  return { headerBottom, stickyTop };
}

export default useStickyHeaderOffset;
