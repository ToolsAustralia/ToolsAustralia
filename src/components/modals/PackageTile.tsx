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
  /**
   * Overrides the line under "free entries" naming WHICH draw they are for. Defaults to
   * "Major Giveaway" on a comfortable tile and nothing on a compact one; pass a value to
   * force it on a compact tile. See the render comment for when that is warranted.
   */
  entriesSubLabel?: string | null;
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
  entriesSubLabel,
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

  // Tighter on a wide tile: it is a horizontal row of three columns competing for width, and
  // every px of side padding is taken from the entries figure. The compact-wide case (the
  // six-pack Additional modal) is the tightest layout in the app and needs the most relief.
  const bandPad = wide ? (compact ? "8px 10px" : "12px 14px") : compact ? "10px 11px" : "14px 17px";
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

  /** The multiplier starburst renders (wide + live promo). Drives the entries row padding. */
  const badgeShown = Boolean(promoActive && wide && multiplier != null && multiplier > 1);

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

      {/* ---- Band 1: identity ----
          On a WIDE tile this is a SINGLE ROW: icon + name on the left, price + period on the
          right, nothing stacked. Keeping the price here (rather than above the CTA) leaves the
          footer column to the button and its two overlay pills alone; keeping it on ONE line
          is what lets the band run slim — a stacked price forced the row to the height of two
          lines of type for a tile whose whole point is being short.
          The non-wide tile is unchanged: there the band tops a tall card and the price belongs
          with the CTA. */}
      <div
        className="relative z-[1] flex items-center"
        style={{
          gap: compact ? 8 : 11,
          padding: wide ? (compact ? "7px 11px" : "9px 17px") : bandPad,
        }}
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

        {/* One line, baseline-aligned: struck price, price, period. Stacking the period under
            the price is what made this band two lines tall, and the wide tile exists so three
            of them fit on screen at once — every row of type here costs a third of that. */}
        {wide && (
          <span className="ml-auto flex shrink-0 items-baseline gap-1.5 pl-2 whitespace-nowrap">
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
              style={{ fontSize: compact ? 16 : 20 }}
            >
              ${price}
            </span>
            <span
              className="font-sans font-semibold leading-none opacity-[0.72]"
              style={{ fontSize: compact ? 9.5 : 10.5 }}
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
          //
          // WIDER on `wide` (136 vs 96) because the dial lays out horizontally there — ring
          // beside its caption instead of above it. The extra 40px is bought from the entries
          // column, which can afford it now that the multiplier badge is absolute and no
          // longer competes for that row's width.
          gridTemplateColumns: wide
            ? compact
              ? "1fr 1px 82px"
              : "1fr 1px 124px"
            : compact
              ? "1fr 1px 62px"
              : "1fr 1px 96px",
          gap: compact ? 9 : 14,
          padding: bandPad,
          ...seamStyle,
        }}
      >
        <div className="relative flex min-w-0 flex-col">
          {/* The multiplier starburst is ABSOLUTE, pinned to this column's upper right.
              In flow it cost height twice over: it set the baseline row's height, and once the
              row ran out of width it WRAPPED to a second line and landed on "FREE ENTRIES" —
              which is how one tile in a set ended up 20px taller than its siblings. Out of
              flow it costs nothing, cannot wrap, and sits in the corner the eye already sweeps
              after reading the number. `pointer-events-none` so it never eats a tile click.
              WIDE ONLY — unchanged. On the compact 2-up one-time grid this repeated a small
              starburst across all six packs at once: six copies of one fact, each too small to
              read. That grid's tab badge already states the promo. Being free of height cost
              does not make it worth showing six times. */}
          {promoActive && wide && multiplier != null && multiplier > 1 && (
            <Image
              src={`/images/badge/X${multiplier}.webp`}
              alt={`${multiplier}x entries`}
              width={56}
              height={56}
              className="pointer-events-none absolute z-[2] object-contain"
              style={{
                width: wide ? (compact ? 28 : 34) : compact ? 40 : 56,
                height: wide ? (compact ? 28 : 34) : compact ? 40 : 56,
                // Nudged past the corner so the starburst's transparent margin does not read
                // as a gap. It overhangs the column, never the tile.
                top: wide ? -6 : -8,
                right: wide ? -4 : -6,
                filter: "drop-shadow(0 3px 10px rgba(0,0,0,.55))",
              }}
            />
          )}

          {/* ONE baseline row: the boosted figure, then `was N` AFTER it. Reading order matches
              the sentence a member says out loud — "150, was 15" — and putting `was` above the
              number cost a whole row on the tile whose purpose is fitting three of itself on
              screen at once. */}
          <div
            className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5"
            // Reserve the badge lane. Measured on the Boss tile: the row ran 141px inside a
            // 135px column, so the absolutely-positioned starburst landed 25px on top of the
            // struck value. Padding the row keeps text out of the corner the badge owns, and
            // the widths above (narrower ring column, smaller figure and struck value) buy
            // back enough room that it still fits on one line.
            style={badgeShown ? { paddingRight: compact ? 22 : 32 } : undefined}
          >
            <span
              className="font-poppins font-black tabular-nums"
              style={{
                // 30 on wide, not 36. Measured: "1000" + "was 100" + the starburst came to
                // 178px of content in a 177px column, so the row wrapped and that ONE tile grew
                // 20px taller than its siblings. The widest real value has to fit on one line.
                fontSize: wide ? (compact ? 18 : 29) : compact ? 21 : 36,
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

            {promoActive && wasEntries != null && wasEntries !== entries && (
              <span
                className="font-sans font-extrabold leading-none line-through opacity-[0.58]"
                style={{ fontSize: wide ? 11 : compact ? 10.5 : 13, textDecorationThickness: 2 }}
              >
                was {wasEntries}
              </span>
            )}

            {/* WIDE TILES ONLY. On the compact 2-up one-time grid this repeated a small
                starburst on all six packs at once — six copies of one fact, each too small to
                read. The tab badge already states the promo for that grid. */}
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
          {/* What the entries are FOR. Suppressed on a compact tile by default, because the
              package modals show six of them at once and the answer is already in the modal's
              own heading. A caller that renders a compact tile OUT of that context — the
              /discount unlock routes, where the surrounding words are all about partner
              offers — passes `entriesSubLabel` so "15 free entries" cannot be misread as
              entries into a discount. */}
          {(entriesSubLabel ?? (compact ? null : "Major Giveaway")) && (
            <span
              className="font-sans font-semibold opacity-[0.72]"
              style={{ fontSize: compact ? 9.5 : 10.5, lineHeight: 1.3, marginTop: 3 }}
            >
              {entriesSubLabel ?? "Major Giveaway"}
            </span>
          )}
        </div>

        <span aria-hidden className="self-stretch" style={{ background: seam }} />

        <AccessRing pct={accessPct} caption={accessCaption} compact={compact} dark={dark} wide={wide} />
      </div>

      {/* ---- Band 3: footer ---- */}
      <div
        className={cn("relative z-[1] flex flex-col justify-center", !wide && "mt-auto")}
        style={{
          // 14, not 8, on `wide`. The ribbon and discount tag are absolutely positioned at
          // `top: -8` on the BUTTON, so they hang above it — with an 8px gap they would touch
          // the price row that now sits there. This is the clearance those two pills need.
          gap: wide ? 14 : compact ? 16 : 18,
          padding: bandPad,
          ...seamStyle,
          // On a wide tile the seam runs down the left edge, not across the top.
          ...(wide
            ? { borderTop: "none", borderLeft: `1px solid ${seam}`, boxShadow: `inset 1px 0 0 ${seamHi}`, width: compact ? 106 : 152, flex: "none" }
            : {}),
        }}
      >
        {/* Price rides the identity band on a WIDE tile — see band 1. This column is left to
            the button and the two pills that overlay its top edge (ribbon upper-left, discount
            tag upper-right); a price row here would put three things in ~190px and add a line
            of height to the one variant that exists to be short. */}
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
                // Sized DOWN on a wide tile. "BEST VALUE" beside a discount tag has to fit
                // inside a ~106px button on the compact-wide grid, and every px the footer
                // column does not need goes to the entries figure, which was wrapping.
                top: wide ? -6 : compact ? -6 : -8,
                // NEGATIVE on wide: the two pills sit at opposite ends of a ~90-106px button
                // and were meeting in the middle. Overhanging the button into the band padding
                // buys ~20px of separation without shrinking either label. The tile clips at
                // its own border, which is further out still, so nothing is cut off.
                left: wide ? -6 : compact ? 6 : 10,
                fontSize: wide ? 6.5 : compact ? 7 : 7.5,
                lineHeight: 1,
                letterSpacing: wide ? "0.03em" : compact ? "0.04em" : "0.1em",
                padding: wide ? "2px 4px" : compact ? "2.5px 5px" : "3.5px 8px",
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
                top: wide ? -6 : compact ? -6 : -8,
                right: wide ? -6 : compact ? 6 : 10,
                gap: wide ? 2 : compact ? 2.5 : 3.5,
                fontSize: wide ? 6.5 : compact ? 7 : 9.5,
                lineHeight: 1,
                letterSpacing: "0.03em",
                padding: wide ? "2px 4px" : compact ? "2.5px 5px" : "3.5px 8px",
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
  wide = false,
}: {
  pct: number;
  caption: string;
  compact: boolean;
  dark: boolean;
  /** Squeeze the dial so three tiles fit on screen without scrolling. */
  wide?: boolean;
}) {
  // The wide tile is height-constrained, and this dial is the tallest thing in its stats band
  // (ring + a caption that wraps to two or three lines). Shrinking the ring and tightening the
  // caption's leading is the cheapest height available without dropping information.
  const size = wide ? (compact ? 40 : 48) : compact ? 44 : 58;
  const stroke = wide ? (compact ? 4.5 : 5.5) : compact ? 5 : 6.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dashoffset = circumference * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const full = pct >= 100;

  return (
    // HORIZONTAL on `wide`: dial on the left, caption to its right, both centred on the shared
    // middle line. Stacked, the caption wraps to two or three lines directly under the ring and
    // the pair becomes the tallest thing in the band — on a tile that exists to be short, that
    // is the wrong axis to spend on. Side by side it costs the height of the ring alone.
    <div
      className={cn("flex", wide ? "flex-row items-center justify-center" : "flex-col items-center")}
      style={{ gap: wide ? 8 : 6 }}
    >
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
          style={{ fontSize: wide ? (compact ? 11 : 14) : compact ? 12 : 16 }}
        >
          {pct}%
        </span>
      </div>
      <span
        className="text-center font-sans font-bold uppercase opacity-80"
        style={{
          fontSize: wide ? (compact ? 7 : 8.5) : compact ? 7.5 : 9.5,
          // 1.15 on wide: the caption still wraps ("2-day discount access" is three words), but
          // beside the ring rather than under it, so its lines no longer add to the tile height
          // — they fill space the ring already occupies.
          lineHeight: wide ? 1.15 : 1.25,
          letterSpacing: compact ? "0.01em" : "0.05em",
          // Deliberately NARROW so the caption wraps to three short lines ("2-DAY /
          // DISCOUNT / ACCESS") rather than two long ones. Beside the ring those lines are
          // free — they fill height the dial already occupies — and every px not spent here
          // goes to the entries figure, which is the column that was wrapping.
          maxWidth: wide ? (compact ? 42 : 64) : compact ? 80 : 96,
        }}
      >
        {caption}
      </span>
    </div>
  );
}
