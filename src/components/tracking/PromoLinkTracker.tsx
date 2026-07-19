"use client";

import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { usePromoLink } from "@/hooks/usePromoLink";
import { useUTMPersistence } from "@/hooks/useUTMPersistence";
import { usePromoWelcomeModal } from "@/hooks/usePromoWelcomeModal";

const PromoWelcomeModal = nextDynamic(
  () => import("@/components/modals/PromoWelcomeModal").then((m) => m.default),
  { ssr: false }
);

/**
 * PromoLinkTracker Component
 *
 * Tracks promo link codes and UTM parameters site-wide.
 * Mounted in root layout (providers.tsx).
 *
 * - Promo link codes: sessionStorage for checkout
 * - UTM: sessionStorage for signup attribution (Klaviyo, Facebook)
 * - One-time welcome modal when a valid promo code is first seen this session
 *
 * @see docs/UTM_ATTRIBUTION.md
 */
function PromoLinkTrackerInner() {
  const { promoCode } = usePromoLink();
  useUTMPersistence();
  const { isOpen, campaignData, dismiss } = usePromoWelcomeModal(promoCode);

  if (!isOpen || !campaignData) {
    return null;
  }

  return <PromoWelcomeModal isOpen={isOpen} onClose={dismiss} campaignData={campaignData} />;
}

// Suspense self-wrap: useSearchParams (via usePromoLink/useUTMPersistence) requires a boundary
// for prerendered (marketing-class) pages — docs/security-csp/rules.md R8. Mounted site-wide
// (providers.tsx) so every route's render tree passes through here.
export default function PromoLinkTracker() {
  return (
    <Suspense fallback={null}>
      <PromoLinkTrackerInner />
    </Suspense>
  );
}
