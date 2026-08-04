"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { EXCLUDED_TRACKING_PREFIXES, shouldTrackRoute } from "@/utils/tracking/should-track-route";

declare global {
  interface Window {
    /**
     * Contentsquare's command queue. The UXA tag does `window._uxa = window._uxa || []`
     * on init and RE-QUEUES commands onto it while its command service is still starting,
     * so pushing before the tag has finished loading is safe — commands are not dropped.
     * (Verified against the live bundle at t.contentsquare.net/uxa/<id>.js, 2026-08-03.)
     *
     * Declared here rather than in src/types/global.d.ts to match how the other pixel
     * globals are typed — see `snaptr` in src/lib/tracking/providers/snapchat.ts and
     * `fbq` in providers/facebook.ts, which colocate their Window augmentation with the
     * only code that touches them.
     */
    _uxa?: unknown[][];
  }
}

/**
 * Contentsquare SPA page tracker.
 *
 * WHY THIS EXISTS
 * The Contentsquare tag emits exactly ONE "natural" pageview per full document load and
 * does NOT auto-detect History API navigations. In an App Router SPA every navigation
 * after the first is client-side, so without this component Contentsquare sees a single
 * page for an entire visit — an 11-minute admin session was reporting "2 pages". Every
 * page-scoped metric (zoning, page comparison, funnels, the replay page list) silently
 * undercounts as a result.
 *
 * The fix is Contentsquare's documented virtual-pageview command:
 *   window._uxa.push(["trackPageview", <path>])
 * The argument is the PATH ONLY (no scheme, no domain, no hash, max 255 chars) — the tag
 * prepends the domain and appends the query string itself.
 *
 * REPLAY EXCLUSION
 * This component also pushes `excludeURLforReplay`, which takes a REGEX STRING and stops
 * session-replay capture on matching URLs. It is driven off EXCLUDED_TRACKING_PREFIXES so
 * there is one source of truth for "surfaces that must not feed third-party tracking":
 * `/admin` renders a full customer-PII dossier and `/affiliate` renders payout bank
 * details — neither has any UX-research value, and both are the highest-PII screens on
 * the site. Note this is a REPLAY control; suppressing the pageview itself is handled
 * separately below by shouldTrackRoute(), because the two are independent in the tag.
 *
 * Mounted only where NEXT_PUBLIC_CONTENTSQUARE_ID is set — the gate lives in
 * src/app/layout.tsx next to the <Script> gate, per docs/tracking/rules.md R8.
 */

// Escape regex metacharacters so a prefix can never be read as a pattern. "-" is safe
// outside a character class, so "/test-pixels" needs no special handling.
const REGEX_META = /[.*+?^${}()|[\]\\]/g;

/**
 * Matches any excluded prefix at a path boundary, so "/admin" and "/admin/users" match
 * but a hypothetical "/administrators" does not. Left unanchored on purpose: the tag
 * tests this against its anonymized URL and we do not want to depend on whether that
 * value is a full URL or a bare path.
 */
const REPLAY_EXCLUSION_REGEX = `(${EXCLUDED_TRACKING_PREFIXES.map((prefix) =>
  prefix.replace(REGEX_META, "\\$&")
).join("|")})(/|\\?|#|$)`;

/** Contentsquare's documented cap for the trackPageview argument. */
const MAX_PATH_LENGTH = 255;

export default function ContentsquarePageTracker() {
  const pathname = usePathname();
  // The tag fires its own pageview for the initial document load. Sending ours too
  // would double-count the landing page on every visit.
  const hasSeenInitialRoute = useRef(false);

  // Declared before the pageview effect so React runs it first: the exclusion must be
  // queued before the tag initializes, otherwise a visitor landing directly on /admin
  // has their first pageview recorded before the rule applies.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window._uxa = window._uxa || [];
    window._uxa.push(["excludeURLforReplay", REPLAY_EXCLUSION_REGEX]);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!hasSeenInitialRoute.current) {
      hasSeenInitialRoute.current = true;
      return;
    }

    // Internal/staff routes are excluded from replay above; also keep them out of the
    // pageview counts so page-level reporting reflects customer traffic only.
    if (!shouldTrackRoute(pathname)) return;

    window._uxa = window._uxa || [];
    window._uxa.push(["trackPageview", (pathname || "/").slice(0, MAX_PATH_LENGTH)]);
  }, [pathname]);

  return null;
}
