"use client";

import React from "react";
import { CreditCard } from "lucide-react";
import { Button } from "../ui";
import ResubscribeTierCard from "./ResubscribeTierCard";

export interface ResubscribeTierOption {
  packageId: string;
  name: string;
  price: number;
  entriesPerMonth: number;
}

interface ResubscribeTierPickerProps {
  packages: ResubscribeTierOption[];
  previousPackageId?: string;
  promoMultiplier: number;
  lastMonthAccumulatedEntries: number;
  onPickTier: (packageId: string) => void;
}

export const ResubscribeTierPicker: React.FC<ResubscribeTierPickerProps> = ({
  packages,
  previousPackageId,
  promoMultiplier,
  lastMonthAccumulatedEntries,
  onPickTier,
}) => {
  const hasAccumulated = lastMonthAccumulatedEntries > 0;
  const hasPreviousMembership = Boolean(previousPackageId);
  const header = hasPreviousMembership ? "Welcome back — pick a tier" : "Pick a tier to get started";
  return (
    <div className="py-2">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-md">
          <CreditCard className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{header}</h2>
        {hasAccumulated ? (
          <p className="text-sm text-gray-600 dark:text-neutral-300">
            You have <strong>{lastMonthAccumulatedEntries.toLocaleString()}</strong> accumulated entries.
          </p>
        ) : hasPreviousMembership ? (
          <p className="text-sm text-gray-600 dark:text-neutral-300">Pick a tier to come back.</p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {packages.map((pkg) => (
          <ResubscribeTierCard
            key={pkg.packageId}
            plan={pkg}
            promoMultiplier={promoMultiplier}
            lastMonthAccumulatedEntries={lastMonthAccumulatedEntries}
            isPrevious={previousPackageId === pkg.packageId}
            onSelect={onPickTier}
          />
        ))}
      </div>
    </div>
  );
};

interface ResubscribeEmptyStateProps {
  packages: ResubscribeTierOption[];
  previousPackageId?: string;
  promoMultiplier: number;
  lastMonthAccumulatedEntries: number;
  onPickTier: (packageId: string) => void;
  /**
   * When true, render the "Your subscription was cancelled" footer note.
   * Default true (cancelled callers); pass false for never-subscribed
   * callers where the cancelled framing does not apply.
   */
  showCancelledFooter?: boolean;
}

/**
 * Empty-state shell shown in place of `InactiveSubscriptionState` when
 * `status === "canceled"` and we want the tier-picker UX.
 */
export const ResubscribeEmptyState: React.FC<ResubscribeEmptyStateProps> = ({
  showCancelledFooter = true,
  ...pickerProps
}) => (
  <div className="py-4">
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-neutral-700 shadow-sm">
      <ResubscribeTierPicker {...pickerProps} />
      {showCancelledFooter ? (
        <p className="text-xs text-center text-gray-500 dark:text-neutral-400 mt-4">
          Your subscription was cancelled. Pick any tier to come back — your entries history is preserved.
        </p>
      ) : null}
    </div>
  </div>
);

/**
 * Fallback: no membership packages loaded (rare). Use the legacy CTA.
 */
export const ResubscribeEmptyStateFallback: React.FC<{ onSubscribeClick: () => void }> = ({ onSubscribeClick }) => (
  <div className="text-center py-8">
    <p className="text-gray-600 dark:text-neutral-300 mb-4">
      Your subscription was cancelled. Reactivate to come back.
    </p>
    <Button onClick={onSubscribeClick} variant="primary">
      Reactivate Subscription
    </Button>
  </div>
);
