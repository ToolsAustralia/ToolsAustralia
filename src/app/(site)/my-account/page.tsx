"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useMyAccountData } from "@/hooks/queries";
import { useUserMajorDrawStats, useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { getActivePackage, type ActivePackageUserInput } from "@/utils/membership/get-active-package";

import PartnerDiscountQueue from "@/components/features/PartnerDiscountQueue";
import UnlockDiscounts from "@/components/sections/promo/UnlockDiscounts";
import { hasActivePartnerDiscountAccess } from "@/utils/membership/benefit-resolution";
import { derivePlanIdFromPackage, getLandingPageThemeFromPlanId } from "@/utils/package-colors/packageColorScheme";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import MembershipModal from "@/components/modals/MembershipModal";
import ReferFriendModal from "@/components/modals/ReferFriendModal";
import PastDrawsModal from "@/components/modals/PastDrawsModal";
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
import PackageDetailModal, {
  type PackageDetailModalPackageData,
  type SubscriptionAccumulationData,
} from "@/components/modals/PackageDetailModal";
import { useMemberships } from "@/hooks/useMemberships";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import RewardsFloatingWidget from "@/components/features/RewardsFloatingWidget";
import { useDashboardEntryDisplay } from "@/hooks/useDashboardEntryDisplay";

import DashboardHeader from "./components/DashboardHeader";
import CoverBanner from "./components/CoverBanner";
import UserInfoBar from "./components/UserInfoBar";
import QuickActions from "./components/QuickActions";
import MajorDrawOverview from "./components/MajorDrawOverview";
import SocialLinksSection from "./components/SocialLinksSection";

type PendingEntriesData = {
  expectedEntries: number;
  renewalDate: Date | null;
  isFailedRenewal: boolean;
  isPending: true;
};

function PartnerDiscountsSection({ user, className }: { user: import("@/hooks/queries/useUserQueries").UserData; className?: string }) {
  const hasAccess = hasActivePartnerDiscountAccess(user as unknown as import("@/models/User").IUser);
  const activePackage = getActivePackage(user as ActivePackageUserInput);

  let packageTheme: ReturnType<typeof getLandingPageThemeFromPlanId> | undefined;
  if (hasAccess) {
    if (activePackage.source === "subscription" && activePackage.packageData) {
      const planId = derivePlanIdFromPackage(activePackage.packageData, "subscription");
      packageTheme = getLandingPageThemeFromPlanId(planId, true);
    } else if (user?.enrichedOneTimePackages?.length) {
      const queue = (user as { partnerDiscountQueue?: Array<{ packageId: string; packageType: string; status: string }> }).partnerDiscountQueue ?? [];
      const activeIds = new Set(
        queue
          .filter((i) => i.status === "active" && ["one-time", "mini-draw", "upsell"].includes(i.packageType))
          .map((i) => String(i.packageId))
      );
      const pkg = user.enrichedOneTimePackages
        .filter((p) => p.isActive && p.packageData && activeIds.has(String(p.packageId)))
        .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0];
      if (pkg?.packageData) {
        const planId = derivePlanIdFromPackage(pkg.packageData, "one-time");
        packageTheme = getLandingPageThemeFromPlanId(planId, false);
      }
    }
  }

  return (
    <UnlockDiscounts
      hasAccess={hasAccess}
      showUnlockButton={!hasAccess}
      title={hasAccess ? "Partner Discounts" : "Unlock Partner Discounts"}
      description={
        hasAccess
          ? "Access exclusive discounts from Australia's top tool brands"
          : "Get instant access to exclusive discounts from Australia's top tool brands"
      }
      packageTheme={packageTheme}
      className={className}
    />
  );
}

export default function MyAccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const {
    data: accountData,
    isLoading: loading,
    error,
  } = useMyAccountData(session?.user?.id);

  const { data: majorDrawStats, isLoading: majorDrawStatsLoading } = useUserMajorDrawStats(session?.user?.id);
  const { data: currentMajorDraw, isLoading: currentMajorDrawLoading } = useCurrentMajorDraw();

  const isDrawCompletedForDashboard = currentMajorDraw?.status === "completed";
  const dashboardEntries = useDashboardEntryDisplay(majorDrawStats, {
    isDrawCompleted: Boolean(isDrawCompletedForDashboard),
  });

  const { requestModal } = useModalPriorityStore();
  const { allowSecondaryModals, suppressRewardsSpotlight } = useDashboardLandingOrchestration(
    status === "authenticated"
  );
  const { openEntryFlow, openWithOneTimePlan, membershipModal } = useMajorDrawEntryCta();
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();

  useMemberships();
  useResolvedMultiplier("membership-packages", "display");

  const activePackage = React.useMemo(() => {
    const u = accountData?.user;
    if (!u) return null;
    return getActivePackage(u as ActivePackageUserInput);
  }, [accountData]);

  const [isReferFriendModalOpen, setIsReferFriendModalOpen] = useState(false);
  const [isPastDrawsModalOpen, setIsPastDrawsModalOpen] = useState(false);

  const [packageDetailModalOpen, setPackageDetailModalOpen] = useState(false);
  const [packageDetailModalData, setPackageDetailModalData] = useState<{
    packageData: PackageDetailModalPackageData;
    membershipType: "subscription" | "one-time";
    accumulation: SubscriptionAccumulationData | null;
  } | null>(null);

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
    if (modalTriggeredRef.current) {
      return;
    }

    if (status === "loading" || loading || !session || !accountData) {
      return;
    }

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
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600 dark:border-red-500 mx-auto mb-4"></div>
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
          <button
            onClick={() => window.location.reload()}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
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

  const membershipPackage = activePackage?.packageData ?? null;
  const showMembershipBadge = Boolean(activePackage?.isActive && membershipPackage);

  const isCompleted = currentMajorDraw?.status === "completed";
  const _isFrozen = currentMajorDraw?.status === "frozen";
  const _isActive = currentMajorDraw?.status === "active";
  const _isQueued = currentMajorDraw?.status === "queued";

  const userSubscription = user.subscription as { lastMonthAccumulatedEntries?: number } | undefined;
  const displayMembershipEntries = dashboardEntries.membershipEntries;
  const displayOneTimeEntries = dashboardEntries.oneTimeEntries;
  const displayTotalEntries = dashboardEntries.currentDrawEntries;

  const getProjectionData = () => {
    if (!hasActiveMembership || !membershipPackage || !userSubscription) return null;

    if (membershipPackage.type !== "subscription" || !("entriesPerMonth" in membershipPackage)) return null;

    const baseEntries = (membershipPackage as { entriesPerMonth?: number }).entriesPerMonth || 0;
    const current = userSubscription.lastMonthAccumulatedEntries ?? baseEntries;

    if (baseEntries === 0) return null;

    const nextMonth = current + baseEntries;
    const month3 = nextMonth + baseEntries;

    return {
      current,
      nextMonth,
      month3,
    };
  };

  const projectionData = getProjectionData();

  const getPendingEntries = (): PendingEntriesData | null => {
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
      if (sub.endDate) {
        renewalDate = new Date(sub.endDate);
      } else if (!isEligibleFailedRenewal && sub.startDate) {
        renewalDate = getFallbackRenewalDate(new Date(sub.startDate));
      }
    }

    return {
      expectedEntries,
      renewalDate,
      isFailedRenewal: isEligibleFailedRenewal,
      isPending: true,
    };
  };

  const pendingEntriesData = getPendingEntries();

  const queue = (user as { partnerDiscountQueue?: Array<{ packageId: string; packageType: string; status: string }> }).partnerDiscountQueue ?? [];
  const activeOneTimePackageIds = new Set(
    queue
      .filter((item) => item.status === "active" && ["one-time", "mini-draw", "upsell"].includes(item.packageType))
      .map((item) => String(item.packageId))
  );

  // Show all active one-time packages (not just those in partner discount queue)
  // Prefer enrichedOneTimePackages from API; fallback to legacy oneTimePackages with minimal packageData
  const enrichedOneTime = (user.enrichedOneTimePackages ?? []).filter((pkg) => pkg.isActive);
  const legacyOneTime = (user.oneTimePackages ?? []).filter((pkg) => pkg.isActive);
  const visibleOneTimePackages = (
    enrichedOneTime.length > 0 ? enrichedOneTime : legacyOneTime.map((pkg) => ({
      ...pkg,
      packageId: String(pkg.packageId),
      packageData: { _id: String(pkg.packageId), name: "One-Time Package", type: "one-time" as const },
    }))
  ).map((pkg) =>
    pkg.packageData
      ? pkg
      : { ...pkg, packageData: { _id: String(pkg.packageId), name: "One-Time Package", type: "one-time" as const } }
  );

  return (
    <div className="min-h-screen-svh w-full min-w-0 max-w-full overflow-x-hidden bg-gray-50 dark:bg-neutral-950">
      <DashboardHeader showRenewalAlert={hasFailedRenewal(user as unknown as import("@/models/User").IUser)} />

      <CoverBanner />

      <UserInfoBar
        firstName={user.firstName}
        lastName={user.lastName}
        email={user.email}
        membershipPackage={membershipPackage}
        showMembershipBadge={showMembershipBadge}
      />

      <QuickActions
        onReferFriend={() => setIsReferFriendModalOpen(true)}
        onGetMoreEntries={() => openEntryFlow()}
        showGetMoreEntries={hasAccessToAdditionalPackages}
        className="mt-3 sm:mt-4"
      />

      <MajorDrawOverview
        drawName={currentMajorDraw?.name || "Major Draw"}
        drawStatus={currentMajorDraw?.status || "active"}
        drawDate={currentMajorDraw?.drawDate}
        totalEntries={displayTotalEntries}
        membershipEntries={displayMembershipEntries}
        oneTimeEntries={displayOneTimeEntries}
        membershipPackage={membershipPackage}
        oneTimePackages={visibleOneTimePackages}
        hasActiveSubscription={hasActiveMembership}
        onViewPastDraws={() => setIsPastDrawsModalOpen(true)}
        onBadgeClick={(data) => {
          setPackageDetailModalData(data);
          setPackageDetailModalOpen(true);
        }}
        onOneTimeCardClick={openWithOneTimePlan}
        projectionData={projectionData}
        pendingEntriesData={pendingEntriesData}
        onResolvePayment={() => router.push("/my-account/settings?tab=subscription")}
        userSubscription={userSubscription}
        activeOneTimePackageIds={activeOneTimePackageIds}
        className="mt-4 sm:mt-6"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 sm:mt-8 space-y-6 sm:space-y-8">
        <div>
          <PartnerDiscountQueue />
        </div>
      </div>

      <div className="my-account-partner-discounts">
        <PartnerDiscountsSection user={user} className="!pb-0 !mb-0" />
      </div>

      <SocialLinksSection className="mt-6 sm:mt-8 mb-6 sm:mb-8" />

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

      {packageDetailModalData && (
        <PackageDetailModal
          isOpen={packageDetailModalOpen}
          onClose={() => {
            setPackageDetailModalOpen(false);
            setPackageDetailModalData(null);
          }}
          packageData={packageDetailModalData.packageData}
          membershipType={packageDetailModalData.membershipType}
          accumulation={packageDetailModalData.accumulation}
          hasActiveSubscription={hasActiveMembership}
          hasAccessToAdditionalPackages={hasAccessToAdditionalPackages}
          onOpenSettingsSubscription={() => router.push("/my-account/settings?tab=subscription")}
          onOpenMembershipModal={() => membershipModal.openModalWithPackageSelectionFirst()}
          onOpenSpecialPackages={() =>
            whenGatesOpenElseGateModal(() => requestModal("special-packages", true))
          }
        />
      )}

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
