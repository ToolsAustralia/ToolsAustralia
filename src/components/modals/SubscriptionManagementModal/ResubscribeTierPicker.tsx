"use client";

import React from "react";
import { CreditCard } from "lucide-react";
import { Button } from "../ui";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";

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
  const promoActive = promoMultiplier > 1;
  return (
    <div className="py-2">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-md">
          <CreditCard className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Welcome back — pick a tier</h2>
        <p className="text-sm text-gray-600 dark:text-neutral-300">
          Your <strong>{lastMonthAccumulatedEntries.toLocaleString()}</strong> accumulated entries carry over.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {packages.map((pkg) => {
          const scheme = getMembershipSectionColorScheme(pkg.packageId, true);
          const grant = pkg.entriesPerMonth * promoMultiplier;
          const nextRenewal = lastMonthAccumulatedEntries + grant + pkg.entriesPerMonth;
          const isPrevious = previousPackageId === pkg.packageId;
          return (
            <button
              key={pkg.packageId}
              type="button"
              onClick={() => onPickTier(pkg.packageId)}
              className={[
                "text-left rounded-xl border p-4 transition-all hover:shadow-md",
                "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700",
                scheme.border ?? "",
              ].join(" ")}
            >
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {pkg.name}
                  {isPrevious && (
                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-neutral-400">
                      (previously)
                    </span>
                  )}
                </h3>
                <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">
                  ${pkg.price}/mo
                </span>
              </div>
              <div className="text-xs text-gray-600 dark:text-neutral-400 space-y-0.5">
                <div>
                  Sign-up grant: <strong>{grant.toLocaleString()}</strong>
                  {promoActive && (
                    <span className="ml-1 inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      {promoMultiplier}× promo
                    </span>
                  )}
                </div>
                <div>
                  Your carry-over: <strong>{lastMonthAccumulatedEntries.toLocaleString()}</strong>
                </div>
                <div className="pt-1 text-gray-700 dark:text-neutral-300">
                  Next renewal: <strong>{nextRenewal.toLocaleString()}</strong>
                </div>
              </div>
            </button>
          );
        })}
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
}

/**
 * Empty-state shell shown in place of `InactiveSubscriptionState` when
 * `status === "canceled"` and we want the tier-picker UX.
 */
export const ResubscribeEmptyState: React.FC<ResubscribeEmptyStateProps> = (props) => (
  <div className="py-4">
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-neutral-700 shadow-sm">
      <ResubscribeTierPicker {...props} />
      <p className="text-xs text-center text-gray-500 dark:text-neutral-400 mt-4">
        Your subscription was cancelled. Pick any tier to come back — your entries history is preserved.
      </p>
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
