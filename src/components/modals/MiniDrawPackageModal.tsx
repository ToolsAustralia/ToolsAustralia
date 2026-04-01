"use client";

import React from "react";
import { X } from "lucide-react";
import type { MiniDrawPackage } from "@/data/miniDrawPackages";
import ModalContainer from "@/components/modals/ui/ModalContainer";

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
  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      height="auto"
      className="!max-w-[360px] sm:!max-w-sm !bg-gray-900 !text-white !border-gray-700 shadow-2xl"
    >
      <div
        className="relative text-sm sm:text-base rounded-xl p-4 sm:p-6"
        style={{
          maxHeight: "calc(100vh - 3rem)",
          minHeight: "280px",
          overflowX: "hidden",
          overflowY: "auto",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-2 -right-2 w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg z-10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="space-y-3 sm:space-y-4 relative z-[1] pr-2">
          <div className="font-bold text-base sm:text-lg text-yellow-400 mb-3 break-words">{pkg.name}</div>

          {pkg.description && (
            <div className="text-gray-300 text-xs sm:text-sm mb-4 leading-relaxed break-words">{pkg.description}</div>
          )}

          <div className="space-y-2.5 sm:space-y-3">
            <div className="flex items-center justify-between py-1.5 border-b border-gray-700">
              <span className="text-gray-300 text-sm sm:text-base">Price:</span>
              <span className="font-semibold text-white text-base sm:text-lg">${pkg.price}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-gray-700">
              <span className="text-gray-300 text-sm sm:text-base">Entries:</span>
              <span className="font-semibold text-yellow-400 text-base sm:text-lg">{pkg.entries}</span>
            </div>
            {pkg.partnerDiscountDays > 0 && (
              <div className="flex items-center justify-between py-1.5 border-b border-gray-700">
                <span className="text-gray-300 text-sm sm:text-base">Partner Discounts:</span>
                <span className="font-semibold text-green-400 text-sm sm:text-base break-words text-right ml-2">
                  {pkg.partnerDiscountDays >= 1
                    ? `${pkg.partnerDiscountDays} ${pkg.partnerDiscountDays === 1 ? "day" : "days"}`
                    : `${pkg.partnerDiscountHours} ${pkg.partnerDiscountHours === 1 ? "hour" : "hours"}`}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onPurchase}
            disabled={isPurchasing || disabled}
            className="w-full mt-4 sm:mt-5 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 text-black py-2.5 sm:py-3 px-4 rounded-lg font-bold text-sm sm:text-base hover:from-yellow-500 hover:via-orange-500 hover:to-red-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {isPurchasing ? (
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-black border-t-transparent" />
                <span>Processing...</span>
              </div>
            ) : (
              "Purchase Now"
            )}
          </button>
        </div>
      </div>
    </ModalContainer>
  );
};

export default MiniDrawPackageModal;
