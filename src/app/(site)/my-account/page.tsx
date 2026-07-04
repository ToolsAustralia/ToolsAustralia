"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard home. The old scaffold components (DashboardHeader, CoverBanner,
// UserInfoBar, QuickActions, SocialLinksSection, MembershipStatus, ActivePrizeDraws,
// RecentOrders, MajorDrawHeaderStrip, MajorDrawOverview, the empty EntryWallet stub,
// MembershipPackagesChart, and the components/index.ts barrel) were removed on
// 2026-07-02 after the revamp superseded them — entries-wallet logic now lives in
// sections/dashboard/EntryWallet; the hero/countdown in DrawsMajorHero.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMyAccountData } from "@/hooks/queries";
import { useUserMajorDrawStats, useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
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
import { useMemberships } from "@/hooks/useMemberships";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";
import { usePartnerDiscountSso } from "@/hooks/queries/usePartnerDiscountSso";
import { useRedeemablesWallet } from "@/hooks/queries/useRedeemablesQueries";

import DashboardHero from "@/components/sections/dashboard/DashboardHero";
import EntryWallet from "@/components/sections/dashboard/EntryWallet";
import DashboardAlertRibbon from "@/components/sections/dashboard/DashboardAlertRibbon";
import DashboardPromoBanner from "@/components/sections/dashboard/DashboardPromoBanner";
import LoyaltyStreak from "@/components/sections/dashboard/LoyaltyStreak";
import { partnerDiscountSsoEnabled } from "@/config/featureFlags";
import { isDashboardFeatureOn } from "@/config/dashboardFeatures";
import QuickActionsGrid from "@/components/sections/dashboard/QuickActionsGrid";
import PartnerPreview from "@/components/sections/dashboard/PartnerPreview";
import DashboardGuestPanel from "@/components/sections/dashboard/DashboardGuestPanel";
import DashboardLoader from "@/components/loading/DashboardLoader";

export default function MyAccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: accountData, isLoading: loading, error } = useMyAccountData(session?.user?.id);

  const { isLoading: majorDrawStatsLoading } = useUserMajorDrawStats(session?.user?.id);
  const { isLoading: currentMajorDrawLoading } = useCurrentMajorDraw();

  const dash = useDashboardState();
  const openSheet = useDashboardSheetStore((s) => s.openSheet);
  const searchParams = useSearchParams();
  const partnerSso = usePartnerDiscountSso();

  const { requestModal } = useModalPriorityStore();
  const { allowSecondaryModals } = useDashboardLandingOrchestration(
    status === "authenticated",
  );
  const { openEntryFlow, openWithOneTimePlan, membershipModal } = useMajorDrawEntryCta();
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();

  useMemberships();
  const { data: claimableWallet } = useRedeemablesWallet(session?.user?.id, { status: "claimable", limit: 20 });

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

  // Deep-link: /my-account?open=subscription|payment opens the matching overlay
  // sheet (e.g. from the global Header "Manage" action), then cleans the URL.
  React.useEffect(() => {
    const open = searchParams?.get("open");
    if (open !== "subscription" && open !== "payment") return;
    openSheet(open === "subscription" ? "manage" : "payment");
    router.replace("/my-account", { scroll: false });
  }, [searchParams, openSheet, router]);

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
    return <DashboardLoader />;
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

  const onResolvePayment = () => openSheet("manage");
  const onBecomeMember = () => whenGatesOpenElseGateModal(() => membershipModal.openModal());
  const onGetPackage = () => openEntryFlow();
  const onBuyPackage = () => openWithOneTimePlan();

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden pb-8">
      {/* subscription-derived tier so a past-due member's chip reads their real tier (e.g. "Boss"),
          not "Plan" — dash.tierKey is null for past-due (getActivePackage gates on isActive). */}
      <DashboardHero
        acct={dash.acct}
        firstName={user.firstName}
        lastName={user.lastName}
        tierKey={dash.subscriptionTierKey}
        tierHex={dash.subscriptionTierHex}
        tierLabel={dash.subscriptionTierLabel}
        stateTheme={dash.stateTheme}
        partnerAccessPct={dash.partnerAccessPct}
        partnerAccessExpiryLabel={dash.partnerAccessExpiryLabel}
        profileComplete={Boolean(user.profileSetupCompleted && user.birthdate)}
        onOpenSettings={() => router.push("/my-account/settings")}
        onRewardPortal={partnerDiscountSsoEnabled() ? () => partnerSso.mutate() : undefined}
        onBecomeMember={() => router.push("/my-account/membership")}
        onUpdatePayment={onResolvePayment}
        onCompleteProfile={() => requestModal("user-setup", true)}
      />

      {dash.acct === "none" ? (
        <div className="px-[18px] pt-4 sm:px-6 lg:px-[26px] lg:pt-[26px]">
          <DashboardGuestPanel drawName={dash.drawName} onBecomeMember={onBecomeMember} onBuyPackage={onBuyPackage} />
        </div>
      ) : (
        <div className="px-[18px] sm:px-6 lg:px-[26px] lg:pt-[26px]">
          <div className="-mt-8 lg:mt-0 lg:grid lg:grid-cols-[1.7fr_1fr] lg:items-start lg:gap-[22px]">
            {/* main column */}
            <div className="space-y-4 lg:space-y-5">
              <DashboardAlertRibbon acct={dash.acct} />
              <EntryWallet
                acct={dash.acct}
                entries={{ membership: dash.entries.membership, oneTime: dash.entries.oneTime }}
                tierHex={dash.tierHex}
                drawName={dash.drawName}
                drawDateIso={dash.drawDateIso}
                drawStatus={dash.drawStatus}
                renewalDateIso={dash.renewalDateIso}
                entriesPerRenewal={dash.membershipEntriesPerRenewal}
              />
              <DashboardPromoBanner multiplier={dash.multiplier} hasAdditionalAccess={dash.hasAdditionalAccess} onGetPackage={onGetPackage} className="lg:hidden" />
              <DashboardPromoBanner multiplier={dash.multiplier} hasAdditionalAccess={dash.hasAdditionalAccess} onGetPackage={onGetPackage} wide className="hidden lg:block" />
              <PartnerPreview acct={dash.acct} partnerAccessPct={dash.partnerAccessPct} expiryLabel={dash.partnerAccessExpiryLabel} tierHex={dash.tierHex} className="hidden lg:block" />
            </div>

            {/* aside column */}
            <div className="mt-4 space-y-4 lg:mt-0 lg:space-y-5">
              {dash.acct === "onetime" ? (
                <section className="rounded-[1.1rem] border border-token bg-surface p-5 shadow-sm">
                  <h3 className="font-['Poppins'] text-base font-extrabold text-primary-token dark:text-white">Keep your partner discounts</h3>
                  <p className="mt-1 text-sm text-muted-token">Membership keeps partner discounts on your account for good, adds more free entries every month, and unlocks member-only bonus offers.</p>
                  <button
                    type="button"
                    onClick={onBecomeMember}
                    className="mt-3 w-full rounded-xl bg-gradient-to-b from-red-500 to-red-700 py-2.5 text-sm font-bold text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px"
                  >
                    Become a member
                  </button>
                </section>
              ) : isDashboardFeatureOn("loyaltyStreak") ? (
                <LoyaltyStreak months={dash.streakMonths} acct={dash.acct} />
              ) : null}
              <QuickActionsGrid
                multiplier={dash.multiplier}
                hasAdditionalAccess={dash.hasAdditionalAccess}
                redeemCount={claimableWallet?.wallet?.filter((i) => i.isRedeemableNow).length ?? 0}
                // openEntryFlow already routes every state correctly (additional-access → packs modal;
                // blocking-sub/past-due → pre-selects a one-time pack; non-member → Tradie sub). The old
                // `? onBecomeMember` fallback mis-sent a past-due member into a subscribe intent (409).
                onGetPackage={onGetPackage}
                onRefer={() => setIsReferFriendModalOpen(true)}
                onPastDraws={() => setIsPastDrawsModalOpen(true)}
              />
            </div>

            {/* partner preview — mobile renders it last (matches prototype order) */}
            <PartnerPreview acct={dash.acct} partnerAccessPct={dash.partnerAccessPct} expiryLabel={dash.partnerAccessExpiryLabel} tierHex={dash.tierHex} className="mt-4 lg:hidden" />
          </div>
        </div>
      )}

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
