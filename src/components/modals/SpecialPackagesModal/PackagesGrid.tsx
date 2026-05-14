"use client";

import React from "react";
import Image from "next/image";
import { CheckCircle, Check } from "lucide-react";
import { type StaticMembershipPackage } from "@/data/membershipPackages";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import { getPackageIcon, getPackageIconWrapperScaleClass } from "@/utils/images/package-icons";
import {
  getPackageColorSchemeForPromo,
  getCardBorderStyle,
  type PackageColorsVariantConfig,
} from "@/utils/package-colors/packageColorScheme";
import { cn } from "@/utils/cn";
import { hexToRgba } from "./utils";

interface PackagesGridProps {
  packagesWithPromo: StaticMembershipPackage[];
  selectedPackage: StaticMembershipPackage | null;
  variantConfig: PackageColorsVariantConfig | undefined;
  onSelectPackage: (pkg: StaticMembershipPackage) => void;
  couponCode: string;
  couponApplied: boolean;
  couponError: string | null;
  onCouponCodeChange: (value: string) => void;
  onCouponApply: () => void;
}

/**
 * Renders the grid of package cards plus the coupon code input directly below
 * (the two are visually adjacent in the original modal).
 */
const PackagesGrid: React.FC<PackagesGridProps> = ({
  packagesWithPromo,
  selectedPackage,
  variantConfig,
  onSelectPackage,
  couponCode,
  couponApplied,
  couponError,
  onCouponCodeChange,
  onCouponApply,
}) => {
  return (
    <>
      {/* Package List - Styled to match PackageSelectionModal (uses package color scheme) */}
      <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
        {packagesWithPromo.map((pkg) => {
          const colorScheme = getPackageColorSchemeForPromo(pkg._id || "", false, variantConfig);
          const isSelected = selectedPackage?._id === pkg._id;
          const accentHex = colorScheme.accentHexLight ?? colorScheme.accentHex;
          // Use solid accent color for card text - textGradientStyle with backgroundClip can make nested text invisible on dark cards
          const cardTextStyle = { color: accentHex };
          const selectTextClass = colorScheme.enterNowButtonTextClass ?? (colorScheme.textGradientStyle ? "" : "text-white");
          const cardInnerBg = "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)";
          return (
            <div
              key={pkg._id}
              className="relative rounded-2xl p-2.5 sm:p-4 transition-all duration-300 cursor-pointer"
              style={{
                ...getCardBorderStyle(colorScheme, cardInnerBg),
                ...(!colorScheme.cardBorderGradient && { background: cardInnerBg }),
                boxShadow: isSelected
                  ? `0 0 0 2px rgba(255,255,255,0.5), 0 0 24px ${hexToRgba(accentHex, 0.5)}, 0 8px 32px ${hexToRgba(accentHex, 0.2)}`
                  : `0 0 15px ${hexToRgba(accentHex, 0.25)}, 0 4px 20px rgba(0,0,0,0.2)`,
              }}
              onClick={() => onSelectPackage(pkg)}
            >
              {/* Promo Badge - Upper right, like PackageSelectionModal/MembershipSection */}
              {pkg.isPromoActive && pkg.promoMultiplier && (
                <div className="absolute -top-4 -right-4 sm:-top-5 sm:-right-5 z-30">
                  <Image
                    src={`/images/badge/X${pkg.promoMultiplier}.webp`}
                    alt={`${pkg.promoMultiplier}x entries`}
                    width={64}
                    height={64}
                    className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                    sizes="(max-width: 640px) 48px, 56px"
                  />
                </div>
              )}

              {/* Selection Indicator */}
              {isSelected && (
                <div
                  className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 text-white rounded-full flex items-center justify-center shadow-lg"
                  style={colorScheme.badgeStyle}
                >
                  <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                </div>
              )}

              {/* Package Icon - Centered at top */}
              {getPackageIcon(pkg._id) && (
                <div className="absolute -top-4 sm:-top-5 left-1/2 transform -translate-x-1/2 z-20">
                  <div
                    className={`w-8 h-8 sm:w-12 sm:h-12 relative ${getPackageIconWrapperScaleClass(String(pkg._id), "modal")}`}
                  >
                    <Image
                      src={getPackageIcon(pkg._id)!}
                      alt={`${pkg.name} icon`}
                      fill
                      sizes="(max-width: 640px) 32px, 48px"
                      className={cn("w-full h-full object-contain opacity-90", colorScheme.glow)}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-[1fr_auto_1fr] grid-rows-1 items-center gap-2 sm:gap-3 pt-2 sm:pt-3">
                {/* Package Name - Left, two rows (same row as entries & price) */}
                <div className="min-w-0 text-xs sm:text-sm font-semibold leading-tight" style={cardTextStyle}>
                  <span>{getPackageDisplayName(pkg)}</span>
                </div>

                {/* Main Entries Display - Pinned to card center, aligns with icon (grid center column) */}
                <div className="flex flex-col items-center justify-center min-w-[60px] sm:min-w-[72px]" style={cardTextStyle}>
                  <div className="text-base sm:text-lg font-bold">
                    {pkg.totalEntries || 0}
                  </div>
                  <div className="text-xs font-bold opacity-90">ENTRIES</div>
                </div>

                {/* Right Side - Price and SELECT button (same style as Enter Now) */}
                <div className="flex items-center justify-end gap-2 sm:gap-2">
                  <div className="text-base sm:text-lg font-bold" style={cardTextStyle}>${pkg.price}</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPackage(pkg);
                    }}
                    className={cn("min-w-[52px] sm:min-w-[58px] px-2 py-1 sm:px-2.5 sm:py-1.5 text-2xs sm:text-xs font-bold rounded-lg transition-colors flex-shrink-0 flex items-center justify-center hover:opacity-90", selectTextClass, colorScheme.borderGlow, isSelected ? "shadow-md" : "")}
                    style={colorScheme.enterNowButtonStyle ?? colorScheme.badgeStyle}
                  >
                    <span style={colorScheme.textGradientStyle ?? undefined}>{isSelected ? "✓" : "SELECT"}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Coupon Code Input - Matches MembershipModal exactly for full width */}
      <div className="mb-3 sm:mb-4 w-full">
        <div className="flex gap-2 w-full">
          <input
            type="text"
            value={couponCode}
            onChange={(e) => onCouponCodeChange(e.target.value)}
            placeholder="Enter coupon code"
            className="flex-1 min-w-0 h-11 px-2 sm:px-3 border border-gray-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all duration-300 text-sm sm:text-base bg-white text-gray-900 placeholder:text-gray-500 dark:bg-slate-800 dark:border-slate-600 dark:text-gray-100 dark:placeholder:text-gray-400"
          />
          {couponApplied ? (
            <div className="h-11 bg-green-500 text-white px-2 sm:px-3 rounded-lg sm:rounded-xl flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <Check size={12} />
              <span className="text-xs font-bold">APPLIED</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onCouponApply}
              className="h-11 bg-gray-500 text-white px-2 sm:px-3 rounded-lg sm:rounded-xl hover:bg-gray-600 transition-colors text-xs sm:text-sm disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
            >
              Apply
            </button>
          )}
        </div>
        {couponError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{couponError}</p>
        )}
      </div>
    </>
  );
};

export default PackagesGrid;
