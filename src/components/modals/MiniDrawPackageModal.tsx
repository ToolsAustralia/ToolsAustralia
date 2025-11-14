"use client";

import React from "react";
import { X } from "lucide-react";
import type { MiniDrawPackage } from "@/data/miniDrawPackages";

interface MiniDrawPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  package: MiniDrawPackage;
  onPurchase: () => void;
  isPurchasing?: boolean;
  disabled?: boolean;
}

/**
 * MiniDrawPackageModal Component
 * Modal component styled like tooltip (dark background, gold/yellow accents)
 * Shows package details with purchase button
 */
const MiniDrawPackageModal: React.FC<MiniDrawPackageModalProps> = ({
  isOpen,
  onClose,
  package: pkg,
  onPurchase,
  isPurchasing = false,
  disabled = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      {/* Modal Content - styled like tooltip */}
      <div
        className="relative bg-gray-900 text-white text-sm sm:text-base rounded-xl p-4 sm:p-6 shadow-2xl w-[360px] sm:w-96 max-w-[calc(100vw-2rem)] z-[101]"
        style={{
          maxHeight: "calc(100vh - 3rem)",
          minHeight: "280px",
          overflowX: "hidden",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg z-10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="space-y-3 sm:space-y-4 relative z-[1] pr-2">
          {/* Package Name */}
          <div className="font-bold text-base sm:text-lg text-yellow-400 mb-3 break-words">{pkg.name}</div>

          {/* Package Description */}
          {pkg.description && (
            <div className="text-gray-300 text-xs sm:text-sm mb-4 leading-relaxed break-words">{pkg.description}</div>
          )}

          {/* Details Section */}
          <div className="space-y-2.5 sm:space-y-3">
            {/* Price */}
            <div className="flex items-center justify-between py-1.5 border-b border-gray-700">
              <span className="text-gray-300 text-sm sm:text-base">Price:</span>
              <span className="font-semibold text-white text-base sm:text-lg">${pkg.price}</span>
            </div>

            {/* Entries */}
            <div className="flex items-center justify-between py-1.5 border-b border-gray-700">
              <span className="text-gray-300 text-sm sm:text-base">Entries:</span>
              <span className="font-semibold text-yellow-400 text-base sm:text-lg">{pkg.entries}</span>
            </div>

            {/* Partner Discounts */}
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

          {/* Purchase button */}
          <button
            onClick={onPurchase}
            disabled={isPurchasing || disabled}
            className="w-full mt-4 sm:mt-5 bg-gradient-to-r from-yellow-400 via-yellow-500 to-orange-500 text-black py-2.5 sm:py-3 px-4 rounded-lg font-bold text-sm sm:text-base hover:from-yellow-500 hover:via-orange-500 hover:to-red-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {isPurchasing ? (
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-black border-t-transparent"></div>
                <span>Processing...</span>
              </div>
            ) : (
              "Purchase Now"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MiniDrawPackageModal;
