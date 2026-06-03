"use client";

import React from "react";
import { CreditCard, Check } from "lucide-react";
import { type SavedPaymentMethod } from "@/hooks/queries";

interface AcceptDeclineRowProps {
  isProcessing: boolean;
  /** True once the purchase has succeeded; keeps the CTA disabled through the
   *  success → auto-close window so the offer cannot be charged a second time. */
  purchaseComplete: boolean;
  isCheckingPaymentMethod: boolean;
  resolvedChargePm: SavedPaymentMethod | undefined;
  showInlineCardSetup: boolean;
  upsellPriceLabel: string;
  onAccept: () => void;
  onDecline: () => void;
  /** Rendered between the accept CTA and the decline link (e.g. inclusions panel). */
  children?: React.ReactNode;
}

const AcceptDeclineRow: React.FC<AcceptDeclineRowProps> = ({
  isProcessing,
  purchaseComplete,
  isCheckingPaymentMethod,
  resolvedChargePm,
  showInlineCardSetup,
  upsellPriceLabel,
  onAccept,
  onDecline,
  children,
}) => {
  return (
    <div className="flex flex-col gap-2 mb-2">
      {/* Primary CTA - Purchase with Default Card */}
      <button
        onClick={() => {
          onAccept();
        }}
        disabled={isProcessing || purchaseComplete || !resolvedChargePm || isCheckingPaymentMethod}
        className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-2.5 sm:py-3 px-4 sm:px-6 rounded-xl font-bold text-base sm:text-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
      >
        {purchaseComplete ? (
          <div className="flex items-center justify-center gap-2">
            <Check className="w-4 h-4 sm:w-5 sm:h-5" />
            Purchased
          </div>
        ) : isProcessing ? (
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Processing...
          </div>
        ) : isCheckingPaymentMethod ? (
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Loading payment method...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            {resolvedChargePm ? (
              <>
                <span>Purchase - ${upsellPriceLabel}</span>

                <div className="flex items-center gap-1 ml-2 bg-white/20 rounded-lg px-2 py-1">
                  <CreditCard className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="text-xs sm:text-sm">
                    {resolvedChargePm.card?.last4
                      ? `•••• ${resolvedChargePm.card.last4}`
                      : "Saved card"}
                  </span>
                </div>
              </>
            ) : showInlineCardSetup ? (
              <span className="text-sm font-medium">Use the secure form above</span>
            ) : (
              "No Payment Method Available"
            )}
          </div>
        )}
      </button>

      {children}

      {/* Secondary Action */}
      <button
        onClick={() => {
          // console.log("🟡 Upsell decline button clicked", {
          //   offerId: offer.id,
          //   invoiceFinalized,
          //   hasOriginalPurchaseContext: !!originalPurchaseContext,
          // });
          onDecline();
        }}
        className="w-full rounded-xl border border-red-300 py-2 px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/45 dark:text-red-400 dark:hover:bg-red-950/40 sm:py-2.5 sm:px-6 sm:text-base"
      >
        No thanks, maybe later
      </button>
    </div>
  );
};

export default AcceptDeclineRow;
