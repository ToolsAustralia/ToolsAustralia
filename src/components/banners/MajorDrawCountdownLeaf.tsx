"use client";

import type { ReactNode } from "react";
import { useLeafTimer } from "@/hooks/useLeafTimer";

export interface MajorDrawTimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Leaf component owning the 1s tick.
 *
 * The tick lives here, not in the host, so a host's scroll-visibility / hover / dismiss state
 * is not re-rendered every second just because a clock advanced. Hosts pass a render prop and
 * stay still.
 *
 * Lifted out of `FloatingCountdownBanner` on 2026-09-03 when the hero gained its own countdown
 * CTA — two ticking clocks on one page must not be two implementations.
 */
export function MajorDrawCountdownLeaf({
  targetMs,
  render,
  tickMs = 1000,
}: {
  targetMs: number | null;
  render: (state: { timeLeft: MajorDrawTimeLeft; isExpired: boolean }) => ReactNode;
  /**
   * How often to recompute. Default 1s for hosts that show SECONDS. A host showing only
   * days/hours/minutes should pass something slower — at 1s it would re-render 60x a minute to
   * paint an identical string.
   */
  tickMs?: number;
}) {
  const now = useLeafTimer(tickMs);
  let timeLeft: MajorDrawTimeLeft = { days: 0, hours: 0, minutes: 0, seconds: 0 };
  let isExpired = true;
  if (targetMs !== null && !Number.isNaN(targetMs)) {
    const difference = targetMs - now;
    if (difference > 0) {
      timeLeft = {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((difference % (1000 * 60)) / 1000),
      };
      isExpired = false;
    }
  }
  return <>{render({ timeLeft, isExpired })}</>;
}
