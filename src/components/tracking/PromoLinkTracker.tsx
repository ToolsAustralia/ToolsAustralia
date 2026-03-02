"use client";

import { usePromoLink } from "@/hooks/usePromoLink";
import { useUTMPersistence } from "@/hooks/useUTMPersistence";

/**
 * PromoLinkTracker Component
 *
 * Silent component that tracks promo link codes and UTM parameters site-wide.
 * Mounted in root layout (providers.tsx).
 *
 * - Promo link codes: sessionStorage for checkout
 * - UTM: sessionStorage for signup attribution (Klaviyo, Facebook)
 *
 * @see docs/UTM_ATTRIBUTION.md
 */
export default function PromoLinkTracker() {
  usePromoLink();
  useUTMPersistence();

  // This component doesn't render anything
  return null;
}
