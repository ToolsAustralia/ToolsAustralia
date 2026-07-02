"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FLAGGED FOR DELETION (do NOT delete — user review pending; see
// docs/superpowers/specs/2026-07-02-dashboard-membership-design.md):
//   🚩 MembershipPackagesChart — after this page drops it, it becomes orphaned
//      (this was its last remaining user; the /membership redesign already flagged it).
//   Removed from THIS page but KEPT (shared, used elsewhere):
//      PartnerBenefitsPromoSection(Client), MembershipSection.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import dynamic from "next/dynamic";

import { useDashboardState } from "@/hooks/useDashboardState";
import { useMembershipCardCta } from "@/hooks/useMembershipCardCta";
import DashboardPageHeader from "../components/DashboardPageHeader";
import MembershipCurrentPlan from "@/components/sections/account-membership/MembershipCurrentPlan";
import MembershipTierList from "@/components/sections/account-membership/MembershipTierList";

const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), { ssr: false });

export default function AccountMembershipPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const dash = useDashboardState();
  const cta = useMembershipCardCta();

  React.useEffect(() => {
    if (status === "loading") return;
    if (!session) router.push("/login");
  }, [session, status, router]);

  if (status === "loading" || dash.isLoading) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen-svh flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-xl font-semibold text-primary-token dark:text-white">Please sign in to manage your membership.</p>
        <Link href="/login" className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700">Sign In</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen-svh w-full min-w-0 max-w-full overflow-x-hidden pb-8">
      <DashboardPageHeader title="Membership" sub="Your plan & billing" icon={CreditCard} stateTheme={dash.stateTheme} showBack />

      <div className="space-y-4 px-[18px] pb-8 pt-4 sm:px-6 lg:px-[26px]">
        <MembershipCurrentPlan
          acct={dash.acct}
          tierKey={dash.tierKey}
          tierHex={dash.tierHex}
          tierLabel={dash.tierLabel}
          user={dash.user}
          onManage={() => router.push("/my-account/settings?tab=subscription")}
          onPayment={() => router.push("/my-account/settings?tab=payment")}
          onBecomeMember={() => cta.membershipModal.openModal()}
          onBuyPackage={() => cta.membershipModal.openModal()}
        />

        {/* Compact tier list + one-time-pack scroll (matches the prototype MembershipPage),
            driven by the verified useMembershipCardCta state machine. */}
        <MembershipTierList cta={cta} isMember={dash.acct === "active"} />
      </div>

      <MembershipModal
        isOpen={cta.membershipModal.isModalOpen}
        onClose={cta.membershipModal.closeModal}
        selectedPlan={cta.membershipModal.selectedPlan}
        onPlanChange={cta.membershipModal.selectPlan}
      />
    </div>
  );
}
