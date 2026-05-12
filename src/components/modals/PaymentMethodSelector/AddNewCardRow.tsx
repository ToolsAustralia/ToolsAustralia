"use client";

/**
 * AddNewCardRow — dashed-border CTA shown alongside the saved-method options
 * for authenticated users without a current selection. Clicking invokes the
 * orchestrator's `onAddNewPaymentMethod` callback which typically reveals the
 * inline `<CardFormSection>` flow.
 */

import React from "react";
import { Plus, ChevronRight } from "lucide-react";

export interface AddNewCardRowProps {
  onAddNew: () => void;
}

const AddNewCardRow: React.FC<AddNewCardRowProps> = ({ onAddNew }) => {
  return (
    <button
      type="button"
      onClick={onAddNew}
      className="w-full border-2 border-dashed border-gray-300 dark:border-neutral-600 hover:border-red-400/80 dark:hover:border-red-500/45 rounded-lg sm:rounded-xl p-3 sm:p-4 text-left transition-colors group"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-neutral-400 group-hover:text-red-600 dark:group-hover:text-red-400" />
          <div>
            <h4 className="font-medium text-gray-900 dark:text-neutral-100 text-sm sm:text-base">
              <span className="sm:hidden">Add New Card</span>
              <span className="hidden sm:inline">Add New Payment Method</span>
            </h4>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400">Enter new card details</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-red-600 dark:group-hover:text-red-400" />
      </div>
    </button>
  );
};

export default AddNewCardRow;
