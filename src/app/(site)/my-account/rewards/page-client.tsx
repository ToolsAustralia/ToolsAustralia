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

import { useDashboardState } from "@/hooks/useDashboardState";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import type { RedeemableWalletItem } from "@/hooks/queries/useRedeemablesQueries";
import DashboardPageHeader from "../components/DashboardPageHeader";
import RewardsPartnerCard from "@/components/sections/rewards/RewardsPartnerCard";
import RewardsPartnerQueue from "@/components/sections/rewards/RewardsPartnerQueue";
import RewardsClaimables from "@/components/sections/rewards/RewardsClaimables";
import RewardsMilestones from "@/components/sections/rewards/RewardsMilestones";
import DashboardLoader from "@/components/loading/DashboardLoader";
import MembershipModal from "@/components/modals/MembershipModal/LazyMembershipModal";

export default function RewardsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const dash = useDashboardState();
  const openSheet = useDashboardSheetStore((s) => s.openSheet);
  const requestModal = useModalPriorityStore((s) => s.requestModal);
  const { openWithOneTimePlan, membershipModal, getTradieSubscriptionPlan } = useMajorDrawEntryCta();
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
  // Open with the Tradie SUBSCRIPTION preselected — the same behavior as tapping the Tradie tier
  // card (owner decision): payment-ready with a "Change" button to swap tiers. Never a bare
  // openModal() (no plan renders the payment step with skeletons and no package).
  const onBecomeMember = () =>
    whenGatesOpenElseGateModal(() => membershipModal.openModal(getTradieSubscriptionPlan()));
  const onBuyPackage = () => openWithOneTimePlan();
  const onUpdatePayment = () => openSheet("manage");

  /**
   * Locked purchase-required coupon tapped in the claimables sheet → open the QUALIFYING purchase
   * flow with the coupon code carried, on the surface matching the requirement:
   * - "membership"      → the membership join flow (same as onBecomeMember) — membership packages.
   * - "one-time" / "any" → one-time packages: SpecialPackagesModal (true auto-apply) for members with
   *   additional access; everyone else gets the MembershipModal ONE-TIME flow (SpecialPackagesModal
   *   renders null without access — the locked cohort is usually exactly that cohort).
   * The code rides the `openMembershipModal` prefill event (MembershipModal auto-applies campaign
   * codes on arrival) or SpecialPackagesModal's `initialCouponCode`; after payment the webhook
   * redeems the coupon off the qualifying purchase (server gate: hasQualifyingPurchase).
   */
  const onUnlockCoupon = (item: RedeemableWalletItem) =>
    whenGatesOpenElseGateModal(() => {
      const code = (item.campaignCode || item.code || "").trim().toUpperCase();
      if (item.purchaseRequirement === "membership") {
        if (code) window.dispatchEvent(new CustomEvent("openMembershipModal", { detail: { referralCode: code } }));
        // Tradie subscription preselected (same as "Become a member" / the reference widget's
        // openMembershipModalWithTradie) — payment-ready with "Change" to swap tiers; the
        // auto-applied code rides the prefill event.
        membershipModal.openModal(getTradieSubscriptionPlan());
        return;
      }
      // "one-time" / "any" — route to one-time package entries.
      if (dash.hasAdditionalAccess) {
        requestModal("special-packages", true, code ? { initialCouponCode: code } : undefined);
        return;
      }
      if (code) window.dispatchEvent(new CustomEvent("openMembershipModal", { detail: { referralCode: code } }));
      openWithOneTimePlan();
    });

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
          tierLabel={dash.subscriptionTierLabel}
          onBecomeMember={onBecomeMember}
          onBuyPackage={onBuyPackage}
          onUpdatePayment={onUpdatePayment}
        />

        {dash.acct !== "none" && userId && (
          <>
            <RewardsPartnerQueue />
            <RewardsClaimables userId={userId} onUnlock={onUnlockCoupon} />
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
