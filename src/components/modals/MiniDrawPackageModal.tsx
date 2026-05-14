"use client";

import React from "react";
import { X } from "lucide-react";
import type { MiniDrawPackage } from "@/data/miniDrawPackages";
import ModalContainer from "@/components/modals/ui/ModalContainer";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";

interface MiniDrawPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  package: MiniDrawPackage;
  onPurchase: () => void;
  isPurchasing?: boolean;
  disabled?: boolean;
}

const MiniDrawPackageModal: React.FC<MiniDrawPackageModalProps> = ({
  isOpen,
  onClose,
  package: pkg,
  onPurchase,
  isPurchasing = false,
  disabled = false,
}) => {
  const partnerCatalogPct = getPartnerCatalogAccessPercentForPlanId(pkg._id);

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      height="auto"
      className="!max-w-[360px] sm:!max-w-sm !bg-gray-900 !text-white !border-gray-700 shadow-2xl"
    >
      <div className="flex max-h-[min(85vh,calc(100vh-3rem))] min-h-[280px] flex-col text-sm sm:text-base rounded-xl p-4 sm:p-6 overflow-visible">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1 font-bold text-base sm:text-lg text-yellow-400 break-words pr-1">{pkg.displayName ?? pkg.name}</div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 text-white shadow-lg transition-colors hover:bg-gray-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5">
          <div className="space-y-3 sm:space-y-4">
            {pkg.description && (
              <div className="text-gray-300 text-xs sm:text-sm leading-relaxed break-words">{pkg.description}</div>
            )}

            <div className="space-y-2.5 sm:space-y-3">
              <div className="flex items-center justify-between border-b border-gray-700 py-1.5">
                <span className="text-gray-300 text-sm sm:text-base">Partner catalog:</span>
                <span className="ml-2 text-right font-semibold text-cyan-300 text-sm sm:text-base">
                  {partnerCatalogPct}% of offers
                </span>
              </div>
              {(pkg.partnerDiscountDays > 0 || pkg.partnerDiscountHours > 0) && (
                <div className="flex items-center justify-between border-b border-gray-700 py-1.5">
                  <span className="text-gray-300 text-sm sm:text-base">Partner access:</span>
                  <span className="ml-2 break-words text-right font-semibold text-green-400 text-sm sm:text-base">
                    {pkg.partnerDiscountDays >= 1
                      ? `${pkg.partnerDiscountDays} ${pkg.partnerDiscountDays === 1 ? "day" : "days"}`
                      : `${pkg.partnerDiscountHours} ${pkg.partnerDiscountHours === 1 ? "hour" : "hours"}`}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-b border-gray-700 py-1.5">
                <span className="text-gray-300 text-sm sm:text-base">Free entries:</span>
                <span className="font-semibold text-yellow-400 text-base sm:text-lg">{pkg.entries}</span>
              </div>
              <div className="flex items-center justify-between border-b border-gray-700 py-1.5">
                <span className="text-gray-300 text-sm sm:text-base">Price:</span>
                <span className="font-semibold text-white text-base sm:text-lg">${pkg.price}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onPurchase}
              disabled={isPurchasing || disabled}
              className="mt-4 w-full bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 py-2.5 sm:py-3 px-4 rounded-lg font-bold text-sm sm:text-base text-black shadow-lg transition-all duration-200 hover:from-yellow-500 hover:via-orange-500 hover:to-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPurchasing ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                  <span>Processing...</span>
                </div>
              ) : (
                "Purchase Now"
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalContainer>
  );
};

export default MiniDrawPackageModal;
