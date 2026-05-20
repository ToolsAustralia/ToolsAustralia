"use client";

import React from "react";
import { History, Info, Shield, Gift, Clock } from "lucide-react";
import MembershipBadge from "@/components/ui/MembershipBadge";
import MonthProjectionTooltip from "@/components/ui/MonthProjectionTooltip";
import type { PackageDetailModalPackageData, SubscriptionAccumulationData } from "@/components/modals/PackageDetailModal";
import { formatRenewalDate } from "@/utils/dates/month-helpers";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { useLeafTimer } from "@/hooks/useLeafTimer";
import { cn } from "@/utils/cn";

interface MajorDrawOverviewProps {
  drawName: string;
  drawStatus: "queued" | "active" | "frozen" | "completed" | "cancelled";
  drawDate?: string;
  /**
   * Start of the current major-draw window. Used together with `drawDate` and
   * `userSubscription.lastResubscribedAt` to decide whether to render the
   * resubscribe + carry-over sub-line below the Membership chip.
   */
  activationDate?: string;
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
  onOneTimeCardClick?: () => void;
  userSubscription?: {
    lastMonthAccumulatedEntries?: number;
    /**
     * Timestamp of the most recent resubscribe (cancelled membership → reactivated).
     * When this falls between `activationDate` and `drawDate`, the major-draw card
     * shows a sub-line clarifying that the membership entries this period include
     * a resubscribe + carry-over.
     */
    lastResubscribedAt?: string | Date;
  };
  activeOneTimePackageIds?: Set<string>;
  className?: string;
}

function CountdownDisplay({ targetDate }: { targetDate: string }) {
  // Leaf component: owns its own 1s tick via useLeafTimer so the parent
  // (MajorDrawOverview) does not re-render on every tick.
  const now = useLeafTimer(1000);
  const target = new Date(targetDate).getTime();
  const difference = target - now;
  const timeLeft =
    difference > 0
      ? {
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        }
      : { days: 0, hours: 0, minutes: 0, seconds: 0 };

  const TimeSegment = ({ value, label }: { value: number; label: string }) => (
    <div className="flex flex-col items-center">
      <div className="relative bg-white/15 dark:bg-slate-800/60 backdrop-blur-md rounded-lg px-2 py-1.5 sm:px-3 sm:py-2 border border-white/20 dark:border-slate-500/50 min-w-[40px] sm:min-w-[50px] shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 rounded-lg bg-gradient-to-b from-white/[0.08] to-transparent" />
        <div className="relative text-white dark:text-slate-100 font-bold text-sm sm:text-base tabular-nums text-center">
          {value.toString().padStart(2, '0')}
        </div>
      </div>
      <div className="text-white/50 dark:text-slate-500 text-3xs sm:text-3xs font-bold uppercase tracking-[0.2em] mt-1">
        {label}
      </div>
    </div>
  );

  const Separator = () => (
    <div className="text-white/30 dark:text-slate-500 font-bold text-lg sm:text-xl self-start mt-1.5 sm:mt-2 px-0.5">:</div>
  );

  if (timeLeft.days > 0) {
    return (
      <div className="flex items-start gap-0.5 sm:gap-1">
        <TimeSegment value={timeLeft.days} label="days" />
        <Separator />
        <TimeSegment value={timeLeft.hours} label="hrs" />
      </div>
    );
  } else if (timeLeft.hours > 0) {
    return (
      <div className="flex items-start gap-0.5 sm:gap-1">
        <TimeSegment value={timeLeft.hours} label="hrs" />
        <Separator />
        <TimeSegment value={timeLeft.minutes} label="min" />
      </div>
    );
  } else if (timeLeft.minutes > 0) {
    return (
      <div className="flex items-start gap-0.5 sm:gap-1">
        <TimeSegment value={timeLeft.minutes} label="min" />
        <Separator />
        <TimeSegment value={timeLeft.seconds} label="sec" />
      </div>
    );
  } else {
    return (
      <div className="flex items-start gap-0.5 sm:gap-1">
        <TimeSegment value={timeLeft.seconds} label="sec" />
      </div>
    );
  }
}

export default function MajorDrawOverview({
  drawName,
  drawStatus,
  drawDate,
  activationDate,
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
  onOneTimeCardClick,
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

  const projectedTotalEntries = pendingEntriesData
    ? pendingEntriesData.expectedEntries + oneTimeEntries
    : totalEntries;

  const [showProjected, setShowProjected] = React.useState(false);

  React.useEffect(() => {
    if (!pendingEntriesData) {
      setShowProjected(false);
      return;
    }
    setShowProjected(false);
    const id = window.setInterval(() => {
      setShowProjected((prev) => !prev);
    }, 5000);
    return () => window.clearInterval(id);
  }, [pendingEntriesData, projectedTotalEntries]);

  const heroValue = pendingEntriesData && showProjected ? projectedTotalEntries : totalEntries;
  const heroLabel =
    pendingEntriesData && showProjected
      ? "Total entries upon membership renewal"
      : "Total Entries";

  /** Wider string wins so tabular hero number does not shift horizontally when alternating. */
  const pendingHeroMinCh = pendingEntriesData
    ? Math.max(
        totalEntries.toLocaleString("en-AU").length,
        projectedTotalEntries.toLocaleString("en-AU").length
      )
    : 0;

  /**
   * True when the user's most recent resubscribe timestamp falls inside this
   * draw's `[activationDate, drawDate]` window. Used to render a sub-line that
   * clarifies the membership entries for this period include a resubscribe +
   * carry-over from the previous membership.
   */
  const drawIncludesResubscribe = Boolean(
    userSubscription?.lastResubscribedAt &&
      activationDate &&
      drawDate &&
      new Date(userSubscription.lastResubscribedAt) >= new Date(activationDate) &&
      new Date(userSubscription.lastResubscribedAt) <= new Date(drawDate)
  );

  /** One badge per package id (user may have multiple active rows for the same upsell). */
  const oneTimeBadgesList = (() => {
    if (!oneTimePackages.length || !activeOneTimePackageIds) return [];
    const byPackageId = new Map<string, (typeof oneTimePackages)[number]>();
    for (const pkg of oneTimePackages) {
      if (!pkg.isActive) continue;
      const id = String(pkg.packageId);
      if (!activeOneTimePackageIds.has(id)) continue;
      if (!byPackageId.has(id)) byPackageId.set(id, pkg);
    }
    return Array.from(byPackageId.values());
  })();

  return (
    <div className={cn("px-4 sm:px-6", className)}>
      <div className="max-w-7xl mx-auto">
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.25),0_4px_20px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)] border border-slate-200/80 dark:border-slate-700/60 overflow-hidden">

          {/* Header Section */}
          <div className="relative bg-gradient-to-br from-[#0a0d14] via-[#150a0f] to-[#0a0d14] dark:from-[#050608] dark:via-[#12080c] dark:to-[#050608] p-4 xs:p-5 sm:p-6 lg:p-8 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_24px_rgba(0,0,0,0.3)]">

            {/* Decorative background layers - stronger red glow */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(238,0,0,0.22),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_80%_80%,rgba(238,0,0,0.12),transparent)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_400px_at_20%_90%,rgba(220,38,38,0.08),transparent)]" />
            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

            {/* Title row */}
            <div className="relative flex items-center justify-between gap-3 mb-5 sm:mb-6">
              <h3 className="text-white font-bold text-lg xs:text-xl sm:text-2xl tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">{drawName}</h3>
              {drawDate && (isActive || isFrozen) && (
                <CountdownDisplay targetDate={drawDate} />
              )}
            </div>

            {/* Main content panel - elevated glass */}
           

              {/* Total entries hero — fixed slots to avoid layout shift when alternating pending renewal */}
              <div className="mb-2 flex flex-col items-center text-center">
                <div
                  className={`relative mx-auto flex items-center justify-center ${
                    pendingEntriesData
                      ? "mb-1 min-h-[2.75rem] xs:min-h-[3.25rem] sm:mb-1.5 sm:min-h-[3.75rem]"
                      : "mb-1.5"
                  }`}
                  style={
                    pendingEntriesData && pendingHeroMinCh > 0
                      ? { minWidth: `${pendingHeroMinCh + 1}ch` }
                      : undefined
                  }
                >
                  <div className="absolute inset-0 bg-gradient-radial from-red-500/30 via-red-400/10 to-transparent blur-3xl scale-[2.5]" />
                  <div className="relative text-4xl xs:text-5xl sm:text-6xl font-extrabold tracking-tighter tabular-nums text-white drop-shadow-[0_0_40px_rgba(238,0,0,0.35),0_0_20px_rgba(238,0,0,0.2),0_2px_4px_rgba(0,0,0,0.4)]">
                    <AnimatedNumber value={heroValue} className="tabular-nums" />
                  </div>
                </div>
                <div
                  className={`flex w-full max-w-full items-center justify-center px-1 ${
                    pendingEntriesData ? "min-h-11 xs:min-h-12 sm:min-h-14" : ""
                  }`}
                >
                  <span
                    key={pendingEntriesData ? String(showProjected) : "default"}
                    className={`max-w-full text-center text-red-100/90 transition-opacity duration-500 whitespace-nowrap ${
                      pendingEntriesData && showProjected
                        ? "font-semibold normal-case tracking-normal text-xs xs:text-sm sm:text-base leading-tight"
                        : "font-bold uppercase text-2xs xs:text-xs sm:text-sm tracking-[0.35em]"
                    }`}
                  >
                    {heroLabel}
                  </span>
                </div>
              </div>

              <div className="space-y-4 relative">
                {showAccumulationTooltip && tooltipPosition && projectionData && (
                  <MonthProjectionTooltip
                    isVisible={showAccumulationTooltip}
                    position={tooltipPosition}
                    placement="top"
                    current={projectionData.current}
                    nextMonth={projectionData.nextMonth}
                    month3={projectionData.month3}
                  />
                )}

                <div className="space-y-3">
                  {/* Entry breakdown cards */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">

                    {/* Membership entries card */}
                    <div
                      className={`group relative flex flex-col items-center justify-between rounded-xl py-4 sm:py-5 px-3 transition-all duration-300 hover:scale-[1.02] shadow-lg min-h-[theme(spacing.28)] ${
                        pendingEntriesData?.isFailedRenewal
                          ? "bg-gradient-to-br from-amber-600/40 via-orange-500/30 to-amber-700/40"
                          : pendingEntriesData
                            ? "bg-gradient-to-br from-red-900/45 via-red-700/35 to-red-900/45"
                            : "bg-gradient-to-br from-red-900/50 via-red-700/40 to-red-900/50"
                      }`}
                    >
                      <div className="absolute inset-0 rounded-xl border border-white/[0.12] group-hover:border-white/[0.2] transition-colors duration-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-white/[0.03]" />

                      {/* Info button - direct child of card, anchored to top-right corner */}
                      {hasActiveSubscription && membershipPackage && projectionData && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            const container = e.currentTarget.closest(".space-y-4") as HTMLElement;
                            if (container) {
                              const containerRect = container.getBoundingClientRect();
                              setTooltipPosition({
                                top: rect.top - containerRect.top - 8,
                                left: rect.left - containerRect.left + rect.width / 2,
                              });
                              setShowAccumulationTooltip(true);
                            }
                          }}
                          className="absolute -top-2 -right-2 left-auto z-20 w-6 h-6 flex items-center justify-center bg-sky-600 hover:bg-sky-500 rounded-full text-white shadow-md border border-sky-500/50 transition-all duration-200 hover:scale-110"
                          aria-label="View accumulation info"
                        >
                          <Info className="w-3 h-3" />
                        </button>
                      )}

                      <div className="relative flex flex-col items-center flex-1 justify-center w-full">
                        <div className="relative flex items-center justify-center gap-1.5 text-red-200/80 text-2xs sm:text-xs font-bold uppercase tracking-[0.15em] mb-1.5">
                          <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-300/70" />
                          <span>Membership</span>
                        </div>
                        <div className="relative flex items-center justify-center gap-1.5">
                          <div
                            className={`text-2xl xs:text-3xl sm:text-4xl font-bold tabular-nums ${
                              pendingEntriesData?.isFailedRenewal
                                ? "text-amber-100"
                                : pendingEntriesData
                                  ? "text-red-50"
                                  : "text-white"
                            }`}
                          >
                            <AnimatedNumber value={displayMembershipEntries} className="tabular-nums" />
                          </div>
                          {pendingEntriesData?.isFailedRenewal && (
                            <Clock
                              className="w-5 h-5 sm:w-6 sm:h-6 text-amber-200/90 flex-shrink-0"
                              aria-label="Entries pending until payment resolved"
                            />
                          )}
                        </div>
                        {displayMembershipEntries === 0 && (
                          <div className="absolute inset-0 bg-slate-900/20 rounded-xl pointer-events-none" />
                        )}
                      </div>

                      {/* Pending renewal notice - bottom of membership card only */}
                      {pendingEntriesData && (
                        <div className="relative w-full text-center mt-2 pt-2 border-t border-white/10">
                          <span
                            className={`text-2xs sm:text-xs font-semibold ${
                              pendingEntriesData.isFailedRenewal ? "text-amber-300/80" : "text-red-300/70"
                            }`}
                          >
                            {pendingEntriesData.isFailedRenewal ? (
                              <>
                               
                                {onResolvePayment && (
                                  <>
                                    {" "}
                                    <button
                                      type="button"
                                      onClick={onResolvePayment}
                                      className="underline underline-offset-2 hover:no-underline focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-1 focus:ring-offset-transparent rounded"
                                      aria-label="Resolve payment – open Settings subscription tab"
                                    >
                                      Resolve payment issue
                                    </button>
                                  </>
                                )}
                              </>
                            ) : (
                              <>
                                Added on renewal
                                {pendingEntriesData.renewalDate && ` — ${formatRenewalDate(pendingEntriesData.renewalDate)}`}
                              </>
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* One-time entries card */}
                    {onOneTimeCardClick ? (
                      <button
                        type="button"
                        onClick={() => onOneTimeCardClick()}
                        className="group relative flex flex-col items-center justify-center rounded-xl overflow-hidden bg-gradient-to-br from-emerald-600/30 via-teal-500/25 to-emerald-700/30 py-4 sm:py-5 px-3 transition-all duration-300 hover:scale-[1.02] w-full min-w-0 text-left cursor-pointer border-0 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-transparent select-none"
                      >
                        <div className="absolute inset-0 rounded-xl border border-white/[0.08] group-hover:border-white/[0.14] transition-colors duration-300 pointer-events-none" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-white/[0.03] pointer-events-none" />

                        <div className="relative flex flex-col items-center gap-1.5 z-[1]">
                          <div className="flex items-center gap-1.5 text-emerald-200/80 text-2xs sm:text-xs font-bold uppercase tracking-[0.15em]">
                            <Gift className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-300/70" />
                            <span>One-time</span>
                          </div>
                          <div className="text-2xl xs:text-3xl sm:text-4xl font-bold text-white tabular-nums">
                            <AnimatedNumber value={oneTimeEntries} className="tabular-nums" />
                          </div>
                        </div>
                        {oneTimeEntries === 0 && (
                          <div className="absolute inset-0 bg-slate-900/20 rounded-xl pointer-events-none" />
                        )}
                      </button>
                    ) : (
                      <div className="group relative flex flex-col items-center justify-center rounded-xl overflow-hidden bg-gradient-to-br from-emerald-600/30 via-teal-500/25 to-emerald-700/30 py-4 sm:py-5 px-3 transition-all duration-300 hover:scale-[1.02]">
                        <div className="absolute inset-0 rounded-xl border border-white/[0.08] group-hover:border-white/[0.14] transition-colors duration-300 pointer-events-none" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-white/[0.03] pointer-events-none" />

                        <div className="relative flex flex-col items-center gap-1.5 z-[1]">
                          <div className="flex items-center gap-1.5 text-emerald-200/80 text-2xs sm:text-xs font-bold uppercase tracking-[0.15em]">
                            <Gift className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-300/70" />
                            <span>One-time</span>
                          </div>
                          <div className="text-2xl xs:text-3xl sm:text-4xl font-bold text-white tabular-nums">
                            <AnimatedNumber value={oneTimeEntries} className="tabular-nums" />
                          </div>
                        </div>
                        {oneTimeEntries === 0 && (
                          <div className="absolute inset-0 bg-slate-900/20 rounded-xl pointer-events-none" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Resubscribe + carry-over sub-line — only on the draw whose
                      window contains the user's `lastResubscribedAt` */}
                  {drawIncludesResubscribe && displayMembershipEntries > 0 && (
                    <p className="text-xs text-gray-500 dark:text-neutral-400 mt-2">
                      Includes resubscribe + carry-over from previous membership. Next month&apos;s renewal will use your new accumulated total.
                    </p>
                  )}

                  {/* Badges row */}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="flex items-center justify-center gap-2">
                      {membershipPackage && (
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
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {oneTimeBadgesList.length > 0 &&
                        oneTimeBadgesList.map((pkg) => (
                          <MembershipBadge
                            key={String(pkg.packageId)}
                            packageData={pkg.packageData}
                            isActive={true}
                            membershipType="one-time"
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
                  </div>
                </div>
              </div>
          
          </div>

          {/* View Past Draws button */}
          <button
            type="button"
            onClick={onViewPastDraws}
            className="group relative w-full p-3.5 xs:p-4 sm:p-5 inline-flex items-center justify-center gap-2.5 bg-slate-50 dark:bg-slate-900/60 hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs xs:text-sm sm:text-base font-bold uppercase tracking-[0.15em] transition-all duration-200 rounded-b-2xl overflow-hidden border-t border-slate-200/70 dark:border-slate-700/50"
          >
            <History className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={2.5} />
            View Past Draws
          </button>
        </div>

        {showAccumulationTooltip && (
          <div className="fixed inset-0 z-[9998]" onClick={() => setShowAccumulationTooltip(false)} />
        )}
      </div>
    </div>
  );
}
