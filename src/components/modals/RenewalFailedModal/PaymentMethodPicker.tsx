"use client";

import React from "react";
import { CreditCard } from "lucide-react";
import { cn } from "@/utils/cn";
import { type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";

interface PaymentMethodPickerProps {
  paymentMethods: SavedPaymentMethod[];
  selectedPaymentMethod: SavedPaymentMethod | null;
  /** Called with the picked payment method, OR null when the user chooses "Enter new payment method". */
  onSelect: (pm: SavedPaymentMethod | null) => void;
}

const formatCardDisplay = (pm: SavedPaymentMethod): string => {
  if (!pm.card) return "Payment Method";
  return `${pm.card.brand.toUpperCase()} •••• ${pm.card.last4}`;
};

const RadioIndicator: React.FC<{ active: boolean }> = ({ active }) =>
  active ? (
    <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white" />
    </div>
  ) : null;

const PaymentMethodPicker: React.FC<PaymentMethodPickerProps> = ({
  paymentMethods,
  selectedPaymentMethod,
  onSelect,
}) => {
  return (
    <div className="mb-4">
      <h4 className="text-2xs font-bold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400 mb-2">
        Choose a payment method
      </h4>

      <div className="space-y-2">
        {/* Saved cards */}
        {paymentMethods.map((pm) => {
          const active = selectedPaymentMethod?.paymentMethodId === pm.paymentMethodId;
          return (
            <button
              key={pm.paymentMethodId}
              type="button"
              onClick={() => onSelect(pm)}
              className={cn(
                "w-full p-3 sm:p-4 border-2 rounded-xl text-left transition-colors",
                active
                  ? "border-red-600 bg-red-50 dark:bg-red-950/40"
                  : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 bg-white dark:bg-neutral-900"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-600 dark:text-neutral-300 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900 dark:text-neutral-100 text-xs sm:text-sm truncate">
                      {formatCardDisplay(pm)}
                    </p>
                    {pm.isDefault && (
                      <p className="text-2xs sm:text-xs text-neutral-500 dark:text-neutral-400">Default payment method</p>
                    )}
                  </div>
                </div>
                <RadioIndicator active={active} />
              </div>
            </button>
          );
        })}

        {/* "Enter new payment method" option (selects null) */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "w-full p-3 sm:p-4 border-2 rounded-xl text-left transition-colors",
            selectedPaymentMethod === null
              ? "border-red-600 bg-red-50 dark:bg-red-950/40"
              : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 bg-white dark:bg-neutral-900"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-600 dark:text-neutral-300 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-neutral-900 dark:text-neutral-100 text-xs sm:text-sm">Enter new payment method</p>
                <p className="text-2xs sm:text-xs text-neutral-500 dark:text-neutral-400">Use a different card</p>
              </div>
            </div>
            <RadioIndicator active={selectedPaymentMethod === null} />
          </div>
        </button>
      </div>
    </div>
  );
};

export default PaymentMethodPicker;
