"use client";

import React from "react";
import Image from "next/image";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import { getPackageIcon } from "@/utils/images/package-icons";
import type { PackageColorScheme } from "@/utils/package-colors/packageColorScheme";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { cn } from "@/utils/cn";
import BestValueBadge from "@/components/ui/BestValueBadge";
import CornerRibbonBadge from "@/components/ui/CornerRibbonBadge";

export interface ElectricPackageCardState {
  locked: boolean;
  lockReason?: string;
  isCurrent: boolean;
}

export interface ElectricPackageCardProps {
  plan: LocalMembershipPlan;
  colorScheme: PackageColorScheme;
  state: ElectricPackageCardState;
  discount?: { regularPrice: number; percentOff: number } | null;
  onSelect: (plan: LocalMembershipPlan) => void;
  /** Show the BEST VALUE corner ribbon (caller decides per tier rule). */
  showBestValue?: boolean;
  /** Optional corner ribbon label (e.g. "MOST POPULAR" / "CURRENT"). Ignored when showBestValue is true. */
  ribbon?: string | null;
}

/** Reads the entries number out of the plan's feature list (mirrors MembershipSection). */
function readEntries(plan: LocalMembershipPlan): { original: number; display: number; multiplied: boolean } {
  const feature = plan.features.find((f) => /entries/i.test(f.text));
  const base = feature ? parseInt(feature.text.match(/(\d+)/)?.[1] ?? "0", 10) : 0;
  const m = typeof plan.metadata?.promoMultiplier === "number" ? plan.metadata.promoMultiplier : 0;
  if (m > 1) {
    const original = plan.metadata?.originalEntries ?? base;
    const display = plan.metadata?.entriesCount ?? base;
    return { original: original as number, display: display as number, multiplied: true };
  }
  return { original: base, display: base, multiplied: false };
}

export default function ElectricPackageCard({
  plan,
  colorScheme,
  state,
  discount,
  onSelect,
  showBestValue = false,
  ribbon = null,
}: ElectricPackageCardProps) {
  const icon = getPackageIcon(plan.id);
  const entries = readEntries(plan);
  const interactive = !state.locked && !state.isCurrent;
  const gradientText = colorScheme.textGradientStyle;
  const accent = colorScheme.accentHex;
  const isPremium = !!gradientText; // VIP (electric-black) — the only electric scheme with a gradient text

  /** Big number: VIP keeps its gold gradient; others are white with a tier-colored glow. */
  const bigNumberStyle: React.CSSProperties = gradientText
    ? { ...(gradientText as React.CSSProperties), filter: `drop-shadow(0 0 4px ${accent}) drop-shadow(0 0 9px ${accent}80)` }
    : { color: "#FFFFFF", textShadow: `0 0 18px ${accent}, 0 0 36px ${accent}80` };

  return (
    <div
      className={cn(
        "relative w-full rounded-3xl overflow-visible",
        "transition-[transform,box-shadow] duration-[var(--ta-transition-dur)]",
        interactive && "hover:scale-[1.02]"
      )}
      style={{
        boxShadow: isPremium
          ? `0 0 0 1px #FFFCEB, 0 0 0 3px ${accent}, 0 0 14px ${accent}B3, 0 10px 30px rgba(0,0,0,0.6)`
          : `0 0 0 1px ${accent}40, 0 0 30px ${accent}66, 0 0 70px ${accent}33, 0 14px 44px rgba(0,0,0,0.55)`,
      }}
    >
      {/* Best Value (top-left) — takes precedence over the ribbon */}
      {showBestValue ? (
        <BestValueBadge position="top-left" size="medium" badgeStyle={colorScheme.badgeStyle} colorScheme={colorScheme} />
      ) : ribbon ? (
        <CornerRibbonBadge position="top-left" size="medium" badgeStyle={colorScheme.badgeStyle} colorScheme={colorScheme}>
          {ribbon}
        </CornerRibbonBadge>
      ) : null}

      {/* Promo multiplier lightning badge (top-right) — only when a multiplier is active */}
      {entries.multiplied && typeof plan.metadata?.promoMultiplier === "number" && (
        <div className="absolute -top-7 -right-6 z-30 pointer-events-none">
          <Image
            src={`/images/badge/X${plan.metadata.promoMultiplier}.webp`}
            alt={`${plan.metadata.promoMultiplier}x entries`}
            width={96}
            height={96}
            className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
            sizes="(max-width: 640px) 80px, 96px"
          />
        </div>
      )}

      {/* Dark body with tier-coloured electric glow (matches reference concept) */}
      <div
        className="relative isolate h-full rounded-3xl px-4 pb-4 pt-16 sm:pt-[68px]"
        style={{
          background: isPremium
            ? `radial-gradient(120% 80% at 50% 0%, ${accent}30 0%, transparent 55%), linear-gradient(180deg, #0b0a06 0%, #050402 100%)`
            : `radial-gradient(120% 85% at 50% 0%, ${accent}33 0%, ${accent}12 32%, transparent 62%), linear-gradient(180deg, #0b0c0f 0%, #060607 100%)`,
          border: isPremium ? `1px solid ${accent}` : `2px solid ${accent}59`,
          boxShadow: isPremium ? `inset 0 0 20px ${accent}2B` : `inset 0 0 26px ${accent}1F`,
        }}
      >
        {/* Static electric inner sheen */}
        <div
          className="pointer-events-none absolute inset-0.5 rounded-[22px] z-0"
          style={{
            background: isPremium
              ? `linear-gradient(180deg, ${accent}33 0%, transparent 12%), radial-gradient(120% 70% at 50% 0%, ${accent}1A 0%, transparent 52%)`
              : `radial-gradient(135% 90% at 50% 0%, ${accent}26 0%, ${accent}0D 30%, transparent 60%)`,
          }}
          aria-hidden
        />

        {/* Icon — raised so it clears the package name */}
        {icon && (
          <div className="absolute -top-12 sm:-top-14 left-1/2 -translate-x-1/2 z-20">
            <div className="w-20 h-20 sm:w-24 sm:h-24 relative">
              <Image
                src={icon}
                alt={`${getPackageDisplayName(plan)} icon`}
                fill
                sizes="(max-width: 640px) 80px, 96px"
                className={cn("object-contain", colorScheme.glow)}
              />
            </div>
          </div>
        )}

        <div className="relative z-10 flex h-full flex-col uppercase">
          {/* Title — tier colour (VIP keeps gold gradient) */}
          <h3
            className="text-center font-sans font-extrabold text-[20px] sm:text-[26px] leading-tight tracking-wide"
            style={
              gradientText
                ? { ...(gradientText as React.CSSProperties), ...(isPremium ? { filter: `drop-shadow(0 0 4px ${accent}) drop-shadow(0 0 9px ${accent}80)` } : {}) }
                : { color: accent, textShadow: `0 0 14px ${accent}80` }
            }
          >
            {getPackageDisplayName(plan)}
          </h3>

          {/* Entries */}
          <div className="mt-2 text-center">
            {entries.multiplied ? (
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-[22px] sm:text-[26px] font-bold line-through text-white/35">
                  {entries.original}
                </span>
                <span className="text-[20px] sm:text-[24px] font-bold" style={{ color: accent }}>→</span>
                <span className="text-[44px] sm:text-[58px] font-extrabold leading-none" style={bigNumberStyle}>
                  {entries.display}
                </span>
              </div>
            ) : (
              <span className="text-[44px] sm:text-[58px] font-extrabold leading-none" style={bigNumberStyle}>
                {entries.display}
              </span>
            )}
            <div className="mt-1 text-[12px] sm:text-[13px] font-semibold tracking-[0.18em] text-white/65">
              FREE ENTRIES
            </div>
          </div>

          <div className="my-3 h-px w-full rounded-full" style={{ backgroundColor: `${accent}59` }} />

          {/* Price block — full-width dark panel; struck price upper-right of price,
              "one time payment" full-width at the bottom, SAVE shield absolute. */}
          <button
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onSelect(plan)}
            aria-label={`Select ${getPackageDisplayName(plan)} for $${plan.price}`}
            className={cn(
              "relative mb-3 w-full overflow-visible rounded-2xl px-4 pb-2 pt-3",
              interactive ? "cursor-pointer hover:brightness-110" : "cursor-not-allowed opacity-90"
            )}
            style={{ backgroundColor: "#0b0b0d", border: `1px solid ${accent}59`, boxShadow: `0 0 16px ${accent}26` }}
          >
            <div className="flex items-start justify-center">
              <span className="relative inline-block text-[30px] font-extrabold leading-none" style={{ color: accent }}>
                ${plan.price}
                {discount && (
                  <span className="absolute left-full top-0 ml-1.5 -translate-y-[3px] whitespace-nowrap text-[13px] font-bold leading-none text-white/40 line-through">
                    ${discount.regularPrice}
                  </span>
                )}
              </span>
            </div>

            <div className="mt-1.5 w-full text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
              {plan.period === "one-time" ? "One Time Payment" : "Per Giveaway"}
            </div>

            {discount && (
              <span
                className="absolute right-0 top-1/2 z-20 inline-flex -translate-y-1/2 translate-x-[28%] flex-col items-center justify-start text-black"
                style={{
                  backgroundColor: accent,
                  width: 56,
                  height: 64,
                  clipPath: "polygon(0% 0%, 100% 0%, 100% 64%, 50% 100%, 0% 64%)",
                  boxShadow: `0 0 18px ${accent}A6`,
                }}
                aria-label={`Save ${discount.percentOff} percent off`}
              >
                <span className="mt-[7px] text-[8px] font-extrabold uppercase leading-none tracking-wide">Save</span>
                <span className="mt-[2px] text-[19px] font-black leading-none">{discount.percentOff}%</span>
                <span className="mt-[1px] text-[9px] font-extrabold uppercase leading-none tracking-wide">Off</span>
              </span>
            )}
          </button>

          {/* CTA — black background, tier-coloured text */}
          <div className="mt-auto">
            <button
              type="button"
              disabled={!interactive}
              onClick={() => interactive && onSelect(plan)}
              className={cn(
                "flex h-[50px] w-full items-center justify-center rounded-2xl px-5 font-sans font-black uppercase tracking-wide text-[16px]",
                interactive ? "hover:brightness-125" : "opacity-50 cursor-not-allowed"
              )}
              style={{
                backgroundColor: "#000000",
                border: `1.5px solid ${accent}`,
                color: accent,
                boxShadow: `0 0 18px ${accent}40, inset 0 0 12px ${accent}1F`,
              }}
            >
              {state.isCurrent ? "Current Plan" : state.locked ? state.lockReason ?? "Locked" : "Enter Now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
