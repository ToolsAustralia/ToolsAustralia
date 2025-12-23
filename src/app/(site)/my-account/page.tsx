"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useMyAccountData } from "@/hooks/queries";
import { useUserMajorDrawStats, useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { queryKeys } from "@/lib/queryKeys";
import MembershipSection from "@/components/sections/MembershipSection";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";

import MajorDrawSection from "@/components/sections/MajorDrawSection";
import PartnerDiscountQueue from "@/components/features/PartnerDiscountQueue";
import UnlockDiscounts from "@/components/sections/promo/UnlockDiscounts";
import { hasActivePartnerDiscountAccess } from "@/utils/membership/benefit-resolution";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import MembershipModal from "@/components/modals/MembershipModal";
import SettingsModal from "@/components/modals/SettingsModal";
import ReferFriendModal from "@/components/modals/ReferFriendModal";
import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";
import { hasPreservedBenefits, getDaysUntilBenefitsExpire } from "@/utils/membership/benefit-resolution";
import { Clock, Share2, Info, CheckCircle, Sparkles, ArrowLeft, Hourglass } from "lucide-react";
import { useMiniDraws } from "@/hooks/queries/useMiniDrawQueries";
import ProductCard from "@/components/ui/ProductCard";
import MembershipBadge from "@/components/ui/MembershipBadge";
import MonthProjectionTooltip from "@/components/ui/MonthProjectionTooltip";
import { getPackageById } from "@/data/membershipPackages";
import { useMemberships } from "@/hooks/useMemberships";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import { convertToLocalPlan, type LocalMembershipPlan } from "@/utils/membership/membership-adapters";

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
  const { requestModal } = useModalPriorityStore();

  // Fetch 8 most recent active mini-draws
  const { data: miniDrawsData, isLoading: miniDrawsLoading } = useMiniDraws({
    page: 1,
    limit: 8,
    status: "active",
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  // Get membership packages and promo for modal integration
  const { subscriptionPackages } = useMemberships();
  const { data: membershipPromo } = usePromoByType("membership-packages");
  const membershipPromoMultiplier = membershipPromo?.multiplier ?? 1;

  const isRewardsFeatureEnabled = rewardsEnabled();
  const rewardsPauseMessage = rewardsDisabledMessage();

  // Local state for subscription management modal
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isReferFriendModalOpen, setIsReferFriendModalOpen] = useState(false);

  // State for accumulation tooltip
  const [showAccumulationTooltip, setShowAccumulationTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  // State for pending entries tooltip
  const [showPendingTooltip, setShowPendingTooltip] = useState(false);
  const [pendingTooltipPosition, setPendingTooltipPosition] = useState<{ top: number; left: number } | null>(null);

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

  // Determine membership info from real data
  // Use enriched package data for both subscription and one-time packages
  const membershipPackage =
    user.subscriptionPackageData || user.enrichedOneTimePackages?.find((pkg) => pkg.isActive)?.packageData;

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
  const isGapState = isCompleted || isQueued;

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

    // Only show for subscription packages
    if (user.subscriptionPackageData !== membershipPackage) return null;

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

  // Calculate pending entries - Show in ALL states if user has active membership but 0 membership entries
  // Simplified: Check if user has active membership but 0 membership entries in the draw
  const getPendingEntries = () => {
    // Wait for majorDrawStats to load
    // majorDrawStats will be an object (not null) even if user has no entries (returns zeros)
    if (majorDrawStatsLoading || !majorDrawStats) {
      return null;
    }

    // Check if user has active membership
    if (!hasActiveMembership) {
      return null; // No active membership, no pending entries to show
    }

    // Get membership entries from the current draw
    const membershipEntriesInDraw = majorDrawStats?.membershipEntries ?? 0;
    
    // Get displayed membership entries (what's actually shown to user)
    // Always use actual draw entries, not accumulated from previous months
    // Only hide entries when draw is completed (previous draw), not when queued (upcoming draw)
    const displayedMembershipEntries = isCompleted
      ? 0
      : majorDrawStats?.membershipEntries ?? 0;

    // Show pending ONLY if:
    // 1. User has active membership
    // 2. Membership entries in current draw are 0 (entries will be added on renewal)
    // 3. AND displayed membership entries are also 0 (user doesn't see any entries currently)
    // This prevents showing pending when user already has accumulated entries displayed
    if (membershipEntriesInDraw === 0 && displayedMembershipEntries === 0) {
      // Try to calculate expected entries from package (for tooltip display)
      // If package info is available, use it; otherwise use subscription data
      let expectedEntries = 0;
      let baseEntries = 0;
      let lastAccumulated = 0;

      if (membershipPackage && membershipPackage.type === "subscription" && "entriesPerMonth" in membershipPackage) {
        baseEntries = (membershipPackage as { entriesPerMonth?: number }).entriesPerMonth || 0;
        lastAccumulated = userSubscription?.lastMonthAccumulatedEntries ?? baseEntries;
        expectedEntries = lastAccumulated + baseEntries;
      } else if (userSubscription?.lastMonthAccumulatedEntries) {
        // Fallback: Use lastMonthAccumulatedEntries if package data not available
        lastAccumulated = userSubscription.lastMonthAccumulatedEntries;
        expectedEntries = lastAccumulated; // Best guess without package info
      } else {
        // Can't calculate expected entries, but still show pending icon
        expectedEntries = 0;
      }

      return {
        expectedEntries,
        baseEntries,
        lastAccumulated,
        needsRenewal: false, // Active membership, just waiting for renewal cycle
      };
    }

    // If membership entries > 0, they're already in the draw, no pending
    return null;
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
                        // Clear session tracking for special packages modal so it can show
                        const { clearModalFromSession } = useModalPriorityStore.getState();
                        clearModalFromSession("special-packages");
                        // Clear sessionStorage flag as well to bypass session check
                        if (typeof window !== "undefined") {
                          sessionStorage.removeItem("specialPackagesModalShown");
                        }
                        // Request special packages modal through priority system (force=true to bypass checks)
                        requestModal("special-packages", true);
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
                      {/* Pending Entries Tooltip - Positioned relative to stats grid */}
                      {showPendingTooltip && pendingTooltipPosition && pendingEntriesData && (
                        <div
                          className="absolute px-3 py-2 sm:px-4 sm:py-3 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white text-[11px] sm:text-sm rounded-xl shadow-2xl border border-slate-500/50 pointer-events-none w-[180px] sm:w-auto sm:min-w-[220px] backdrop-blur-sm"
                          style={{
                            zIndex: 10000,
                            left: `${pendingTooltipPosition.left}px`,
                            top: `${pendingTooltipPosition.top}px`,
                            transform: "translateY(-50%)",
                          }}
                        >
                          <div className="font-bold mb-2 sm:mb-3 text-[12px] sm:text-base bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                            Pending Entries
                          </div>
                          <div className="space-y-2 sm:space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-gray-300 text-[10px] sm:text-xs font-medium">Expected</span>
                              <span className="text-white font-bold text-[11px] sm:text-sm tabular-nums">
                                {pendingEntriesData.expectedEntries.toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <div className="mt-2 sm:mt-2.5 pt-2 sm:pt-2.5 border-t border-slate-700/50">
                            <div className="text-gray-300 text-[10px] sm:text-xs">
                              Will be automatically added to the draw once your subscription is renewed
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Membership Entries */}
                      <div className="group relative bg-gradient-to-br from-blue-500/20 via-blue-400/10 to-indigo-500/20 backdrop-blur-sm rounded-xl p-3 border border-blue-400/30">
                        {/* Info Button - Top Left */}
                        {hasActiveMembership &&
                          membershipPackage &&
                          user.subscriptionPackageData === membershipPackage &&
                          projectionData && (
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
                          <div className="flex items-center justify-center gap-1.5 mb-1">
                            <div className="text-xl font-bold text-white drop-shadow-lg">
                              {displayMembershipEntries}
                            </div>
                            {/* Pending icon indicator during frozen/gap state */}
                            {pendingEntriesData && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const statsGrid = e.currentTarget.closest(".grid.grid-cols-2") as HTMLElement;
                                  if (statsGrid) {
                                    const gridRect = statsGrid.getBoundingClientRect();
                                    setPendingTooltipPosition({
                                      top: rect.top - gridRect.top + rect.height / 2,
                                      left: rect.right - gridRect.left + 8,
                                    });
                                    setShowPendingTooltip(true);
                                  }
                                }}
                                className="flex items-center justify-center w-4 h-4 text-blue-300 hover:text-blue-200 transition-colors cursor-help relative z-20"
                                aria-label="Pending entries info"
                              >
                                <Hourglass className="w-4 h-4 animate-hourglass-flip" />
                              </button>
                            )}
                          </div>
                          {membershipPackage && (
                            <div className="flex flex-col gap-1 items-center">
                              <MembershipBadge
                                packageData={membershipPackage}
                                isActive={true}
                                membershipType={
                                  user.subscriptionPackageData === membershipPackage ? "subscription" : "one-time"
                                }
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
                        // Clear session tracking for special packages modal so it can show
                        const { clearModalFromSession } = useModalPriorityStore.getState();
                        clearModalFromSession("special-packages");
                        // Clear sessionStorage flag as well to bypass session check
                        if (typeof window !== "undefined") {
                          sessionStorage.removeItem("specialPackagesModalShown");
                        }
                        // Request special packages modal through priority system (force=true to bypass checks)
                        requestModal("special-packages", true);
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

          {/* Major Draw Section */}
          <MajorDrawSection className="mb-12" />

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
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        user={user}
        membershipModal={membershipModal}
      />

      <ReferFriendModal
        isOpen={isReferFriendModalOpen}
        onCloseAction={() => setIsReferFriendModalOpen(false)}
        userId={user._id}
        userFirstName={user.firstName}
      />

      {/* Click outside to close accumulation tooltip */}
      {showAccumulationTooltip && (
        <div className="fixed inset-0 z-[9998]" onClick={() => setShowAccumulationTooltip(false)} />
      )}
      {/* Click outside to close pending tooltip */}
      {showPendingTooltip && (
        <div className="fixed inset-0 z-[9998]" onClick={() => setShowPendingTooltip(false)} />
      )}
    </div>
  );
}
