"use client";

// ─────────────────────────────────────────────────────────────────────────────
// FLAGGED FOR DELETION (do NOT delete here — user review pending; see
// docs/superpowers/specs/2026-07-02-user-dashboard-revamp-foundation-home-design.md):
//   Genuinely dead (0 usages): components/MembershipStatus.tsx, ActivePrizeDraws.tsx,
//   RecentOrders.tsx, the empty EntryWallet.tsx stub, stale components/index.ts re-exports.
// Superseded on THIS page but KEPT (still used by sub-pages until their own specs):
//   DashboardHeader, CoverBanner, UserInfoBar, QuickActions, SocialLinksSection.
//   MajorDrawOverview — entries-wallet logic extracted into sections/dashboard/EntryWallet;
//   its major-draw/countdown role migrates to the Draws sub-project.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useMyAccountData } from "@/hooks/queries";
import { useUserMajorDrawStats, useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { getActivePackage, type ActivePackageUserInput } from "@/utils/membership/get-active-package";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import dynamic from "next/dynamic";
// Lazy-loaded: MembershipModal bundles Stripe + payment forms.
const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), { ssr: false });
// Lazy-loaded: dashboard modals only mount when opened — keep them out of the initial bundle.
const ReferFriendModal = dynamic(() => import("@/components/modals/ReferFriendModal"), { ssr: false });
const PastDrawsModal = dynamic(() => import("@/components/modals/PastDrawsModal"), { ssr: false });
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";
import { hasSeenExplainer } from "@/utils/subscription-explainer-storage";
import {
  markPostPurchaseLanding,
  setDeferSubscriptionExplainerThisSession,
  shouldDeferSubscriptionExplainerThisSession,
  isLandingCooldownActive,
} from "@/utils/dashboard-landing-session";
import { useDashboardLandingOrchestration } from "@/hooks/useDashboardLandingOrchestration";
import { getFallbackRenewalDate } from "@/utils/dates/month-helpers";
import { useMemberships } from "@/hooks/useMemberships";
import RewardsFloatingWidget from "@/components/features/RewardsFloatingWidget";
import { useDashboardState } from "@/hooks/useDashboardState";

import DashboardHero from "@/components/sections/dashboard/DashboardHero";
import EntryWallet, { type EntryWalletPendingData } from "@/components/sections/dashboard/EntryWallet";
import DashboardPromoBanner from "@/components/sections/dashboard/DashboardPromoBanner";
import LoyaltyStreak from "@/components/sections/dashboard/LoyaltyStreak";
import QuickActionsGrid from "@/components/sections/dashboard/QuickActionsGrid";
import PartnerPreview from "@/components/sections/dashboard/PartnerPreview";
import DashboardGuestPanel from "@/components/sections/dashboard/DashboardGuestPanel";

export default function MyAccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: accountData, isLoading: loading, error } = useMyAccountData(session?.user?.id);

  const { data: majorDrawStats, isLoading: majorDrawStatsLoading } = useUserMajorDrawStats(session?.user?.id);
  const { data: currentMajorDraw, isLoading: currentMajorDrawLoading } = useCurrentMajorDraw();

  const dash = useDashboardState();

  const { requestModal } = useModalPriorityStore();
  const { allowSecondaryModals, suppressRewardsSpotlight } = useDashboardLandingOrchestration(
    status === "authenticated",
  );
  const { openEntryFlow, openWithOneTimePlan, membershipModal } = useMajorDrawEntryCta();
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();

  useMemberships();

  const activePackage = React.useMemo(() => {
    const u = accountData?.user;
    if (!u) return null;
    return getActivePackage(u as ActivePackageUserInput);
  }, [accountData]);

  const [isReferFriendModalOpen, setIsReferFriendModalOpen] = useState(false);
  const [isPastDrawsModalOpen, setIsPastDrawsModalOpen] = useState(false);

  React.useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
    }
  }, [session, status, router]);

  const modalTriggeredRef = React.useRef(false);
  const referFriendPendingRef = React.useRef(false);

  React.useEffect(() => {
    if (!session || !accountData) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("showReferFriendAfterSetup") === "true") {
      referFriendPendingRef.current = true;
    }
  }, [session, accountData]);

  React.useEffect(() => {
    if (!referFriendPendingRef.current) return;
    if (!allowSecondaryModals) return;

    const t = window.setTimeout(() => {
      referFriendPendingRef.current = false;
      if (sessionStorage.getItem("showReferFriendAfterSetup") === "true") {
        sessionStorage.removeItem("showReferFriendAfterSetup");
      }
      setIsReferFriendModalOpen(true);
    }, 10_000);

    return () => clearTimeout(t);
  }, [allowSecondaryModals]);

  React.useEffect(() => {
    if (modalTriggeredRef.current) return;
    if (status === "loading" || loading || !session || !accountData) return;

    const setupJustCompleted = sessionStorage.getItem("setupJustCompleted");
    if (setupJustCompleted) {
      sessionStorage.removeItem("setupJustCompleted");
      return;
    }

    const pendingUpsellFlag = sessionStorage.getItem("pendingUpsellFlag");
    const pendingUpsellDataStr = sessionStorage.getItem("pendingUpsell");

    let upsellData = null;
    if (pendingUpsellDataStr) {
      try {
        upsellData = JSON.parse(pendingUpsellDataStr);
      } catch (e) {
        console.error("Failed to parse pending upsell data:", e);
        sessionStorage.removeItem("pendingUpsell");
        sessionStorage.removeItem("pendingUpsellFlag");
      }
    }

    if (pendingUpsellFlag === "true" && upsellData) {
      markPostPurchaseLanding();
      setDeferSubscriptionExplainerThisSession();
      requestModal("upsell", true, upsellData);
      modalTriggeredRef.current = true;
    } else if (!accountData.user.profileSetupCompleted || !accountData.user.birthdate) {
      markPostPurchaseLanding();
      requestModal("user-setup", true);
      modalTriggeredRef.current = true;
    }
  }, [status, loading, session, accountData, requestModal]);

  const userId = session?.user?.id;
  const profileSetupCompleted = accountData?.user?.profileSetupCompleted;
  React.useEffect(() => {
    if (typeof window === "undefined" || !userId || !accountData) return;
    if (status === "loading" || loading) return;
    if (!allowSecondaryModals) return;
    if (accountData.user?.subscription?.isActive !== true) return;
    if (hasFailedRenewal(accountData.user as unknown as import("@/models/User").IUser)) return;
    if (hasSeenExplainer(userId)) return;
    if (!profileSetupCompleted) return;
    if (sessionStorage.getItem("pendingUpsellFlag") === "true") return;
    if (shouldDeferSubscriptionExplainerThisSession()) return;

    const pkg = activePackage?.packageData;
    const entriesPerMonth = (pkg && "entriesPerMonth" in pkg && pkg.entriesPerMonth) || 0;
    const packageName = pkg && "name" in pkg ? (pkg.name as string) : undefined;
    const sub = accountData.user?.subscription as { lastMonthAccumulatedEntries?: number; packageId?: string } | undefined;
    const lastMonthAccumulatedEntries = sub?.lastMonthAccumulatedEntries ?? entriesPerMonth;
    const selectedPackageId = sub?.packageId != null ? String(sub.packageId) : undefined;

    const t = window.setTimeout(() => {
      const { activeModal: modalNow, modalQueue } = useModalPriorityStore.getState();
      if (modalNow || modalQueue.length > 0 || isLandingCooldownActive()) return;
      if (shouldDeferSubscriptionExplainerThisSession()) return;
      if (hasSeenExplainer(userId)) return;
      requestModal("subscription-explainer", false, {
        entriesPerMonth,
        packageName,
        userId,
        lastMonthAccumulatedEntries,
        selectedPackageId,
      });
    }, 2500);

    return () => clearTimeout(t);
  }, [userId, profileSetupCompleted, status, loading, allowSecondaryModals, accountData, requestModal, activePackage?.packageData]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOpenMembershipModal = (event: CustomEvent<{ plan?: LocalMembershipPlan }>) => {
      const plan = event.detail?.plan;
      whenGatesOpenElseGateModal(() => {
        if (plan) {
          membershipModal.setSelectedPlan(plan);
        }
        membershipModal.openModal();
      });
    };

    window.addEventListener("openMembershipModal", handleOpenMembershipModal as EventListener);
    return () => {
      window.removeEventListener("openMembershipModal", handleOpenMembershipModal as EventListener);
    };
  }, [membershipModal, whenGatesOpenElseGateModal]);

  if (status === "loading" || loading || majorDrawStatsLoading || currentMajorDrawLoading) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600 dark:border-red-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading your account...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Error Loading Account</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error instanceof Error ? error.message : "An error occurred"}</p>
          <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Please Sign In</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">You need to be signed in to view your account.</p>
          <Link href="/login" className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (!accountData) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">No Account Data</h1>
          <p className="text-gray-600 dark:text-gray-400">Unable to load your account information.</p>
        </div>
      </div>
    );
  }

  const { user } = accountData;
  const hasActiveMembership = user?.subscription?.isActive === true;
  const hasAccessToAdditionalPackages = hasAdditionalPackageAccess(accountData?.user || null, majorDrawStats);
  const membershipPackage = activePackage?.source === "subscription" ? activePackage.packageData : null;
  const isCompleted = currentMajorDraw?.status === "completed";
  const userSubscription = user.subscription as { lastMonthAccumulatedEntries?: number } | undefined;

  // Pending-renewal projection (member/failed-renewal with no membership entries yet).
  const getPendingEntries = (): EntryWalletPendingData | null => {
    if (majorDrawStatsLoading || !majorDrawStats) return null;
    const membershipEntriesInDraw = majorDrawStats?.membershipEntries ?? 0;
    const displayedMembershipEntries = isCompleted ? 0 : majorDrawStats?.membershipEntries ?? 0;
    if (membershipEntriesInDraw !== 0 || displayedMembershipEntries !== 0) return null;

    const isEligibleActive = hasActiveMembership;
    const isEligibleFailedRenewal = hasFailedRenewal(user as unknown as import("@/models/User").IUser);
    if (!isEligibleActive && !isEligibleFailedRenewal) return null;

    let expectedEntries = 0;
    if (membershipPackage && membershipPackage.type === "subscription" && "entriesPerMonth" in membershipPackage) {
      const baseEntries = (membershipPackage as { entriesPerMonth?: number }).entriesPerMonth || 0;
      const lastAccumulated = userSubscription?.lastMonthAccumulatedEntries ?? baseEntries;
      expectedEntries = lastAccumulated + baseEntries;
    } else if (userSubscription?.lastMonthAccumulatedEntries) {
      expectedEntries = userSubscription.lastMonthAccumulatedEntries;
    }

    const sub = user.subscription as { endDate?: Date | string; startDate?: Date | string } | undefined;
    let renewalDate: Date | null = null;
    if (sub) {
      if (sub.endDate) renewalDate = new Date(sub.endDate);
      else if (!isEligibleFailedRenewal && sub.startDate) renewalDate = getFallbackRenewalDate(new Date(sub.startDate));
    }

    return { expectedEntries, renewalDate, isFailedRenewal: isEligibleFailedRenewal };
  };

  const pendingEntriesData = getPendingEntries();

  const onResolvePayment = () => router.push("/my-account/settings?tab=subscription");
  const onBecomeMember = () => whenGatesOpenElseGateModal(() => membershipModal.openModal());
  const onGetPackage = () => openEntryFlow();
  const onBuyPackage = () => openWithOneTimePlan();

  return (
    <div className="min-h-screen-svh w-full min-w-0 max-w-full overflow-x-hidden pb-8">
      <DashboardHero
        acct={dash.acct}
        firstName={user.firstName}
        lastName={user.lastName}
        tierHex={dash.tierHex}
        tierLabel={dash.tierLabel}
        stateTheme={dash.stateTheme}
        partnerAccessPct={dash.partnerAccessPct}
        partnerAccessExpiryLabel={dash.partnerAccessExpiryLabel}
        onOpenSettings={() => router.push("/my-account/settings")}
        onRewardPortal={() => router.push("/my-account/benefits")}
        onBecomeMember={onBecomeMember}
        onUpdatePayment={onResolvePayment}
      />

      {dash.acct === "none" ? (
        <div className="px-4 pt-4 sm:px-6">
          <DashboardGuestPanel drawName={dash.drawName} onBecomeMember={onBecomeMember} onBuyPackage={onBuyPackage} />
        </div>
      ) : (
        <div className="px-4 pt-4 sm:px-6 lg:grid lg:grid-cols-[1.7fr_1fr] lg:items-start lg:gap-6">
          <div className="space-y-4">
            <EntryWallet
              acct={dash.acct}
              entries={dash.entries}
              tierHex={dash.tierHex}
              drawName={dash.drawName}
              drawDateIso={dash.drawDateIso}
              drawStatus={dash.drawStatus}
              pending={pendingEntriesData}
              onResolvePayment={onResolvePayment}
            />
            <DashboardPromoBanner multiplier={dash.multiplier} onGetPackage={onGetPackage} />
            <PartnerPreview acct={dash.acct} expiryLabel={dash.partnerAccessExpiryLabel} />
          </div>

          <div className="mt-4 space-y-4 lg:mt-0">
            {dash.acct === "onetime" ? (
              <section className="rounded-3xl border border-token bg-surface p-5 shadow-sm">
                <h3 className="font-['Poppins'] text-base font-extrabold text-primary-token dark:text-white">Make it permanent</h3>
                <p className="mt-1 text-sm text-muted-token">Become a member for monthly free entries and lasting partner access.</p>
                <button
                  type="button"
                  onClick={onBecomeMember}
                  className="mt-3 w-full rounded-xl bg-gradient-to-b from-red-500 to-red-700 py-2.5 text-sm font-bold text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px"
                >
                  Become a member
                </button>
              </section>
            ) : (
              <LoyaltyStreak months={dash.streakMonths} acct={dash.acct} />
            )}
            <QuickActionsGrid
              multiplier={dash.multiplier}
              onGetPackage={hasAccessToAdditionalPackages ? onGetPackage : onBecomeMember}
              onRefer={() => setIsReferFriendModalOpen(true)}
              onPastDraws={() => setIsPastDrawsModalOpen(true)}
            />
          </div>
        </div>
      )}

      <RewardsFloatingWidget userId={user._id} positionAboveBottomNav suppressSpotlight={suppressRewardsSpotlight} />

      <MembershipModal
        isOpen={membershipModal.isModalOpen}
        onClose={membershipModal.closeModal}
        selectedPlan={membershipModal.selectedPlan}
        onPlanChange={membershipModal.selectPlan}
        membershipModalConfig={
          membershipModal.openWithPackageSelectionFirst ? { showPackageSelectionFirst: true } : undefined
        }
      />

      <ReferFriendModal
        isOpen={isReferFriendModalOpen}
        onCloseAction={() => setIsReferFriendModalOpen(false)}
        userId={user._id}
        userFirstName={user.firstName}
      />

      <PastDrawsModal
        isOpen={isPastDrawsModalOpen}
        onClose={() => setIsPastDrawsModalOpen(false)}
        userId={session?.user?.id ?? ""}
      />
    </div>
  );
}
