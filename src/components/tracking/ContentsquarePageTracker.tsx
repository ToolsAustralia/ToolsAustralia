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
 * The Contentsquare tag emits exactly ONE "natural" pageview per full document load. In an
 * App Router SPA every navigation after the first is client-side, so without a virtual
 * pageview Contentsquare sees a single page for an entire visit — an 11-minute admin
 * session was reporting "2 pages". Every page-scoped metric (zoning, page comparison,
 * funnels, the replay page list) silently undercounts as a result.
 *
 * THIS COMPONENT MUST BE THE ONLY SOURCE OF VIRTUAL PAGEVIEWS. DO NOT ALSO ENABLE A
 * TAG-SIDE ONE.
 * Contentsquare can ALSO emit virtual pageviews server-side, via a CSTC snippet pairing the
 * "Artificial Pageview" template with a "HistoryChange" trigger. That is configured in the
 * Contentsquare dashboard, NOT in this repo, and it is invisible to code review. The tag
 * does not de-duplicate the two — Contentsquare's own docs assume you use either CSTC or a
 * manual trackPageview, never both — so when both are live EVERY client-side navigation is
 * counted TWICE. That shipped: on 2026-08-07 /membership and /faq each sent two artificial
 * pageviews per navigation (pn=2 and pn=3, then pn=5 and pn=6), inflating pages/session and
 * putting phantom self-loops (/membership → /membership) into Journey Analysis.
 *
 * An earlier version of this comment claimed the tag "does NOT auto-detect History API
 * navigations" (verified true against the bundle on 2026-08-03). The CSTC snippet was
 * enabled some time after that, so the claim silently went stale and hid the double-count.
 * Hence: verify, don't trust this paragraph. The tag-side config is public —
 *   curl -s https://t.contentsquare.net/settings/598444.json | jq .implementations
 * `implementations: []` means this component is the only source and all is well. If an
 * ArtificialPageview/HistoryChange entry is present, disable that snippet in the CS Tag
 * Configurator rather than deleting the push below — keeping it here retains the
 * shouldTrackRoute() suppression and the 255-char cap, neither of which the tag-side
 * trigger applies.
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

/**
 * Elements whose TEXT must never reach session replay, marked with a bare `data-cs-mask`
 * attribute at the render site. One attribute selector rather than a list of CSS paths, so
 * masking survives refactors — a renamed class silently stops masking, a moved attribute
 * moves with the element.
 *
 * SCOPE — what this is actually for. The tag already masks a lot on its own, and duplicating
 * that here would be noise:
 *   - `<input>`, `<textarea>` and contenteditable content are masked BY DEFAULT. Contentsquare
 *     never collects text typed into a field, so form inputs need no selector.
 *   - Automatic Personal Data Redaction (always on, cannot be disabled) replaces email
 *     addresses, JWTs, OAuth tokens and credit-card numbers found anywhere in the DOM, URLs
 *     or error strings.
 * What neither covers is PERSONAL DATA RENDERED AS A TEXT NODE — a member's name in the
 * header, a shipping address on checkout success, a date of birth, free text the member typed
 * into support chat. That is this selector's job, and it was previously uncovered: replay ran
 * at 100% capture with no masking configured at all (verified 2026-08-07 —
 * anonymisationMethod: null, textVisibilityEnabled: 0, maskMedia: false).
 *
 * Note `/admin`, `/affiliate` and `/my-account/settings` are excluded from replay entirely
 * (EXCLUDED_TRACKING_PREFIXES), so elements only ever rendered there need no attribute.
 */
const PII_MASK_SELECTOR = "[data-cs-mask]";

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
    // Both of these are privacy controls and BOTH must be queued before the tag initializes.
    // Contentsquare's docs are explicit that setPIISelectors has to be pushed "before firing
    // the main tag" — a masking rule that lands late has already lost. This effect is declared
    // above the pageview effect so React runs it first, and the tag itself is `lazyOnload`
    // (fires at browser idle, after load), so both commands are safely queued well ahead of it.
    window._uxa.push(["excludeURLforReplay", REPLAY_EXCLUSION_REGEX]);
    window._uxa.push(["setPIISelectors", { PIISelectors: [PII_MASK_SELECTOR] }]);
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
