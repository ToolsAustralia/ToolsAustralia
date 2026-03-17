"use client";

import React from "react";
import { History, Info } from "lucide-react";
import MembershipBadge from "@/components/ui/MembershipBadge";
import MonthProjectionTooltip from "@/components/ui/MonthProjectionTooltip";
import type { PackageDetailModalPackageData, SubscriptionAccumulationData } from "@/components/modals/PackageDetailModal";

interface MajorDrawOverviewProps {
  drawName: string;
  drawStatus: "queued" | "active" | "frozen" | "completed" | "cancelled";
  drawDate?: string;
  totalEntries: number;
  membershipEntries: number;
  oneTimeEntries: number;
  membershipPackage?: PackageDetailModalPackageData | null;
  oneTimePackages?: Array<{
    packageId: string;
    packageData: PackageDetailModalPackageData;
    isActive: boolean;
  }>;
  hasActiveSubscription?: boolean;
  onViewPastDraws: () => void;
  onBadgeClick?: (data: {
    packageData: PackageDetailModalPackageData;
    membershipType: "subscription" | "one-time";
    accumulation: SubscriptionAccumulationData | null;
  }) => void;
  projectionData?: {
    current: number;
    nextMonth: number;
    month3: number;
  } | null;
  pendingEntriesData?: {
    expectedEntries: number;
    renewalDate: Date | null;
    isFailedRenewal: boolean;
    isPending: true;
  } | null;
  onResolvePayment?: () => void;
  userSubscription?: { lastMonthAccumulatedEntries?: number };
  activeOneTimePackageIds?: Set<string>;
  className?: string;
}

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

export default function MajorDrawOverview({
  drawName,
  drawStatus,
  drawDate,
  totalEntries,
  membershipEntries,
  oneTimeEntries,
  membershipPackage,
  oneTimePackages = [],
  hasActiveSubscription = false,
  onViewPastDraws,
  onBadgeClick,
  projectionData,
  pendingEntriesData,
  onResolvePayment,
  userSubscription,
  activeOneTimePackageIds,
  className = "",
}: MajorDrawOverviewProps) {
  const [showAccumulationTooltip, setShowAccumulationTooltip] = React.useState(false);
  const [tooltipPosition, setTooltipPosition] = React.useState<{ top: number; left: number } | null>(null);

  const _isCompleted = drawStatus === "completed";
  const isFrozen = drawStatus === "frozen";
  const isActive = drawStatus === "active";
  const _isQueued = drawStatus === "queued";

  const displayMembershipEntries = pendingEntriesData ? pendingEntriesData.expectedEntries : membershipEntries;

  return (
    <div className={`px-4 sm:px-6 ${className}`}>
      <div className="max-w-7xl mx-auto">
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
          <div className="bg-gradient-to-br from-[#ee0000] via-red-600 to-red-700 dark:from-red-900 dark:via-red-800 dark:to-red-900 p-3 xs:p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-3 sm:mb-4">
              <h3 className="text-white font-bold text-base xs:text-lg sm:text-xl">{drawName}</h3>
              {drawDate && (isActive || isFrozen) && (
                <CountdownDisplay targetDate={drawDate} />
              )}
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 xs:p-4 border border-white/20">
              <div className="text-center mb-3">
                <div className="text-2xl xs:text-3xl sm:text-4xl font-bold bg-gradient-to-r from-white via-yellow-100 to-white bg-clip-text text-transparent mb-1">
                  {totalEntries}
                </div>
                <div className="text-white/90 text-xs xs:text-sm sm:text-base md:text-lg font-semibold uppercase tracking-wide">Total Entries</div>
              </div>

              <div className="grid grid-cols-2 gap-2 relative">
                {showAccumulationTooltip && tooltipPosition && projectionData && (
                  <MonthProjectionTooltip
                    isVisible={showAccumulationTooltip}
                    position={tooltipPosition}
                    current={projectionData.current}
                    nextMonth={projectionData.nextMonth}
                    month3={projectionData.month3}
                  />
                )}

                <div
                  className={`group relative backdrop-blur-sm rounded-lg xs:rounded-xl p-2 xs:p-3 border ${
                    pendingEntriesData?.isFailedRenewal
                      ? "bg-gradient-to-br from-amber-500/20 via-amber-400/10 to-orange-500/20 border-amber-400/30"
                      : pendingEntriesData
                        ? "bg-gradient-to-br from-slate-500/20 via-blue-400/10 to-indigo-500/20 border-blue-300/30"
                        : "bg-gradient-to-br from-blue-500/20 via-blue-400/10 to-indigo-500/20 border-blue-400/30"
                  }`}
                >
                  {hasActiveSubscription && membershipPackage && projectionData && (
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
                      <span className="text-white/90 text-[10px] xs:text-xs font-semibold uppercase tracking-wide">Membership</span>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-0.5 mb-1">
                      <div
                        className={`text-lg xs:text-xl font-bold drop-shadow-lg ${
                          pendingEntriesData?.isFailedRenewal
                            ? "text-amber-400"
                            : pendingEntriesData
                              ? "text-blue-200"
                              : "text-white"
                        }`}
                      >
                        {displayMembershipEntries}
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
                              {onResolvePayment && (
                                <button
                                  type="button"
                                  onClick={onResolvePayment}
                                  className="underline underline-offset-1 hover:no-underline focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-1 focus:ring-offset-transparent rounded"
                                  aria-label="Resolve payment – open Settings subscription tab"
                                >
                                  Resolve payment
                                </button>
                              )}
                            </>
                          ) : pendingEntriesData.renewalDate ? (
                            `Added on renewal`
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
                            if (onBadgeClick) {
                              const baseEntries = (membershipPackage as { entriesPerMonth?: number }).entriesPerMonth ?? 0;
                              const accumulation: SubscriptionAccumulationData | null =
                                membershipPackage.type === "subscription" && baseEntries > 0 && userSubscription
                                  ? {
                                      entriesPerMonth: baseEntries,
                                      lastMonthAccumulatedEntries: userSubscription.lastMonthAccumulatedEntries ?? baseEntries,
                                    }
                                  : null;
                              onBadgeClick({
                                packageData: membershipPackage,
                                membershipType: "subscription",
                                accumulation,
                              });
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="group relative bg-gradient-to-br from-green-500/20 via-emerald-400/10 to-teal-500/20 backdrop-blur-sm rounded-lg xs:rounded-xl p-2 xs:p-3 border border-green-400/30">
                  <div className="relative z-10 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <span className="text-white/90 text-[10px] xs:text-xs font-semibold uppercase tracking-wide">One-time</span>
                    </div>
                    <div className="text-lg xs:text-xl font-bold text-white mb-1 drop-shadow-lg">{oneTimeEntries}</div>
                    <div className="text-[10px] xs:text-xs text-white/70 uppercase tracking-wide">Packages</div>
                    {oneTimePackages && oneTimePackages.length > 0 && activeOneTimePackageIds && (
                      <div className="flex flex-wrap justify-center gap-2 mt-2">
                        {oneTimePackages
                          .filter((pkg) => pkg.isActive && activeOneTimePackageIds.has(String(pkg.packageId)))
                          .map((pkg, index) => (
                            <MembershipBadge
                              key={`${String(pkg.packageId)}-${index}`}
                              packageData={pkg.packageData}
                              isActive={true}
                              membershipType="one-time"
                              iconOnly
                              onClick={() => {
                                if (onBadgeClick) {
                                  onBadgeClick({
                                    packageData: pkg.packageData,
                                    membershipType: "one-time",
                                    accumulation: null,
                                  });
                                }
                              }}
                            />
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onViewPastDraws}
            className="w-full p-3 xs:p-4 sm:p-6 inline-flex items-center justify-center gap-2 sm:gap-3 bg-gray-50 dark:bg-neutral-800/50 hover:bg-gray-100 dark:hover:bg-neutral-700/50 text-gray-900 dark:text-white text-xs xs:text-sm sm:text-base md:text-lg font-semibold uppercase tracking-wide transition-colors rounded-b-2xl"
          >
            VIEW PAST DRAWS
            <History className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" strokeWidth={2.5} />
          </button>
        </div>

        {showAccumulationTooltip && (
          <div className="fixed inset-0 z-[9998]" onClick={() => setShowAccumulationTooltip(false)} />
        )}
      </div>
    </div>
  );
}
