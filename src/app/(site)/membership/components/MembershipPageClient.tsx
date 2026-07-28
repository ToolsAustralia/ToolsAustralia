"use client";

import { useMembershipCardCta } from "@/hooks/useMembershipCardCta";
import { useMembershipModalDeepLink } from "@/hooks/useMembershipModalDeepLink";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import MembershipPortalReturnBanner, {
  type PortalReturn,
} from "@/components/sections/membership/MembershipPortalReturnBanner";
import MembershipHero from "@/components/sections/membership/MembershipHero";
import MembershipTrustStrip from "@/components/sections/membership/MembershipTrustStrip";
import MembershipBrandShowcase from "@/components/sections/membership/MembershipBrandShowcase";
import MembershipHowItWorks from "@/components/sections/membership/MembershipHowItWorks";
import MembershipTierChooser from "@/components/sections/membership/MembershipTierChooser";
import MembershipEntriesStack from "@/components/sections/membership/MembershipEntriesStack";
import MembershipDrawCycle from "@/components/sections/membership/MembershipDrawCycle";
import MembershipPrizeChooser from "@/components/sections/membership/MembershipPrizeChooser";
import MembershipWinnersWall from "@/components/sections/membership/MembershipWinnersWall";
import MembershipFinalCta from "@/components/sections/membership/MembershipFinalCta";
import MembershipModal from "@/components/modals/MembershipModal/LazyMembershipModal";

// ─────────────────────────────────────────────────────────────────────────────
// FLAGGED FOR DELETION (do NOT delete here — user review pending; see
// docs/superpowers/specs/2026-06-29-membership-page-redesign-design.md):
//   • MembershipPackagesChart — after this rebuild it is only used by
//     /my-account/membership; candidate for deletion once that page is redesigned.
// Removed from THIS page's composition but KEPT (shared across the site, untouched):
//   • MembershipSection, UnlockDiscounts, PartnerBenefitsPromoSection(Client)
// ─────────────────────────────────────────────────────────────────────────────

export default function MembershipPageClient({
  portalReturn,
}: {
  portalReturn?: PortalReturn;
}) {
  const cta = useMembershipCardCta();
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();

  // Klaviyo abandoned-checkout deep-link (`?openMembership=1&packageId=<id>`):
  // gate the open behind the major-draw purchase gate, mirroring
  // MembershipSection's wiring. Klaviyo Started Checkout is intentionally NOT
  // re-fired here — the original "Enter Now" click already fired the event that
  // triggered the abandoned-checkout flow (see useMembershipModalDeepLink docs).
  // openModal(plan) pre-selects the plan itself (useMembershipModal).
  useMembershipModalDeepLink((plan) => {
    whenGatesOpenElseGateModal(() => {
      cta.membershipModal.openModal(plan);
    });
  });

  return (
    <>
      {portalReturn && (
        <MembershipPortalReturnBanner
          portalReturn={portalReturn}
          onSelectPlan={cta.onSelect}
          plans={[...cta.membershipPlans, ...cta.oneTimePlans]}
        />
      )}
      <MembershipHero cta={cta} />
      <MembershipTrustStrip />
      <MembershipBrandShowcase cta={cta} />
      <MembershipHowItWorks />
      <MembershipTierChooser cta={cta} />
      <MembershipEntriesStack />
      <MembershipDrawCycle />
      <MembershipPrizeChooser />
      <MembershipWinnersWall />
      <MembershipFinalCta cta={cta} />

      <MembershipModal
        isOpen={cta.membershipModal.isModalOpen}
        onClose={cta.membershipModal.closeModal}
        selectedPlan={cta.membershipModal.selectedPlan}
        onPlanChange={cta.membershipModal.selectPlan}
      />
    </>
  );
}
