"use client";

import { useCallback, useEffect, useRef } from "react";

/** Settle window after the last reel change before the build is reported. */
const DEBOUNCE_MS = 1000;

interface UsePrizeBuildTrackingArgs {
  /** Only `/promotions/*` surfaces report a build — elsewhere there is no visit row. */
  enabled: boolean;
  /** The LANDING page slug (from the pathname), never the built prize. */
  landingSlug: string | undefined;
  /** Catalog-resolved slug of what is on screen. */
  builtPrizeSlug: string;
  toolboxSwitches: number;
  toolsetSwitches: number;
  /**
   * Did the visitor touch ANYTHING (toolbox reel, toolset reel, OR the cash toggle) — distinct
   * from the two counters above, which count only REEL touches. Cash is not a reel card, so
   * selecting it never bumps `toolboxSwitches`/`toolsetSwitches` (F-010), but it IS a build
   * choice worth reporting. Gate the beacon on this flag, not on the counters — gating on
   * `toolboxSwitches === 0 && toolsetSwitches === 0` would silently drop every cash-only
   * visitor (their build choice would never reach the visit row). Do not simplify this back
   * into a counter check.
   */
  hasInteracted: boolean;
}

/**
 * Reports the prize a visitor assembled, plus how much they engaged with the reels.
 *
 * Debounced so flicking through five brands is one write, not five, and flushed on `pagehide`
 * so a fast bouncer is still captured. Counts are CUMULATIVE, and the server `$set`s them, so a
 * double flush (debounce landing and then `pagehide`) is idempotent.
 *
 * Sends nothing until the visitor has actually switched something — an untouched page already
 * has a correct visit row and a zero-switch write would be pure noise.
 *
 * Lives in a hook, not in `PrizeShowcase`, because components must not call APIs
 * (CLAUDE.md layering).
 *
 * @see docs/promo/frontend.md
 */
export function usePrizeBuildTracking({
  enabled,
  landingSlug,
  builtPrizeSlug,
  toolboxSwitches,
  toolsetSwitches,
  hasInteracted,
}: UsePrizeBuildTrackingArgs): void {
  // Latest values, so the unload listeners never send a stale build. Written in an effect
  // rather than during render — a render-phase write is impure and can be discarded.
  const latest = useRef({ landingSlug, builtPrizeSlug, toolboxSwitches, toolsetSwitches, hasInteracted });
  useEffect(() => {
    latest.current = { landingSlug, builtPrizeSlug, toolboxSwitches, toolsetSwitches, hasInteracted };
  });

  const lastSent = useRef<string | null>(null);

  /**
   * Stable across renders (no reactive deps — everything is read from refs), so the unload
   * listeners below can be registered ONCE instead of being torn down and re-added on every
   * reel switch.
   */
  const send = useCallback((useBeacon: boolean) => {
    const {
      landingSlug: slug,
      builtPrizeSlug: built,
      toolboxSwitches: tb,
      toolsetSwitches: ts,
      hasInteracted: interacted,
    } = latest.current;
    if (!slug || !built) return;
    // Gate on INTERACTION, not on the reel counters: cash is a toggle, not a reel touch, so a
    // cash-only visitor has tb === 0 && ts === 0 forever yet still made a real build choice.
    // Gating on the counters would silently drop that visitor's build from the visit row (F-010).
    if (!interacted) return; // never touched anything — the visit row is already correct
    const payload = JSON.stringify({
      slug,
      builtPrizeSlug: built,
      toolboxSwitches: tb,
      toolsetSwitches: ts,
    });
    if (payload === lastSent.current) return; // nothing changed since the last report
    lastSent.current = payload;

    const url = "/api/tracking/promo-prize-build";
    // `sendBeacon` survives the page going away; the debounced path uses `fetch` so the
    // request carries normal headers and is visible in the network tab during dev.
    if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      return;
    }
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Fire-and-forget: a lost build report must never surface to the visitor.
    });
  }, []);

  // Debounce: restarted on every change, so five quick switches are one write. `hasInteracted`
  // is included so a redundant cash click (already-selected cash re-clicked on a cash landing
  // page, where neither the slug nor the counters move) still schedules a send instead of
  // relying solely on the unload flush.
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => send(false), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, builtPrizeSlug, toolboxSwitches, toolsetSwitches, hasInteracted, send]);

  /**
   * Unload flush, registered ONCE per mount.
   *
   * Deliberately a separate effect from the debounce above: if these listeners lived in that
   * effect they would be re-registered on every reel switch, and a handler added with an
   * inline arrow cannot be removed — one leaked `visibilitychange` listener per switch.
   * Both handlers are named so both are removed.
   */
  useEffect(() => {
    if (!enabled) return;
    const onPageHide = () => send(true);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") send(true);
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, send]);
}
