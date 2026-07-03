"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FLAGGED FOR DELETION (do NOT delete — user review pending; see
// docs/superpowers/specs/2026-07-02-dashboard-rewards-design.md):
//   Removed from THIS page but KEPT (shared, used by other surfaces):
//     PartnerDiscountQueue, UnlockDiscounts. The old red benefits hero JSX is
//     replaced by DashboardPageHeader (goes away naturally).
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";
import dynamicImport from "next/dynamic";

import { useDashboardState } from "@/hooks/useDashboardState";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import DashboardPageHeader from "../components/DashboardPageHeader";
import RewardsPartnerCard from "@/components/sections/rewards/RewardsPartnerCard";
import RewardsPartnerQueue from "@/components/sections/rewards/RewardsPartnerQueue";
import RewardsClaimables from "@/components/sections/rewards/RewardsClaimables";
import RewardsMilestones from "@/components/sections/rewards/RewardsMilestones";
import DashboardLoader from "@/components/loading/DashboardLoader";

const MembershipModal = dynamicImport(() => import("@/components/modals/MembershipModal"), { ssr: false });

// Data reads (session/subscription/redeemables) → render dynamically.
export const dynamic = "force-dynamic";

export default function RewardsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const dash = useDashboardState();
  const openSheet = useDashboardSheetStore((s) => s.openSheet);
  const { openWithOneTimePlan, membershipModal } = useMajorDrawEntryCta();
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();

  React.useEffect(() => {
    if (status === "loading") return;
    if (!session) router.push("/login");
  }, [session, status, router]);

  if (status === "loading" || dash.isLoading) {
    return <DashboardLoader label="Loading your rewards…" />;
  }

  if (!session) {
    return (
      <div className="min-h-screen-svh flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-xl font-semibold text-primary-token dark:text-white">Please sign in to view your rewards.</p>
        <Link href="/login" className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700">
          Sign In
        </Link>
      </div>
    );
  }

  const userId = dash.user?._id ?? session.user?.id ?? "";
  const onBecomeMember = () => whenGatesOpenElseGateModal(() => membershipModal.openModal());
  const onBuyPackage = () => openWithOneTimePlan();
  const onUpdatePayment = () => openSheet("manage");

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden pb-8">
      <DashboardPageHeader
        title="Rewards"
        sub="Partners · claims · milestones"
        icon={Gift}
        stateTheme={dash.stateTheme}
      />

      <div className="space-y-4 px-4 pt-4 sm:px-6">
        <RewardsPartnerCard
          acct={dash.acct}
          partnerAccessPct={dash.partnerAccessPct}
          expiryLabel={dash.partnerAccessExpiryLabel}
          tierHex={dash.tierHex}
          onBecomeMember={onBecomeMember}
          onBuyPackage={onBuyPackage}
          onUpdatePayment={onUpdatePayment}
        />

        {dash.acct !== "none" && userId && (
          <>
            <RewardsPartnerQueue />
            <RewardsClaimables userId={userId} />
            <RewardsMilestones acct={dash.acct} months={dash.streakMonths} tierHex={dash.tierHex} />
          </>
        )}
      </div>

      <MembershipModal
        isOpen={membershipModal.isModalOpen}
        onClose={membershipModal.closeModal}
        selectedPlan={membershipModal.selectedPlan}
        onPlanChange={membershipModal.selectPlan}
        membershipModalConfig={
          membershipModal.openWithPackageSelectionFirst ? { showPackageSelectionFirst: true } : undefined
        }
      />
    </div>
  );
}
