"use client";

import { usePromoLink } from "@/hooks/usePromoLink";

/**
 * PromoLinkTracker Component
 * Silent component that tracks promo link codes from URL parameters
 * and stores them in sessionStorage for use during checkout
 *
 * This component should be added to the root layout to ensure
 * promo link codes are tracked site-wide
 */
export default function PromoLinkTracker() {
  // Simply call the hook - it handles all the tracking logic
  usePromoLink();

  // This component doesn't render anything
  return null;
}
