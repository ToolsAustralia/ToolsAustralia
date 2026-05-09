"use client";

import React, { useState, useEffect } from "react";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/utils/cn";

interface BenefitCountdownProps {
  effectiveDate: Date;
  changeType: "upgrade" | "downgrade";
  currentBenefits: {
    packageName: string;
    /** Current accumulated free entries (membership balance), not base monthly grant only */
    accumulatedEntries: number;
    /** Share of partner-offer catalog visible for this tier (see getPartnerCatalogAccessPercentForPlanId) */
    partnerDiscountAccessPercent: number;
    partnerDiscountDays: number;
  };
  newBenefits: {
    packageName: string;
    /** Projected accumulated free entries after the plan change */
    accumulatedEntries: number;
    partnerDiscountAccessPercent: number;
    partnerDiscountDays: number;
  };
  onExpired?: () => void;
}

const BenefitCountdown: React.FC<BenefitCountdownProps> = ({
  effectiveDate,
  changeType,
  currentBenefits,
  newBenefits,
  onExpired,
}) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const target = new Date(effectiveDate).getTime();
      const difference = target - now;

      if (difference <= 0) {
        setIsExpired(true);
        onExpired?.();
        return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      return { days, hours, minutes, seconds };
    };

    // Calculate immediately
    setTimeLeft(calculateTimeLeft());

    // Update every second
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [effectiveDate, onExpired]);

  if (isExpired) {
    return (
      <div className="rounded-lg border-2 border-green-200 bg-green-50 p-3 sm:p-4 dark:border-green-800 dark:bg-green-950/40">
        <div className="mb-2 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
          <span className="text-sm font-semibold text-green-900 dark:text-green-100">
            Your {newBenefits.packageName} benefits are now active!
          </span>
        </div>
        <div className="text-xs text-green-800 dark:text-green-200/90">
          You now have {newBenefits.accumulatedEntries.toLocaleString()} accumulated free entries and{" "}
          {newBenefits.partnerDiscountAccessPercent}% access to partner discount offers.
        </div>
      </div>
    );
  }

  const urgency =
    timeLeft.days <= 1
      ? {
          accent: "text-red-600 dark:text-red-400",
          border: "border-red-200 dark:border-red-800",
          leftBar: "border-l-red-500 dark:border-l-red-500",
        }
      : timeLeft.days <= 3
        ? {
            accent: "text-orange-600 dark:text-orange-400",
            border: "border-orange-200 dark:border-orange-800",
            leftBar: "border-l-orange-500 dark:border-l-orange-500",
          }
        : {
            accent: "text-blue-600 dark:text-blue-400",
            border: "border-blue-200 dark:border-blue-800",
            leftBar: "border-l-blue-500 dark:border-l-blue-400",
          };

  const cardFrame =
    changeType === "downgrade"
      ? "border-orange-200 dark:border-orange-800 border-l-4 border-l-orange-500 dark:border-l-orange-500"
      : "border-green-200 dark:border-green-800 border-l-4 border-l-green-500 dark:border-l-green-500";

  return (
    <div className={cn("rounded-lg border-2 bg-white p-3 shadow-sm sm:p-4 dark:bg-neutral-800", cardFrame)}>
      <div className="mb-3 flex items-center gap-2">
        <Clock className={cn("h-4 w-4 flex-shrink-0", urgency.accent)} />
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          {changeType === "downgrade" ? "Downgrade" : "Upgrade"} scheduled
        </span>
      </div>

      {/* Countdown Timer */}
      <div className="mb-4 flex items-center justify-center gap-2 sm:gap-4">
        <div className="text-center">
          <div className={cn("text-xl font-bold tabular-nums sm:text-2xl", urgency.accent)}>{timeLeft.days}</div>
          <div className="text-xs font-medium text-gray-600 dark:text-neutral-300">days</div>
        </div>
        <div className="text-lg font-bold text-gray-400 dark:text-neutral-500">:</div>
        <div className="text-center">
          <div className={cn("text-xl font-bold tabular-nums sm:text-2xl", urgency.accent)}>
            {timeLeft.hours.toString().padStart(2, "0")}
          </div>
          <div className="text-xs font-medium text-gray-600 dark:text-neutral-300">hours</div>
        </div>
        <div className="text-lg font-bold text-gray-400 dark:text-neutral-500">:</div>
        <div className="text-center">
          <div className={cn("text-xl font-bold tabular-nums sm:text-2xl", urgency.accent)}>
            {timeLeft.minutes.toString().padStart(2, "0")}
          </div>
          <div className="text-xs font-medium text-gray-600 dark:text-neutral-300">min</div>
        </div>
      </div>

      {/* Current Benefits */}
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-medium leading-snug text-gray-800 dark:text-neutral-100 sm:text-sm">
            Use your current {currentBenefits.packageName} benefits before they expire:
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-center dark:border-neutral-600 dark:bg-neutral-900/80">
            <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
              {currentBenefits.accumulatedEntries.toLocaleString()}
            </div>
            <div className="text-2xs font-medium text-gray-600 dark:text-neutral-400">accumulated entries</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-center dark:border-neutral-600 dark:bg-neutral-900/80">
            <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
              {currentBenefits.partnerDiscountAccessPercent}%
            </div>
            <div className="text-2xs font-medium leading-tight text-gray-600 dark:text-neutral-400 sm:text-2xs">
              Partner offers access %
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-center dark:border-neutral-600 dark:bg-neutral-900/80">
            <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{currentBenefits.partnerDiscountDays}</div>
            <div className="text-2xs font-medium text-gray-600 dark:text-neutral-400">partner days</div>
          </div>
        </div>
      </div>

      {/* Next Benefits Preview */}
      <div className="mt-4 border-t border-gray-200 pt-4 dark:border-neutral-600">
        <div className="mb-2 text-xs font-medium text-gray-700 dark:text-neutral-200 sm:text-sm">
          Then you&apos;ll get {newBenefits.packageName} benefits:
        </div>
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-2.5 text-center dark:border-neutral-600 dark:bg-neutral-900/50">
            <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
              {newBenefits.accumulatedEntries.toLocaleString()}
            </div>
            <div className="text-2xs font-medium text-gray-600 dark:text-neutral-400">accumulated entries</div>
          </div>
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-2.5 text-center dark:border-neutral-600 dark:bg-neutral-900/50">
            <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">
              {newBenefits.partnerDiscountAccessPercent}%
            </div>
            <div className="text-2xs font-medium leading-tight text-gray-600 dark:text-neutral-400 sm:text-2xs">
              Partner offers access %
            </div>
          </div>
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-2.5 text-center dark:border-neutral-600 dark:bg-neutral-900/50">
            <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{newBenefits.partnerDiscountDays}</div>
            <div className="text-2xs font-medium text-gray-600 dark:text-neutral-400">partner days</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BenefitCountdown;
