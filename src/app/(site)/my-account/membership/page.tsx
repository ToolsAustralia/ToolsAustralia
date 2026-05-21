"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useMyAccountData } from "@/hooks/queries";
import DashboardHeader from "../components/DashboardHeader";
import PartnerBenefitsPromoSectionClient from "@/components/sections/promo/PartnerBenefitsPromoSectionClient";
import MembershipPackagesChart from "@/components/sections/MembershipPackagesChart";
import dynamic from "next/dynamic";
import MembershipSection from "@/components/sections/MembershipSection";

// Lazy-loaded: MembershipModal bundles Stripe + payment forms.
const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), {
  ssr: false,
});
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useMemberships } from "@/hooks/useMemberships";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";

export default function MembershipPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: accountData, isLoading: loading } = useMyAccountData(session?.user?.id);
  const membershipModal = useMembershipModal();

  useMemberships();

  React.useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
    }
  }, [session, status, router]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600 dark:border-red-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session || !accountData) {
    return null;
  }

  const { user } = accountData;

  return (
    <div className="min-h-screen-svh w-full min-w-0 max-w-full overflow-x-hidden bg-gray-50 dark:bg-neutral-950">
      <DashboardHeader
        title="Membership"
        showRenewalAlert={hasFailedRenewal(user as unknown as import("@/models/User").IUser)}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-6 sm:pb-8 space-y-6 sm:space-y-8">
        {/* Top: Why Subscribe (PartnerBenefitsPromoSection - shown to non-members) */}
        <div>
          <PartnerBenefitsPromoSectionClient scrollToId="membership" />
        </div>

        {/* Side-by-Side Breakdown chart - right after PartnerBenefits */}
        <div>
          <MembershipPackagesChart />
        </div>

        {/* MembershipSection - packages CTA */}
        <div id="membership">
          <MembershipSection
            title="READY TO JOIN?"
            padding="py-6 sm:py-8 lg:py-12"
          />
        </div>
      </div>

      <MembershipModal
        isOpen={membershipModal.isModalOpen}
        onClose={membershipModal.closeModal}
        selectedPlan={membershipModal.selectedPlan}
        onPlanChange={membershipModal.selectPlan}
      />
    </div>
  );
}
