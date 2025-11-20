/**
 * Partner Discount Queue Component
 *
 * Displays the user's current partner discount access status and queued future benefits.
 * Shows:
 * - Active discount period with countdown
 * - List of upcoming queued discount periods (FIFO order)
 * - Total days of access remaining
 * - Visual timeline of benefits
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Clock, Gift, Calendar, CheckCircle2, AlertCircle, Package, ChevronDown, ChevronUp } from "lucide-react";

// Interface for active period data from API
interface ActivePeriod {
  isActive: boolean;
  source: "subscription" | "one-time" | "mini-draw" | "upsell" | null;
  packageName: string | null;
  endsAt: Date | null;
  daysRemaining: number;
  hoursRemaining: number;
}

// Interface for queued item data from API
interface QueuedItem {
  packageName: string;
  packageType: "subscription" | "one-time" | "mini-draw" | "upsell";
  daysOfAccess: number;
  hoursOfAccess: number;
  purchaseDate: Date;
  queuePosition: number;
  expiryDate: Date;
}

// Interface for queue summary from API
interface QueueSummary {
  activePeriod: ActivePeriod;
  queuedItems: QueuedItem[];
  totalQueuedDays: number;
  totalQueuedItems: number;
  summary: {
    hasActiveAccess: boolean;
    hasQueuedItems: boolean;
    nextActivationDate: Date | null;
    totalDaysOfAccessRemaining: number;
    isActiveSubscription: boolean; // New field to distinguish subscription vs one-time
    subscriptionBenefits?: {
      shopDiscountPercent: number;
      packageName: string;
      subscriptionType: string;
    };
  };
}

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

type PartnerDiscountQueueProps = {
  className?: string;
  startExpanded?: boolean;
  forceExpanded?: boolean;
  variant?: "dashboard" | "detailed";
  titleOverride?: string;
  subtitleOverride?: string;
};

export default function PartnerDiscountQueue({
  className = "",
  startExpanded = false,
  forceExpanded = false,
  variant = "dashboard",
  titleOverride,
  subtitleOverride,
}: PartnerDiscountQueueProps) {
  const [queueData, setQueueData] = useState<QueueSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState({ days: 0, hours: 0, minutes: 0 });
  const [isExpanded, setIsExpanded] = useState(startExpanded); // Collapsed by default unless overridden
  const [isOptimisticUpdate, setIsOptimisticUpdate] = useState(false); // Track optimistic updates
  const expanded = forceExpanded ? true : isExpanded;

  // Keep forced expanded panels open even if a user tries to toggle.
  useEffect(() => {
    if (forceExpanded) {
      setIsExpanded(true);
    }
  }, [forceExpanded]);

  // Fetch queue data from API with optimistic update support
  const fetchQueueData = useCallback(async (isOptimistic = false) => {
    try {
      if (!isOptimistic) {
        setIsLoading(true);
      }
      setError(null);

      const response = await fetch("/api/partner-discount/queue");
      if (!response.ok) {
        throw new Error("Failed to fetch partner discount queue");
      }

      const result = await response.json();
      if (result.success) {
        setQueueData(result.data);
        if (isOptimistic) {
          setIsOptimisticUpdate(false); // Reset optimistic flag
        }
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (err) {
      console.error("Error fetching queue data:", err);
      setError(err instanceof Error ? err.message : "Failed to load partner discount queue");
      if (isOptimistic) {
        setIsOptimisticUpdate(false); // Reset on error
      }
    } finally {
      if (!isOptimistic) {
        setIsLoading(false);
      }
    }
  }, []);

  // Optimistic update function for immediate UI feedback
  const addOptimisticQueueItem = useCallback(
    (packageData: {
      packageName: string;
      packageType: "subscription" | "one-time" | "mini-draw" | "upsell";
      discountDays: number;
      discountHours: number;
    }) => {
      if (!queueData) return;

      setIsOptimisticUpdate(true);

      // Create optimistic queue item
      const optimisticItem: QueuedItem = {
        packageName: packageData.packageName,
        packageType: packageData.packageType,
        daysOfAccess: packageData.discountDays,
        hoursOfAccess: packageData.discountHours,
        purchaseDate: new Date(),
        queuePosition: queueData.totalQueuedItems + 1,
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 12 months from now
      };

      // Update queue data optimistically
      const updatedQueueData = {
        ...queueData,
        queuedItems: [...queueData.queuedItems, optimisticItem],
        totalQueuedDays: queueData.totalQueuedDays + packageData.discountDays,
        totalQueuedItems: queueData.totalQueuedItems + 1,
        summary: {
          ...queueData.summary,
          hasQueuedItems: true,
          totalDaysOfAccessRemaining: queueData.summary.totalDaysOfAccessRemaining + packageData.discountDays,
        },
      };

      setQueueData(updatedQueueData);

      // Fetch real data in background
      setTimeout(() => {
        fetchQueueData(true); // Fetch without loading state
      }, 1000);
    },
    [queueData, fetchQueueData]
  );

  // Initial load
  useEffect(() => {
    fetchQueueData();
  }, [fetchQueueData]);

  // Event listener for purchase completion (best practice: custom events)
  useEffect(() => {
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
  }, [queueData, addOptimisticQueueItem]);

  // Listen for focus events to refresh data (best practice: stale-while-revalidate)
  useEffect(() => {
    const handleFocus = () => {
      // Refresh data when user returns to tab (stale-while-revalidate pattern)
      if (!isLoading && !isOptimisticUpdate) {
        fetchQueueData(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [isLoading, isOptimisticUpdate, fetchQueueData]);

  // Update countdown timer for active period
  useEffect(() => {
    if (!queueData?.activePeriod?.isActive || !queueData.activePeriod.endsAt) {
      return;
    }

    const updateTimer = () => {
      const now = new Date();
      const endsAt = new Date(queueData.activePeriod.endsAt!);
      const diff = endsAt.getTime() - now.getTime();

      if (diff <= 0) {
        // Period has ended - refresh data
        fetchQueueData();
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      setTimeRemaining({ days, hours, minutes });
    };

    // Update immediately
    updateTimer();

    // Update every minute
    const interval = setInterval(updateTimer, 60000);

    return () => clearInterval(interval);
  }, [queueData, fetchQueueData]);

  // Get icon based on package type
  const getPackageIcon = (type: string) => {
    switch (type) {
      case "subscription":
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case "one-time":
        return <Package className="w-5 h-5 text-blue-600" />;
      case "mini-draw":
        return <Gift className="w-5 h-5 text-purple-600" />;
      case "upsell":
        return <Gift className="w-5 h-5 text-orange-600" />;
      default:
        return <Package className="w-5 h-5 text-gray-600" />;
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

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-white via-gray-50 to-white rounded-3xl shadow-lg border-2 border-gray-200 p-6 sm:p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 rounded-xl w-1/3 mb-6"></div>
          <div className="space-y-4">
            <div className="h-32 bg-gradient-to-r from-gray-200 to-gray-300 rounded-2xl"></div>
            <div className="h-24 bg-gradient-to-r from-gray-200 to-gray-300 rounded-2xl"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-gradient-to-br from-red-50 via-orange-50 to-red-50 border-2 border-red-300 rounded-3xl p-6 sm:p-8 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-red-900 mb-2">Error Loading Partner Discounts</h3>
            <p className="text-sm text-red-700 mb-4">{error}</p>
            <button
              onClick={() => fetchQueueData()}
              className="bg-gradient-to-r from-red-600 to-red-700 text-white px-6 py-3 rounded-xl font-semibold hover:from-red-700 hover:to-red-800 transition-all duration-300 transform hover:scale-105 shadow-lg text-sm uppercase tracking-wide"
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

  const queueHeading = titleOverride ?? "Partner Discounts";
  const queueSubtitle =
    subtitleOverride ??
    (summary.isActiveSubscription && summary.subscriptionBenefits
      ? `${summary.subscriptionBenefits.shopDiscountPercent}% shop discount • Active subscription`
      : summary.totalDaysOfAccessRemaining > 0
      ? `${summary.totalDaysOfAccessRemaining} days of access `
      : "You have no partner access yet");

  const handleToggle = () => {
    if (forceExpanded) {
      return;
    }
    setIsExpanded((prev) => !prev);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#050607] via-[#0f1117] to-[#030304] border border-white/10 shadow-[0_20px_45px_rgba(0,0,0,0.65)] text-white ${className}`}
    >
      {/* Premium Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/5 opacity-40"></div>
      <div className="absolute inset-0 opacity-[0.08] pattern-radial-grid"></div>
      <div className="absolute top-[-40px] right-[-60px] w-72 h-72 bg-gradient-to-br from-red-500/20 via-yellow-400/10 to-transparent rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-60px] left-[-40px] w-72 h-72 bg-gradient-to-tr from-white/10 via-red-500/10 to-transparent rounded-full blur-3xl"></div>

      {/* Collapsible Header - Always Visible */}
      <button
        onClick={handleToggle}
        className="relative z-10 w-full flex items-center justify-between p-4 sm:p-5 lg:p-6 hover:bg-white/5 transition-all duration-200 cursor-pointer group"
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-red-600 via-red-500 to-orange-600 rounded-xl flex items-center justify-center shadow-xl flex-shrink-0 group-hover:scale-110 transition-transform duration-200 ring-2 ring-white/20">
            <Gift className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <h2 className="text-base sm:text-lg lg:text-2xl font-bold text-white font-['Poppins'] truncate drop-shadow-lg">
              {queueHeading}
            </h2>
            <p className="text-xs sm:text-sm text-white/70">{queueSubtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {summary.isActiveSubscription && summary.subscriptionBenefits ? (
            (() => {
              const colors = getSubscriptionBadgeColors(summary.subscriptionBenefits.packageName);
              return (
                <div
                  className={`bg-gradient-to-br ${
                    colors.background
                  } rounded-lg sm:rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 border-2 ${colors.border} shadow-sm ${
                    isOptimisticUpdate ? "animate-pulse" : ""
                  }`}
                >
                  <p
                    className={`text-lg sm:text-2xl font-bold bg-gradient-to-r ${colors.text} bg-clip-text text-transparent leading-none`}
                  >
                    {summary.subscriptionBenefits.shopDiscountPercent}%
                  </p>
                </div>
              );
            })()
          ) : summary.totalDaysOfAccessRemaining > 0 ? (
            <div
              className={`bg-gradient-to-br from-yellow-100 to-orange-100 rounded-lg sm:rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 border-2 border-yellow-300 shadow-sm ${
                isOptimisticUpdate ? "animate-pulse" : ""
              }`}
            >
              <p className="text-sm sm:text-2xl font-bold bg-gradient-to-r from-yellow-700 to-orange-600 bg-clip-text text-transparent leading-none">
                {summary.totalDaysOfAccessRemaining}
              </p>
            </div>
          ) : null}
          <div className="w-8 h-8 sm:w-9 sm:h-9 bg-white/10 rounded-lg flex items-center justify-center group-hover:bg-white/20 transition-colors border border-white/20">
            {expanded ? (
              <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            ) : (
              <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            )}
          </div>
        </div>
      </button>

      {expanded && variant === "detailed" && (
        <div className="relative z-10 px-4 sm:px-5 lg:px-6 pt-0 pb-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                label: "Access Status",
                value: summary.hasActiveAccess ? "Live" : "Inactive",
                hint: summary.hasActiveAccess ? "Discounts applied right now." : "Queue another package to resume.",
                accent: "from-emerald-400/40 to-emerald-600/10 border-emerald-400/30",
              },
              {
                label: "Queued Days",
                value: totalQueuedDays,
                hint: "Auto-activates when current period ends.",
                accent: "from-yellow-400/40 to-orange-500/10 border-yellow-400/30",
              },
              {
                label: "Packages Queued",
                value: totalQueuedItems,
                hint: "Memberships, one-time packs, upsells.",
                accent: "from-blue-400/40 to-indigo-500/10 border-blue-400/30",
              },
            ].map((card) => (
              <div
                key={card.label}
                className={`p-4 rounded-2xl bg-gradient-to-br ${card.accent} backdrop-blur border text-white shadow-inner`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/70">{card.label}</p>
                <p className="text-2xl font-bold mt-1 drop-shadow">{card.value}</p>
                <p className="text-sm text-white/70 mt-1">{card.hint}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expandable Content */}
      {expanded && (
        <div className="relative z-10 px-4 sm:px-5 lg:px-6 pb-4 sm:pb-5 lg:pb-6 border-t border-white/10 pt-4 sm:pt-5">
          {/* Active Period Section */}
          {activePeriod.isActive ? (
            <div className="mb-4 sm:mb-6 bg-gradient-to-br from-[#062013] via-[#04140c] to-[#020805] border border-emerald-500/40 rounded-xl sm:rounded-2xl p-3 sm:p-5 lg:p-6 shadow-[0_15px_35px_rgba(6,20,12,0.6)] relative overflow-hidden group hover:shadow-[0_20px_45px_rgba(6,20,12,0.75)] transition-shadow duration-300">
              {/* Animated background */}
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 via-transparent to-emerald-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

              <div className="relative z-10">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 shadow-md animate-pulse ring-2 ring-emerald-300/40">
                      <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 lg:w-7 lg:h-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                        <h3 className="text-sm sm:text-base lg:text-xl font-bold text-white truncate drop-shadow">
                          ✅ {summary.isActiveSubscription ? "Active Subscription" : "Active Period"}
                        </h3>
                        <span
                          className={`px-2 py-0.5 text-[10px] sm:text-xs font-bold rounded-full border uppercase tracking-wide bg-white/10 text-white ${getPackageBadgeColor(
                            activePeriod.source || "",
                            activePeriod.packageName || undefined
                          )}`}
                        >
                          {activePeriod.source}
                        </span>
                      </div>
                      <p className="text-white/90 font-semibold text-xs sm:text-sm lg:text-lg truncate">
                        {activePeriod.packageName}
                      </p>
                      {summary.isActiveSubscription && summary.subscriptionBenefits && (
                        <p className="text-emerald-200 font-bold text-xs sm:text-sm mt-1">
                          {summary.subscriptionBenefits.shopDiscountPercent}% off all shop purchases
                        </p>
                      )}
                    </div>
                  </div>

                  {!summary.isActiveSubscription && (
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-emerald-200">
                      <div className="flex items-center gap-1.5 bg-emerald-500/20 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-emerald-400/40">
                        <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="font-bold whitespace-nowrap">
                          {timeRemaining.days}d {timeRemaining.hours}h {timeRemaining.minutes}m
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="font-medium text-[11px] sm:text-sm">{formatDate(activePeriod.endsAt!)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Compact Progress bar - Only for one-time packages, not subscriptions */}
                {!summary.isActiveSubscription && (
                  <div className="mt-3 sm:mt-4">
                    <div className="w-full bg-white/10 rounded-full h-2 sm:h-3 overflow-hidden shadow-inner border border-white/20">
                      <div
                        className="bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-300 h-2 sm:h-3 rounded-full transition-all duration-500 shadow-md animate-pulse"
                        style={{
                          width: `${Math.max(
                            10,
                            (timeRemaining.hours / (activePeriod.daysRemaining * 24 + timeRemaining.hours)) * 100
                          )}%`,
                        }}
                      ></div>
                    </div>
                    <p className="text-[10px] sm:text-xs text-emerald-200 mt-1 sm:mt-2 font-medium">
                      {activePeriod.daysRemaining} days until next benefit
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mb-4 sm:mb-6 bg-gradient-to-br from-[#1b1c20] via-[#101115] to-[#08090b] border border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-5 lg:p-6 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-transparent to-white/5 opacity-30"></div>
              <div className="relative flex items-start gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-gray-200 to-gray-400 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 lg:w-7 lg:h-7 text-gray-900" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm sm:text-base lg:text-xl font-bold text-white mb-1">No Active Discount</h3>
                  <p className="text-xs sm:text-sm text-white/70">
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
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h3 className="text-sm sm:text-base lg:text-xl font-bold text-white flex items-center gap-1.5 sm:gap-2">
                  <Package className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-red-400 flex-shrink-0" />
                  <span className="truncate">Upcoming</span>
                </h3>
                <span className="px-2 py-1 sm:px-3 sm:py-1.5 lg:px-4 lg:py-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-white border border-yellow-400/30 rounded-full text-[10px] sm:text-xs lg:text-sm font-bold shadow-sm whitespace-nowrap">
                  {totalQueuedItems} queued
                </span>
              </div>

              <div className="space-y-2 sm:space-y-3">
                {queuedItems.slice(0, 5).map((item, index) => (
                  <div
                    key={index}
                    className="bg-gradient-to-br from-[#111318] via-[#08090c] to-[#050506] border border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-5 hover:shadow-[0_15px_35px_rgba(0,0,0,0.6)] transition-all duration-300 hover:scale-[1.01] group relative overflow-hidden"
                  >
                    {/* Hover effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-transparent to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                    <div className="relative z-10 flex items-center justify-between gap-2 sm:gap-4">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ring-1 ring-yellow-300/30">
                          {getPackageIcon(item.packageType)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-white text-xs sm:text-sm lg:text-lg truncate">
                            {item.packageName}
                          </h4>
                          <p className="text-[10px] sm:text-xs lg:text-sm text-white/70 font-medium truncate">
                            <span className="text-orange-300 font-bold">{item.daysOfAccess}</span> day
                            {item.daysOfAccess !== 1 ? "s" : ""} access
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="inline-block px-2 py-0.5 sm:px-2.5 sm:py-1 bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-400/30 rounded-md sm:rounded-lg">
                          <span className="text-[10px] sm:text-xs lg:text-sm font-bold text-white whitespace-nowrap">
                            #{item.queuePosition}
                          </span>
                        </div>
                        <p className="text-[9px] sm:text-[10px] lg:text-xs text-white/50 font-medium mt-0.5 sm:mt-1">
                          {formatDate(item.purchaseDate)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                {totalQueuedItems > 5 && (
                  <div className="text-center py-2 sm:py-3 text-xs sm:text-sm font-semibold text-white bg-white/5 rounded-lg sm:rounded-xl border border-white/15">
                    + {totalQueuedItems - 5} more
                  </div>
                )}
              </div>

              {/* Compact Summary Footer */}
              <div className="mt-3 sm:mt-4 lg:mt-5 p-3 sm:p-4 lg:p-5 bg-gradient-to-r from-[#18100a] via-[#201106] to-[#2b0909] border border-orange-400/30 rounded-xl sm:rounded-2xl shadow-inner relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/20 via-transparent to-red-500/20"></div>
                <div className="relative z-10 flex items-start gap-2 sm:gap-3">
                  <div className="w-7 h-7 sm:w-9 sm:h-9 lg:w-10 lg:h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ring-1 ring-white/30">
                    <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5 text-white drop-shadow" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm text-white font-semibold mb-0.5 sm:mb-1">
                      <strong className="text-sm sm:text-base">Total:</strong> {totalQueuedDays} day
                      {totalQueuedDays !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[10px] sm:text-xs text-white/70">
                      Activates automatically when current period ends
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            !activePeriod.isActive && (
              <div className="text-center py-6 sm:py-8 lg:py-10 px-4 sm:px-6">
                <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-gradient-to-br from-white/15 to-white/5 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 shadow-inner border border-white/20">
                  <Gift className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-white" />
                </div>
                <h3 className="text-base sm:text-lg lg:text-xl font-bold text-white mb-2 sm:mb-3">
                  No Queued Discounts
                </h3>
                <p className="text-xs sm:text-sm text-white/70 max-w-md mx-auto mb-4 sm:mb-6">
                  Purchase packages to stack partner discount access!
                </p>
                <div className="inline-block px-4 py-2 sm:px-6 sm:py-3 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 text-black rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wide shadow-lg">
                  Browse Packages
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
