import type { Metadata } from "next";
import PortalTransitStandalone from "./page-client";

export const metadata: Metadata = {
  title: "Opening your offer…",
  // Transient hand-off surface — never a search result.
  robots: { index: false, follow: false },
};

/**
 * REQUIRED — do not remove (docs/security-csp/rules.md R8).
 *
 * This page has no data and would otherwise prerender as static (`○` in the build route
 * table). It is not a `STATIC_MARKETING_PATHS` entry, so it is served under the **nonce** CSP —
 * and a prerendered copy bakes in one request's nonce, which then fails to match every
 * subsequent response. The result is a page whose scripts are all CSP-blocked: an interstitial
 * that renders nothing, in a popup, at the exact moment the member is waiting.
 *
 * Caught by the build route table before shipping. It must read `ƒ`, never `○`.
 */
export const dynamic = "force-dynamic";

/**
 * The interstitial shown in the tab we open while the partner-portal session warms.
 *
 * WHY A ROUTE AND NOT MARKUP IN THE POPUP. The tab has to be opened inside the click gesture
 * (popup blockers), but the destination is not known for another second or two, so something
 * has to fill it. The first version wrote a hand-rolled HTML string into `about:blank` — which
 * meant a SECOND loader implementation that promptly drifted from the real one: wrong type
 * scale, no responsive handling, none of the accessibility the real screen has. Owner feedback
 * on 2026-08-03 was simply that it "looks bad on mobile", and the honest cause was that it was
 * never the same component.
 *
 * Opening the tab straight at this route means the member sees the SAME screen as every other
 * portal hand-off, maintained in one place.
 */
export default function PortalTransitPage() {
  return <PortalTransitStandalone />;
}
