"use client";

/**
 * CouponRow — bonus-applied panel OR coupon code input + Apply button.
 * Hidden when the active plan is an upsell offer.
 *
 * Visual output (className strings, structure, colors) is preserved
 * byte-for-byte from the original MembershipModal.tsx (lines 5475-5542).
 */

import React from "react";
import { Check, Loader2 } from "lucide-react";

interface PromoLinkInfoLite {
  bonusEntries: number;
  isValid: boolean;
  isLoading: boolean;
  appliesToMembership: boolean;
  appliesToOneTime: boolean;
  code: string;
}

interface CouponRowProps {
  isUpsellOffer: boolean;
  promoLinkInfo: PromoLinkInfoLite | null;
  couponCode: string;
  couponApplied: boolean;
  showApplyingIndicator: boolean;
  isApplyDisabled: boolean;
  referralInfo: { referrerName: string } | null;
  referralError: string | null;
  promoThemePrimary: string;
  onCouponCodeChange: (value: string) => void;
  onApply: () => void;
}

const CouponRow: React.FC<CouponRowProps> = ({
  isUpsellOffer,
  promoLinkInfo,
  couponCode,
  couponApplied,
  showApplyingIndicator,
  isApplyDisabled,
  referralInfo,
  referralError,
  promoThemePrimary,
  onCouponCodeChange,
  onApply,
}) => {
  if (isUpsellOffer) return null;

  return (
    <div>
      {promoLinkInfo?.isValid && promoLinkInfo.bonusEntries > 0 ? (
        <div className="flex gap-2">
          <div className="flex-1 h-11 px-2 sm:px-3 border border-gray-300 rounded-lg sm:rounded-xl bg-gray-50 flex items-center text-sm sm:text-base text-gray-700 dark:text-neutral-200">
            {promoLinkInfo.bonusEntries} extra entries applied
          </div>
          <div className="h-11 bg-green-500 text-white px-2 sm:px-3 rounded-lg sm:rounded-xl flex items-center gap-1 sm:gap-2">
            <Check size={12} />
            <span className="text-xs font-bold">APPLIED</span>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => onCouponCodeChange(e.target.value.toUpperCase())}
              className="flex-1 h-11 px-2 sm:px-3 border border-gray-300 rounded-lg sm:rounded-xl focus:ring-2 focus:border-transparent transition-all duration-300 text-base bg-white text-gray-900 placeholder:text-gray-500 dark:bg-slate-800 dark:border-slate-600 dark:text-gray-100 dark:placeholder:text-gray-400"
              style={{ ["--tw-ring-color" as string]: promoThemePrimary }}
              placeholder="Enter coupon code"
            />
            {couponApplied ? (
              <div className="h-11 bg-green-500 text-white px-2 sm:px-3 rounded-lg sm:rounded-xl flex items-center gap-1 sm:gap-2">
                <Check size={12} />
                <span className="text-xs font-bold">APPLIED</span>
              </div>
            ) : showApplyingIndicator ? (
              <div className="h-11 flex items-center gap-2 text-xs text-gray-500 px-2 sm:px-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Applying...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={onApply}
                disabled={isApplyDisabled}
                className="h-11 bg-gray-500 text-white px-2 sm:px-3 rounded-lg sm:rounded-xl hover:bg-gray-600 transition-colors text-xs sm:text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            )}
          </div>
          {referralInfo && (
            <p className="mt-2 text-xs text-green-600">
              Code confirmed! You and {referralInfo.referrerName} will receive 100 bonus entries when you
              complete your purchase.
            </p>
          )}
          {referralError && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {referralError}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default CouponRow;
