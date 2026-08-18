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
  /**
   * Did the visitor touch ANYTHING (either reel, or the cash toggle)?
   *
   * Reported to the server, NOT used to decide whether to report at all — every visitor's build
   * is recorded so that builders and signups are counted over the same population (F-018). This
   * is what still answers "did they engage", and it cannot be derived from the two counters:
   * cash is a toggle rather than a reel card, so a cash-only visitor stays at 0/0 (F-010).
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
 * EVERY visitor with a resolved build is reported, touched or not (F-018) — an untouched
 * visitor sends once at unload with both counters at 0 and `interacted: false`. That is what
 * keeps `builders` and `signups` counting the same population; gating on interaction let
 * `signups / builders` exceed 100%.
 *
 * (This paragraph previously said the opposite — "sends nothing until the visitor has actually
 * switched something" — which survived the F-018 fix below it and described behaviour the code
 * had already stopped having. It is the reason `builders` is exposure rather than engagement,
 * so getting it wrong here misreads the whole Built-prize table.)
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
    // NO interaction gate (F-018). It used to return early for a visitor who never touched the
    // reels, which put the visit and signup rows on different populations: the signup path
    // records the page's default build for those visitors, so `signups` counted them while
    // `builders` did not, and `signups / builders` could exceed 100% — the same class of
    // visibly-impossible number as the 250% switched-away column (F-013).
    //
    // An untouched visitor now reports the build they actually had on screen with both counters
    // at 0, which is what the design specifies the field to mean. "Did they engage?" is answered
    // by the counters being 0, never by this row's absence. `lastSent` below still collapses this
    // to exactly one write per page-session, and the server `$set`s absolute values, so the extra
    // write is idempotent and cannot inflate anything.
    //
    // Note this is also why the counters alone can't be the gate: cash is a toggle, not a reel
    // touch, so a cash-only visitor sits at tb === 0 && ts === 0 yet made a real choice (F-010).
    const payload = JSON.stringify({
      slug,
      builtPrizeSlug: built,
      toolboxSwitches: tb,
      toolsetSwitches: ts,
      interacted,
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

  // Debounce: restarted on every change, so five quick switches are one write.
  //
  // Gated on `hasInteracted` — NOT because an untouched visitor goes unreported (F-018 requires
  // that they ARE reported, or `builders` and `signups` count different populations), but because
  // the unload flush below already covers them. Without this gate the mount timer fires once for
  // every visitor and then again after their first switch, doubling writes on the highest-traffic
  // path in the product for no extra information.
  //
  // So: untouched visitor -> exactly one write, at unload. Engaged visitor -> the debounced
  // write(s), with the unload flush deduped by `lastSent`. One write per visitor either way.
  useEffect(() => {
    if (!enabled || !hasInteracted) return;
    const timer = setTimeout(() => send(false), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, hasInteracted, builtPrizeSlug, toolboxSwitches, toolsetSwitches, send]);

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
