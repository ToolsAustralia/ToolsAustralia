"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
// Type-only: erased at build, so this never pulls Mongoose into the client bundle
// (eslint `internal-norm/no-models-in-client` explicitly permits type-only imports).
import type { PartnerDiscountSurface } from "@/models/PartnerDiscountVisit";

/**
 * Page analytics for the two partner-discount catalogue surfaces (`/discount` and
 * `/my-account/rewards/catalogue`).
 *
 * TWO BEACONS PER VISIT, NOT ONE PER INTERACTION. The visit is recorded on mount; everything
 * the visitor did is accumulated in a ref and sent once when they leave. A 1,833-row list is
 * the wrong place to be firing a request per click.
 *
 * THE COUNTERS ARE CUMULATIVE AND THE SERVER WRITES THEM WITH `$set`.
 * That is what makes the three flush triggers below safe: two or three flushes for one visit
 * converge on the same row state rather than multiplying it. Deltas plus `$inc` would need
 * client-side bookkeeping and would double-count a retried request.
 *
 * ALL THREE TRIGGERS ARE LOAD-BEARING — this is the part that is easy to get wrong:
 *   - `pagehide`          — closing the tab, or a hard navigation off the site.
 *   - `visibilitychange`  — mobile Safari frequently never fires `pagehide` when the user
 *                           backgrounds the app or switches tabs, and that is where a large
 *                           share of this traffic lives.
 *   - unmount             — BOTH surfaces are SPA routes. Clicking the header nav away from
 *                           `/discount` fires NO page lifecycle event at all, so without the
 *                           unmount flush most in-site departures would silently lose every
 *                           counter. This is the trigger a `pagehide`-only implementation
 *                           misses, and it is the common case, not the edge case.
 *
 * @see src/app/api/tracking/discount-page-visit/route.ts
 * @see src/app/api/tracking/discount-page-engagement/route.ts
 * @see docs/partner/analytics.md
 */

/** The imperative surface the two page-clients call. Stable across renders. */
export interface PartnerDiscountTracker {
  /** Search, category, level, open-only or sort was touched. */
  interaction: () => void;
  /** An offer was opened. `locked` marks one above the visitor's access level. */
  offerOpened: (locked: boolean) => void;
  /** An access seam exists on this view — the denominator for seam-reach rate. */
  seamRendered: () => void;
  /** The access seam scrolled into view. */
  seamReached: () => void;
  /** An unlock CTA was clicked (a locked offer's route into the membership modal). */
  unlockClick: () => void;
  /** A portal hand-off was started from this surface. */
  portalHandoff: () => void;
  /** A search returned nothing. */
  zeroResultSearch: () => void;
}

interface Counters {
  interacted: boolean;
  offersOpened: number;
  lockedOffersOpened: number;
  seamRendered: boolean;
  seamReached: boolean;
  unlockClicks: number;
  portalHandoff: boolean;
  zeroResultSearch: boolean;
}

const emptyCounters = (): Counters => ({
  interacted: false,
  offersOpened: 0,
  lockedOffersOpened: 0,
  seamRendered: false,
  seamReached: false,
  unlockClicks: 0,
  portalHandoff: false,
  zeroResultSearch: false,
});

export interface UsePartnerDiscountTrackingOptions {
  surface: PartnerDiscountSurface;
  /**
   * The visitor's resolved partner-access %, or undefined while it is still loading.
   *
   * Read at SEND time, not at mount. The visit beacon fires immediately so a two-second
   * bounce is still counted — that population is most of what "is the seam working" is about
   * — which means a member's tier often has not arrived yet. The engagement flush carries the
   * resolved value and corrects the row server-side.
   */
  accessPct?: number;
  /**
   * Set false to record nothing at all. The member catalogue uses this while the session is
   * resolving, because it redirects unauthenticated visitors — recording a visit for someone
   * who is about to be bounced to `/login` would inflate the member surface with people who
   * never saw it.
   */
  enabled?: boolean;
}

export function usePartnerDiscountTracking({
  surface,
  accessPct,
  enabled = true,
}: UsePartnerDiscountTrackingOptions): PartnerDiscountTracker {
  const counters = useRef<Counters>(emptyCounters());
  /** Nothing to say since the last flush — skip the request entirely. */
  const dirty = useRef(false);
  /** The visit beacon is fired exactly once per mounted surface. */
  const visitSent = useRef(false);
  /** Latest values read at send time, so the callbacks below need no dependencies. */
  const accessPctRef = useRef(accessPct);
  accessPctRef.current = accessPct;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;

  const flush = useCallback(() => {
    if (!enabledRef.current || !dirty.current) return;
    // Cleared BEFORE the request, not after: a flush that is still in flight when the next
    // trigger fires must not send the same state twice, and if the request fails there is
    // nothing useful to retry — the visitor is already gone.
    dirty.current = false;
    const payload = {
      surface: surfaceRef.current,
      ...(accessPctRef.current !== undefined && { accessPct: accessPctRef.current }),
      ...counters.current,
    };
    try {
      void fetch("/api/tracking/discount-page-engagement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // Survives the document being torn down. The payload is a handful of numbers, far
        // inside the 64 KB keepalive limit.
        keepalive: true,
      }).catch(() => {
        // Fire-and-forget.
      });
    } catch {
      // `fetch` can throw synchronously during teardown in some browsers. Never let analytics
      // break a navigation.
    }
  }, []);

  // Visit beacon. Fires as soon as the surface is enabled, deliberately WITHOUT waiting for
  // the tier to resolve — see `accessPct` above.
  useEffect(() => {
    if (!enabled || visitSent.current) return;
    visitSent.current = true;
    try {
      void fetch("/api/tracking/discount-page-visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surface,
          ...(accessPctRef.current !== undefined && { accessPct: accessPctRef.current }),
        }),
        keepalive: true,
      }).catch(() => {
        // Fire-and-forget.
      });
    } catch {
      // As above — never break the page.
    }
  }, [enabled, surface]);

  // The three flush triggers.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      // The SPA case. Runs on a real unmount and also on React's development double-invoke,
      // where `dirty` is still false so this is a no-op.
      flush();
    };
  }, [flush]);

  return useMemo<PartnerDiscountTracker>(() => {
    const mark = (mutate: (c: Counters) => void) => {
      mutate(counters.current);
      dirty.current = true;
    };
    return {
      interaction: () => mark((c) => { c.interacted = true; }),
      offerOpened: (locked: boolean) =>
        mark((c) => {
          c.offersOpened += 1;
          if (locked) c.lockedOffersOpened += 1;
        }),
      // Idempotent by nature — the list re-renders constantly and these are called from
      // render-driven effects, so they must be safe to call on every pass.
      seamRendered: () => {
        if (!counters.current.seamRendered) mark((c) => { c.seamRendered = true; });
      },
      seamReached: () => {
        if (!counters.current.seamReached) mark((c) => { c.seamReached = true; });
      },
      unlockClick: () => mark((c) => { c.unlockClicks += 1; }),
      portalHandoff: () => {
        if (!counters.current.portalHandoff) mark((c) => { c.portalHandoff = true; });
      },
      zeroResultSearch: () => {
        if (!counters.current.zeroResultSearch) mark((c) => { c.zeroResultSearch = true; });
      },
    };
  }, []);
}
