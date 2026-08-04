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
import { getPackageCardSurface } from "@/utils/package-colors/packageCardSurface";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import { getAdditionalPackDiscount } from "@/utils/membership/additional-pack-discount";
import {
  isBossSubscriptionPlanId,
  isForemanSubscriptionPlanId,
  isOneTimeBestValuePlanId,
} from "@/utils/membership/additional-package-mapping";
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
    <div>
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
          // Same chrome the MembershipSection card and the package picker render, so the
          // card the visitor lands on repeats the tile they tapped.
          const surface = getPackageCardSurface(planId, {
            isMembershipTab,
            colorScheme: pkgScheme,
          });
          const accentHex = isUpsellOffer ? promoThemePrimary : pkgScheme.accentHex;
          /** Ink-contrast fill for pills — an accent chip vanishes on a vivid body. */
          const onInk = surface.blackText ? "#FFFFFF" : "#0A0A0A";
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
          // Upsell offers are themed by promoThemePrimary, not a package tier, so they have no
          // vivid tier body — they keep the original slate treatment.
          const useTierSurface = isPackageCard && !isUpsellOffer;
          // Tier flag shown beside the package name — the SAME rule the package picker's
          // ribbons use (PlanGrid), so the card the visitor lands on repeats the label that
          // was on the tile they tapped. Upsell offers keep their own "Limited Offer" framing.
          const tierFlag = isUpsellOffer
            ? null
            : isMembershipTab && isForemanSubscriptionPlanId(planId)
              ? "Recommended"
              : (isMembershipTab && isBossSubscriptionPlanId(planId)) ||
                  (!isMembershipTab && isOneTimeBestValuePlanId(planId))
                ? "Best Value"
                : null;
          // Name + price share the shared surface's title treatment (tier ink on the vivid
          // body, or the VIP champagne-gold gradient). Upsell offers keep the promo accent.
          const titleStyle: React.CSSProperties = useTierSurface
            ? surface.title
            : { color: accentHex, textShadow: `0 0 14px ${accentHex}80` };
          // Benefit/entry lines — muted ink on the vivid body.
          const benefitStyle: React.CSSProperties = useTierSurface
            ? { color: surface.ink }
            : { color: "#FFFFFF", textShadow: `0 0 8px ${accentHex}66` };
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
                className="relative rounded-lg sm:rounded-xl p-2 sm:p-3"
                style={
                  useTierSurface
                    ? { background: surface.body, border: surface.border, boxShadow: surface.bloom }
                    : {
                        border: "2px solid transparent",
                        backgroundImage: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${accentHex}, transparent)`,
                        backgroundOrigin: "border-box",
                        backgroundClip: "padding-box, border-box",
                      }
                }
              >
                {useTierSurface && (
                  <div
                    className="pointer-events-none absolute inset-0.5 rounded-[10px] z-0"
                    style={{ background: surface.sheen }}
                    aria-hidden
                  />
                )}
                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h4
                        className="font-bold text-xs sm:text-sm leading-tight"
                        style={isPackageCard ? titleStyle : undefined}
                      >
                        {promoEnhancedPlan?.name ? getPackageDisplayName(promoEnhancedPlan) : "No package selected"}
                      </h4>
                      {tierFlag && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-3xs sm:text-2xs font-extrabold uppercase leading-none tracking-wide"
                          style={useTierSurface ? { backgroundColor: surface.ink, color: onInk } : { backgroundColor: accentHex, color: "#0A0A0A" }}
                        >
                          {tierFlag}
                        </span>
                      )}
                    </div>
                    <p
                      className={cn("text-xs sm:text-sm leading-tight", !isPackageCard ? "text-gray-600 dark:text-neutral-400" : "")}
                      style={isPackageCard ? benefitStyle : undefined}
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
                        style={isPackageCard ? benefitStyle : undefined}
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
                        <span
                          className="text-xs sm:text-sm font-bold leading-none line-through"
                          style={{ color: useTierSurface ? surface.inkFaint : "rgba(255,255,255,0.4)" }}
                        >
                          ${discount.regularPrice}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-3xs sm:text-2xs font-extrabold uppercase leading-none"
                          style={useTierSurface ? { backgroundColor: surface.ink, color: onInk } : { backgroundColor: accentHex, color: "#0A0A0A" }}
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
                        <span
                          className="text-3xs sm:text-2xs font-semibold uppercase tracking-wide"
                          style={{ color: useTierSurface ? surface.inkMuted : "rgba(255,255,255,0.55)" }}
                        >
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
                        className="relative z-10 text-xs sm:text-sm leading-tight underline underline-offset-2 hover:no-underline transition-all duration-200 cursor-pointer"
                        style={{
                          // White is invisible on the lime/amber vivid bodies — follow the tier ink.
                          color: useTierSurface ? surface.ink : "#FFFFFF",
                          textDecorationColor: useTierSurface ? surface.ink : "#FFFFFF",
                        }}
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
