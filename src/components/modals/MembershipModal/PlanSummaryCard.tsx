"use client";

/**
 * PlanSummaryCard — "Selected Package" card with name/price/Change-link and an
 * optional promo multiplier band along the bottom. Used in step 2.
 *
 * Visual output (className strings, gradient backgrounds, border colors,
 * skeleton state) is preserved byte-for-byte from the original
 * MembershipModal.tsx (lines 5588-5763).
 */

import React from "react";
import { cn } from "@/utils/cn";
import HexagonalPromoBadge from "../../ui/HexagonalPromoBadge";
import { type LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { type PromoMultiplier } from "@/types/promo-multiplier";
import { getPackageColorSchemeForPromo } from "@/utils/package-colors/packageColorScheme";
import { convertToAPIPlan } from "@/utils/membership/membership-adapters";
import { getPackageById } from "@/data/membershipPackages";
import { type VariantConfig } from "@/models/ab-testing/Variant";
import { type MembershipPlan as ApiMembershipPlan } from "@/hooks/useMemberships";

interface PlanSummaryCardProps {
  promoEnhancedPlan: LocalMembershipPlan;
  promoThemePrimary: string;
  contextVariantConfig: VariantConfig | null;
  subscriptionPackages: ApiMembershipPlan[];
  oneTimePackages: ApiMembershipPlan[];
  onPackageChange: () => void;
}

const PlanSummaryCard: React.FC<PlanSummaryCardProps> = ({
  promoEnhancedPlan,
  promoThemePrimary,
  contextVariantConfig,
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
          const planId = promoEnhancedPlan?.metadata?.isUpsellOffer
            ? "power-pack"
            : (promoEnhancedPlan?.id || "power-pack");
          const isMembershipTab = promoEnhancedPlan?.period !== "one-time";
          const pkgScheme = getPackageColorSchemeForPromo(planId, isMembershipTab, contextVariantConfig);
          const accentHex = promoEnhancedPlan?.metadata?.isUpsellOffer
            ? promoThemePrimary
            : (pkgScheme.accentHexLight ?? pkgScheme.accentHex);
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
          const nameStyle = isPackageCard && pkgScheme.textGradientStyle
            ? pkgScheme.textGradientStyle
            : isPackageCard
              ? { color: accentHex }
              : undefined;
          const bonusBorderColor = isPackageCard ? `${accentHex}4D` : `${promoThemePrimary}4D`;
          const bonusTextColor = isPackageCard ? accentHex : promoThemePrimary;
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
          return (
            <>
              <h3
                className={`text-xs sm:text-sm font-bold mb-1 sm:mb-2 ${
                  promoEnhancedPlan?.metadata?.isUpsellOffer === true ? "" : "text-gray-800 dark:text-neutral-100"
                }`}
                style={promoEnhancedPlan?.metadata?.isUpsellOffer === true ? { color: promoThemePrimary } : undefined}
              >
                {promoEnhancedPlan?.metadata?.isUpsellOffer === true ? "Limited Offer" : "Selected Package"}
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
                      className={cn("font-bold text-xs sm:text-sm leading-tight", nameStyle ? "" : "")}
                      style={nameStyle ?? (isPackageCard ? { color: accentHex } : undefined)}
                    >
                      {promoEnhancedPlan?.name || "No package selected"}
                    </h4>
                    <p
                      className={cn("text-xs sm:text-sm leading-tight", !isPackageCard ? "text-gray-600 dark:text-neutral-400" : "")}
                      style={
                        isPackageCard && pkgScheme.textGradientStyle
                          ? { ...pkgScheme.textGradientStyle, opacity: 0.9 }
                          : isPackageCard
                            ? { color: accentHex }
                            : undefined
                      }
                    >
                      {promoEnhancedPlan?.features && promoEnhancedPlan.features.length > 0
                        ? promoEnhancedPlan.features[0].text
                        : promoEnhancedPlan?.subtitle || "No package selected"}
                    </p>
                    {selectedEntriesCount > 0 ? (
                      <p
                        className={cn("text-xs sm:text-sm leading-tight", !isPackageCard ? "text-gray-600 dark:text-neutral-400" : "")}
                        style={
                          isPackageCard && pkgScheme.textGradientStyle
                            ? { ...pkgScheme.textGradientStyle, opacity: 0.85 }
                            : isPackageCard
                              ? { color: accentHex }
                              : undefined
                        }
                      >
                        {promoEnhancedPlan?.period === "mo"
                          ? `${selectedEntriesCount} free entries every month`
                          : `${selectedEntriesCount} free entries`}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-0.5 items-end shrink-0">
                    <div
                      className={cn("font-bold text-xs sm:text-sm leading-tight", pkgScheme.textGradientStyle ? "" : "")}
                      style={
                        isPackageCard && pkgScheme.textGradientStyle
                          ? pkgScheme.textGradientStyle
                          : isPackageCard
                            ? { color: accentHex }
                            : undefined
                      }
                    >
                      {promoEnhancedPlan?.price && promoEnhancedPlan?.period
                        ? promoEnhancedPlan.period === "one-time"
                          ? `$${promoEnhancedPlan.price} One Time Payment`
                          : `$${promoEnhancedPlan.price} Per Giveaway`
                        : "No price"}
                    </div>
                    {promoEnhancedPlan?.metadata?.isUpsellOffer !== true && (
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
                {promoEnhancedPlan?.metadata?.isPromoActive &&
                  promoEnhancedPlan?.metadata?.promoMultiplier && (
                    <div
                      className="mt-3 pt-3 border-t"
                      style={{ borderColor: bonusBorderColor }}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-xs sm:text-sm font-semibold" style={{ color: bonusTextColor }}>
                          <HexagonalPromoBadge
                            multiplier={promoEnhancedPlan.metadata.promoMultiplier as PromoMultiplier}
                            size="xs"
                          />
                        </span>
                        <span className="text-xs sm:text-sm text-white font-bold">
                          {promoEnhancedPlan.metadata.promoMultiplier}x Bonus entries have been applied
                        </span>
                      </div>
                    </div>
                  )}
              </div>
            </>
          );
        })()}
    </div>
  );
};

export default PlanSummaryCard;
