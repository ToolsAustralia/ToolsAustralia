/**
 * Build a deep-link URL for the Klaviyo abandoned-checkout email CTA.
 *
 * The URL lands the user back on the membership page (or a brand promo page
 * when they originated from one) with the package query param so the page
 * surfaces the right tier. UTM params let the ads team attribute revenue
 * from this email to a specific Klaviyo flow.
 *
 * Example output:
 *   https://toolsaustralia.com.au/membership
 *     ?openMembership=1
 *     &packageId=membership_standard
 *     &utm_source=klaviyo
 *     &utm_medium=email
 *     &utm_campaign=klaviyo_abandoned_checkout
 *
 * Auto-opening the MembershipModal from `?openMembership=1` is a follow-up
 * enhancement — for now, landing on the right page with the right package
 * highlighted is sufficient and is one click away from completing checkout.
 *
 * See `Started Checkout` event payload in docs/tracking/KLAVIYO_INTEGRATION.md
 * and the spec at docs/superpowers/specs/2026-05-27-klaviyo-events-expansion-design.md §5.
 */
export function buildCheckoutResumeUrl(params: {
  /** Absolute base URL (e.g. `process.env.NEXT_PUBLIC_SITE_URL`). */
  baseUrl: string;
  /** Resolved package id (e.g. `"membership_standard"`). Always set. */
  packageId: string;
  /** Optional promo slug — when set, the URL points at `/promotions/<slug>` instead of `/membership`. */
  promoSlug?: string;
  /** Optional UTM campaign override. Defaults to `"klaviyo_abandoned_checkout"`. */
  campaign?: string;
}): string {
  const url = new URL(params.baseUrl);

  if (params.promoSlug) {
    // Keep the user contextually anchored to the promo they were viewing.
    url.pathname = `/promotions/${params.promoSlug}`;
  } else {
    url.pathname = "/membership";
  }

  // Hint to MembershipModal (or its host page) that the user came from an
  // abandoned-checkout email. The actual auto-open listener can be wired
  // later; today this just survives in the URL for analytics.
  url.searchParams.set("openMembership", "1");
  url.searchParams.set("packageId", params.packageId);
  url.searchParams.set("utm_source", "klaviyo");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", params.campaign ?? "klaviyo_abandoned_checkout");

  return url.toString();
}
