"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useMyAccountData } from "@/hooks/queries";
import { useUserMajorDrawStats, useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { queryKeys } from "@/lib/queryKeys";
import MembershipSection from "@/components/sections/MembershipSection";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";

import PrizeShowcase from "@/components/sections/promo/PrizeShowcase";
import PartnerDiscountQueue from "@/components/features/PartnerDiscountQueue";
import UnlockDiscounts from "@/components/sections/promo/UnlockDiscounts";
import LatestWinnerHero from "@/components/sections/LatestWinnerHero";
import WinnerTestimonySection from "@/components/sections/WinnerTestimonySection";
import { hasActivePartnerDiscountAccess } from "@/utils/membership/benefit-resolution";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import MembershipModal from "@/components/modals/MembershipModal";
import SettingsModal from "@/components/modals/SettingsModal";
import ReferFriendModal from "@/components/modals/ReferFriendModal";
import RenewalFailedModal from "@/components/modals/RenewalFailedModal";
import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";
import { hasPreservedBenefits, getDaysUntilBenefitsExpire } from "@/utils/membership/benefit-resolution";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";
import { hasSeenExplainer, markExplainerSeen } from "@/utils/subscription-explainer-storage";
import { formatRenewalDate, getFallbackRenewalDate } from "@/utils/dates/month-helpers";
import { AlertTriangle, Clock, Share2, Info, CheckCircle, Sparkles, ArrowLeft } from "lucide-react";
import { useMiniDraws } from "@/hooks/queries/useMiniDrawQueries";
import ProductCard from "@/components/ui/ProductCard";
import MembershipBadge from "@/components/ui/MembershipBadge";
import MonthProjectionTooltip from "@/components/ui/MonthProjectionTooltip";
import PackageDetailModal, {
  type PackageDetailModalPackageData,
  type SubscriptionAccumulationData,
} from "@/components/modals/PackageDetailModal";
import { getPackageById } from "@/data/membershipPackages";
import { useMemberships } from "@/hooks/useMemberships";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";

/** Pending entries display data when user has active/failed-renewal but 0 entries in draw */
type PendingEntriesData = {
  expectedEntries: number;
  renewalDate: Date | null;
  isFailedRenewal: boolean;
  isPending: true;
};

// Partner Discounts Section Component
// Conditionally renders UnlockDiscounts based on user's partner discount access
function PartnerDiscountsSection({ user }: { user: import("@/hooks/queries/useUserQueries").UserData }) {
  // Check if user has active partner discount access
  const hasAccess = hasActivePartnerDiscountAccess(user as unknown as import("@/models/User").IUser);

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
    />
  );
}

// Simple countdown display component for the badge
function CountdownDisplay({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = React.useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  React.useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const target = new Date(targetDate).getTime();
      const difference = target - now;

      if (difference > 0) {
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);

        setTimeLeft({ days, hours, minutes, seconds });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  if (timeLeft.days > 0) {
    return (
      <div className="text-white font-bold text-xs sm:text-sm">
        {timeLeft.days}d {timeLeft.hours}h
      </div>
    );
  } else if (timeLeft.hours > 0) {
    return (
      <div className="text-white font-bold text-xs sm:text-sm">
        {timeLeft.hours}h {timeLeft.minutes}m
      </div>
    );
  } else if (timeLeft.minutes > 0) {
    return (
      <div className="text-white font-bold text-xs sm:text-sm">
        {timeLeft.minutes}m {timeLeft.seconds}s
      </div>
    );
  } else {
    return <div className="text-white font-bold text-xs sm:text-sm">{timeLeft.seconds}s</div>;
  }
}

export default function MyAccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    data: accountData,
    isLoading: loading,
    error,
    refetch: refetchAccountData,
  } = useMyAccountData(session?.user?.id);

  // Add real-time major draw data
  const { data: majorDrawStats, isLoading: majorDrawStatsLoading } = useUserMajorDrawStats(session?.user?.id);
  const { data: currentMajorDraw, isLoading: currentMajorDrawLoading } = useCurrentMajorDraw();

  // Add membership hooks
  const membershipModal = useMembershipModal();
  const { requestModal, activeModal, closeModal } = useModalPriorityStore();
  const { openEntryFlow } = useMajorDrawEntryCta();

  // Fetch 8 most recent active mini-draws
  const { data: miniDrawsData, isLoading: miniDrawsLoading } = useMiniDraws({
    page: 1,
    limit: 8,
    status: "active",
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  // Fetch winners for testimony section
  const [winners, setWinners] = React.useState<Array<{
    id: string;
    drawId: string;
    drawName: string;
    drawType: "major" | "mini";
    prize: {
      name: string;
      description: string;
      value: number;
      images: string[];
    };
    winnerFirstName: string;
    winnerLastName: string;
    winnerState?: string;
    imageUrl?: string;
    selectedDate: string;
    testimony?: string;
    selectedPrize?: string;
    cycle: number;
  }>>([]);
  const [winnersLoading, setWinnersLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchWinners = async () => {
      try {
        const response = await fetch("/api/winners/all?limit=100");
        const data = await response.json();

        if (data.success && data.winners) {
          setWinners(data.winners);
        }
      } catch (error) {
        console.error("Error fetching winners:", error);
      } finally {
        setWinnersLoading(false);
      }
    };

    fetchWinners();
  }, []);

  // Get membership packages and promo for modal integration
  const { subscriptionPackages } = useMemberships();
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const membershipPromoMultiplier = resolvedMembershipMultiplier ?? 1;

  const isRewardsFeatureEnabled = rewardsEnabled();
  const rewardsPauseMessage = rewardsDisabledMessage();

  // Local state for subscription management modal
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [openSettingsToSubscription, setOpenSettingsToSubscription] = useState(false);
  const [isReferFriendModalOpen, setIsReferFriendModalOpen] = useState(false);
  const [isRenewalFailedModalOpen, setIsRenewalFailedModalOpen] = useState(false);

  // State for accumulation tooltip
  const [showAccumulationTooltip, setShowAccumulationTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  // Package detail modal (badge click)
  const [packageDetailModalOpen, setPackageDetailModalOpen] = useState(false);
  const [packageDetailModalData, setPackageDetailModalData] = useState<{
    packageData: PackageDetailModalPackageData;
    membershipType: "subscription" | "one-time";
    accumulation: SubscriptionAccumulationData | null;
  } | null>(null);

  const searchParams = useSearchParams();
  // Open Settings with Subscription tab when navigating from Header "Manage membership"
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (searchParams?.get("open") === "subscription") {
      setOpenSettingsToSubscription(true);
      setIsSettingsModalOpen(true);
      window.history.replaceState({}, "", "/my-account");
    }
  }, [searchParams]);

  // Redirect if not authenticated
  React.useEffect(() => {
    if (status === "loading") return; // Still loading
    if (!session) {
      router.push("/login");
    }
  }, [session, status, router]);

  // Invalidate and refetch queries when session becomes available (after login)
  React.useEffect(() => {
    if (status === "authenticated" && session?.user?.id) {
      // Invalidate all user-related queries to ensure fresh data after login
      const userId = session.user.id;
      queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.majorDraw.userStats(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rewards.user(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });

      // Also refetch account data immediately
      refetchAccountData();
    }
  }, [status, session?.user?.id, queryClient, refetchAccountData]);

  // Add ref to prevent multiple triggers
  const modalTriggeredRef = React.useRef(false);

  React.useEffect(() => {
    if (!session || !accountData) return;
    if (typeof window === "undefined") return;

    const shouldShowReferFriend = sessionStorage.getItem("showReferFriendAfterSetup");
    if (shouldShowReferFriend === "true") {
      sessionStorage.removeItem("showReferFriendAfterSetup");
      setTimeout(() => setIsReferFriendModalOpen(true), 600);
    }
  }, [session, accountData]);

  // Trigger user setup modal only for users who need setup
  React.useEffect(() => {
    // Prevent multiple triggers
    if (modalTriggeredRef.current) {
      // console.log("🚫 Modal already triggered this session, skipping");
      return;
    }

    if (status === "loading" || loading || !session || !accountData) {
      // console.log("⏳ Still loading data...", {
      //   status,
      //   loading,
      //   hasSession: !!session,
      //   hasAccountData: !!accountData,
      // });
      return;
    }

    // Check if setup was just completed (prevent re-triggering after page reload)
    const setupJustCompleted = sessionStorage.getItem("setupJustCompleted");
    if (setupJustCompleted) {
      // console.log("✅ Setup just completed, skipping modal trigger");
      sessionStorage.removeItem("setupJustCompleted");
      return;
    }

    // CRITICAL FIX: Check sessionStorage FIRST (always available, fixes tab-switching bug)
    // Don't rely on Zustand store which may not be hydrated yet in production
    const pendingUpsellFlag = sessionStorage.getItem("pendingUpsellFlag");
    const pendingUpsellDataStr = sessionStorage.getItem("pendingUpsell");

    // console.log("🔍 Checking for pending upsell:", {
    //   sessionStorageFlag: pendingUpsellFlag,
    //   hasSessionData: !!pendingUpsellDataStr,
    //   allSessionStorageKeys: Object.keys(sessionStorage),
    //   setupJustCompleted: sessionStorage.getItem("setupJustCompleted"),
    // });

    // Parse upsell data from sessionStorage if available
    let upsellData = null;
    if (pendingUpsellDataStr) {
      try {
        upsellData = JSON.parse(pendingUpsellDataStr);
        // console.log("✅ Parsed upsell data from sessionStorage");
      } catch (e) {
        console.error("❌ Failed to parse pending upsell data:", e);
        sessionStorage.removeItem("pendingUpsell");
        sessionStorage.removeItem("pendingUpsellFlag");
      }
    }

    // Determine modal to show
    if (pendingUpsellFlag === "true" && upsellData) {
      // CRITICAL: Show UPSELL FIRST for new users (matching development behavior)
      // console.log("🎯 Pending upsell detected, showing UPSELL FIRST");
      requestModal("upsell", true, upsellData);
      modalTriggeredRef.current = true;

      // Queue user setup to show after upsell closes (if setup incomplete)
      if (!accountData.user.profileSetupCompleted) {
        // console.log("📋 User-setup queued to show AFTER upsell closes");
        // UpsellModal's handleClose will trigger user-setup after upsell closes
      }
    } else if (!accountData.user.profileSetupCompleted) {
      // No pending upsell, show user setup modal directly
      // console.log("🎯 No pending upsell, showing user-setup directly");
      requestModal("user-setup", true);
      modalTriggeredRef.current = true;
    } else {
      // console.log("✅ User setup already completed, no modals needed");
    }
  }, [status, loading, session, accountData, requestModal]);

  // Subscription explainer: one-time per account, active subscribers only, after higher-priority modals
  const userId = session?.user?.id;
  const profileSetupCompleted = accountData?.user?.profileSetupCompleted;
  React.useEffect(() => {
    if (typeof window === "undefined" || !userId || !accountData) return;
    if (status === "loading" || loading || activeModal) return;
    if (accountData.user?.subscription?.isActive !== true) return;
    if (hasFailedRenewal(accountData.user as unknown as import("@/models/User").IUser)) return;
    if (hasSeenExplainer(userId)) return;
    if (!profileSetupCompleted) return;
    if (sessionStorage.getItem("pendingUpsellFlag") === "true") return;

    const pkg = accountData.user?.subscriptionPackageData || accountData.user?.enrichedOneTimePackages?.find((p: { isActive: boolean }) => p.isActive)?.packageData;
    const entriesPerMonth = (pkg && "entriesPerMonth" in pkg && pkg.entriesPerMonth) || 0;
    const packageName = pkg && "name" in pkg ? (pkg.name as string) : undefined;
    const sub = accountData.user?.subscription as { lastMonthAccumulatedEntries?: number; packageId?: string } | undefined;
    const lastMonthAccumulatedEntries = sub?.lastMonthAccumulatedEntries ?? entriesPerMonth;
    const selectedPackageId = sub?.packageId != null ? String(sub.packageId) : undefined;

    requestModal("subscription-explainer", false, {
      entriesPerMonth,
      packageName,
      userId,
      lastMonthAccumulatedEntries,
      selectedPackageId,
    });
  }, [userId, profileSetupCompleted, status, loading, activeModal, accountData, requestModal]);

  // Show loading while checking authentication or fetching data
  if (status === "loading" || loading || majorDrawStatsLoading || currentMajorDrawLoading) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your account...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Error Loading Account</h1>
          <p className="text-gray-600 mb-4">{error instanceof Error ? error.message : "An error occurred"}</p>
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

  // Show not authenticated state
  if (!session) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Please Sign In</h1>
          <p className="text-gray-600 mb-4">You need to be signed in to view your account.</p>
          <Link href="/login" className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  // Show no data state
  if (!accountData) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">No Account Data</h1>
          <p className="text-gray-600">Unable to load your account information.</p>
        </div>
      </div>
    );
  }

  const { user } = accountData;

  // Map mini draws to include fields required by ProductCard (must be after user is extracted)
  const hasActiveMembership = user?.subscription?.isActive === true;

  // Check if user has access to additional packages (subscription OR current draw entries)
  // Use accountData.user as userData since we're already using accountData
  const hasAccessToAdditionalPackages = hasAdditionalPackageAccess(accountData?.user || null, majorDrawStats);

  // Get user's mini draw participation IDs for prioritization
  // Type assertion to access miniDrawParticipation which may not be in the UserData type
  const userWithParticipation = user as unknown as {
    miniDrawParticipation?: Array<{
      miniDrawId: unknown;
      totalEntries: number;
    }>;
  };

  const userParticipatingMiniDrawIds = new Set(
    (userWithParticipation?.miniDrawParticipation || [])
      .filter((p) => p.totalEntries > 0)
      .map((p) => {
        // Handle both string and ObjectId formats
        const miniDrawId = p.miniDrawId;
        if (typeof miniDrawId === "string") {
          return miniDrawId;
        }
        if (miniDrawId && typeof miniDrawId === "object") {
          // Check if it has toString method (ObjectId-like)
          if ("toString" in miniDrawId && typeof (miniDrawId as { toString: () => string }).toString === "function") {
            return (miniDrawId as { toString: () => string }).toString();
          }
          // Check if it has _id property
          if ("_id" in miniDrawId) {
            const idValue = (miniDrawId as { _id: unknown })._id;
            if (typeof idValue === "string") {
              return idValue;
            }
            if (idValue && typeof idValue === "object" && "toString" in idValue) {
              return (idValue as { toString: () => string }).toString();
            }
          }
        }
        return "";
      })
      .filter((id) => id !== "")
  );

  // Map and categorize mini draws
  const allActiveMiniDraws = (miniDrawsData?.miniDraws || []).map((miniDraw) => {
    const totalEntries = miniDraw.totalEntries || 0;
    const minimumEntries = miniDraw.minimumEntries || 0;
    const entriesRemaining =
      miniDraw.entriesRemaining !== undefined ? miniDraw.entriesRemaining : Math.max(minimumEntries - totalEntries, 0);

    // Check if user is a participant in this mini draw
    const miniDrawId =
      typeof miniDraw._id === "string"
        ? miniDraw._id
        : miniDraw._id && typeof miniDraw._id === "object" && "toString" in miniDraw._id
        ? (miniDraw._id as { toString: () => string }).toString()
        : String(miniDraw._id);
    const isParticipant = userParticipatingMiniDrawIds.has(miniDrawId);

    return {
      ...miniDraw,
      totalEntries,
      minimumEntries,
      entriesRemaining,
      requiresMembership: false, // ✅ AUTHENTICATION-ONLY: Mini draws available to all authenticated users
      hasActiveMembership,
      isParticipant, // Flag to indicate user is participating
    };
  });

  // Separate into participant and non-participant draws
  const participantMiniDraws = allActiveMiniDraws.filter((draw) => draw.isParticipant);
  const otherMiniDraws = allActiveMiniDraws.filter((draw) => !draw.isParticipant);

  // Combine: participant draws first, then others
  const activeMiniDraws = [...participantMiniDraws, ...otherMiniDraws];

  // Membership card shows subscription package only (never one-time). One-time badges go in One-time card.
  const membershipPackage = user.subscriptionPackageData ?? null;

  /**
   * Check if user has active membership that includes "Mini Draws" feature
   * This determines if user is automatically entered in all minidraws
   */
  const checkMembershipIncludesMiniDraws = (): boolean => {
    // Check if user has active subscription
    if (!user.subscription?.isActive || !user.subscription?.packageId) {
      return false;
    }

    // Get package details
    const packageId = user.subscription.packageId.toString();
    const packageData = getPackageById(packageId);

    if (!packageData) {
      return false;
    }

    // Check if package features include "Mini Draws"
    const includesMiniDraws = packageData.features.some((feature) => feature.toLowerCase().includes("mini draw"));

    return includesMiniDraws;
  };

  const hasMembershipWithMiniDraws = checkMembershipIncludesMiniDraws();

  // Calculate draw status and timing information (needed early for displayMembershipEntries)
  const isCompleted = currentMajorDraw?.status === "completed";
  const isFrozen = currentMajorDraw?.status === "frozen";
  const isActive = currentMajorDraw?.status === "active";
  const isQueued = currentMajorDraw?.status === "queued";

  // Use actual membership entries from the current draw (not accumulated from previous months)
  // This shows what's actually in the current draw, not historical accumulation
  const userSubscription = user.subscription as { lastMonthAccumulatedEntries?: number } | undefined;
  // During completed state: don't show membership entries (they're from the previous draw)
  // During queued/active/frozen state: show actual membership entries in the current draw
  // Always use majorDrawStats.membershipEntries (actual draw entries) instead of lastMonthAccumulatedEntries
  const displayMembershipEntries = isCompleted
    ? 0
    : majorDrawStats?.membershipEntries ?? 0;
  const displayOneTimeEntries = majorDrawStats?.oneTimeEntries || 0;
  const displayTotalEntries = majorDrawStats?.currentDrawEntries || 0;

  // Get projection data for tooltip
  const getProjectionData = () => {
    if (!hasActiveMembership || !membershipPackage || !userSubscription) return null;

    // membershipPackage is subscription-only; no one-time fallback
    // Check if package has entriesPerMonth (subscription packages only)
    if (membershipPackage.type !== "subscription" || !("entriesPerMonth" in membershipPackage)) return null;

    const baseEntries = (membershipPackage as { entriesPerMonth?: number }).entriesPerMonth || 0;
    const current = userSubscription.lastMonthAccumulatedEntries ?? baseEntries;

    if (baseEntries === 0) return null;

    // Calculate: Current, Next Month, Month 3
    const nextMonth = current + baseEntries;
    const month3 = nextMonth + baseEntries;

    return {
      current,
      nextMonth,
      month3,
    };
  };

  const projectionData = getProjectionData();

  // Check if current user is the winner
  const isWinner = currentMajorDraw?.winner?.userId?.toString() === session?.user?.id;

  // Calculate pending entries: (A) active subscribers or (B) failed-renewal users with 0 entries in draw
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
    if (!isEligibleFailedRenewal && sub) {
      if (sub.endDate) {
        renewalDate = new Date(sub.endDate);
      } else if (sub.startDate) {
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

  // Debug logging for entry calculation
  // console.log("📊 My Account - Entry Display Logic:", {
  //   currentMajorDraw: currentMajorDraw,
  //   majorDrawStats: majorDrawStats,
  //   displaying: {
  //     total: displayTotalEntries,
  //     membership: displayMembershipEntries,
  //     oneTime: displayOneTimeEntries,
  //   },
  //   drawStatus: {
  //     status: currentMajorDraw?.status,
  //     isCompleted,
  //     isFrozen,
  //     isActive,
  //     isQueued,
  //     daysRemaining,
  //     isWinner,
  //   },
  //   note: "Now showing only current major draw entries (not accumulated total)",
  // });

  return (
    <div className="min-h-screen-svh bg-gray-50 w-full overflow-hidden">
      {/* Premium Dashboard Hero Section */}
      <div className="relative bg-gradient-to-br from-[#ee0000] via-red-600 to-red-700 pt-[86px] sm:pt-[106px] overflow-hidden">
        {/* Premium Background Effects */}
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent via-transparent to-black/20"></div>

        {/* Floating Elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-white/10 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-16 h-16 bg-yellow-400/20 rounded-full blur-lg animate-pulse delay-1000"></div>
        <div className="absolute bottom-20 left-1/4 w-12 h-12 bg-white/15 rounded-full blur-md animate-pulse delay-2000"></div>

        <div className="relative max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 ">
          <div className="w-full">
            {/* Premium Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between pb-8 gap-6">
              {/* Welcome Section */}
              <div className=" lg:text-left lg:flex-[2] lg:max-w-2xl px-4">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold font-['Poppins'] mb-4 text-white leading-tight">
                  Welcome back,
                  <br />
                  <span className="bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
                    {user.firstName}!
                  </span>
                </h1>
                <p className="text-white/80 text-base sm:text-lg lg:text-xl  max-w-lg">
                  Manage your entries, track your progress, and boost your winning chances.
                </p>

                {/* Desktop Only - Manage Membership Buttons */}
                <div className="hidden lg:flex flex-row gap-3 my-5">
                  <button
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="group relative bg-gradient-to-r from-white/20 to-white/10 backdrop-blur-sm border border-white/30 text-white px-6 py-3 rounded-xl font-semibold hover:from-white/30 hover:to-white/20 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      Settings
                      {hasFailedRenewal(user as unknown as import("@/models/User").IUser) && (
                        <AlertTriangle
                          className="w-4 h-4 text-amber-300 drop-shadow-[0_0_4px_rgba(0,0,0,0.5)] animate-pulse"
                          strokeWidth={2.5}
                          aria-hidden
                        />
                      )}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/20 to-orange-400/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </button>

                  <button
                    onClick={() => setIsReferFriendModalOpen(true)}
                    className="group relative bg-gradient-to-r from-yellow-300 via-amber-300 to-orange-400 text-black px-6 py-3 rounded-xl font-semibold hover:from-yellow-400 hover:to-orange-500 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <Share2 className="w-4 h-4" />
                      Refer a Friend
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-white/40 to-white/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </button>

                  {hasAccessToAdditionalPackages && (
                    <button
                      onClick={() => {
                        // Use openEntryFlow hook which handles gate checking and modal opening
                        openEntryFlow();
                      }}
                      className="group relative bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-6 py-3 rounded-xl font-bold hover:from-yellow-500 hover:to-orange-600 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        Get More Entries
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-yellow-300 to-orange-400 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </button>
                  )}
                </div>
              </div>

              {/* Advanced Stats Dashboard */}
              <div className="lg:flex-[3] lg:max-w-2xl">
                <div className="relative bg-gradient-to-br from-white/10 via-white/5 to-white/10 backdrop-blur-xl rounded-3xl p-4 sm:p-6 border border-white/30 shadow-2xl overflow-hidden">
                  {/* Animated Background Pattern */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-50"></div>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-yellow-400/10 to-orange-500/10 rounded-full blur-2xl"></div>
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-blue-400/10 to-purple-500/10 rounded-full blur-xl"></div>

                  {/* Major Draw Horizontal Badge */}
                  {currentMajorDraw && (
                    <div className="absolute top-0 left-2 right-2 sm:top-0 sm:left-4 sm:right-4 z-20">
                      <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/20 shadow-lg">
                        <div className="flex items-center justify-between">
                          {/* Left: Status & Draw Info */}
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                isActive
                                  ? "bg-green-400 animate-pulse"
                                  : isFrozen
                                  ? "bg-cyan-400 animate-pulse"
                                  : isCompleted
                                  ? "bg-gray-400"
                                  : isQueued
                                  ? "bg-blue-400"
                                  : "bg-gray-400"
                              }`}
                            ></div>
                            <span className="text-white/90 text-xs font-semibold">
                              {isActive
                                ? "Active"
                                : isFrozen
                                ? "Frozen"
                                : isCompleted
                                ? "Completed"
                                : isQueued
                                ? "Queued"
                                : "Unknown"}{" "}
                              Draw
                            </span>
                            <span className="text-white font-bold text-xs sm:text-sm">{currentMajorDraw.name}</span>
                          </div>

                          {/* Right: Countdown/Status */}
                          <div className="flex items-center gap-2">
                            {isWinner ? (
                              <div className="text-yellow-300 font-bold text-xs sm:text-sm animate-pulse">
                                🎉 You Won!
                              </div>
                            ) : isCompleted ? (
                              <div className="text-gray-300 font-bold text-xs sm:text-sm">Draw Ended</div>
                            ) : isActive || isFrozen ? (
                              <CountdownDisplay targetDate={currentMajorDraw.drawDate || ""} />
                            ) : (
                              <button
                                onClick={() => window.open("https://www.facebook.com/toolsaust", "_blank")}
                                className="flex items-center gap-1.5 text-white font-bold text-xs sm:text-sm hover:text-white/80 transition-colors cursor-pointer"
                              >
                                <div className="relative">
                                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                  <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping opacity-75"></div>
                                </div>
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="relative z-10">
                    {/* Main Total with Advanced Design */}
                    <div className="text-center mb-4 relative">
                      <div className="relative bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white via-yellow-100 to-white bg-clip-text text-transparent mb-1 drop-shadow-lg">
                          {displayTotalEntries}
                        </div>
                        <div className="text-white/90 text-sm font-semibold uppercase tracking-wide">Total Entries</div>
                      </div>
                    </div>

                    {/* Advanced Stats Grid */}
                    <div className="grid grid-cols-2 gap-2 relative">
                      {/* Accumulation Tooltip - Positioned relative to stats grid */}
                      {showAccumulationTooltip && tooltipPosition && projectionData && (
                        <MonthProjectionTooltip
                          isVisible={showAccumulationTooltip}
                          position={tooltipPosition}
                          current={projectionData.current}
                          nextMonth={projectionData.nextMonth}
                          month3={projectionData.month3}
                        />
                      )}
                      {/* Membership Entries */}
                      <div
                        className={`group relative backdrop-blur-sm rounded-xl p-3 border ${
                          pendingEntriesData?.isFailedRenewal
                            ? "bg-gradient-to-br from-amber-500/20 via-amber-400/10 to-orange-500/20 border-amber-400/30"
                            : pendingEntriesData
                              ? "bg-gradient-to-br from-slate-500/20 via-blue-400/10 to-indigo-500/20 border-blue-300/30"
                              : "bg-gradient-to-br from-blue-500/20 via-blue-400/10 to-indigo-500/20 border-blue-400/30"
                        }`}
                      >
                        {/* Info Button - Top Left */}
                        {hasActiveMembership && membershipPackage && projectionData && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                const statsGrid = e.currentTarget.closest(".grid.grid-cols-2") as HTMLElement;
                                if (statsGrid) {
                                  const gridRect = statsGrid.getBoundingClientRect();
                                  setTooltipPosition({
                                    top: rect.top - gridRect.top + rect.height / 2,
                                    left: rect.right - gridRect.left + 8,
                                  });
                                  setShowAccumulationTooltip(true);
                                }
                              }}
                              className="absolute top-2 left-2 z-20 w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full border border-white/30 text-white/80 hover:text-white transition-all duration-200 hover:scale-110"
                              aria-label="View accumulation info"
                            >
                              <Info className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                          )}
                        <div className="relative z-10 text-center">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <span className="text-white/90 text-xs font-semibold uppercase tracking-wide">
                              Membership
                            </span>
                          </div>
                          <div className="flex flex-col items-center justify-center gap-0.5 mb-1">
                            <div
                              className={`text-xl font-bold drop-shadow-lg ${
                                pendingEntriesData?.isFailedRenewal
                                  ? "text-amber-400"
                                  : pendingEntriesData
                                    ? "text-blue-200"
                                    : "text-white"
                              }`}
                            >
                              {pendingEntriesData ? pendingEntriesData.expectedEntries : displayMembershipEntries}
                            </div>
                            {pendingEntriesData && (
                              <span
                                className={`text-[10px] sm:text-xs font-medium text-center ${
                                  pendingEntriesData.isFailedRenewal ? "text-amber-400" : "text-blue-200"
                                }`}
                              >
                                {pendingEntriesData.isFailedRenewal ? (
                                  <>
                                    Update payment to add entries.{" "}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenSettingsToSubscription(true);
                                        setIsSettingsModalOpen(true);
                                      }}
                                      className="underline underline-offset-1 hover:no-underline focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-1 focus:ring-offset-transparent rounded"
                                      aria-label="Resolve payment – open Settings subscription tab"
                                    >
                                      Resolve payment
                                    </button>
                                  </>
                                ) : pendingEntriesData.renewalDate ? (
                                  `Added on renewal · ${formatRenewalDate(pendingEntriesData.renewalDate)}`
                                ) : (
                                  "Added on renewal"
                                )}
                              </span>
                            )}
                          </div>
                          {membershipPackage && (
                            <div className="flex flex-col gap-1 items-center">
                              <MembershipBadge
                                packageData={membershipPackage}
                                isActive={true}
                                membershipType="subscription"
                                onClick={() => {
                                  const baseEntries = (membershipPackage as { entriesPerMonth?: number }).entriesPerMonth ?? 0;
                                  const accumulation: SubscriptionAccumulationData | null =
                                    membershipPackage.type === "subscription" && baseEntries > 0 && userSubscription
                                      ? {
                                          entriesPerMonth: baseEntries,
                                          lastMonthAccumulatedEntries:
                                            userSubscription.lastMonthAccumulatedEntries ?? baseEntries,
                                        }
                                      : null;
                                  setPackageDetailModalData({
                                    packageData: membershipPackage as PackageDetailModalPackageData,
                                    membershipType: "subscription",
                                    accumulation,
                                  });
                                  setPackageDetailModalOpen(true);
                                }}
                              />
                              {/* Show preserved benefits countdown */}
                              {user &&
                                hasPreservedBenefits(user as unknown as Partial<import("@/models/User").IUser>) && (
                                  <div className="flex items-center gap-1 text-xs text-yellow-200 font-semibold bg-orange-500/30 px-2 py-0.5 rounded-full backdrop-blur-sm">
                                    <Clock className="w-3 h-3" />
                                    {getDaysUntilBenefitsExpire(
                                      user as unknown as Partial<import("@/models/User").IUser>
                                    )}{" "}
                                    days left
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* One-time Entries */}
                      <div className="group relative bg-gradient-to-br from-green-500/20 via-emerald-400/10 to-teal-500/20 backdrop-blur-sm rounded-xl p-3 border border-green-400/30">
                        <div className="relative z-10 text-center">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <span className="text-white/90 text-xs font-semibold uppercase tracking-wide">
                              One-time
                            </span>
                          </div>
                          <div className="text-xl font-bold text-white mb-1 drop-shadow-lg">
                            {displayOneTimeEntries}
                          </div>
                          <div className="text-xs text-white/70 uppercase tracking-wide">Packages</div>
                          {/* Only show one-time packages that have status "active" in user.partnerDiscountQueue */}
                          {(() => {
                            const queue = (user as { partnerDiscountQueue?: Array<{ packageId: string; packageName: string; packageType: string; status: string }> }).partnerDiscountQueue ?? [];
                            const activePackageIds = new Set(
                              queue
                                .filter(
                                  (item) =>
                                    item.status === "active" &&
                                    ["one-time", "mini-draw", "upsell"].includes(item.packageType)
                                )
                                .map((item) => String(item.packageId))
                            );
                            const basePackages = (user.enrichedOneTimePackages ?? []).filter(
                              (pkg) => pkg.isActive && pkg.packageData
                            );
                            const visiblePackages = basePackages.filter((pkg) =>
                              activePackageIds.has(String(pkg.packageId))
                            );
                            return visiblePackages.length > 0 ? (
                              <div className="flex flex-wrap justify-center gap-2 mt-2">
                                {visiblePackages.map((pkg) => (
                                  <MembershipBadge
                                    key={String(pkg.packageId)}
                                    packageData={pkg.packageData}
                                    isActive={true}
                                    membershipType="one-time"
                                    iconOnly
                                    onClick={() => {
                                      setPackageDetailModalData({
                                        packageData: pkg.packageData as PackageDetailModalPackageData,
                                        membershipType: "one-time",
                                        accumulation: null,
                                      });
                                      setPackageDetailModalOpen(true);
                                    }}
                                  />
                                ))}
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>

                      {/* Reward Points - TEMPORARILY HIDDEN */}
                      {/* TODO: Re-enable reward card when needed */}
                      {false && (
                        <div className="group relative bg-gradient-to-br from-yellow-500/20 via-amber-400/10 to-orange-500/20 backdrop-blur-sm rounded-xl p-3 border border-yellow-400/30">
                          <div className="relative z-10 text-center">
                            <div className="flex items-center justify-center gap-1 mb-1">
                              <span className="text-white/90 text-xs font-semibold uppercase tracking-wide">
                                Rewards
                              </span>
                            </div>
                            {isRewardsFeatureEnabled ? (
                              <>
                                <div className="text-xl font-bold text-white mb-1 drop-shadow-lg">
                                  {user.rewardsPoints.toLocaleString()}
                                </div>
                                <div className="text-xs text-white/70 uppercase tracking-wide">Points</div>
                              </>
                            ) : (
                              <div className="text-xs text-white/80 leading-relaxed">
                                <div className="text-base font-semibold text-white mb-1">Paused</div>
                                <p>{rewardsPauseMessage}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* Mobile Only - Manage Membership Buttons */}
                <div className="lg:hidden flex flex-col gap-3 mt-6">
                  {/* First Row: Manage and Refer a Friend */}
                  <div className="flex flex-row gap-3">
                    <button
                      onClick={() => setIsSettingsModalOpen(true)}
                      className="group relative bg-gradient-to-r from-white/20 to-white/10 backdrop-blur-sm border border-white/30 text-white px-4 py-2 rounded-lg font-semibold hover:from-white/30 hover:to-white/20 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex-1"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        Settings
                        {hasFailedRenewal(user as unknown as import("@/models/User").IUser) && (
                          <AlertTriangle
                            className="w-4 h-4 text-amber-300 drop-shadow-[0_0_4px_rgba(0,0,0,0.5)] animate-pulse"
                            strokeWidth={2.5}
                            aria-hidden
                          />
                        )}
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/20 to-orange-400/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </button>

                    <button
                      onClick={() => setIsReferFriendModalOpen(true)}
                      className="group relative bg-gradient-to-r from-yellow-300 via-amber-300 to-orange-400 text-black px-4 py-2 rounded-lg font-bold hover:from-yellow-400 hover:to-orange-500 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex-1"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        <Share2 className="w-4 h-4" />
                        Refer a Friend
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-white/40 to-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </button>
                  </div>

                  {/* Second Row: Get More Entries (for users with subscription OR current draw entries) */}
                  {hasAccessToAdditionalPackages && (
                    <button
                      onClick={() => {
                        // Use openEntryFlow hook which handles gate checking and modal opening
                        openEntryFlow();
                      }}
                      className="group relative bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-4 py-2 rounded-lg font-bold hover:from-yellow-500 hover:to-orange-600 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl w-full"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        Get More Entries
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-yellow-300 to-orange-400 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 -mt-16 pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ">
          {/* Partner Discount Queue Section */}
          <div className="pt-4 mb-12">
            <PartnerDiscountQueue />
          </div>

          {/* Boost Your Odds 50% Section - Using MembershipSection */}
          <div className="">
            <MembershipSection title="BOOST YOUR ODDS 50%" padding="py-8 sm:py-12" />
          </div>

          {/* Major Draw Section - PrizeShowcase for uniformity */}
          <div className="mb-12">
            <PrizeShowcase />
          </div>

          {/* Latest Winner Hero Section */}
          <LatestWinnerHero className="mb-12" />

          {/* Winner Testimony Section */}
          {!winnersLoading && winners.length > 0 && (
            <WinnerTestimonySection winners={winners} className="mb-12" />
          )}

          {/* Mini Draw Section */}
          <div className="">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent font-['Poppins'] mb-6">
                Mini Draw
              </h2>
            </div>

            {/* Membership Info Banner */}
            {!miniDrawsLoading && activeMiniDraws.length > 0 && (
              <div className="mb-8">
                {hasMembershipWithMiniDraws ? (
                  // Success Banner - User has membership with minidraws
                  <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black border-2 border-gray-700 rounded-xl p-4 sm:p-6 shadow-lg backdrop-blur-sm">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md border-2 border-green-400/30">
                          <CheckCircle className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base sm:text-xl font-bold text-white mb-1">
                          You&apos;re Automatically Entered!
                        </h3>
                        <p className="text-xs sm:text-base text-gray-300">
                          With your active membership, you&apos;re automatically entered in all mini draws. Your entries
                          are calculated from your membership benefits plus any additional minidraw packages you&apos;ve
                          purchased.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  // CTA Banner - User doesn't have membership with minidraws
                  <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black border-2 border-gray-700 rounded-xl p-4 sm:p-6 shadow-lg backdrop-blur-sm">
                    <div className="flex items-start gap-3 sm:gap-4 mb-4">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-red-600 via-red-700 to-red-800 flex items-center justify-center shadow-md border-2 border-red-400/30">
                          <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base sm:text-xl font-bold text-white mb-1">Get Your Name in Every Draw</h3>
                        <p className="text-xs sm:text-base text-gray-300">
                          Subscribe to a membership package and automatically enter all mini draws! Your membership
                          entries will be added to every active minidraw.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                      <button
                        onClick={() => {
                          // Get Tradie package for default selection
                          const getTradiePackage = (): LocalMembershipPlan => {
                            const targetPackageId = "tradie-subscription";
                            const packageData = subscriptionPackages.find((pkg) => pkg.id === targetPackageId);

                            if (!packageData) {
                              // Fallback if package not found
                              const baseEntries = 15; // Tradie subscription has 15 entries per month
                              const promoEntries = baseEntries * membershipPromoMultiplier;

                              return {
                                id: targetPackageId,
                                name: "Tradie",
                                price: 20,
                                period: "mo",
                                features: [
                                  {
                                    text: `${promoEntries} Free Accumulated Entries${
                                      membershipPromoMultiplier > 1 ? ` (${membershipPromoMultiplier}X PROMO!)` : ""
                                    }`,
                                  },
                                  { text: "100% Access to Partner Discounts" },
                                  { text: "Mini Draws" },
                                ],
                                buttonText: "Get Started",
                                buttonStyle: "secondary",
                                isMemberOnly: false,
                                metadata: {
                                  entriesCount: promoEntries,
                                  promoMultiplier: membershipPromoMultiplier,
                                  originalEntries: baseEntries,
                                  isPromoActive: membershipPromoMultiplier > 1,
                                },
                              };
                            }

                            const localPlan = convertToLocalPlan(packageData);

                            // Apply promo multiplier if active
                            if (membershipPromoMultiplier <= 1) {
                              return localPlan;
                            }

                            const originalEntries = localPlan.metadata?.entriesCount ?? 0;
                            const promoEntries = originalEntries * membershipPromoMultiplier;

                            return {
                              ...localPlan,
                              features: localPlan.features.map((feature) => {
                                if (feature.text.toLowerCase().includes("entries")) {
                                  return {
                                    ...feature,
                                    text: feature.text.replace(/\d+/, promoEntries.toString()),
                                  };
                                }
                                return feature;
                              }),
                              metadata: {
                                ...localPlan.metadata,
                                entriesCount: promoEntries,
                                originalEntries,
                                promoMultiplier: membershipPromoMultiplier,
                                isPromoActive: true,
                              },
                            };
                          };

                          const tradiePlan = getTradiePackage();
                          membershipModal.setSelectedPlan(tradiePlan);
                          membershipModal.openModal();
                        }}
                        className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl"
                      >
                        Get Your Name in Every Draw
                      </button>
                      <button
                        onClick={() => membershipModal.openModalWithPackageSelectionFirst()}
                        className="flex-1 bg-white border-2 border-blue-600 text-blue-700 hover:bg-blue-50 font-bold py-3 px-6 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg"
                      >
                        Subscribe to Membership Package
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {miniDrawsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-red-600 border-t-transparent"></div>
              </div>
            ) : activeMiniDraws.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600">No active mini-draws available at the moment.</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-900 font-['Poppins'] mb-2">
                      {hasMembershipWithMiniDraws ? "Increase Your Chances of Winning" : "Explore More Mini Draws"}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {hasMembershipWithMiniDraws
                        ? "Purchase additional entries to boost your odds!"
                        : "Join these exciting mini draws"}
                    </p>
                  </div>
                  <Link
                    href="/mini-draws"
                    className="text-red-600 hover:text-red-700 font-medium flex items-center gap-1 text-sm sm:text-base"
                  >
                    <span className="hidden sm:inline">View All Mini Draws</span>
                    <span className="sm:hidden">View All</span>
                    <ArrowLeft className="w-4 h-4 rotate-180" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                  {activeMiniDraws.map((miniDraw) => (
                    <ProductCard key={miniDraw._id} product={miniDraw} viewMode="grid" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Partner Discounts Section */}
        <div className="my-account-partner-discounts ">
          <PartnerDiscountsSection user={user} />
        </div>
      </div>

      {/* Modals */}
      <MembershipModal
        isOpen={membershipModal.isModalOpen}
        onClose={membershipModal.closeModal}
        selectedPlan={membershipModal.selectedPlan}
        onPlanChange={membershipModal.selectPlan}
        membershipModalConfig={
          membershipModal.openWithPackageSelectionFirst
            ? { showPackageSelectionFirst: true }
            : undefined
        }
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => {
          setOpenSettingsToSubscription(false);
          setIsSettingsModalOpen(false);
        }}
        initialTab={openSettingsToSubscription ? "subscription" : undefined}
        user={user}
        membershipModal={membershipModal}
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
          onOpenSettingsSubscription={() => {
            setOpenSettingsToSubscription(true);
            setIsSettingsModalOpen(true);
          }}
          onOpenMembershipModal={() => membershipModal.openModalWithPackageSelectionFirst()}
          onOpenSpecialPackages={() => requestModal("special-packages", true)}
        />
      )}

      <ReferFriendModal
        isOpen={isReferFriendModalOpen}
        onCloseAction={() => setIsReferFriendModalOpen(false)}
        userId={user._id}
        userFirstName={user.firstName}
      />

      <RenewalFailedModal
        isOpen={isRenewalFailedModalOpen && activeModal === "renewal-failed"}
        onClose={() => {
          setIsRenewalFailedModalOpen(false);
          closeModal();
        }}
      />

      {/* Click outside to close accumulation tooltip */}
      {showAccumulationTooltip && (
        <div className="fixed inset-0 z-[9998]" onClick={() => setShowAccumulationTooltip(false)} />
      )}
    </div>
  );
}
