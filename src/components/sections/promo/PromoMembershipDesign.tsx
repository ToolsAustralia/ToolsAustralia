"use client";

import dynamic from "next/dynamic";
import { useMembershipCardCta } from "@/hooks/useMembershipCardCta";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { useExperimentTracking } from "@/hooks/ab-testing/useExperimentTracking";
import MembershipTierChooser from "@/components/sections/membership/MembershipTierChooser";

// MembershipModal bundles Stripe + payment forms; lazy-load it (mirrors MembershipPageClient).
const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), { ssr: false });

/**
 * A/B TREATMENT for the promotions package section: the /membership tier + one-time-packs
 * design, dropped onto promo pages. Mirrors MembershipPageClient — one useMembershipCardCta
 * instance owning one MembershipModal — but:
 *   • passes includeAdditionalForMembers so members see the same Additional packs the control
 *     (MembershipSection) shows (offer parity — measure design, not offer);
 *   • passes onPackageCtaClick to emit a diagnostic A/B "click" event at the SAME modal-open
 *     point the control (MembershipSection) emits on — so the funnel is comparable, and it
 *     does NOT fire on the draw-gate or /my-account early-returns. No-ops outside an experiment.
 *   • uses sectionId="packages" so the promo #packages scroll anchor is preserved and there is
 *     no duplicate #membership id on the page.
 */
export default function PromoMembershipDesign() {
  const { experimentId, variantId } = useVariantContext();
  const { trackEvent } = useExperimentTracking();

  const cta = useMembershipCardCta({
    includeAdditionalForMembers: true,
    onPackageCtaClick: (plan) => {
      if (experimentId && variantId) {
        trackEvent(experimentId, variantId, "click", { element: "package_cta", packageId: plan.id });
      }
    },
  });

  return (
    <>
      <MembershipTierChooser cta={cta} sectionId="packages" />
      <MembershipModal
        isOpen={cta.membershipModal.isModalOpen}
        onClose={cta.membershipModal.closeModal}
        selectedPlan={cta.membershipModal.selectedPlan}
        onPlanChange={cta.membershipModal.selectPlan}
      />
    </>
  );
}
