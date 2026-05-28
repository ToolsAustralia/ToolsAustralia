"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
import { useUserContext } from "@/contexts/UserContext";

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
  const { isAuthenticated } = useUserContext();
  const pathname = usePathname();

  useEffect(() => {
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
    // Deps intentionally stable: re-fires only on actual route change or auth flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promo.id, promo.slug, pathname, isAuthenticated]);

  return null;
}
