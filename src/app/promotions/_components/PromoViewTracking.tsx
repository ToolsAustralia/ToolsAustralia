"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";

interface PromoViewTrackingProps {
  promo: {
    /** URL slug for the promo / prize (e.g. "milwaukee-march-2026", "dewalt"). */
    slug: string;
    /** Optional database/config id, when available. Omitted from the event when undefined. */
    id?: string;
    /** Campaign-style promo title (e.g. "Win a Milwaukee Tool Pack"). */
    title: string;
    /** Specific prize name (e.g. "Milwaukee 18V Combo Kit"). */
    prizeName: string;
    /** Optional prize hero image URL for email template use. Omitted when undefined. */
    prizeImageUrl?: string;
  };
}

/**
 * Fires the canonical Klaviyo "Viewed Giveaway" event once per route change for
 * any `/promotions/<slug>` (or brand-specific) page. Powers the ads team's
 * "viewed but didn't enter" Klaviyo flow with rich properties (promo title,
 * prize name, prize image URL, full promo URL) that email templates can
 * reference directly.
 *
 * Mirrors the established pattern in
 * [MiniDrawViewTracking.tsx](../../../app/(site)/mini-draws/[id]/components/MiniDrawViewTracking.tsx)
 * and [ProductViewTracking.tsx](../../../app/(site)/shop/[slug]/components/ProductViewTracking.tsx).
 *
 * Coexists with the existing `Viewed Page` (`PageType: "promotion"`) event
 * from [KlaviyoPageTracker](../../../components/KlaviyoPageTracker.tsx) — does
 * not replace it. The richer properties on `Viewed Giveaway` let email
 * templates render the specific promo's title and prize image rather than
 * just a slug string.
 *
 * Dedupe: fires once per route change via `useEffect` deps. Re-render on the
 * same route (state changes, re-fetches) does NOT duplicate because the deps
 * are stable.
 *
 * Consent: gated on `hasPixelConsent()` inside `trackKlaviyoEvent` — same
 * gate as all other Klaviyo client-side events.
 *
 * Property schema: see "Canonical property names" in
 * `docs/tracking/KLAVIYO_INTEGRATION.md`. Snapshot-tested in
 * `canonical-events-shape.test.ts`.
 */
export default function PromoViewTracking({ promo }: PromoViewTrackingProps) {
  const { trackViewedGiveaway } = useKlaviyoTracking();
  const { status } = useSession();
  const pathname = usePathname();

  // `status` from next-auth has three values: "loading" | "authenticated" |
  // "unauthenticated". `useUserContext().isAuthenticated` is derived from the
  // raw session and reports `false` during the "loading" window — which
  // previously caused EVERY logged-in viewer to fire one wrong
  // `is_authenticated: false` event before the session resolved, then a
  // second correct `is_authenticated: true` event ~50-200ms later. The ads
  // team's segments saw ~2x noise on the logged-out branch as a result.
  //
  // Fix (2026-05-29): wait for the session to actually resolve before firing.
  // `is_authenticated` is derived once the status is no longer "loading", so
  // the value reflects the user's true session state at the moment we fire.
  // Single event per page view, correct on the first try.
  const isAuthenticated = status === "authenticated";

  useEffect(() => {
    // Guard against firing during the session-loading window.
    if (status === "loading") return;

    const promoUrl = typeof window !== "undefined" ? window.location.href : "";

    trackViewedGiveaway({
      promo_slug: promo.slug,
      promo_id: promo.id,
      promo_title: promo.title,
      prize_name: promo.prizeName,
      prize_image_url: promo.prizeImageUrl,
      promo_url: promoUrl,
      is_authenticated: isAuthenticated,
    });
    // Deps intentionally stable: re-fires only on actual route change, session
    // resolution, or a true sign-in/sign-out flip — never during the
    // initial-load "loading" window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promo.id, promo.slug, pathname, status, isAuthenticated]);

  return null;
}
