"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useMyAccountData } from "@/hooks/queries";
import { useUserMajorDrawStats, useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import MembershipSection from "@/components/sections/MembershipSection";

import MajorDrawSection from "@/components/sections/MajorDrawSection";
import ProductCategories from "@/components/features/ProductCategories";
import PartnerDiscountQueue from "@/components/features/PartnerDiscountQueue";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import MembershipModal from "@/components/modals/MembershipModal";
import SubscriptionManagementModal from "@/components/modals/SubscriptionManagementModal";
import ReferFriendModal from "@/components/modals/ReferFriendModal";
import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";
import { hasPreservedBenefits, getDaysUntilBenefitsExpire } from "@/utils/membership/benefit-resolution";
import { Clock, Share2 } from "lucide-react";
import { useMiniDraws } from "@/hooks/queries/useMiniDrawQueries";
import ProductCard from "@/components/ui/ProductCard";

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
  const { data: accountData, isLoading: loading, error } = useMyAccountData(session?.user?.id);

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
    sortBy: "activationDate",
    sortOrder: "desc",
  });

  const isRewardsFeatureEnabled = rewardsEnabled();
  const rewardsPauseMessage = rewardsDisabledMessage();

  // Local state for subscription management modal
  const [isSubscriptionManagementModalOpen, setIsSubscriptionManagementModalOpen] = useState(false);
  const [isReferFriendModalOpen, setIsReferFriendModalOpen] = useState(false);

  // Redirect if not authenticated
  React.useEffect(() => {
    if (status === "loading") return; // Still loading
    if (!session) {
      router.push("/login");
    }
  }, [session, status, router]);

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
      console.log("🚫 Modal already triggered this session, skipping");
      return;
    }

    if (status === "loading" || loading || !session || !accountData) {
      console.log("⏳ Still loading data...", {
        status,
        loading,
        hasSession: !!session,
        hasAccountData: !!accountData,
      });
      return;
    }

    // Check if setup was just completed (prevent re-triggering after page reload)
    const setupJustCompleted = sessionStorage.getItem("setupJustCompleted");
    if (setupJustCompleted) {
      console.log("✅ Setup just completed, skipping modal trigger");
      sessionStorage.removeItem("setupJustCompleted");
      return;
    }

    // CRITICAL FIX: Check sessionStorage FIRST (always available, fixes tab-switching bug)
    // Don't rely on Zustand store which may not be hydrated yet in production
    const pendingUpsellFlag = sessionStorage.getItem("pendingUpsellFlag");
    const pendingUpsellDataStr = sessionStorage.getItem("pendingUpsell");

    console.log("🔍 Checking for pending upsell:", {
      sessionStorageFlag: pendingUpsellFlag,
      hasSessionData: !!pendingUpsellDataStr,
      allSessionStorageKeys: Object.keys(sessionStorage),
      setupJustCompleted: sessionStorage.getItem("setupJustCompleted"),
    });

    // Parse upsell data from sessionStorage if available
    let upsellData = null;
    if (pendingUpsellDataStr) {
      try {
        upsellData = JSON.parse(pendingUpsellDataStr);
        console.log("✅ Parsed upsell data from sessionStorage");
      } catch (e) {
        console.error("❌ Failed to parse pending upsell data:", e);
        sessionStorage.removeItem("pendingUpsell");
        sessionStorage.removeItem("pendingUpsellFlag");
      }
    }

    // Determine modal to show
    if (pendingUpsellFlag === "true" && upsellData) {
      // CRITICAL: Show UPSELL FIRST for new users (matching development behavior)
      console.log("🎯 Pending upsell detected, showing UPSELL FIRST");
      requestModal("upsell", true, upsellData);
      modalTriggeredRef.current = true;

      // Queue user setup to show after upsell closes (if setup incomplete)
      if (!accountData.user.profileSetupCompleted) {
        console.log("📋 User-setup queued to show AFTER upsell closes");
        // UpsellModal's handleClose will trigger user-setup after upsell closes
      }
    } else if (!accountData.user.profileSetupCompleted) {
      // No pending upsell, show user setup modal directly
      console.log("🎯 No pending upsell, showing user-setup directly");
      requestModal("user-setup", true);
      modalTriggeredRef.current = true;
    } else {
      console.log("✅ User setup already completed, no modals needed");
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
  const activeMiniDraws = (miniDrawsData?.miniDraws || []).map((miniDraw) => {
    const totalEntries = miniDraw.totalEntries || 0;
    const minimumEntries = miniDraw.minimumEntries || 0;
    const entriesRemaining =
      miniDraw.entriesRemaining !== undefined ? miniDraw.entriesRemaining : Math.max(minimumEntries - totalEntries, 0);
    return {
      ...miniDraw,
      totalEntries,
      minimumEntries,
      entriesRemaining,
      requiresMembership: true, // Mini draws require membership
      hasActiveMembership,
    };
  });

  // Get membership badge colors based on package type
  const getMembershipBadgeColors = (packageName?: string) => {
    if (!packageName) return "bg-gradient-to-r from-gray-500 to-slate-600 text-white";

    if (packageName.toLowerCase().includes("tradie") || packageName.toLowerCase().includes("apprentice")) {
      return "bg-gradient-to-r from-blue-500 to-indigo-600 text-white";
    } else if (packageName.toLowerCase().includes("tradie")) {
      return "bg-gradient-to-r from-emerald-500 to-green-600 text-white";
    } else if (packageName.toLowerCase().includes("foreman")) {
      return "bg-gradient-to-r from-purple-600 to-purple-700 text-white";
    } else if (packageName.toLowerCase().includes("boss")) {
      return "bg-gradient-to-r from-gray-900 to-black text-yellow-400 animate-pulse drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]";
    } else if (packageName.toLowerCase().includes("power")) {
      return "bg-gradient-to-r from-gray-900 to-black text-yellow-400 animate-pulse drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]";
    } else {
      return "bg-gradient-to-r from-gray-500 to-slate-600 text-white";
    }
  };

  // Determine membership info from real data
  // Use enriched package data for both subscription and one-time packages
  const membershipPackage =
    user.subscriptionPackageData || user.enrichedOneTimePackages?.find((pkg) => pkg.isActive)?.packageData;
  const membershipName = membershipPackage?.name || "None";

  // Use API data for current draw entries (which is already filtered to current major draw)
  // This ensures we only show entries for the current active major draw, not accumulated totals
  const displayMembershipEntries = majorDrawStats?.membershipEntries || 0;
  const displayOneTimeEntries = majorDrawStats?.oneTimeEntries || 0;
  const displayTotalEntries = majorDrawStats?.currentDrawEntries || 0;

  // Calculate draw status and timing information
  const isCompleted = currentMajorDraw?.status === "completed";
  const isFrozen = currentMajorDraw?.status === "frozen";
  const isActive = currentMajorDraw?.status === "active";
  const isQueued = currentMajorDraw?.status === "queued";

  // Calculate days remaining for current draw
  const daysRemaining = currentMajorDraw?.drawDate
    ? Math.max(
        0,
        Math.ceil((new Date(currentMajorDraw.drawDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      )
    : 0;

  // Check if current user is the winner
  const isWinner = currentMajorDraw?.winner?.userId?.toString() === session?.user?.id;

  // Debug logging for entry calculation
  console.log("📊 My Account - Entry Display Logic:", {
    currentMajorDraw: currentMajorDraw,
    majorDrawStats: majorDrawStats,
    displaying: {
      total: displayTotalEntries,
      membership: displayMembershipEntries,
      oneTime: displayOneTimeEntries,
    },
    drawStatus: {
      status: currentMajorDraw?.status,
      isCompleted,
      isFrozen,
      isActive,
      isQueued,
      daysRemaining,
      isWinner,
    },
    note: "Now showing only current major draw entries (not accumulated total)",
  });

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
                    onClick={() => setIsSubscriptionManagementModalOpen(true)}
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
                      Manage Membership
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
                                onClick={() => window.open("https://facebook.com", "_blank")}
                                className="text-blue-400 font-bold text-xs sm:text-sm hover:text-blue-300 transition-colors cursor-pointer"
                              >
                                Live Now
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
                    <div className="grid grid-cols-3 gap-2">
                      {/* Membership Entries */}
                      <div className="group relative bg-gradient-to-br from-blue-500/20 via-blue-400/10 to-indigo-500/20 backdrop-blur-sm rounded-xl p-3 border border-blue-400/30 hover:border-blue-400/50 transition-all duration-300 hover:scale-105">
                        <div className="relative z-10 text-center">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <span className="text-white/90 text-xs font-semibold uppercase tracking-wide">
                              Membership
                            </span>
                          </div>
                          <div className="text-xl font-bold text-white mb-1 drop-shadow-lg">
                            {displayMembershipEntries}
                          </div>
                          {membershipPackage && (
                            <div className="flex flex-col gap-1 items-center">
                              <div
                                className={`inline-block px-2 py-0.5 rounded-full font-bold text-xs shadow-lg ${getMembershipBadgeColors(
                                  membershipPackage.name
                                )}`}
                              >
                                {membershipName}
                              </div>
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
                      <div className="group relative bg-gradient-to-br from-green-500/20 via-emerald-400/10 to-teal-500/20 backdrop-blur-sm rounded-xl p-3 border border-green-400/30 hover:border-green-400/50 transition-all duration-300 hover:scale-105">
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

                      {/* Reward Points */}
                      <div className="group relative bg-gradient-to-br from-yellow-500/20 via-amber-400/10 to-orange-500/20 backdrop-blur-sm rounded-xl p-3 border border-yellow-400/30 hover:border-yellow-400/50 transition-all duration-300 hover:scale-105">
                        <div className="relative z-10 text-center">
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <span className="text-white/90 text-xs font-semibold uppercase tracking-wide">Rewards</span>
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
                    </div>
                  </div>
                </div>
                {/* Mobile Only - Manage Membership Buttons */}
                <div className="lg:hidden flex flex-row gap-3 mt-6">
                  <button
                    onClick={() => setIsSubscriptionManagementModalOpen(true)}
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
                      Manage
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/20 to-orange-400/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </button>

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
                    className="group relative bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-4 py-2 rounded-lg font-bold hover:from-yellow-500 hover:to-orange-600 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl flex-1"
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

          {/* Major Draw Section */}
          <MajorDrawSection className="mb-12" />

          {/* Boost Your Odds 50% Section - Using MembershipSection */}
          <div className="mb-12">
            <MembershipSection title="BOOST YOUR ODDS 50%" padding="py-8 sm:py-12" />
          </div>

          {/* Mini Draw Section */}
          <div className="mb-16">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent font-['Poppins'] mb-6">
                Mini Draw
              </h2>
            </div>

            {miniDrawsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-red-600 border-t-transparent"></div>
              </div>
            ) : activeMiniDraws.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600">No active mini-draws available at the moment.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                {activeMiniDraws.map((miniDraw) => (
                  <ProductCard key={miniDraw._id} product={miniDraw} viewMode="grid" />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Partner Brands Section */}
        <div className="my-account-product-categories">
          <ProductCategories
            title="OUR PARTNER BRANDS"
            description="Explore our trusted partner brands and discover professional-grade tools and equipment for your trade"
            padding="pb-8 sm:pb-12 lg:pb-16 pt-8"
            margin="mb-16 sm:mb-20 lg:mb-24"
            showBackground={false}
          />
        </div>
      </div>

      {/* Modals */}
      <MembershipModal
        isOpen={membershipModal.isModalOpen}
        onClose={membershipModal.closeModal}
        selectedPlan={membershipModal.selectedPlan}
        onPlanChange={membershipModal.selectPlan}
      />

      <SubscriptionManagementModal
        isOpen={isSubscriptionManagementModalOpen}
        onClose={() => setIsSubscriptionManagementModalOpen(false)}
        user={user}
      />

      <ReferFriendModal
        isOpen={isReferFriendModalOpen}
        onCloseAction={() => setIsReferFriendModalOpen(false)}
        userId={user._id}
        userFirstName={user.firstName}
      />
    </div>
  );
}
