"use client";

import React from "react";
import { XCircle } from "lucide-react";
import { Button } from "../ui";
import { cn } from "@/utils/cn";
import type { SubscriptionBenefits } from "./types";

interface CancelResumeRowProps {
  subscriptionBenefits: SubscriptionBenefits | null;
  isLoading: boolean;
  formatDate: (value?: string | Date | null, locale?: string) => string | null;
  onCancel: () => void;
  onReactivate: () => void;
}

/**
 * Bottom action row of the management actions list. Switches between
 * "Cancel Subscription" (active) and "Reactivate Subscription" (cancelled).
 */
const CancelResumeRow: React.FC<CancelResumeRowProps> = ({
  subscriptionBenefits,
  isLoading,
  formatDate,
  onCancel,
  onReactivate,
}) => {
  return (
    <div
      className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 rounded-lg gap-3 sm:gap-4 shadow-sm ${
        subscriptionBenefits?.isCancelled
          ? "bg-yellow-50 dark:bg-yellow-950/30 border-2 border-yellow-200 dark:border-yellow-800 border-l-4"
          : "bg-white dark:bg-neutral-800 border-2 border-red-200 dark:border-red-800 border-l-4"
      }`}
    >
      <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
        <XCircle
          className={cn(
            "w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5 sm:mt-0",
            subscriptionBenefits?.isCancelled
              ? "text-yellow-600 dark:text-yellow-500"
              : "text-red-600 dark:text-red-400"
          )}
        />
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">
            {subscriptionBenefits?.isCancelled ? "Subscription Cancelled" : "Cancel Subscription"}
          </p>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-300">
            {subscriptionBenefits?.isCancelled
              ? `Benefits end on ${formatDate(subscriptionBenefits.endDate) ?? "end of billing period"}`
              : "You'll retain access until the end of your billing period"}
          </p>
        </div>
      </div>
      {!subscriptionBenefits?.isCancelled ? (
        <Button
          onClick={onCancel}
          disabled={isLoading}
          variant="secondary"
          size="sm"
          className="border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 w-full sm:w-auto text-xs sm:text-sm"
        >
          Cancel
        </Button>
      ) : (
        <Button
          onClick={onReactivate}
          disabled={isLoading}
          variant="primary"
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto text-xs sm:text-sm shadow-sm hover:shadow-md"
        >
          Reactivate
        </Button>
      )}
    </div>
  );
};

export default CancelResumeRow;
