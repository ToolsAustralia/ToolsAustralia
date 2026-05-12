"use client";

import React from "react";
import { CheckCircle, Sparkles, CreditCard } from "lucide-react";
import { type StaticMembershipPackage } from "@/data/membershipPackages";
import {
  getPackageColorSchemeForPromo,
  type PackageColorsVariantConfig,
} from "@/utils/package-colors/packageColorScheme";
import { type SavedPaymentMethod } from "@/hooks/queries";
import { Button } from "../ui";
import { cn } from "@/utils/cn";
import { hexToRgba, darkenHex } from "./utils";

interface PurchaseFooterProps {
  selectedPackage: StaticMembershipPackage | null;
  variantConfig: PackageColorsVariantConfig | undefined;
  isProcessing: boolean;
  needsInlineCardSetup: boolean;
  paymentMethodsLoading: boolean;
  resolvedChargePm: SavedPaymentMethod | undefined;
  onPurchase: () => void;
}

/**
 * Bottom action area: the "Buy Now" CTA (or disabled "Select Pack" placeholder
 * when no package is selected) + the trust indicator strip.
 */
const PurchaseFooter: React.FC<PurchaseFooterProps> = ({
  selectedPackage,
  variantConfig,
  isProcessing,
  needsInlineCardSetup,
  paymentMethodsLoading,
  resolvedChargePm,
  onPurchase,
}) => {
  return (
    <>
      {/* Action Buttons */}
      <div className="space-y-2 sm:space-y-3">
        {/* Buy Button - uses package badgeStyle when package selected (same as Enter Now) */}
        {selectedPackage ? (() => {
          const colorScheme = getPackageColorSchemeForPromo(selectedPackage._id || "", false, variantConfig);
          const accentHex = colorScheme.accentHexLight ?? colorScheme.accentHex;
          const accentDark = darkenHex(accentHex, 34);
          const textClass = colorScheme.enterNowButtonTextClass ?? "text-white";
          const buttonStyle = {
            ...(colorScheme.enterNowButtonStyle ?? colorScheme.badgeStyle),
            background: `linear-gradient(135deg, ${accentHex} 0%, ${accentDark} 100%)`,
            border: `1px solid ${hexToRgba(accentHex, 0.55)}`,
            boxShadow: `0 10px 24px ${hexToRgba(accentHex, 0.35)}, inset 0 1px 0 ${hexToRgba("#ffffff", 0.22)}`,
          };
          return (
            <button
              type="button"
              onClick={() => resolvedChargePm && onPurchase()}
              disabled={isProcessing || !resolvedChargePm || needsInlineCardSetup || paymentMethodsLoading}
              className={cn("font-agency font-black uppercase w-full rounded-2xl py-2 sm:py-3 flex items-center justify-center gap-3 sm:gap-4 text-sm sm:text-base transition-all duration-300 transform", textClass, colorScheme.borderGlow, "membership-enter-cta-animation disabled:cursor-not-allowed relative overflow-hidden")}
              style={buttonStyle}
            >
              {isProcessing ? (
                <span className="relative z-10">Processing...</span>
              ) : needsInlineCardSetup ? (
                <span className="relative z-10 text-xs sm:text-sm font-semibold normal-case">
                  Use the card form above to complete purchase
                </span>
              ) : resolvedChargePm ? (
                <>
                  <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 relative z-10" />
                  <span className="relative z-10">
                    Buy Now - ${selectedPackage.price}
                  </span>
                  <div className="flex items-center gap-1.5 bg-white/20 rounded px-2 sm:px-3 py-1 sm:py-1.5 relative z-10">
                    <CreditCard className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    <span className="text-xs">
                      •••• {resolvedChargePm.card?.last4}
                    </span>
                  </div>
                </>
              ) : paymentMethodsLoading ? (
                <span className="relative z-10 text-xs sm:text-sm font-semibold normal-case">Checking saved cards…</span>
              ) : (
                <span className="relative z-10">No Payment Method</span>
              )}
            </button>
          );
        })() : (
          <Button
            disabled
            variant="secondary"
            fullWidth
            size="md"
            className="font-bold text-sm sm:text-base py-2 sm:py-3 opacity-75 cursor-not-allowed"
          >
            <div className="flex items-center justify-center gap-1.5 sm:gap-2">
              <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Select Pack</span>
            </div>
          </Button>
        )}

      </div>
    </>
  );
};

interface TrustIndicatorsProps {
  /** Empty for now — kept as a hook for future props. */
  _unused?: never;
}

export const TrustIndicators: React.FC<TrustIndicatorsProps> = () => {
  return (
    <div className="mt-4 border-t border-gray-200 pt-3 dark:border-neutral-800 sm:mt-6 sm:pt-4">
      <div className="flex items-center justify-center gap-3 text-xs text-gray-500 dark:text-neutral-400 sm:gap-6 sm:text-sm">
        <div className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
          <span>Instant</span>
        </div>
        <div className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
          <span>Secure</span>
        </div>
        <div className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
          <span>One-Time</span>
        </div>
      </div>
    </div>
  );
};

export default PurchaseFooter;
