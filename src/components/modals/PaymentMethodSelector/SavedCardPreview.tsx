"use client";

/**
 * SavedCardPreview — selected-default-card preview row shown to authenticated
 * users who have a payment method already chosen. Renders the card brand,
 * masked digits, the "Default Payment Method" badge, and a "Change" button
 * that clears the selection back to the picker rows.
 */

import React from "react";
import type { SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";

export interface SavedCardPreviewProps {
  paymentMethod: SavedPaymentMethod;
  onClearSelection: () => void;
}

const getCardBrandIcon = (brand: string) => {
  const brandLower = brand.toLowerCase();
  if (brandLower.includes("visa")) return "💳";
  if (brandLower.includes("mastercard")) return "💳";
  if (brandLower.includes("amex") || brandLower.includes("american express")) return "💳";
  return "💳";
};

const formatCardDisplay = (paymentMethod: SavedPaymentMethod) => {
  if (!paymentMethod.card) return "Payment Method";
  return `${paymentMethod.card.brand.toUpperCase()} •••• ${paymentMethod.card.last4}`;
};

const SavedCardPreview: React.FC<SavedCardPreviewProps> = ({ paymentMethod, onClearSelection }) => {
  return (
    <div className="rounded-lg sm:rounded-xl p-3 sm:p-4 border-2 border-neutral-200 bg-neutral-50 dark:border-red-500/35 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center justify-center w-8 h-5 sm:w-10 sm:h-6 bg-[#ffffff] dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-600">
            <span className="text-sm sm:text-lg">
              {getCardBrandIcon(paymentMethod.card?.brand || "")}
            </span>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-neutral-100 text-sm sm:text-base">
              {formatCardDisplay(paymentMethod)}
            </h4>
            {paymentMethod.isDefault && (
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">✓ Default Payment Method</p>
            )}
          </div>
        </div>
        <button
          onClick={onClearSelection}
          className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs sm:text-sm font-medium"
        >
          Change
        </button>
      </div>
    </div>
  );
};

export default SavedCardPreview;
