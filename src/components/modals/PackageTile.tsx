"use client";

/**
 * PackageTile — the single package card used by BOTH package modals.
 *
 * Replaces the old dark slate rows in `PackageSelectionModal/PlanCard` and
 * `SpecialPackagesModal/PackagesGrid`, which were visually unrelated to the tier cards on
 * /membership. Structure is three engraved bands over a glossy tier-coloured fill:
 *
 *   band 1  icon + name
 *   band 2  hero entries number | rule | partner-discount-access ring
 *   band 3  price + CTA, with the ribbon and discount tag riding the CTA's top edge
 *
 * Bands butt directly against each other — the separation is an engraved seam
 * (`border-top` + an inset highlight), never padding.
 *
 * Every colour derives from ONE hex, the tier accent: see `glossFill` / `needsDarkInk` /
 * `shadeHex` in packageColorScheme.ts. Lime and amber tiers cross the ink threshold and
 * flip to black text, which is why nothing here hardcodes white.
 *
 * Two densities: `compact` is the mobile 2-up (~176px), comfortable is desktop (≥300px).
 */

import React from "react";
import Image from "next/image";
import { Check, Tag } from "lucide-react";
import { getPackageIcon, getPackageIconWrapperScaleClass } from "@/utils/images/package-icons";
import { glossFill, needsDarkInk } from "@/utils/package-colors/packageColorScheme";
import { cn } from "@/utils/cn";

export type PackageTileRibbon = "best-value" | "popular" | "recommended";

export interface PackageTileProps {
  planId: string;
  name: string;
  /** Tier accent — drives the fill, ink, seams and ring. */
  accentHex: string;
  /** Entries granted. Already multiplied when a promo is live. */
  entries: number;
  /** Pre-promo entries, shown struck. Omit when no promo is active. */
  wasEntries?: number | null;
  promoActive?: boolean;
  /** Active promo multiplier, shown as a chip beside the entries. Omit when there is none. */
  multiplier?: number | null;
  /** Partner-catalogue access percent (0–100). */
  accessPct: number;
  /** Caption under the ring, e.g. "partner discount access" / "4-day discount access". */
  accessCaption: string;
  price: number;
  /** e.g. "One Time" or "Per Giveaway" (modals) / "per month · cancel anytime" (sections). */
  periodLabel: string;
  /** Pre-discount price, shown struck. */
  struckPrice?: number | null;
  discountPercent?: number | null;
  ribbon?: PackageTileRibbon | null;
  isSelected: boolean;
  isCurrent: boolean;
  /**
   * Overrides the CTA's label. The default three-way ("Select" / "Selected" / "Current
   * plan") is the modals' pick-one-of-many grammar; a tile shown ALONE as a route to buy
   * ("Get Foreman") is making a different offer, and "Select" there reads as a step in a
   * chooser that is not on screen. Selection styling is unaffected.
   */
  ctaLabel?: string;
  compact?: boolean;
  /**
   * Full-width single-column tile: puts the stats and footer bands SIDE BY SIDE instead of
   * stacked, roughly halving the tile's height. Stacking three of these vertically ran past
   * the modal's scroll height; side-by-side lets all three tiers sit on screen at once,
   * which is the whole point of showing them together.
   */
  wide?: boolean;
  onSelect: () => void;
}

export default function PackageTile({
  planId,
  name,
  accentHex,
  entries,
  wasEntries,
  promoActive = false,
  multiplier,
  accessPct,
  accessCaption,
  price,
  periodLabel,
  struckPrice,
  discountPercent,
  ribbon,
  isSelected,
  isCurrent,
  ctaLabel,
  compact = false,
  wide = false,
  onSelect,
}: PackageTileProps) {
  const dark = needsDarkInk(accentHex);
  const ink = dark ? "#1c1403" : "#ffffff";
  const seam = dark ? "rgba(28,20,3,.2)" : "rgba(255,255,255,.2)";
  const seamHi = dark ? "rgba(255,255,255,.4)" : "rgba(255,255,255,.16)";
  const tint = dark ? "rgba(0,0,0,.07)" : "rgba(0,0,0,.12)";

  // A locked tile must never wear the selected treatment, or the modal dresses the plan
  // the user already owns as their active choice.
  const selected = isSelected && !isCurrent;
  const icon = getPackageIcon(planId);

  const bandPad = compact ? "10px 11px" : "14px 17px";
  const seamStyle: React.CSSProperties = {
    background: tint,
    borderTop: `1px solid ${seam}`,
    boxShadow: `inset 0 1px 0 ${seamHi}`,
  };

  // The discount tag always shows when there IS a discount.
  //
  // The handoff had an "overlay budget" — on a compact tile, render the tag only when there
  // is no ribbon, so two pills never crowd a ~152px button. That suppressed the 50% on
  // exactly the packs where it matters most (Power and VIP carry BEST VALUE), leaving the
  // saving to the struck price alone. A discount is a reason to buy; a ribbon is a label.
  // The ribbon sits left and the tag right, so they do not overlap — they are only tight.
  const showDiscountTag = discountPercent != null;

  return (
    <div
      role="button"
      tabIndex={isCurrent ? -1 : 0}
      aria-pressed={selected}
      aria-disabled={isCurrent || undefined}
      onClick={() => !isCurrent && onSelect()}
      onKeyDown={(e) => {
        if (isCurrent) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative isolate flex h-full flex-col overflow-hidden transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] focus-visible:outline-none",
        compact ? "rounded-[15px]" : "rounded-[19px]",
        isCurrent ? "cursor-not-allowed opacity-[0.62]" : "cursor-pointer hover:-translate-y-1"
      )}
      style={{
        background: glossFill(accentHex),
        color: ink,
        border: "1px solid rgba(255,255,255,.22)",
        boxShadow: selected
          ? `0 0 0 2px ${dark ? "#1c1403" : "#ffffff"}, 0 0 0 5px ${accentHex}, 0 20px 44px -22px rgba(15,23,42,.55)`
          : `inset 0 1px 0 rgba(255,255,255,.4), 0 0 0 1px ${accentHex}, 0 14px 34px -18px ${accentHex}, 0 20px 46px -30px rgba(15,23,42,.5)`,
      }}
    >
      {/* Gloss overlays — top sheen and bottom weight, under all band content */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,.22), transparent 24%)" }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
        style={{ background: "linear-gradient(180deg, transparent 56%, rgba(0,0,0,.14))" }}
      />

      {/* ---- Band 1: identity ---- */}
      <div
        className="relative z-[1] flex items-center"
        style={{ gap: compact ? 8 : 11, padding: bandPad }}
      >
        <span
          className="grid flex-none place-items-center"
          style={{
            width: compact ? 26 : 33,
            height: compact ? 26 : 33,
            borderRadius: compact ? 8 : 10,
            background: dark
              ? "linear-gradient(160deg, rgba(28,20,3,.16), rgba(28,20,3,.04))"
              : "linear-gradient(160deg, rgba(255,255,255,.3), rgba(255,255,255,.08))",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,.45), inset 0 -1px 2px rgba(0,0,0,.16), 0 2px 6px -2px rgba(0,0,0,.32)",
          }}
        >
          {icon && (
            <Image
              src={icon}
              alt=""
              width={compact ? 18 : 23}
              height={compact ? 18 : 23}
              // Per-tier optical correction — Boss and VIP artwork carries more internal
              // padding, so at an equal box they read smaller than the other tiers.
              className={cn("object-contain", getPackageIconWrapperScaleClass(planId, "modal"))}
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.3))" }}
            />
          )}
        </span>
        <span
          className="min-w-0 truncate font-poppins font-black uppercase leading-none"
          style={{ fontSize: compact ? 11 : 14, letterSpacing: "0.11em" }}
        >
          {name}
        </span>

        {/* On a wide tile the price rides the identity band's right edge instead of sitting
            above the CTA. That frees the footer column for the button alone — the ribbon
            and discount tag overlay its top edge, and with the price there too the three
            were fighting for the same ~190px. */}
        {wide && (
          <span className="ml-auto flex shrink-0 flex-col items-end pl-2">
            <span className="flex items-baseline gap-1.5">
              {struckPrice != null && (
                <span
                  className="font-sans font-bold leading-none line-through opacity-50"
                  style={{ fontSize: compact ? 10.5 : 12, textDecorationThickness: 1.5 }}
                >
                  ${struckPrice}
                </span>
              )}
              <span
                className="font-poppins font-black leading-none tabular-nums"
                style={{ fontSize: compact ? 17 : 22 }}
              >
                ${price}
              </span>
            </span>
            {/* The period qualifies the price, so it travels with it — leaving it behind in
                the footer split one statement across two bands. */}
            <span
              className="whitespace-nowrap font-sans font-semibold opacity-[0.72]"
              style={{ fontSize: compact ? 9.5 : 11, lineHeight: 1.2, marginTop: 2 }}
            >
              {periodLabel}
            </span>
          </span>
        )}
      </div>

      {/* Bands 2+3 sit side by side on a wide tile, stacked otherwise. `display: contents`
          means the non-wide path renders exactly as before — no wrapper in the box model. */}
      <div className={wide ? "relative z-[1] flex flex-1 items-stretch" : "contents"}>
      {/* ---- Band 2: stats ---- */}
      <div
        className={cn("relative z-[1] grid items-center", wide && "flex-1")}
        style={{
          // The third column is a FIXED px width. An `auto` column gets squeezed by the
          // 1fr and the caption collapses onto three lines.
          gridTemplateColumns: compact ? "1fr 1px 62px" : "1fr 1px 96px",
          gap: compact ? 9 : 14,
          padding: bandPad,
          ...seamStyle,
        }}
      >
        <div className="flex min-w-0 flex-col">
          {/* Stacked, not a baseline row. The handoff had `was` beside the hero number with
              flex-wrap, which meant its position depended on the tile width — inline on a
              wide tile, wrapped above on a narrow one. Fixing it above the number keeps the
              before/after reading identical in every density. */}
          <div className="flex flex-col items-start">
            {/* `was N` and the multiplier chip share ONE row. Stacking the chip on its own
                line added a third row to the column, which fights the whole point of the
                wide tile — the chip explains the struck value sitting right next to it. */}
            {promoActive && (
              <span
                className="flex items-center gap-1.5"
                style={{ marginBottom: compact ? 3 : 4 }}
              >
                {wasEntries != null && wasEntries !== entries && (
                  <span
                    className="font-sans font-extrabold leading-none line-through opacity-[0.58]"
                    style={{ fontSize: compact ? 10.5 : 13, textDecorationThickness: 2 }}
                  >
                    was {wasEntries}
                  </span>
                )}
                {/* WIDE TILES ONLY. On the compact 2-up one-time grid this repeated a small
                    starburst on all six packs at once — six copies of one fact, each too
                    small to read. The tab badge already states the promo for that grid. The
                    three membership tiles have the width to carry it at a legible size. */}
                {wide && multiplier != null && multiplier > 1 && (
                  <Image
                    src={`/images/badge/X${multiplier}.webp`}
                    alt={`${multiplier}x entries`}
                    width={56}
                    height={56}
                    className="shrink-0 object-contain"
                    style={{
                      width: compact ? 46 : 56,
                      height: compact ? 46 : 56,
                      // Vertical negative margins only. Horizontal ones pulled the starburst
                      // over the entries number beside it.
                      margin: compact ? "-12px 0 -12px 2px" : "-14px 0 -14px 4px",
                      filter: "drop-shadow(0 3px 10px rgba(0,0,0,.55))",
                    }}
                  />
                )}
              </span>
            )}
            <span
              className="font-poppins font-black tabular-nums"
              style={{
                fontSize: compact ? 21 : 36,
                lineHeight: 0.9,
                letterSpacing: "-0.03em",
                textShadow: promoActive
                  ? "0 0 22px rgba(255,216,77,.55), 0 2px 12px rgba(0,0,0,.2)"
                  : dark
                    ? "0 2px 10px rgba(255,255,255,.25)"
                    : "0 2px 12px rgba(0,0,0,.16)",
                // Same pop as the ribbon, run 3× — the boosted figure is the single thing on
                // this tile the promo changed, so it earns more insistence than the flag.
                // Gated on promoActive: with no promo there is nothing to draw the eye to,
                // and a number that pulses for no reason just reads as a glitch.
                // Reduced-motion is neutralised globally (globals.css sets
                // animation-duration: 1ms on every element), same as the ribbon.
                ...(promoActive
                  ? { animation: "ta-ribbon-pop 1.5s ease-in-out 3" }
                  : {}),
              }}
            >
              {entries}
            </span>
          </div>
          <span
            className="font-sans font-extrabold uppercase"
            style={{
              fontSize: compact ? 10 : 10.5,
              lineHeight: 1.2,
              letterSpacing: compact ? "0.04em" : "0.07em",
              marginTop: compact ? 6 : 8,
            }}
          >
            free entries
          </span>
          {!compact && (
            <span
              className="font-sans font-semibold opacity-[0.72]"
              style={{ fontSize: 10.5, lineHeight: 1.3, marginTop: 3 }}
            >
              Major Giveaway
            </span>
          )}
        </div>

        <span aria-hidden className="self-stretch" style={{ background: seam }} />

        <AccessRing pct={accessPct} caption={accessCaption} compact={compact} dark={dark} />
      </div>

      {/* ---- Band 3: footer ---- */}
      <div
        className={cn("relative z-[1] flex flex-col justify-center", !wide && "mt-auto")}
        style={{
          gap: wide ? 8 : compact ? 16 : 18,
          padding: bandPad,
          ...seamStyle,
          // On a wide tile the seam runs down the left edge, not across the top.
          ...(wide
            ? { borderTop: "none", borderLeft: `1px solid ${seam}`, boxShadow: `inset 1px 0 0 ${seamHi}`, width: compact ? 148 : 190, flex: "none" }
            : {}),
        }}
      >
        {/* Price + period live in the identity band on a wide tile — see band 1 — leaving
            this column to the CTA and its ribbon/discount overlays alone. */}
        {!wide && (
          <div className="flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-0.5">
            <span
              className="font-poppins font-black leading-none tabular-nums"
              style={{ fontSize: compact ? 19 : 25 }}
            >
              ${price}
            </span>
            {struckPrice != null && (
              <span
                className="font-sans font-bold leading-none line-through opacity-50"
                style={{ fontSize: compact ? 10.5 : 12, textDecorationThickness: 1.5 }}
              >
                ${struckPrice}
              </span>
            )}
            <span
              className="font-sans font-semibold opacity-[0.72]"
              style={{ fontSize: compact ? 10.5 : 11.5, lineHeight: 1.25 }}
            >
              {periodLabel}
            </span>
          </div>
        )}

        <div className="relative flex w-full">
          {/* Ribbon rides the CTA's top edge, upper LEFT. A current plan shows none — the
              CTA already reads "Current plan", and a CURRENT tag says it twice. */}
          {ribbon && !isCurrent && (
            <span
              className="absolute z-[3] whitespace-nowrap font-sans font-black uppercase"
              style={{
                // Inline, not a Tailwind arbitrary class. `animate-[…cubic-bezier(.22,1,.36,1)]`
                // depends on the JIT emitting a value containing commas and parens; inline it
                // always applies. globals.css's prefers-reduced-motion block still neutralises
                // it (animation-duration: 1ms on every element), so the a11y gate is intact.
                animation: "ta-ribbon-pop 1.5s ease-in-out",
                top: compact ? -6 : -8,
                left: compact ? 6 : 10,
                fontSize: compact ? 7 : 7.5,
                lineHeight: 1,
                letterSpacing: compact ? "0.04em" : "0.1em",
                padding: compact ? "2.5px 5px" : "3.5px 8px",
                borderRadius: 999,
                border: compact ? "1px solid" : "1.5px solid",
                boxShadow: "0 5px 12px -6px rgba(0,0,0,.7)",
                ...(ribbon === "best-value"
                  ? {
                      background: "linear-gradient(180deg,#f6dd8c,#d4af37 60%,#a87f1d)",
                      color: "#221a02",
                      borderColor: "rgba(255,240,190,.7)",
                    }
                  : { background: "#ffffff", color: "#0b0b0d", borderColor: "rgba(11,11,13,.25)" }),
              }}
            >
              {ribbon === "best-value" ? "Best value" : ribbon === "recommended" ? "Recommended" : "Popular"}
            </span>
          )}

          {showDiscountTag && (
            <span
              className="absolute z-[3] inline-flex items-center whitespace-nowrap font-sans font-black"
              style={{
                top: compact ? -6 : -8,
                right: compact ? 6 : 10,
                gap: compact ? 2.5 : 3.5,
                fontSize: compact ? 7 : 9.5,
                lineHeight: 1,
                letterSpacing: "0.03em",
                padding: compact ? "2.5px 5px" : "3.5px 8px",
                borderRadius: 999,
                background: "#ffffff",
                color: "#0b0b0d",
                border: compact ? "1px solid rgba(11,11,13,.25)" : "1.5px solid rgba(11,11,13,.25)",
                boxShadow: "0 6px 14px -6px rgba(0,0,0,.7)",
              }}
            >
              <Tag size={compact ? 8.5 : 11} strokeWidth={2.1} />
              {discountPercent}%
            </span>
          )}

          {/* 44px at every breakpoint — this is the mobile tap target. */}
          <button
            type="button"
            tabIndex={-1}
            disabled={isCurrent}
            onClick={(e) => {
              e.stopPropagation();
              if (!isCurrent) onSelect();
            }}
            className="flex h-11 w-full items-center justify-center gap-[7px] font-poppins font-black transition-[filter] duration-200 group-hover:brightness-[1.16]"
            style={{
              borderRadius: compact ? 12 : 13,
              border: "none",
              fontSize: compact ? 12.5 : 13.5,
              lineHeight: 1,
              letterSpacing: "0.02em",
              cursor: isCurrent ? "not-allowed" : "pointer",
              ...(selected
                ? {
                    background: "#ffffff",
                    color: "#0b0b0d",
                    boxShadow:
                      "0 10px 24px -12px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.6)",
                  }
                : {
                    background: "linear-gradient(180deg,#18181e,#0b0b0d)",
                    color: "#ffffff",
                    boxShadow:
                      "0 10px 24px -12px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.14), inset 0 -1px 0 rgba(0,0,0,.5)",
                  }),
            }}
          >
            {selected && <Check size={14} strokeWidth={3} />}
            {isCurrent ? "Current plan" : selected ? "Selected" : (ctaLabel ?? "Select")}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

/** Catalogue-access dial. 100% gets the gold "full access" treatment. */
function AccessRing({
  pct,
  caption,
  compact,
  dark,
}: {
  pct: number;
  caption: string;
  compact: boolean;
  dark: boolean;
}) {
  const size = compact ? 44 : 58;
  const stroke = compact ? 5 : 6.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dashoffset = circumference * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const full = pct >= 100;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        {/* Dial face behind the ring */}
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: size * 0.76,
            height: size * 0.76,
            background:
              "radial-gradient(circle at 50% 34%, rgba(255,255,255,.16), rgba(0,0,0,.12))",
            boxShadow: full
              ? "inset 0 1px 2px rgba(0,0,0,.28), inset 0 -1px 1px rgba(255,255,255,.16), 0 0 26px -2px rgba(255,214,120,.9)"
              : "inset 0 1px 2px rgba(0,0,0,.28), inset 0 -1px 1px rgba(255,255,255,.16)",
          }}
        />
        <svg
          width={size}
          height={size}
          className="absolute"
          style={{
            filter: full
              ? "drop-shadow(0 0 7px rgba(255,250,228,.95)) drop-shadow(0 0 16px rgba(255,208,116,.9))"
              : `drop-shadow(0 0 5px ${dark ? "rgba(28,20,3,.32)" : "rgba(255,255,255,.5)"})`,
          }}
          aria-hidden
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={full ? "#ffffff" : "currentColor"}
            strokeOpacity={full ? 0.3 : 0.22}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={full ? "#fff4d2" : "currentColor"}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <span
          className="relative font-poppins font-black leading-none tabular-nums"
          style={{ fontSize: compact ? 12 : 16 }}
        >
          {pct}%
        </span>
      </div>
      <span
        className="text-center font-sans font-bold uppercase opacity-80"
        style={{
          fontSize: compact ? 7.5 : 9.5,
          lineHeight: 1.25,
          letterSpacing: compact ? "0.01em" : "0.05em",
          maxWidth: compact ? 80 : 96,
        }}
      >
        {caption}
      </span>
    </div>
  );
}
