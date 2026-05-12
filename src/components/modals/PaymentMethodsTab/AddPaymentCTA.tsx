"use client";

import React from "react";
import { CreditCard, Plus, Loader2 } from "lucide-react";
import { Button } from "../ui";

interface AddPaymentCTAProps {
  variant: "empty-state" | "footer";
  isCreatingSetupIntent: boolean;
  showAddForm?: boolean;
  onClick: () => void;
}

/**
 * Two CTA shapes:
 *  - "empty-state": large dashed-border block when no payment methods exist
 *  - "footer": full-width primary button shown beneath the saved-method list
 */
const AddPaymentCTA: React.FC<AddPaymentCTAProps> = ({
  variant,
  isCreatingSetupIntent,
  showAddForm = false,
  onClick,
}) => {
  if (variant === "empty-state") {
    return (
      <div className="text-center py-8 sm:py-12 border-2 border-dashed border-gray-300 dark:border-neutral-600 rounded-xl px-4 bg-gradient-to-br from-gray-50/50 to-transparent dark:from-neutral-900/50 dark:to-transparent">
        <div className="w-16 h-16 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-neutral-700 dark:to-neutral-800 rounded-full flex items-center justify-center shadow-sm">
          <CreditCard className="w-8 h-8 text-gray-400 dark:text-neutral-500" />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-neutral-100 mb-1 sm:mb-2">No Payment Methods</h3>
        <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400 mb-4 sm:mb-6">You haven&apos;t saved any payment methods yet.</p>
        <Button
          onClick={onClick}
          disabled={isCreatingSetupIntent}
          className="bg-gradient-to-r from-red-600 to-red-400 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold hover:from-red-675 hover:to-red-650 disabled:opacity-60 shadow-md hover:shadow-lg transition-all"
        >
          {isCreatingSetupIntent ? (
            <>
              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Add Payment Method
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="pt-3 sm:pt-4 border-t border-gray-200 dark:border-neutral-600">
      <Button
        onClick={onClick}
        disabled={isCreatingSetupIntent || showAddForm}
        className="w-full bg-gradient-to-r from-red-600 to-red-400 text-white py-2 sm:py-3 px-4 sm:px-6 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold hover:from-red-675 hover:to-red-650 disabled:opacity-60 flex items-center justify-center gap-1.5 sm:gap-2 shadow-md hover:shadow-lg transition-all"
      >
        {isCreatingSetupIntent ? (
          <>
            <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
            Loading...
          </>
        ) : (
          <>
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            Add New Payment Method
          </>
        )}
      </Button>
    </div>
  );
};

export default AddPaymentCTA;
