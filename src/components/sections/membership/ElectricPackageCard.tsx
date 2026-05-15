"use client";

import React from "react";
import Image from "next/image";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import { getPackageIcon } from "@/utils/images/package-icons";
import type { PackageColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getCardBorderStyle } from "@/utils/package-colors/packageColorScheme";
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

  return (
    <div
      className={cn(
        "relative w-full rounded-3xl overflow-visible",
        "transition-[transform,box-shadow] duration-[var(--ta-transition-dur)]",
        interactive && "hover:scale-[1.02] hover:brightness-110"
      )}
      style={{ boxShadow: `0 0 0 1px ${colorScheme.accentHex}40, 0 0 28px ${colorScheme.accentHex}59, 0 0 64px ${colorScheme.accentHex}33, 0 12px 40px ${colorScheme.accentHex}26` }}
    >
      {/* Best Value (top-left) — takes precedence over the ribbon */}
      {showBestValue ? (
        <BestValueBadge position="top-left" size="medium" badgeStyle={colorScheme.badgeStyle} colorScheme={colorScheme} />
      ) : ribbon ? (
        <CornerRibbonBadge position="top-left" size="medium" badgeStyle={colorScheme.badgeStyle} colorScheme={colorScheme}>
          {ribbon}
        </CornerRibbonBadge>
      ) : null}

      {/* Entries / promo multiplier lightning badge (top-right) — only when a multiplier is active */}
      {entries.multiplied && typeof plan.metadata?.promoMultiplier === "number" && (
        <div className="absolute -top-7 -right-6 z-30 pointer-events-none">
          <Image
            src={`/images/badge/X${plan.metadata.promoMultiplier}.webp`}
            alt={`${plan.metadata.promoMultiplier}x entries`}
            width={96}
            height={96}
            className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
            sizes="(max-width: 640px) 80px, 96px"
          />
        </div>
      )}

      {/* Brand gradient body + electric edge */}
      <div
        className="relative isolate h-full rounded-3xl p-4 pt-10"
        style={{
          background: colorScheme.bgGradient,
          backgroundOrigin: "border-box",
          ...getCardBorderStyle(colorScheme, colorScheme.bgGradient),
        }}
      >
        {/* Static electric inner sheen */}
        <div
          className="pointer-events-none absolute inset-0.5 rounded-2xl z-0"
          style={{
            background: `radial-gradient(130% 90% at 50% 0%, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.05) 35%, transparent 60%), linear-gradient(to top, ${colorScheme.accentHex}33 0%, ${colorScheme.accentHex}14 30%, transparent 65%)`,
          }}
          aria-hidden
        />

        {/* Icon */}
        {icon && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-20">
            <div className="w-20 h-20 sm:w-24 sm:h-24 relative">
              <Image
                src={icon}
                alt={`${getPackageDisplayName(plan)} icon`}
                fill
                sizes="(max-width: 640px) 80px, 96px"
                className={cn("object-contain opacity-90", colorScheme.glow)}
              />
            </div>
          </div>
        )}

        <div className="relative z-10 flex h-full flex-col uppercase">
          {/* Title */}
          <h3
            className={cn("text-center font-sans font-bold text-[20px] sm:text-[24px] leading-tight tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]", gradientText ? "" : colorScheme.text)}
            style={gradientText}
          >
            {getPackageDisplayName(plan)}
          </h3>

          {/* Entries */}
          <div className={cn("mt-1 text-center", gradientText ? "" : colorScheme.text)}>
            {entries.multiplied ? (
              <div className="flex items-center justify-center gap-1.5">
                <span className={cn("text-[22px] sm:text-[26px] font-bold line-through opacity-40", colorScheme.textMuted)}>
                  {entries.original}
                </span>
                <span className="text-[20px] sm:text-[24px] font-bold" style={gradientText ? { color: colorScheme.accentHex } : undefined}>→</span>
                <span className={cn("text-[40px] sm:text-[52px] font-bold", gradientText ? "" : colorScheme.entriesText)} style={gradientText}>
                  {entries.display}
                </span>
              </div>
            ) : (
              <span className={cn("text-[40px] sm:text-[52px] font-bold", gradientText ? "" : colorScheme.entriesText)} style={gradientText}>
                {entries.display}
              </span>
            )}
            <div className={cn("text-[15px] sm:text-[17px] tracking-wide font-semibold", gradientText ? "" : colorScheme.textMuted)} style={gradientText}>
              free entries
            </div>
          </div>

          <div className="my-2 h-px w-full rounded-full bg-white/70 dark:bg-neutral-600/50" />

          {/* Price block — strikethrough + now + % OFF badge live HERE (never top-right) */}
          <button
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onSelect(plan)}
            aria-label={`Select ${getPackageDisplayName(plan)} for $${plan.price}`}
            className={cn(
              "mx-auto mb-3 flex w-fit items-center gap-2 rounded-2xl bg-gradient-to-r px-3 py-1.5",
              colorScheme.gradient,
              colorScheme.buttonShadow,
              interactive ? "cursor-pointer hover:opacity-90" : "cursor-not-allowed opacity-90",
              "ring-1 ring-white/25 shadow-[0_4px_18px_rgba(0,0,0,0.35)]"
            )}
          >
            {discount && (
              <span className={cn("text-sm font-bold line-through opacity-50", colorScheme.buttonText)}>
                ${discount.regularPrice}
              </span>
            )}
            <span className={cn("text-[20px] font-bold", colorScheme.buttonText)}>${plan.price}</span>
            <span className={cn("text-[11px] font-semibold opacity-90", colorScheme.buttonText)}>
              {plan.period === "one-time" ? "one time" : "per giveaway"}
            </span>
            {discount && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[11px] font-black"
                style={{ ...colorScheme.badgeStyle }}
              >
                {discount.percentOff}% OFF
              </span>
            )}
          </button>

          {/* CTA */}
          <div className="mt-auto">
            <button
              type="button"
              disabled={!interactive}
              onClick={() => interactive && onSelect(plan)}
              className={cn(
                "flex h-[48px] w-full items-center justify-center rounded-2xl px-5 font-sans font-black uppercase text-[15px]",
                colorScheme.buttonText,
                interactive ? "hover:brightness-110" : "opacity-60 cursor-not-allowed",
                "ring-1 ring-white/20 shadow-[0_6px_20px_rgba(0,0,0,0.4)]"
              )}
              style={(colorScheme.enterNowButtonStyle ?? colorScheme.badgeStyle) as React.CSSProperties}
            >
              <span style={gradientText ?? undefined}>
                {state.isCurrent ? "Current Plan" : state.locked ? state.lockReason ?? "Locked" : "Enter Now"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
