"use client";

import React from "react";
import { Check } from "lucide-react";
import { type StaticMembershipPackage } from "@/data/membershipPackages";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import { type PackageColorsVariantConfig } from "@/utils/package-colors/packageColorScheme";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { getAdditionalPackDiscount } from "@/utils/membership/additional-pack-discount";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { isOneTimeBestValuePlanId } from "@/utils/membership/additional-package-mapping";
import PackageTile, { type PackageTileRibbon } from "../PackageTile";

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
 * The package tile grid plus the coupon row.
 *
 * The coupon stays here: this modal owns its OWN purchase flow (Stripe Elements,
 * handlePurchase, setup-intent — see index.tsx), it is not a front-end for MembershipModal.
 * The two modals are alternatives — SpecialPackagesModal serves members WITH additional
 * access, MembershipModal's one-time flow serves everyone else. Removing the coupon here
 * also breaks `initialCouponCode`, which the rewards coupon-unlock journey depends on.
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
      {/* Single column of WIDE tiles, not a 2-up grid.
          The 2-up put six packs on three tall rows, which forced scrolling to compare them —
          the previous design fitted all of them in one view, and that comparability is the
          point of this modal. The wide tile lays stats and footer side by side instead of
          stacked, roughly halving each row's height. */}
      <div className="mb-4 grid grid-cols-1 items-stretch gap-2 pt-3 sm:mb-6 sm:gap-2.5">
        {packagesWithPromo.map((pkg) => {
          const id = pkg._id || "";
          const colorScheme = getElectricPackageColorScheme(id);
          const discount = getAdditionalPackDiscount(id);
          const days = pkg.partnerDiscountDays ?? 0;
          const entries = pkg.totalEntries || 0;
          const ribbon: PackageTileRibbon | null = isOneTimeBestValuePlanId(id) ? "best-value" : null;

          return (
            <PackageTile
              key={id}
              planId={id}
              name={getPackageDisplayName(pkg)}
              accentHex={colorScheme.accentHex}
              entries={entries}
              wasEntries={typeof pkg.originalEntries === "number" ? pkg.originalEntries : null}
              promoActive={Boolean(pkg.isPromoActive)}
              multiplier={pkg.promoMultiplier}
              accessPct={getPartnerCatalogAccessPercentForPlanId(id)}
              accessCaption={
                days > 0 ? `${days}-day discount access` : "partner discount access"
              }
              price={pkg.price}
              periodLabel="One Time"
              struckPrice={discount ? discount.regularPrice : null}
              discountPercent={discount ? discount.percentOff : null}
              ribbon={ribbon}
              isSelected={selectedPackage?._id === pkg._id}
              // Additional packs are never a "current plan" — they are repeat purchases.
              isCurrent={false}
              // Always compact + wide: this modal's job is comparing six packs at a glance,
              // so every row is as short as the tile can go, at every width.
              compact
              wide
              onSelect={() => onSelectPackage(pkg)}
            />
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
