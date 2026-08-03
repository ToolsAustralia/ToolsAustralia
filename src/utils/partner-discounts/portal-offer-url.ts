/**
 * Deep link into a single offer in the partner portal.
 *
 * The vendor serves every offer at a stable path — `{portal}/products/view_smart/{id}` —
 * where `view_smart` is constant and only the id varies. Confirmed against the live portal
 * 2026-07-31 (e.g. offer 1065496 = JB HiFi Business).
 *
 * REQUIRES A LIVE PORTAL SESSION. There is no way to carry a target offer through the SSO
 * hand-off (vendor ask 16), so this link is only useful once the member has been through
 * "Open partner portal" at least once in the current session. Callers must therefore treat
 * it as a convenience, never as the primary path to redemption.
 *
 * The vendor's host stays in ENV, never inline in a component (CLAUDE.md: a third party's
 * name belongs in config and one clearly-named adapter — this file — so the domain survives
 * swapping the provider). Returns null when unset, and every caller must degrade to a
 * non-link rather than render a broken href.
 *
 * @module utils/partner-discounts/portal-offer-url
 */

/** Vendor offer ids are all-digits — the build script's own invariant. */
const OFFER_ID = /^\d+$/;

/**
 * Marker that this browser has completed a portal hand-off, so the member almost certainly
 * holds a live portal session.
 *
 * WHY IT IS NEEDED (measured 2026-07-31). A `view_smart` link opened WITHOUT a portal session
 * does not trigger SSO — it dead-ends:
 *
 *   /products/view_smart/{id}  →302→  {portal}/users/login  →302→  toolsaustralia.com.au/login
 *
 * and **no return-to parameter survives**, so the offer is lost entirely. An already-signed-in
 * member is then bounced straight back out to their dashboard, having asked for an offer and
 * been given a login page. That is worse than not linking at all.
 *
 * We cannot read the vendor's cookie cross-origin, so this is a deliberate one-way heuristic:
 * set only when WE have just sent the member through the hand-off. Under-detection is safe
 * (they get the portal button instead of a direct link and still arrive); over-detection is
 * what dead-ends people, and cannot happen because nothing else writes this key.
 *
 * `sessionStorage`, not `localStorage`: the portal session is itself session-scoped, so a
 * marker that outlived the tab would start lying. Cleared with the rest of the per-user
 * client storage at sign-out (global rule on auth boundaries).
 */
const PORTAL_HANDOFF_KEY = "ta.partnerPortal.handedOff";

/** Call immediately before redirecting the member into the portal. */
export function markPartnerPortalHandoff(): void {
  try {
    sessionStorage.setItem(PORTAL_HANDOFF_KEY, "1");
  } catch {
    // Private mode / storage disabled — degrade to "cold", which is the safe direction.
  }
}

/** True only when this tab has already been through the hand-off. */
export function hasPartnerPortalSession(): boolean {
  try {
    return sessionStorage.getItem(PORTAL_HANDOFF_KEY) === "1";
  } catch {
    return false;
  }
}

export function buildPartnerPortalOfferUrl(offerId: string): string | null {
  const base = process.env.NEXT_PUBLIC_PARTNER_PORTAL_URL?.trim();
  if (!base || !OFFER_ID.test(offerId)) return null;
  const origin = base.replace(/\/+$/, "");
  return `${origin}/products/view_smart/${offerId}`;
}

/**
 * Offer artwork, served from the vendor's media bucket at `…/product_image/{id}.{ext}`.
 *
 * PUBLIC — no portal session needed (a signed-out request returns 200 with `image/png`),
 * which is what makes it usable on our own catalogue page.
 *
 * **The extension varies per offer** — mostly `.png`, but `.jpg` for some (21190 is one), and
 * the bucket answers 403 for the wrong one. There is no way to know which from the id alone,
 * so the correct extension is resolved once by `scripts/probe-partner-catalog-images.ts` and
 * committed; this builder just takes it.
 *
 * COVERAGE IS 948/1833 (52%), AND THE SHORTFALL IS STRUCTURAL, NOT RANDOM. Split by category:
 * every category except one sits at 97–100%, and the single category "In-Store Offer" (877
 * offers, 48% of the catalogue) sits at **0%**. So this builder resolves artwork for
 * essentially all e-gift/online offers and none of the in-store ones.
 *
 * In-store offers DO have artwork in the portal — they are just not keyed by offer id.
 * Read off the live portal 2026-08-03, offer 1068399 (pureBIO New Zealand) renders:
 *     product_image/133414.jpeg      ← an internal media id, NOT 1068399
 *     merchant_logo/1032063.jpeg     ← the merchant id
 * Neither id appears anywhere in the CSV we are given, so there is no way to derive the URL
 * from what we hold. Closing this needs the vendor's product endpoint (the `GET
 * {portal}/api/v1/products/{id}` ask, currently 401) — see docs/partner/gotchas.md.
 *
 * PATH HISTORY (worth keeping — it cost two wrong conclusions):
 *   1. An earlier version guessed `big_image/{id}.png`, which resolves for only 64 of 1,833.
 *      That produced a confident "3% of the catalogue has artwork" — wrong; it measured one
 *      folder, not coverage. `big_image/` holds home-page hero banners, which is why a few
 *      merchandised ids resolved there and made the guess look half-right.
 *   2. Then `product_image/{offerId}` was declared "effectively complete" — also wrong, for
 *      the mirror-image reason: the sample that validated it contained no in-store offers.
 * Both mistakes were guessing URLs. Both were settled in minutes by opening the vendor's own
 * page with a live session and reading the `<img>` src. Do that first.
 *
 * Files are unoptimised and run to several hundred KB, so they must go through Next's image
 * optimiser (hence the host in `DEFAULT_IMAGE_HOSTS`) and be lazily loaded.
 */
export function buildPartnerPortalOfferImageUrl(offerId: string, ext: string): string | null {
  const base = process.env.NEXT_PUBLIC_PARTNER_MEDIA_URL?.trim();
  if (!base || !OFFER_ID.test(offerId) || !/^(png|jpg|jpeg|webp|gif)$/.test(ext)) return null;
  const origin = base.replace(/\/+$/, "");
  return `${origin}/product_image/${offerId}.${ext}`;
}
