"use client";

/**
 * "There's something new in Rewards" — the discovery nudge for the partner catalogue.
 *
 * WHY IT EXISTS
 * `/my-account/rewards/catalogue` answers the question the vendor's portal cannot ("what does
 * my tier actually open?"), but it is a brand-new surface reached from inside another page.
 * Members who never open Rewards will never find it, and an unfound feature is the same as an
 * unbuilt one.
 *
 * SHAPE OF THE NUDGE — deliberately small:
 *  - A dot on the Rewards nav item, in BOTH navs (they share `DASHBOARD_NAV`).
 *  - It pulses for ~3s on arrival to catch the eye, then settles to a static dot. A permanent
 *    pulse is a permanent distraction; a static dot is wayfinding.
 *  - The pulse is `motion-safe:` only, so `prefers-reduced-motion` gets the dot and no motion
 *    at all (CLAUDE.md: new always-on animation needs a reduced-motion gate).
 *  - It clears when the member ARRIVES at the catalogue, not when they click near it, and the
 *    marker is per-account and cleared at sign-out.
 *
 * Deliberately NOT a modal, tooltip or coach-mark: this competes with real member tasks
 * (entries, billing), and a dot costs nobody anything.
 */

import React from "react";
import { useSession } from "next-auth/react";
import {
  hasSeenPartnerCatalogueSpotlight,
  markPartnerCatalogueSpotlightSeen,
} from "@/utils/rewards-widget-spotlight-storage";

const PULSE_MS = 3000;

/**
 * Whether to show the nudge for the signed-in member.
 *
 * Reads localStorage after mount only — it does not exist on the server, and reading it during
 * render would hydrate-mismatch. So the first paint never shows the dot, which is the right
 * bias: a late dot is harmless, a flash of one on every load is not.
 */
export function usePartnerCatalogueSpotlight(): { show: boolean; pulsing: boolean; dismiss: () => void } {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const [show, setShow] = React.useState(false);
  const [pulsing, setPulsing] = React.useState(false);

  React.useEffect(() => {
    if (!userId || hasSeenPartnerCatalogueSpotlight(userId)) return;
    setShow(true);
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), PULSE_MS);
    return () => clearTimeout(t);
  }, [userId]);

  const dismiss = React.useCallback(() => {
    if (userId) markPartnerCatalogueSpotlightSeen(userId);
    setShow(false);
    setPulsing(false);
  }, [userId]);

  return { show, pulsing, dismiss };
}

/** Call on the catalogue page — marks the nudge resolved once the member actually lands. */
export function usePartnerCatalogueSpotlightSeen(): void {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  React.useEffect(() => {
    if (userId) markPartnerCatalogueSpotlightSeen(userId);
  }, [userId]);
}

/** The dashboard route that owns the partner catalogue. */
const REWARDS_HREF = "/my-account/rewards";

/**
 * Re-arm key for the Rewards tab's per-visit pulse (`.ta-nudge-attention`).
 *
 * WHY A KEY IS NEEDED HERE AND NOWHERE ELSE
 * That CSS class replays on mount, which is free for a page — the App Router remounts a
 * page component on every navigation. Both navs live in the dashboard LAYOUT, which does
 * NOT remount, so the animation would run once on first load and never again. Feeding this
 * value to the icon wrapper's `key` remounts just that wrapper on each dashboard
 * navigation, which restarts the animation.
 *
 * Returns null while the member is already on Rewards (or deeper): pulsing the tab you are
 * standing on is noise, not wayfinding.
 *
 * This is deliberately NOT gated on the one-time `hasSeenPartnerCatalogueSpotlight` marker
 * that governs the dot and the "New" pill. Those two retire once seen, because "new" stops
 * being true — but the tab stays worth pointing at, and gating the pulse on the same marker
 * is exactly what left the whole nudge invisible to anyone who had already looked once.
 */
export function rewardsTabPulseKey(pathname: string | null): string | null {
  if (!pathname) return null;
  if (pathname === REWARDS_HREF || pathname.startsWith(`${REWARDS_HREF}/`)) return null;
  return pathname;
}

/**
 * The dot itself. Absolutely positioned, so the caller only needs a positioned ancestor —
 * it never changes the nav item's layout or its hit area.
 */
export function SpotlightDot({ pulsing, className }: { pulsing: boolean; className?: string }) {
  return (
    <span className={className ?? "pointer-events-none absolute right-0 top-0"} aria-hidden="true">
      <span className="relative flex h-2 w-2">
        {pulsing && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping" />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-surface" />
      </span>
    </span>
  );
}
