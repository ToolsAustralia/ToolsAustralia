"use client";

/**
 * ChangeMethodRow — pair of CTAs shown when an authenticated user has saved
 * payment methods but none is currently selected. Renders the
 * "Use Default Payment Method" preview button and a "Choose from Saved Methods"
 * button that opens the SavedPaymentMethodsModal portal in the orchestrator.
 */

import React from "react";
import { CreditCard, ChevronRight } from "lucide-react";
import type { SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";

export interface ChangeMethodRowProps {
  paymentMethods: SavedPaymentMethod[];
  onUseDefault: () => void;
  onOpenSavedMethods: () => void;
}

const formatCardDisplay = (paymentMethod: SavedPaymentMethod) => {
  if (!paymentMethod.card) return "Payment Method";
  return `${paymentMethod.card.brand.toUpperCase()} •••• ${paymentMethod.card.last4}`;
};

const ChangeMethodRow: React.FC<ChangeMethodRowProps> = ({
  paymentMethods,
  onUseDefault,
  onOpenSavedMethods,
}) => {
  if (paymentMethods.length === 0) return null;

  const defaultPaymentMethod = paymentMethods.find((pm) => pm.isDefault);

  return (
    <>
      {/* Use Default Payment Method */}
      <button
        onClick={onUseDefault}
        className="w-full border-2 border-gray-200 dark:border-neutral-600 hover:border-red-400/70 dark:hover:border-red-500/50 rounded-lg sm:rounded-xl p-3 sm:p-4 text-left transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-neutral-400 group-hover:text-red-600 dark:group-hover:text-red-400" />
            <div>
              <h4 className="font-medium text-gray-900 dark:text-neutral-100 text-sm sm:text-base">
                <span className="sm:hidden">Use Default</span>
                <span className="hidden sm:inline">Use Default Payment Method</span>
              </h4>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400">
                {defaultPaymentMethod?.card
                  ? formatCardDisplay(defaultPaymentMethod)
                  : "No default payment method"}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-red-600 dark:group-hover:text-red-400" />
        </div>
      </button>

      {/* Choose from Saved Methods */}
      <button
        type="button"
        onClick={onOpenSavedMethods}
        className="w-full border-2 border-gray-200 dark:border-neutral-600 hover:border-red-400/70 dark:hover:border-red-500/50 rounded-lg sm:rounded-xl p-3 sm:p-4 text-left transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-neutral-400 group-hover:text-red-600 dark:group-hover:text-red-400" />
            <div>
              <h4 className="font-medium text-gray-900 dark:text-neutral-100 text-sm sm:text-base">
                <span className="sm:hidden">Saved Methods</span>
                <span className="hidden sm:inline">Choose from Saved Methods</span>
              </h4>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400">
                {paymentMethods.length} saved payment method{paymentMethods.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-red-600 dark:group-hover:text-red-400" />
        </div>
      </button>
    </>
  );
};

export default ChangeMethodRow;
