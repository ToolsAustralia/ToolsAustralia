"use client";

import React from "react";
import Image from "next/image";
import { CheckCircle, Check } from "lucide-react";
import { type StaticMembershipPackage } from "@/data/membershipPackages";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import { getPackageIcon, getPackageIconWrapperScaleClass } from "@/utils/images/package-icons";
import { type PackageColorsVariantConfig } from "@/utils/package-colors/packageColorScheme";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { getPackageCardSurface } from "@/utils/package-colors/packageCardSurface";
import { getAdditionalPackDiscount } from "@/utils/membership/additional-pack-discount";
import { cn } from "@/utils/cn";
import BestValueBadge from "@/components/ui/BestValueBadge";
import { isOneTimeBestValuePlanId } from "@/utils/membership/additional-package-mapping";

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
      <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6 pt-3">
        {packagesWithPromo.map((pkg) => {
          const colorScheme = getElectricPackageColorScheme(pkg._id || "");
          const isSelected = selectedPackage?._id === pkg._id;
          // Same chrome as the MembershipSection card (ElectricPackageCard) and the package
          // picker, so all three surfaces agree tier-for-tier.
          const surface = getPackageCardSurface(pkg._id || "", {
            isMembershipTab: false,
            colorScheme,
          });
          /** Ink-contrast fill for pills/badges — an accent chip vanishes on a vivid body. */
          const onInk = surface.blackText ? "#FFFFFF" : "#0A0A0A";
          const discount = getAdditionalPackDiscount(pkg._id || "");
          // No selection → every card reads at full strength. A selection exists → only the
          // selected card keeps it; the rest recede.
          const showStrong = selectedPackage == null || isSelected;
          return (
            <div
              key={pkg._id}
              className={cn(
                "relative rounded-2xl p-2.5 sm:p-4 transition-[opacity,box-shadow] duration-300 cursor-pointer",
                !showStrong && "opacity-60"
              )}
              style={{
                background: surface.body,
                // Constant border in every state → selecting causes no layout shift.
                border: surface.border,
                boxShadow: isSelected ? surface.bloomSelected : surface.bloom,
              }}
              onClick={() => onSelectPackage(pkg)}
            >
              {/* Inner sheen — depth pass, matches the section card */}
              <div
                className="pointer-events-none absolute inset-0.5 rounded-[14px] z-0"
                style={{ background: surface.sheen }}
                aria-hidden
              />
              {isOneTimeBestValuePlanId(pkg._id || "") && (
                <BestValueBadge
                  position="top-left"
                  size="small"
                  badgeStyle={colorScheme.badgeStyle}
                  colorScheme={colorScheme}
                  className="scale-[0.6] origin-top-left"
                />
              )}

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
                  className="absolute -top-1 -right-1 z-30 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center shadow-lg"
                  style={{ background: surface.ring, color: onInk }}
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

              <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] grid-rows-1 items-center gap-2 sm:gap-3 pt-2 sm:pt-3">
                {/* Package Name - Left, two rows (same row as entries & price) */}
                <div className="min-w-0 text-xs sm:text-sm font-semibold leading-tight" style={surface.title}>
                  <span>
                    {getPackageDisplayName(pkg)
                      .split(" ")
                      .map((word, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <br className="sm:hidden" />}
                          {i > 0 && <span className="hidden sm:inline"> </span>}
                          {word}
                        </React.Fragment>
                      ))}
                  </span>
                </div>

                {/* Main Entries Display - Pinned to card center, aligns with icon (grid center column) */}
                <div className="flex flex-col items-center justify-center min-w-[60px] sm:min-w-[72px]">
                  <div className="relative text-base sm:text-lg font-extrabold" style={surface.bigNumber}>
                    {pkg.totalEntries || 0}
                    {pkg.isPromoActive && typeof pkg.originalEntries === "number" && pkg.originalEntries !== (pkg.totalEntries || 0) && (
                      <span
                        className="absolute right-full top-0 mr-1 whitespace-nowrap text-[11px] font-bold leading-none line-through"
                        style={{ color: surface.inkFaint }}
                      >
                        {pkg.originalEntries}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-bold tracking-wide" style={{ color: surface.inkMuted }}>FREE ENTRIES</div>
                </div>

                {/* Right Side - Price (struck regular upper-right) + SELECT button */}
                <div className="flex items-center justify-end gap-2">
                  <span className="relative inline-block text-base sm:text-lg font-extrabold leading-none" style={surface.title}>
                    {discount && (
                      <span
                        className="absolute -top-3 right-0 whitespace-nowrap text-[11px] font-bold leading-none line-through"
                        style={{ color: surface.inkFaint }}
                      >
                        ${discount.regularPrice}
                      </span>
                    )}
                    ${pkg.price}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPackage(pkg);
                    }}
                    className={cn("min-w-[38px] sm:min-w-[58px] px-1.5 py-0.5 sm:px-2.5 sm:py-1.5 text-[8px] sm:text-xs font-bold rounded-md sm:rounded-lg transition-colors flex-shrink-0 flex items-center justify-center hover:opacity-90", isSelected ? "shadow-md" : "")}
                    style={surface.cta}
                  >
                    {isSelected ? "✓" : "SELECT"}
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
