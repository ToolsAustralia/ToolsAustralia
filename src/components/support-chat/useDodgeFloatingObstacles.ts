"use client";

import { useEffect, useRef, useState } from "react";
import { addRAFScrollListener } from "@/utils/dom/listenerHelpers";

/**
 * useDodgeFloatingObstacles
 *
 * Keeps a corner-docked floating control from overlapping other bottom-anchored
 * floating elements — the draw countdown banner (`FloatingCountdownBanner`), the
 * promotions "get entries" bar (`FloatingGetEntriesButton`), the upsell gift icon
 * (`FloatingGiftIcon`). Those opt in declaratively by carrying `data-floating-widget`.
 *
 * OPT-IN CONTRACT: carry the attribute only while the obstacle is actually VISIBLE. An
 * element that stays mounted but parks itself invisible (e.g. `opacity-0`) still has a
 * non-zero rect, so the size check below can't see through it and the control lifts for
 * something the user can't see. Drop the attribute instead of fading with it attached —
 * the MutationObserver watches exactly this attribute, so toggling it recomputes for free.
 * (Do NOT solve this by reading computed opacity here: framer-driven obstacles animate in
 * FROM opacity 0 via rAF inline styles with no transitionend, so an opacity gate silently
 * misses a real obstacle when the scroll stops right at the mount boundary.)
 *
 * Three callers share it: the Cobber launcher (`ChatBubbleButton`, 56px) and the two
 * mutually-exclusive promotions right-corner controls (`PromotionsGuestThemeToggle` and
 * `PromotionsAccountButton`, 48px). All three dock at the same `FLOATING_DOCK_*` offsets,
 * so a full-width obstacle lifts both corners by the identical amount and they stay
 * bottom-aligned through the slide.
 *
 * Collision policy (the agreed rule — see docs/ai-chatbot/gotchas.md § launcher
 * placement): the launcher LIFTS above any floating obstacle that overlaps its
 * DEFAULT corner rect. The overlap test is a plain axis-aligned bounding-box (AABB)
 * intersection against the launcher's default position, which gives the right answer
 * across viewports for free:
 *   - Mobile: the countdown banner is near-full-width, so it reaches the corner →
 *     the launcher lifts above it.
 *   - Desktop: the same banner is centered + narrow (max-w-4xl), so it never reaches
 *     the corner → no lift.
 *   - Top-docked banners (e.g. the scroll-follow PromoBanner, which flips to top-4)
 *     don't intersect the bottom rect → ignored.
 * Corner selection (left vs right) is handled separately by the widget's `side` prop;
 * this hook only decides how far UP to sit.
 *
 * Returns the launcher's target `bottom` in px when it must dodge, or 0 (= keep its
 * default CSS position). Recomputes on scroll (banners collapse / appear on scroll),
 * on resize, and on DOM mutations (a banner being dismissed or mounting) — all
 * rAF-throttled. Pass `enabled = false` to disable (e.g. when the launcher is hidden
 * or the panel is open); it then does no work and returns 0.
 */

/**
 * Shared dock geometry for EVERY corner-docked floating control — the Cobber launcher
 * AND the promotions right-corner FABs (theme toggle / account stack). One baseline and
 * one inset so opposite corners read as a matched pair. These MUST stay in lockstep with
 * the Tailwind classes on each caller (`bottom-5`, `left-5` / `right-5`); a caller that
 * hard-codes its own offsets drifts out of alignment AND makes the overlap test below
 * run against a rect it doesn't occupy. See docs/shared-ui/gotchas.md § floating dock.
 */
export const FLOATING_DOCK_BOTTOM_PX = 20; // bottom-5 = 1.25rem
export const FLOATING_DOCK_SIDE_PX = 20; // left-5 / right-5 = 1.25rem

/** Cobber launcher disc (w-14/h-14). The promotions FABs are smaller — they pass 48. */
const DEFAULT_CORNER_PX = 56;
const GAP = 12; // clearance left above an obstacle

/**
 * @param cornerPx height/width of the element actually occupying the corner. Only the
 *   BOTTOM-most disc of a stack counts — bottom-anchored obstacles can never reach a
 *   higher one without also hitting it. Defaults to the launcher's 56px.
 */
export function useDodgeFloatingObstacles(
  side: "left" | "right",
  enabled: boolean,
  cornerPx: number = DEFAULT_CORNER_PX
): number {
  const [dodgeBottom, setDodgeBottom] = useState(0);
  // Mirror the latest value so the (stable) listeners can diff without re-subscribing.
  const lastRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      if (lastRef.current !== 0) {
        lastRef.current = 0;
        setDodgeBottom(0);
      }
      return;
    }

    const compute = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Caller's DEFAULT corner rect (before any dodge), in viewport coords.
      const x0 = side === "right" ? vw - FLOATING_DOCK_SIDE_PX - cornerPx : FLOATING_DOCK_SIDE_PX;
      const x1 = x0 + cornerPx;
      const y0 = vh - FLOATING_DOCK_BOTTOM_PX - cornerPx;
      const y1 = vh - FLOATING_DOCK_BOTTOM_PX;

      let maxTopFromBottom = 0;
      const obstacles = document.querySelectorAll<HTMLElement>("[data-floating-widget]");
      obstacles.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return; // hidden / unmounted
        const overlaps = r.left < x1 && r.right > x0 && r.top < y1 && r.bottom > y0;
        if (!overlaps) return;
        // How much vertical space this obstacle blocks from the viewport bottom.
        const topFromBottom = vh - r.top;
        if (topFromBottom > maxTopFromBottom) maxTopFromBottom = topFromBottom;
      });

      const next = maxTopFromBottom > 0 ? Math.round(maxTopFromBottom + GAP) : 0;
      if (next !== lastRef.current) {
        lastRef.current = next;
        setDodgeBottom(next);
      }
    };

    // rAF-throttle the non-scroll triggers (scroll is already throttled by the helper).
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };

    compute();
    const offScroll = addRAFScrollListener(window, compute);
    window.addEventListener("resize", schedule, { passive: true });
    // Banners mount / dismiss without a scroll (AnimatePresence, the ✕ dismiss) — watch
    // the DOM so the launcher un-lifts the moment an obstacle disappears.
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-floating-widget"],
    });

    return () => {
      offScroll();
      window.removeEventListener("resize", schedule);
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [side, enabled, cornerPx]);

  return dodgeBottom;
}
