/**
 * Partner Discount Queue Component for Rewards Page
 *
 * Displays the user's current partner discount access status and queued future benefits.
 * Modified layout to fit the rewards page width constraints.
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Clock, Gift, Calendar, CheckCircle2, AlertCircle, Package } from "lucide-react";
import { usePartnerDiscountQueue } from "@/hooks/queries/usePartnerDiscountQueue";
import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";

// Export the component and optimistic update function for external use
export const usePartnerDiscountQueueOptimistic = () => {
  return {
    addOptimisticQueueItem: (packageData: {
      packageName: string;
      packageType: "subscription" | "one-time" | "mini-draw" | "upsell";
      discountDays: number;
      discountHours: number;
    }) => {
      // Dispatch custom event for other components to listen to
      const event = new CustomEvent("purchaseCompleted", {
        detail: {
          packageData: {
            name: packageData.packageName,
            packageName: packageData.packageName,
            partnerDiscountDays: packageData.discountDays,
            partnerDiscountHours: packageData.discountHours,
          },
          packageType: packageData.packageType,
        },
      });

      window.dispatchEvent(event);
    },
  };
};

export default function PartnerDiscounts() {
  const isRewardsFeatureEnabled = rewardsEnabled();
  const pauseMessage = rewardsDisabledMessage();

  const [timeRemaining, setTimeRemaining] = useState({ days: 0, hours: 0, minutes: 0 });
  // Expanded by default - no state needed since content is always visible
  const [visibleQueuedCount, setVisibleQueuedCount] = useState(3); // Start with 3 queued items
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Use TanStack Query hook
  const { data: queueData, isLoading, error, refetchQueue, addOptimisticQueueItem } = usePartnerDiscountQueue();

  // Event listener for purchase completion (best practice: custom events)
  useEffect(() => {
    if (!isRewardsFeatureEnabled) {
      return;
    }

    const handlePurchaseComplete = (event: CustomEvent) => {
      const { packageData, packageType } = event.detail;

      // Only handle packages that have partner discount benefits
      if (packageData && (packageData.partnerDiscountDays || packageData.partnerDiscountHours)) {
        console.log("🎁 Purchase completed, updating partner discount queue optimistically");

        addOptimisticQueueItem({
          packageName: packageData.name || packageData.packageName,
          packageType: packageType || "one-time",
          discountDays: packageData.partnerDiscountDays || 0,
          discountHours: packageData.partnerDiscountHours || 0,
        });
      }
    };

    // Listen for purchase completion events
    window.addEventListener("purchaseCompleted", handlePurchaseComplete as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener("purchaseCompleted", handlePurchaseComplete as EventListener);
    };
  }, [isRewardsFeatureEnabled, queueData, addOptimisticQueueItem]);

  // Listen for focus events to refresh data (best practice: stale-while-revalidate)
  useEffect(() => {
    if (!isRewardsFeatureEnabled) {
      return;
    }

    const handleFocus = () => {
      // TanStack Query handles refetch on window focus automatically
      // This is just for manual refresh if needed
      refetchQueue();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [isRewardsFeatureEnabled, refetchQueue]);

  // Memoize the updateTimer function to prevent infinite re-renders
  const updateTimer = useCallback(() => {
    if (!isRewardsFeatureEnabled || !queueData?.activePeriod?.isActive || !queueData.activePeriod.endsAt) {
      return;
    }

    const now = new Date();
    const endsAt = new Date(queueData.activePeriod.endsAt!);
    const diff = endsAt.getTime() - now.getTime();

    if (diff <= 0) {
      // Period has ended - refresh data
      refetchQueue();
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    setTimeRemaining({ days, hours, minutes });
  }, [isRewardsFeatureEnabled, queueData?.activePeriod?.isActive, queueData?.activePeriod?.endsAt, refetchQueue]);

  // Update countdown timer for active period
  useEffect(() => {
    if (!isRewardsFeatureEnabled || !queueData?.activePeriod?.isActive || !queueData.activePeriod.endsAt) {
      return;
    }

    // Update immediately
    updateTimer();

    // Update every minute
    const interval = setInterval(updateTimer, 60000);

    return () => clearInterval(interval);
  }, [isRewardsFeatureEnabled, updateTimer, queueData?.activePeriod?.isActive, queueData?.activePeriod?.endsAt]);

  // Infinite scrolling effect for queued items
  useEffect(() => {
    if (!isRewardsFeatureEnabled) {
      return;
    }

    const handleScroll = () => {
      if (scrollContainerRef.current && queueData) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

        // Load more when 80% scrolled
        if (scrollPercentage > 0.8 && visibleQueuedCount < queueData.queuedItems.length) {
          setVisibleQueuedCount((prev) => Math.min(prev + 3, queueData.queuedItems.length)); // Add 3 more items
        }
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [isRewardsFeatureEnabled, visibleQueuedCount, queueData]);

  // Reset visible count when queued items change
  useEffect(() => {
    if (!isRewardsFeatureEnabled) {
      return;
    }

    setVisibleQueuedCount(3);
  }, [isRewardsFeatureEnabled, queueData?.queuedItems.length]);

  // Get icon based on package type
  const getPackageIcon = (type: string) => {
    switch (type) {
      case "subscription":
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case "one-time":
        return <Package className="w-4 h-4 text-blue-600" />;
      case "mini-draw":
        return <Gift className="w-4 h-4 text-purple-600" />;
      case "upsell":
        return <Gift className="w-4 h-4 text-orange-600" />;
      default:
        return <Package className="w-4 h-4 text-gray-600" />;
    }
  };

  // Get badge color based on package type and name
  const getPackageBadgeColor = (type: string, packageName?: string) => {
    if (!packageName) {
      switch (type) {
        case "subscription":
          return "bg-green-100 text-green-800 border-green-300";
        case "one-time":
          return "bg-blue-100 text-blue-800 border-blue-300";
        case "mini-draw":
          return "bg-purple-100 text-purple-800 border-purple-300";
        case "upsell":
          return "bg-orange-100 text-orange-800 border-orange-300";
        default:
          return "bg-gray-100 text-gray-800 border-gray-300";
      }
    }

    const name = packageName.toLowerCase();

    // Package-specific colors matching the existing design system
    if (name.includes("tradie") || name.includes("apprentice")) {
      return "bg-blue-100 text-blue-800 border-blue-300";
    } else if (name.includes("foreman")) {
      return "bg-purple-100 text-purple-800 border-purple-300";
    } else if (name.includes("boss")) {
      return "bg-yellow-100 text-yellow-900 border-yellow-400";
    } else if (name.includes("power")) {
      return "bg-yellow-100 text-yellow-900 border-yellow-400";
    } else {
      // Fallback based on type
      switch (type) {
        case "subscription":
          return "bg-green-100 text-green-800 border-green-300";
        case "one-time":
          return "bg-blue-100 text-blue-800 border-blue-300";
        case "mini-draw":
          return "bg-purple-100 text-purple-800 border-purple-300";
        case "upsell":
          return "bg-orange-100 text-orange-800 border-orange-300";
        default:
          return "bg-gray-100 text-gray-800 border-gray-300";
      }
    }
  };

  // Get subscription badge colors based on package name
  const getSubscriptionBadgeColors = (packageName?: string) => {
    if (!packageName)
      return {
        background: "from-green-100 to-emerald-100",
        border: "border-green-300",
        text: "from-green-700 to-emerald-600",
      };

    const name = packageName.toLowerCase();

    if (name.includes("tradie") || name.includes("apprentice")) {
      return {
        background: "from-blue-100 to-indigo-100",
        border: "border-blue-300",
        text: "from-blue-700 to-indigo-600",
      };
    } else if (name.includes("foreman")) {
      return {
        background: "from-purple-100 to-violet-100",
        border: "border-purple-300",
        text: "from-purple-700 to-violet-600",
      };
    } else if (name.includes("boss")) {
      return {
        background: "from-yellow-100 to-orange-100",
        border: "border-yellow-400",
        text: "from-yellow-700 to-orange-600",
      };
    } else if (name.includes("power")) {
      return {
        background: "from-yellow-100 to-orange-100",
        border: "border-yellow-400",
        text: "from-yellow-700 to-orange-600",
      };
    } else {
      return {
        background: "from-green-100 to-emerald-100",
        border: "border-green-300",
        text: "from-green-700 to-emerald-600",
      };
    }
  };

  // Format date for display
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (!isRewardsFeatureEnabled) {
    return (
      <div className="bg-gradient-to-br from-white via-gray-50 to-white rounded-2xl shadow-lg border-2 border-gray-200 p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
            <Gift className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Partner Discounts Unavailable</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{pauseMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-white via-gray-50 to-white rounded-2xl shadow-lg border-2 border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gradient-to-r from-gray-200 to-gray-300 rounded-lg w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-24 bg-gradient-to-r from-gray-200 to-gray-300 rounded-xl"></div>
            <div className="h-16 bg-gradient-to-r from-gray-200 to-gray-300 rounded-xl"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-gradient-to-br from-red-50 via-orange-50 to-red-50 border-2 border-red-300 rounded-2xl p-6 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-red-900 mb-2">Error Loading Partner Discounts</h3>
            <p className="text-sm text-red-700 mb-3">{error instanceof Error ? error.message : String(error)}</p>
            <button
              onClick={() => refetchQueue()}
              className="bg-gradient-to-r from-red-600 to-red-700 text-white px-4 py-2 rounded-lg font-semibold hover:from-red-700 hover:to-red-800 transition-all duration-200 text-sm"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No data
  if (!queueData) {
    return null;
  }

  const { activePeriod, queuedItems, totalQueuedDays, totalQueuedItems, summary } = queueData;

  return (
    <div className="bg-gradient-to-br from-white via-gray-50 to-white rounded-2xl shadow-lg border-2 border-gray-200 relative overflow-hidden">
      {/* Premium Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-yellow-50/30 via-transparent to-orange-50/30 opacity-50"></div>
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-yellow-400/10 to-orange-500/10 rounded-full blur-2xl"></div>
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-red-400/10 to-orange-500/10 rounded-full blur-xl"></div>

      {/* Header - Always Visible */}
      <div className="relative z-10 w-full flex items-center justify-between p-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 bg-gradient-to-br from-red-600 via-red-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
            <Gift className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <h2 className="text-lg font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent font-['Poppins'] truncate">
              Partner Discounts
            </h2>
            {summary.isActiveSubscription && summary.subscriptionBenefits ? (
              (() => {
                const textColor = summary.subscriptionBenefits.packageName?.toLowerCase().includes("boss")
                  ? "text-yellow-600"
                  : summary.subscriptionBenefits.packageName?.toLowerCase().includes("foreman")
                  ? "text-purple-600"
                  : summary.subscriptionBenefits.packageName?.toLowerCase().includes("tradie")
                  ? "text-blue-600"
                  : "text-green-600";

                return (
                  <p className="text-sm text-gray-600">
                    <span className={`font-bold ${textColor}`}>
                      {summary.subscriptionBenefits.shopDiscountPercent}% off
                    </span>{" "}
                    shop discounts
                    <span className={`ml-2 ${textColor} font-semibold`}>• Active Subscription</span>
                  </p>
                );
              })()
            ) : summary.totalDaysOfAccessRemaining > 0 ? (
              <p className="text-sm text-gray-600">
                <span className="font-bold text-orange-600">{summary.totalDaysOfAccessRemaining} days</span> total
                access
                {activePeriod.isActive && <span className="ml-2 text-green-600 font-semibold">• Active</span>}
              </p>
            ) : (
              <p className="text-sm text-gray-500">No active access</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {summary.isActiveSubscription && summary.subscriptionBenefits ? (
            (() => {
              const colors = getSubscriptionBadgeColors(summary.subscriptionBenefits.packageName);
              return (
                <div
                  className={`bg-gradient-to-br ${colors.background} rounded-lg px-2.5 py-1.5 border-2 ${colors.border} shadow-sm`}
                >
                  <p
                    className={`text-lg font-bold bg-gradient-to-r ${colors.text} bg-clip-text text-transparent leading-none`}
                  >
                    {summary.subscriptionBenefits.shopDiscountPercent}%
                  </p>
                </div>
              );
            })()
          ) : summary.totalDaysOfAccessRemaining > 0 ? (
            <div
              className={`bg-gradient-to-br from-yellow-100 to-orange-100 rounded-lg px-2.5 py-1.5 border-2 border-yellow-300 shadow-sm`}
            >
              <p className="text-lg font-bold bg-gradient-to-r from-yellow-700 to-orange-600 bg-clip-text text-transparent leading-none">
                {summary.totalDaysOfAccessRemaining}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 px-4 pb-4 border-t border-gray-200 pt-4">
        {/* Active Period Section */}
        {activePeriod.isActive ? (
          <div className="mb-4 bg-gradient-to-br from-green-50 via-emerald-50 to-green-50 border-2 border-green-400 rounded-xl p-4 shadow-lg relative overflow-hidden group hover:shadow-xl transition-shadow duration-300">
            {/* Animated background */}
            <div className="absolute inset-0 bg-gradient-to-r from-green-100/30 via-transparent to-emerald-100/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="relative z-10">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md animate-pulse">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-base font-bold text-green-900 truncate">
                        ✅ {summary.isActiveSubscription ? "Active Subscription" : "Active Period"}
                      </h3>
                      <span
                        className={`px-2 py-0.5 text-xs font-bold rounded-full border uppercase tracking-wide ${getPackageBadgeColor(
                          activePeriod.source || "",
                          activePeriod.packageName || undefined
                        )}`}
                      >
                        {activePeriod.source}
                      </span>
                    </div>
                    <p className="text-green-800 font-semibold text-sm truncate">{activePeriod.packageName}</p>
                    {summary.isActiveSubscription && summary.subscriptionBenefits && (
                      <p className="text-green-700 font-bold text-sm mt-1">
                        {summary.subscriptionBenefits.shopDiscountPercent}% off all shop purchases
                      </p>
                    )}
                  </div>
                </div>

                {!summary.isActiveSubscription && (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-green-800">
                    <div className="flex items-center gap-1.5 bg-green-100 px-2 py-1 rounded-lg border border-green-300">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      <span className="font-bold whitespace-nowrap">
                        {timeRemaining.days}d {timeRemaining.hours}h {timeRemaining.minutes}m
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 flex-shrink-0" />
                      <span className="font-medium text-sm">{formatDate(activePeriod.endsAt!)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Compact Progress bar - Only for one-time packages, not subscriptions */}
              {!summary.isActiveSubscription && (
                <div className="mt-3">
                  <div className="w-full bg-green-200 rounded-full h-2 overflow-hidden shadow-inner border border-green-300">
                    <div
                      className="bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 h-2 rounded-full transition-all duration-500 shadow-md animate-pulse"
                      style={{
                        width: `${Math.max(
                          10,
                          (timeRemaining.hours / (activePeriod.daysRemaining * 24 + timeRemaining.hours)) * 100
                        )}%`,
                      }}
                    ></div>
                  </div>
                  <p className="text-xs text-green-700 mt-1 font-medium">
                    {activePeriod.daysRemaining} days until next benefit
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-4 bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 border-2 border-gray-300 border-dashed rounded-xl p-4 relative overflow-hidden">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-gray-400 to-gray-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-gray-800 mb-1">No Active Discount</h3>
                <p className="text-sm text-gray-600">
                  {totalQueuedItems > 0
                    ? "Next period activates automatically."
                    : "Purchase a package to get discounts!"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Queued Items Section - Compact */}
        {totalQueuedItems > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span className="truncate">Upcoming</span>
              </h3>
              <span className="px-2 py-1 bg-gradient-to-r from-yellow-100 to-orange-100 text-orange-800 border-2 border-orange-300 rounded-full text-xs font-bold shadow-sm whitespace-nowrap">
                {totalQueuedItems} queued
              </span>
            </div>

            <div
              ref={scrollContainerRef}
              className="h-[250px] overflow-y-auto pr-2 custom-scrollbar"
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "#ee0000 #f3f4f6",
              }}
            >
              <div className="space-y-2">
                {queuedItems.slice(0, visibleQueuedCount).map((item, index) => (
                  <div
                    key={index}
                    className="bg-gradient-to-br from-white via-gray-50 to-white border-2 border-gray-200 rounded-xl p-3 hover:shadow-lg transition-all duration-300 hover:scale-[1.01] group relative overflow-hidden"
                  >
                    {/* Hover effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-yellow-50/30 via-transparent to-orange-50/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                    <div className="relative z-10 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-7 h-7 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md">
                          {getPackageIcon(item.packageType)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-gray-900 text-sm truncate">{item.packageName}</h4>
                          <p className="text-xs text-gray-600 font-medium truncate">
                            <span className="text-orange-600 font-bold">{item.daysOfAccess}</span> day
                            {item.daysOfAccess !== 1 ? "s" : ""} access
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="inline-block px-2 py-0.5 bg-gradient-to-r from-red-100 to-orange-100 border border-red-300 rounded-md">
                          <span className="text-xs font-bold text-red-700 whitespace-nowrap">
                            #{item.queuePosition}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">{formatDate(item.purchaseDate)}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Loading indicator */}
                {visibleQueuedCount < totalQueuedItems && (
                  <div className="flex justify-center py-4">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Clock className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Loading more discounts...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Compact Summary Footer */}
            <div className="mt-3 p-3 bg-gradient-to-r from-yellow-50 via-orange-50 to-red-50 border-2 border-orange-300 rounded-xl shadow-inner relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-100/20 via-transparent to-orange-100/20"></div>
              <div className="relative z-10 flex items-start gap-2">
                <div className="w-7 h-7 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md">
                  <Calendar className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-orange-900 font-semibold mb-0.5">
                    <strong>Total:</strong> {totalQueuedDays} day
                    {totalQueuedDays !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-orange-800">Activates automatically when current period ends</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          !activePeriod.isActive && (
            <div className="text-center py-6 px-4">
              <div className="w-12 h-12 bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-inner">
                <Gift className="w-6 h-6 text-gray-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">No Queued Discounts</h3>
              <p className="text-sm text-gray-600 max-w-md mx-auto mb-4">
                Purchase packages to stack partner discount access!
              </p>
              <div className="inline-block px-4 py-2 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 text-black rounded-lg font-bold text-sm uppercase tracking-wide shadow-lg">
                Browse Packages
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
