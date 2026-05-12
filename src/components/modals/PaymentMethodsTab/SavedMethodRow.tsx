"use client";

import React from "react";
import { Trash2, Star, CheckCircle, Loader2 } from "lucide-react";
import { type SavedPaymentMethod } from "@/hooks/useSavedPaymentMethods";
import { Button } from "../ui";

interface SavedMethodRowProps {
  paymentMethod: SavedPaymentMethod;
  isSubscriptionBillingCard: boolean;
  settingDefaultId: string | null;
  deletingId: string | null;
  onSetDefault: (paymentMethodId: string) => void;
  onDelete: (paymentMethodId: string) => void;
}

const getCardBrandIcon = (brand: string) => {
  const brandLower = brand.toLowerCase();
  if (brandLower.includes("visa")) return "💳";
  if (brandLower.includes("mastercard")) return "💳";
  if (brandLower.includes("amex") || brandLower.includes("american express")) return "💳";
  return "💳";
};

const formatExpiryDate = (month: number, year: number) => {
  return `${month.toString().padStart(2, "0")}/${year.toString().slice(-2)}`;
};

const SavedMethodRow: React.FC<SavedMethodRowProps> = ({
  paymentMethod,
  isSubscriptionBillingCard,
  settingDefaultId,
  deletingId,
  onSetDefault,
  onDelete,
}) => {
  return (
    <div
      className={`border-2 rounded-lg sm:rounded-xl p-2.5 sm:p-4 transition-all shadow-sm hover:shadow-md ${
        paymentMethod.isDefault
          ? "border-blue-500 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30"
          : isSubscriptionBillingCard
          ? "border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/30"
          : "border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-gray-300 dark:hover:border-neutral-600"
      }`}
    >
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
          <div className="flex items-center justify-center w-10 h-7 sm:w-12 sm:h-8 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-neutral-700 dark:to-neutral-800 rounded-lg flex-shrink-0 shadow-sm">
            <span className="text-lg sm:text-xl">{getCardBrandIcon(paymentMethod.card?.brand || "")}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 dark:text-neutral-100 text-xs sm:text-sm truncate">
                {paymentMethod.card?.brand?.toUpperCase() || "CARD"} •••• {paymentMethod.card?.last4}
              </h3>
              {paymentMethod.isDefault && (
                <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-full text-2xs sm:text-xs font-semibold flex-shrink-0 shadow-sm">
                  <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />
                  DEFAULT
                </span>
              )}
              {isSubscriptionBillingCard && (
                <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300 rounded-full text-2xs sm:text-xs font-semibold flex-shrink-0 shadow-sm">
                  <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  RENEWALS
                </span>
              )}
            </div>
            <p className="text-2xs sm:text-xs text-gray-600 dark:text-neutral-400 mt-0.5 sm:mt-1">
              Expires {formatExpiryDate(paymentMethod.card?.expMonth || 0, paymentMethod.card?.expYear || 0)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {!paymentMethod.isDefault && (
            <Button
              onClick={() => onSetDefault(paymentMethod.paymentMethodId)}
              disabled={settingDefaultId !== null}
              className="bg-gray-600 hover:bg-gray-700 text-white px-1.5 sm:px-3 py-0.5 sm:py-1.5 rounded text-3xs sm:text-xs font-medium disabled:opacity-50 flex-shrink-0 h-6 sm:h-8"
            >
              {settingDefaultId === paymentMethod.paymentMethodId ? (
                <Loader2 className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 animate-spin" />
              ) : (
                <>
                  <span className="hidden sm:inline">Set Default</span>
                  <span className="sm:hidden">Default</span>
                </>
              )}
            </Button>
          )}

          <div
            title={
              isSubscriptionBillingCard
                ? "Remove payment method (used for subscription renewals in Stripe)"
                : "Remove saved payment method"
            }
          >
            <Button
              onClick={() => onDelete(paymentMethod.paymentMethodId)}
              disabled={deletingId === paymentMethod.paymentMethodId}
              className="bg-red-600 hover:bg-red-700 text-white p-0 sm:p-2 rounded text-3xs sm:text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 h-6 sm:h-8 w-6 sm:w-8 flex items-center justify-center"
            >
              {deletingId === paymentMethod.paymentMethodId ? (
                <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SavedMethodRow;
