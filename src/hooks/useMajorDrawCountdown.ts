"use client";

import { useEffect, useState } from "react";
import { useCurrentMajorDraw, useNextDraw } from "@/hooks/queries/useMajorDrawQueries";

/**
 * The one place that decides WHAT the homepage counts down to.
 *
 * Extracted from `FloatingCountdownBanner` (2026-09-03) when the hero gained its own
 * countdown CTA: two components showing the same clock must not each re-derive the target,
 * or a rule change (gates-closed → next draw's activationDate) fixes one and silently leaves
 * the other counting to the wrong moment.
 *
 * The 1s tick deliberately does NOT live here — it belongs in a leaf so a ticking clock never
 * re-renders its host. See `MajorDrawCountdownLeaf`.
 */
export interface MajorDrawCountdown {
  /** Epoch ms to count down to, or null while loading / when there is nothing to count to. */
  targetMs: number | null;
  /** True when the current draw is not accepting entries — flips the palette and the CTA copy. */
  gatesClosed: boolean;
  /** Current draw's name, when gates are open. */
  drawName: string | null;
  /** Next draw's name, when gates are closed. */
  nextDrawName: string | null;
  /**
   * Gated on a short delay after the query resolves so the first paint never shows 00:00:00:00
   * and then snap to the real figure — the flash reads as "the draw already finished".
   */
  isReady: boolean;
}

export function useMajorDrawCountdown(): MajorDrawCountdown {
  const { data: currentMajorDraw, isLoading } = useCurrentMajorDraw();
  const { data: nextDraw } = useNextDraw();
  const [isReady, setIsReady] = useState(false);

  const gatesClosed = currentMajorDraw?.status !== "active";

  // When gates are closed the meaningful moment is when the NEXT draw opens, not the current
  // draw's (already passed) date.
  const targetDateString =
    gatesClosed && nextDraw?.activationDate ? nextDraw.activationDate : currentMajorDraw?.drawDate;
  const targetMs = targetDateString ? new Date(targetDateString).getTime() : null;

  useEffect(() => {
    if (currentMajorDraw && !isLoading) {
      const t = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(t);
    }
  }, [currentMajorDraw, isLoading]);

  return {
    targetMs,
    gatesClosed,
    drawName: gatesClosed ? null : currentMajorDraw?.name ?? null,
    nextDrawName: gatesClosed ? nextDraw?.name ?? null : null,
    isReady,
  };
}
