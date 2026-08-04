"use client";

import React from "react";
import { Check } from "lucide-react";
import Image from "next/image";
import BestValueBadge from "@/components/ui/BestValueBadge";
import CornerRibbonBadge from "@/components/ui/CornerRibbonBadge";
import { getPackageIcon, getPackageIconWrapperScaleClass } from "@/utils/images/package-icons";
import { type getPackageColorSchemeForPromo } from "@/utils/package-colors/packageColorScheme";
import { getPackageCardSurface } from "@/utils/package-colors/packageCardSurface";
import { cn } from "@/utils/cn";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import FeaturesPreview from "./FeaturesPreview";

type ColorScheme = ReturnType<typeof getPackageColorSchemeForPromo>;

interface PlanCardProps {
  plan: LocalMembershipPlan;
  colorScheme: ColorScheme;
  accentHex: string;
  /** Set for additional (member) packs sold below the matching non-member pack. */
  discount: { regularPrice: number; percentOff: number } | null;
  isCurrent: boolean;
  isSelected: boolean;
  showBestValueRibbon: boolean;
  /** Foreman tier — its ribbon reads RECOMMENDED instead of the generic MOST POPULAR. */
  showRecommendedRibbon?: boolean;
  onClick: () => void;
}

const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  colorScheme,
  accentHex,
  discount,
  isCurrent,
  isSelected,
  showBestValueRibbon,
  showRecommendedRibbon = false,
  onClick,
}) => {
  // Same chrome the MembershipSection card renders (ElectricPackageCard), so the picker
  // and the section agree tier-for-tier — including the cross-tier light-theme remaps.
  const surface = getPackageCardSurface(plan.id, {
    isMembershipTab: plan.period !== "one-time",
    colorScheme,
  });
  /** Ink-contrast fill for pills/badges — an accent-coloured chip vanishes on a vivid body. */
  const onInk = surface.blackText ? "#FFFFFF" : "#0A0A0A";

  return (
    <div
      className={cn(
        "relative rounded-2xl p-2.5 sm:p-4 transition-[transform,box-shadow] duration-300",
        isCurrent ? "cursor-not-allowed opacity-75" : "cursor-pointer hover:scale-[1.02]"
      )}
      style={{
        background: surface.body,
        // Constant border in BOTH states so selecting causes no layout shift — only the
        // bloom escalates. (The old card went 2px → 3px on select and nudged the row.)
        border: surface.border,
        boxShadow: isSelected ? surface.bloomSelected : surface.bloom,
      }}
      onClick={onClick}
    >
      {/* Inner sheen — the depth pass that makes the vivid body read as a card, not a swatch */}
      <div
        className="pointer-events-none absolute inset-0.5 rounded-[14px] z-0"
        style={{ background: surface.sheen }}
        aria-hidden
      />

      {/* Promo Badge (10x entries) - Upper right, like MembershipSection */}
      {plan.metadata?.isPromoActive && plan.metadata?.promoMultiplier && (
        <div className="absolute -top-4 -right-4 sm:-top-5 sm:-right-5 z-30">
          <Image
            src={`/images/badge/X${plan.metadata.promoMultiplier}.webp`}
            alt={`${plan.metadata.promoMultiplier}x entries`}
            width={64}
            height={64}
            className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
            sizes="(max-width: 640px) 48px, 56px"
          />
        </div>
      )}

      {/* Price - Absolute top-left, no background */}
      <div className="absolute top-1.5 left-1.5 z-20 font-poppins text-center">
        <div className="relative inline-block">
          <div className="font-bold text-base sm:text-lg leading-tight" style={surface.title}>
            ${plan.price}
          </div>
          {discount && (
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-1.5 flex items-center gap-1 whitespace-nowrap leading-none">
              <span className="text-3xs sm:text-2xs font-bold line-through" style={{ color: surface.inkFaint }}>
                ${discount.regularPrice}
              </span>
              <span
                className="rounded-full px-1 py-0.5 text-3xs font-extrabold uppercase"
                style={{ backgroundColor: surface.ink, color: onInk }}
              >
                {discount.percentOff}% Off
              </span>
            </div>
          )}
        </div>
        <div className="text-3xs sm:text-2xs font-semibold" style={{ color: surface.inkMuted }}>
          {plan.period === "one-time" ? "One Time" : "Per Giveaway"}
        </div>
      </div>

      {/* Best Value = last tier only: Boss subscription, or Power one-time (incl. member additional) */}
      {showBestValueRibbon && (
        <BestValueBadge position="top-right" size="small" badgeStyle={colorScheme.badgeStyle} colorScheme={colorScheme} />
      )}
      {!showBestValueRibbon && (isCurrent || showRecommendedRibbon || plan.isPopular) && (
        <CornerRibbonBadge
          position="top-right"
          size="small"
          badgeStyle={colorScheme.badgeStyle}
          colorScheme={colorScheme}
        >
          {isCurrent ? "CURRENT" : showRecommendedRibbon ? "RECOMMENDED" : "MOST POPULAR"}
        </CornerRibbonBadge>
      )}

      {/* Current Selection Indicator */}
      {isSelected && !isCurrent && (
        <div
          className="absolute -top-1 -right-1 z-30 rounded-full p-0.5 sm:p-1 flex items-center justify-center"
          style={{ background: surface.ring, color: onInk }}
        >
          <Check size={10} className="sm:hidden" />
          <Check size={12} className="hidden sm:block" />
        </div>
      )}

      {/* Package Icon - Centered at top */}
      {getPackageIcon(plan.id) && (
        <div className="absolute -top-4 sm:-top-5 left-1/2 transform -translate-x-1/2 z-20">
          <div
            className={`w-8 h-8 sm:w-12 sm:h-12 relative ${getPackageIconWrapperScaleClass(plan.id, "modal")}`}
          >
            <Image
              src={getPackageIcon(plan.id)!}
              alt={`${plan.name} icon`}
              fill
              sizes="(max-width: 640px) 32px, 48px"
              className={cn("w-full h-full object-contain", colorScheme.glow, "opacity-90")}
            />
          </div>
        </div>
      )}

      {/* Plan Content - Centered Layout */}
      <div className="relative z-10 text-center pt-8 sm:pt-8">
        <div className="flex items-center justify-center gap-2 mb-1 sm:mb-1.5">
          <h3 className="text-base sm:text-lg font-bold tracking-wide" style={surface.title}>
            {getPackageDisplayName(plan)}
          </h3>
        </div>
        {plan.subtitle && (
          <p className="text-xs sm:text-sm mb-1.5 sm:mb-2" style={{ color: surface.inkMuted }}>
            {plan.subtitle}
          </p>
        )}

        <FeaturesPreview plan={plan} surface={surface} accentHex={accentHex} />
      </div>
    </div>
  );
};

export default PlanCard;
