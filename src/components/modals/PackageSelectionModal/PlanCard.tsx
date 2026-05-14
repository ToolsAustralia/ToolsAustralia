"use client";

import React from "react";
import { Check } from "lucide-react";
import Image from "next/image";
import BestValueBadge from "@/components/ui/BestValueBadge";
import CornerRibbonBadge from "@/components/ui/CornerRibbonBadge";
import { getPackageIcon, getPackageIconWrapperScaleClass } from "@/utils/images/package-icons";
import { getCardBorderStyle, type getPackageColorSchemeForPromo } from "@/utils/package-colors/packageColorScheme";
import { cn } from "@/utils/cn";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import FeaturesPreview from "./FeaturesPreview";

type ColorScheme = ReturnType<typeof getPackageColorSchemeForPromo>;

// Helper function to convert hex color to rgba for box-shadow
const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

interface PlanCardProps {
  plan: LocalMembershipPlan;
  colorScheme: ColorScheme;
  accentHex: string;
  isCurrent: boolean;
  isSelected: boolean;
  showBestValueRibbon: boolean;
  onClick: () => void;
}

const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  colorScheme,
  accentHex,
  isCurrent,
  isSelected,
  showBestValueRibbon,
  onClick,
}) => {
  return (
    <div
      className={`relative rounded-2xl p-2.5 sm:p-4 shadow-[0_0_15px_rgba(0,0,0,0.4)] transition-all duration-300 hover:scale-[1.02] ${
        isCurrent ? "cursor-not-allowed opacity-75" : "cursor-pointer"
      } ${
        isSelected
          ? "ring-4 ring-yellow-400 ring-offset-2 ring-offset-slate-900 shadow-2xl"
          : "hover:shadow-[0_0_25px_rgba(0,0,0,0.6)]"
      }`}
      style={{
        ...(colorScheme.cardBorderGradient
          ? getCardBorderStyle(colorScheme, "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)")
          : {
              border: isSelected
                ? `3px solid ${accentHex}`
                : `2px solid transparent`,
              backgroundImage: isSelected
                ? `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${hexToRgba(
                    accentHex,
                    0.8
                  )}, ${hexToRgba(accentHex, 0.5)})`
                : `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%), linear-gradient(135deg, ${accentHex}, transparent)`,
              backgroundOrigin: "border-box",
              backgroundClip: "padding-box, border-box",
            }),
        boxShadow: isSelected
          ? `0 0 20px ${hexToRgba(accentHex, 0.6)}, 0 0 40px ${hexToRgba(
              accentHex,
              0.4
            )}, 0 0 60px rgba(251, 191, 36, 0.3), 0 0 0 4px rgba(251, 191, 36, 0.2)`
          : `0 0 15px ${hexToRgba(accentHex, 0.4)}, 0 0 30px ${hexToRgba(
              accentHex,
              0.2
            )}`,
      }}
      onClick={onClick}
    >
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
        <div
          className={cn("font-bold text-base sm:text-lg leading-tight", colorScheme.textGradientStyle ? "" : colorScheme.priceText)}
          style={colorScheme.textGradientStyle ?? { color: accentHex }}
        >
          ${plan.price}
        </div>
        <div
          className="text-3xs sm:text-2xs font-semibold"
          style={colorScheme.textGradientStyle ? { ...colorScheme.textGradientStyle, opacity: 0.9 } : { color: "rgba(255,255,255,0.9)" }}
        >
          {plan.period === "one-time" ? "One Time" : "Per Giveaway"}
        </div>
      </div>

      {/* Best Value = last tier only: Boss subscription, or Power one-time (incl. member additional) */}
      {showBestValueRibbon && (
        <BestValueBadge position="top-right" size="small" badgeStyle={colorScheme.badgeStyle} colorScheme={colorScheme} />
      )}
      {!showBestValueRibbon && (isCurrent || (plan.isPopular && !isCurrent)) && (
        <CornerRibbonBadge
          position="top-right"
          size="small"
          badgeStyle={colorScheme.badgeStyle}
          colorScheme={colorScheme}
        >
          {isCurrent ? "CURRENT" : "MOST POPULAR"}
        </CornerRibbonBadge>
      )}

      {/* Current Selection Indicator */}
      {isSelected && !isCurrent && (
        <div
          className="absolute -top-1 -right-1 text-white rounded-full p-0.5 sm:p-1 flex items-center justify-center"
          style={{ background: accentHex }}
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
      <div className="text-center pt-8 sm:pt-8">
        <div className="flex items-center justify-center gap-2 mb-1 sm:mb-1.5">
          <h3
            className="text-base sm:text-lg font-bold tracking-wide"
            style={colorScheme.textGradientStyle ?? { color: accentHex }}
          >
            {getPackageDisplayName(plan)}
          </h3>
        </div>
        {plan.subtitle && (
          <p
            className="text-xs sm:text-sm mb-1.5 sm:mb-2"
            style={colorScheme.textGradientStyle ? { ...colorScheme.textGradientStyle, opacity: 0.9 } : { color: "rgba(255,255,255,0.8)" }}
          >
            {plan.subtitle}
          </p>
        )}

        <FeaturesPreview plan={plan} colorScheme={colorScheme} accentHex={accentHex} />
      </div>
    </div>
  );
};

export default PlanCard;
