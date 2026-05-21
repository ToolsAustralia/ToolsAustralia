"use client";

import React from "react";
import { CreditCard } from "lucide-react";
import { Button } from "../ui";
import type { SubMgmtUser } from "./types";
import {
  ResubscribeEmptyState,
  ResubscribeEmptyStateFallback,
  type ResubscribeTierOption,
} from "./ResubscribeTierPicker";

interface InactiveSubscriptionStateProps {
  status: NonNullable<SubMgmtUser["subscription"]>["status"];
  onSubscribeClick: () => void;
  // New optional props for the resubscribe tier picker. If absent (e.g.
  // status !== "canceled" or no packages loaded), fall back to the legacy CTA.
  packages?: ResubscribeTierOption[];
  previousPackageId?: string;
  promoMultiplier?: number;
  lastMonthAccumulatedEntries?: number;
  onPickTier?: (packageId: string) => void;
}

/**
 * Empty-state card shown when the user has a subscription record but it
 * is inactive and not past_due. For cancelled users with packages available,
 * renders a tier picker; otherwise keeps the legacy "Reactivate" CTA.
 */
export const InactiveSubscriptionState: React.FC<InactiveSubscriptionStateProps> = ({
  status: _status,
  onSubscribeClick,
  packages,
  previousPackageId,
  promoMultiplier,
  lastMonthAccumulatedEntries,
  onPickTier,
}) => {
  // Universal picker for any non-active, non-past_due state (canceled,
  // unpaid, incomplete, incomplete_expired). Status no longer gates
  // rendering — caller is responsible for routing past_due through the
  // recovery flow before this component renders.
  if (packages && packages.length > 0 && onPickTier) {
    return (
      <ResubscribeEmptyState
        packages={packages}
        previousPackageId={previousPackageId}
        promoMultiplier={promoMultiplier ?? 1}
        lastMonthAccumulatedEntries={lastMonthAccumulatedEntries ?? 0}
        onPickTier={onPickTier}
        showCancelledFooter={Boolean(previousPackageId)}
      />
    );
  }

  // No packages loaded (rare): defensive fallback to the legacy single CTA.
  return <ResubscribeEmptyStateFallback onSubscribeClick={onSubscribeClick} />;
};

interface NoSubscriptionStateProps {
  onSubscribeClick: () => void;
}

/**
 * Empty-state card shown when the user has no subscription history at all.
 */
export const NoSubscriptionState: React.FC<NoSubscriptionStateProps> = ({ onSubscribeClick }) => (
  <div className="text-center py-8">
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 rounded-xl p-6 sm:p-8 border border-gray-200 dark:border-neutral-700 shadow-sm">
      <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
        <CreditCard className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Active Subscription</h2>
      <p className="text-gray-600 dark:text-neutral-300 mb-6">
        You don&apos;t have an active subscription to manage.
      </p>
      <Button
        onClick={onSubscribeClick}
        variant="primary"
        className="bg-gradient-to-r from-red-600 to-red-400 hover:from-red-675 hover:to-red-650 shadow-md hover:shadow-lg transition-all"
      >
        Subscribe to Membership Packages
      </Button>
    </div>
  </div>
);
