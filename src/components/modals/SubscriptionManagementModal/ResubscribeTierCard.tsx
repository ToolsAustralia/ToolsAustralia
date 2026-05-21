"use client";

import React from "react";
import Image from "next/image";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getPackageIcon } from "@/utils/images/package-icons";
import PromoBadgeImage from "@/components/ui/PromoBadgeImage";
import { hasBundledMultiplierAssets, type PromoMultiplier } from "@/types/promo-multiplier";
import { cn } from "@/utils/cn";
import type { ResubscribeTierOption } from "./ResubscribeTierPicker";

export interface ResubscribeTierCardProps {
  plan: ResubscribeTierOption;
  promoMultiplier: number;
  lastMonthAccumulatedEntries: number;
  isPrevious: boolean;
  theme?: "light" | "dark";
  onSelect: (packageId: string) => void;
}

const ResubscribeTierCard: React.FC<ResubscribeTierCardProps> = ({
  plan,
  promoMultiplier,
  lastMonthAccumulatedEntries,
  isPrevious,
  theme = "dark",
  onSelect,
}) => {
  const scheme = getMembershipSectionColorScheme(plan.packageId, true);
  const icon = getPackageIcon(plan.packageId);
  const grant = plan.entriesPerMonth * promoMultiplier;
  const nextRenewal = lastMonthAccumulatedEntries + grant + plan.entriesPerMonth;
  const isLight = theme === "light";
  const promoActive = promoMultiplier > 1;
  const showBundledBadge = promoActive && hasBundledMultiplierAssets(promoMultiplier);

  const accent = scheme.accentHex;
  const bigNumberStyle: React.CSSProperties = isLight
    ? { color: "#0A0A0A" }
    : {
        color: "#FFFFFF",
        textShadow: `0 0 18px ${accent}, 0 0 36px ${accent}80`,
      };

  return (
    <div
      className={cn(
        "relative w-full text-left rounded-3xl overflow-visible p-5",
        "transition-[box-shadow] duration-200",
        scheme.bgGradient,
      )}
      style={{
        boxShadow: isLight
          ? "0 4px 12px rgba(0,0,0,0.08)"
          : `0 0 24px ${accent}40, 0 4px 12px rgba(0,0,0,0.3)`,
      }}
    >
      {/* Top row: icon + multiplier badge */}
      <div className="flex items-start justify-between mb-3">
        {icon ? (
          <Image
            src={icon}
            alt={`${plan.name} icon`}
            width={48}
            height={48}
            className="object-contain"
            sizes="48px"
          />
        ) : (
          <div className="w-12 h-12" aria-hidden="true" />
        )}
        {showBundledBadge ? (
          <PromoBadgeImage
            multiplier={promoMultiplier as PromoMultiplier}
            size="large"
            className="!h-16 sm:!h-18 md:!h-20"
          />
        ) : null}
      </div>

      {/* Tier name + price */}
      <div className="flex items-baseline justify-between mb-3">
        <h3 className={cn("font-bold text-lg", isLight ? "text-gray-900" : "text-white")}>
          {plan.name}
          {isPrevious && (
            <span
              className={cn(
                "ml-2 text-xs font-normal",
                isLight ? "text-gray-500" : "text-white/70",
              )}
            >
              (previously)
            </span>
          )}
        </h3>
        <span
          className={cn(
            "text-sm font-semibold",
            isLight ? "text-gray-700" : "text-white/90",
          )}
        >
          ${plan.price}/mo
        </span>
      </div>

      {/* Big sign-up grant number */}
      <div className="mb-3">
        <p
          className={cn(
            "text-xs uppercase tracking-wide font-semibold mb-1",
            isLight ? "text-gray-600" : "text-white/80",
          )}
        >
          Sign-up grant
        </p>
        <p className="text-3xl font-black leading-none" style={bigNumberStyle}>
          {grant.toLocaleString()}
        </p>
      </div>

      {/* Per-tier breakdown */}
      <div
        className={cn(
          "text-xs space-y-1",
          isLight ? "text-gray-700" : "text-white/85",
        )}
      >
        <p>
          Accumulated entries: <strong>{lastMonthAccumulatedEntries.toLocaleString()}</strong>
        </p>
        <p>
          Next renewal: <strong>{nextRenewal.toLocaleString()}</strong>
        </p>
      </div>

      {/* Join CTA — mirrors ElectricPackageCard CTA: black bg, tier-coloured text & border */}
      <button
        type="button"
        onClick={() => onSelect(plan.packageId)}
        className={cn(
          "mt-4 flex h-[50px] w-full items-center justify-center rounded-2xl px-5",
          "font-sans font-black uppercase tracking-wide text-[16px]",
          "transition-[transform,box-shadow,filter] duration-200 hover:scale-[1.02] hover:brightness-125",
        )}
        style={{
          backgroundColor: "#000000",
          border: `1.5px solid ${accent}`,
          color: accent,
          boxShadow: `0 0 18px ${accent}40, inset 0 0 12px ${accent}1F`,
        }}
      >
        Join {plan.name}
      </button>
    </div>
  );
};

export default ResubscribeTierCard;
