"use client";

import dynamic from "next/dynamic";
import { usePromoLink } from "@/hooks/usePromoLink";
import { useUTMPersistence } from "@/hooks/useUTMPersistence";
import { usePromoWelcomeModal } from "@/hooks/usePromoWelcomeModal";

const PromoWelcomeModal = dynamic(
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
export default function PromoLinkTracker() {
  const { promoCode } = usePromoLink();
  useUTMPersistence();
  const { isOpen, campaignData, dismiss } = usePromoWelcomeModal(promoCode);

  if (!isOpen || !campaignData) {
    return null;
  }

  return <PromoWelcomeModal isOpen={isOpen} onClose={dismiss} campaignData={campaignData} />;
}
