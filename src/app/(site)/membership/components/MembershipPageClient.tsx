"use client";

import dynamic from "next/dynamic";
import { useMembershipCardCta } from "@/hooks/useMembershipCardCta";
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

// Lazy-loaded: MembershipModal bundles Stripe + payment forms.
const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), {
  ssr: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// FLAGGED FOR DELETION (do NOT delete here — user review pending; see
// docs/superpowers/specs/2026-06-29-membership-page-redesign-design.md):
//   • MembershipPackagesChart — after this rebuild it is only used by
//     /my-account/membership; candidate for deletion once that page is redesigned.
// Removed from THIS page's composition but KEPT (shared across the site, untouched):
//   • MembershipSection, UnlockDiscounts, PartnerBenefitsPromoSection(Client)
// ─────────────────────────────────────────────────────────────────────────────

export default function MembershipPageClient() {
  const cta = useMembershipCardCta();
  return (
    <>
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
