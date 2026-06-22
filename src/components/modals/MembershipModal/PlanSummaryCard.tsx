"use client";

/**
 * PlanSummaryCard — "Selected Package" card with name/price/Change-link.
 *
 * Colour + text treatment is inherited from the MembershipSection electric
 * cards (ElectricPackageCard dark mode): membership-tab plans resolve via
 * getMembershipSectionColorScheme, one-time / additional packs via
 * getElectricPackageColorScheme. Name + price use the card title style
 * (tier accent + glow, gold gradient for VIP); benefit lines use the same
 * electric white as the MembershipSection "free entries" block.
 */

import React from "react";
import { cn } from "@/utils/cn";
import { type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import { getAdditionalPackDiscount } from "@/utils/membership/additional-pack-discount";
import { convertToAPIPlan } from "@/utils/membership/membership-adapters";
import { getPackageById } from "@/data/membershipPackages";
import {
  getPartnerDiscountBenefitTextForPackageId,
  getPartnerCatalogAccessPercentForMembershipPackageId,
} from "@/utils/partner-discounts/partner-catalog-visibility";
import { type MembershipPlan as ApiMembershipPlan } from "@/hooks/useMemberships";

interface PlanSummaryCardProps {
  promoEnhancedPlan: LocalMembershipPlan;
  promoThemePrimary: string;
  subscriptionPackages: ApiMembershipPlan[];
  oneTimePackages: ApiMembershipPlan[];
  onPackageChange: () => void;
}

const PlanSummaryCard: React.FC<PlanSummaryCardProps> = ({
  promoEnhancedPlan,
  promoThemePrimary,
  subscriptionPackages,
  oneTimePackages,
  onPackageChange,
}) => {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl p-2 sm:p-3">
      {!promoEnhancedPlan ||
      promoEnhancedPlan.id === "placeholder" ||
      promoEnhancedPlan.id.startsWith("placeholder-") ? (
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse w-32"></div>
          <div className="border rounded-lg sm:rounded-xl p-2 sm:p-3 bg-gray-100">
            <div className="space-y-2">
              <div className="h-5 bg-gray-200 rounded animate-pulse w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
              <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3"></div>
            </div>
          </div>
        </div>
      ) : (() => {
          const isUpsellOffer = promoEnhancedPlan?.metadata?.isUpsellOffer === true;
          const planId = isUpsellOffer ? "power-pack" : (promoEnhancedPlan?.id || "power-pack");
          const isMembershipTab = promoEnhancedPlan?.period !== "one-time";
          // Same scheme resolution as MembershipSection's renderPlanCard so the
          // selected-package card matches the grid card exactly.
          const pkgScheme = isMembershipTab
            ? getMembershipSectionColorScheme(planId, true)
            : getElectricPackageColorScheme(planId);
          const accentHex = isUpsellOffer ? promoThemePrimary : pkgScheme.accentHex;
          // Member additional packs are sold below the matching non-member pack.
          const discount = isUpsellOffer ? null : getAdditionalPackDiscount(promoEnhancedPlan?.id || "");
          const isPackageCard = Boolean(
            promoEnhancedPlan?.id &&
              (promoEnhancedPlan.id.startsWith("mini-pack-") ||
                promoEnhancedPlan.id.includes("apprentice") ||
                promoEnhancedPlan.id.includes("tradie") ||
                promoEnhancedPlan.id.includes("foreman") ||
                promoEnhancedPlan.id.includes("boss") ||
                promoEnhancedPlan.id.includes("power-pack") ||
                promoEnhancedPlan.id.includes("vip"))
          );
          const cardBorderColor = isPackageCard ? `${accentHex}${pkgScheme.cardBorderOpacity}` : undefined;
          // Title style mirrors ElectricPackageCard dark mode: tier accent + glow,
          // or the VIP champagne-gold gradient. Used for the name AND the price.
          const gradientText = pkgScheme.textGradientStyle as React.CSSProperties | undefined;
          const titleStyle: React.CSSProperties = gradientText
            ? { ...gradientText, filter: `drop-shadow(0 0 4px ${accentHex}) drop-shadow(0 0 9px ${accentHex}80)` }
            : { color: accentHex, textShadow: `0 0 14px ${accentHex}80` };
          // Electric white — same treatment as the MembershipSection entries block.
          const electricWhiteStyle: React.CSSProperties = {
            color: "#FFFFFF",
            textShadow: `0 0 8px ${accentHex}66`,
          };
          const selectedCatalogId = (() => {
            const api = convertToAPIPlan(promoEnhancedPlan, [...subscriptionPackages, ...oneTimePackages]);
            return (api?._id || promoEnhancedPlan.id).trim();
          })();
          const parseSelectedEntries = (value: unknown) => {
            if (typeof value === "number") return value;
            const parsed = parseInt(String(value ?? 0), 10);
            return Number.isNaN(parsed) ? 0 : parsed;
          };
          let selectedEntriesCount = parseSelectedEntries(promoEnhancedPlan?.metadata?.entriesCount);
          if (selectedEntriesCount <= 0) {
            const staticPkg = getPackageById(selectedCatalogId);
            if (staticPkg?.type === "subscription" && staticPkg.entriesPerMonth) {
              selectedEntriesCount = staticPkg.entriesPerMonth;
            } else if (staticPkg?.type === "one-time" && staticPkg.totalEntries) {
              selectedEntriesCount = staticPkg.totalEntries;
            }
          }
          // First benefit row is the partner-discount access %, not the entries.
          // `promoEnhancedPlan.features[0]` is the entries line (and the promo
          // enhancement rewrites it to "N Free Entries (KX PROMO!)"), so reusing
          // it duplicated the entries shown directly below. Show the partner line
          // here instead; fall back to the feature/subtitle only when the package
          // grants no partner access (helper returns null).
          const partnerBenefitLine = getPartnerDiscountBenefitTextForPackageId(selectedCatalogId)
            ? `${getPartnerCatalogAccessPercentForMembershipPackageId(selectedCatalogId)}% access to partner discount offers`
            : null;
          return (
            <>
              <h3
                className={`text-xs sm:text-sm font-bold mb-1 sm:mb-2 ${
                  isUpsellOffer ? "" : "text-gray-800 dark:text-neutral-100"
                }`}
                style={isUpsellOffer ? { color: promoThemePrimary } : undefined}
              >
                {isUpsellOffer ? "Limited Offer" : "Selected Package"}
              </h3>
              <div
                className="rounded-lg sm:rounded-xl p-2 sm:p-3"
                style={
                  cardBorderColor
                    ? {
                        border: `2px solid ${cardBorderColor}`,
                        backgroundImage: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
                      }
                    : {
                        border: "2px solid transparent",
                        backgroundImage: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${accentHex}, transparent)`,
                        backgroundOrigin: "border-box",
                        backgroundClip: "padding-box, border-box",
                      }
                }
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <h4
                      className="font-bold text-xs sm:text-sm leading-tight"
                      style={isPackageCard ? titleStyle : undefined}
                    >
                      {promoEnhancedPlan?.name ? getPackageDisplayName(promoEnhancedPlan) : "No package selected"}
                    </h4>
                    <p
                      className={cn("text-xs sm:text-sm leading-tight", !isPackageCard ? "text-gray-600 dark:text-neutral-400" : "")}
                      style={isPackageCard ? electricWhiteStyle : undefined}
                    >
                      {partnerBenefitLine
                        ? partnerBenefitLine
                        : promoEnhancedPlan?.features && promoEnhancedPlan.features.length > 0
                          ? promoEnhancedPlan.features[0].text
                          : promoEnhancedPlan?.subtitle || "No package selected"}
                    </p>
                    {selectedEntriesCount > 0 ? (
                      <p
                        className={cn("text-xs sm:text-sm leading-tight", !isPackageCard ? "text-gray-600 dark:text-neutral-400" : "")}
                        style={isPackageCard ? electricWhiteStyle : undefined}
                      >
                        {promoEnhancedPlan?.period === "mo"
                          ? `${selectedEntriesCount} free entries every month`
                          : `${selectedEntriesCount} free entries`}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-0.5 items-end shrink-0">
                    {discount && (
                      <div className="flex items-center gap-1.5 whitespace-nowrap leading-none">
                        <span className="text-xs sm:text-sm font-bold leading-none line-through text-white/40">
                          ${discount.regularPrice}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-3xs sm:text-2xs font-extrabold uppercase leading-none"
                          style={{ backgroundColor: accentHex, color: "#0A0A0A" }}
                        >
                          {discount.percentOff}% Off
                        </span>
                      </div>
                    )}
                    {promoEnhancedPlan?.price && promoEnhancedPlan?.period ? (
                      <div className="flex flex-col items-end leading-tight">
                        <span
                          className="font-bold text-xs sm:text-sm"
                          style={isPackageCard ? titleStyle : undefined}
                        >
                          {discount ? `= $${promoEnhancedPlan.price}` : `$${promoEnhancedPlan.price}`}
                        </span>
                        <span className="text-3xs sm:text-2xs font-semibold uppercase tracking-wide text-white/55">
                          {promoEnhancedPlan.period === "one-time" ? "One Time Payment" : "Per Giveaway"}
                        </span>
                      </div>
                    ) : (
                      <div
                        className="font-bold text-xs sm:text-sm leading-tight"
                        style={isPackageCard ? titleStyle : undefined}
                      >
                        No price
                      </div>
                    )}
                    {!isUpsellOffer && (
                      <button
                        onClick={onPackageChange}
                        type="button"
                        className="relative z-10 text-xs sm:text-sm leading-tight text-white underline decoration-white underline-offset-2 hover:no-underline hover:text-white transition-all duration-200 cursor-pointer"
                      >
                        Change
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          );
        })()}
    </div>
  );
};

export default PlanSummaryCard;
