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
  /**
   * WIDE ONLY. Puts the access dial FIRST (left) with the entries figure in the middle,
   * instead of entries-left / dial-right. Column WIDTHS are identical either way — only the
   * reading order changes — so every measured fit (entries on one line, the badge lane, the
   * caption at three lines) holds in both orders.
   */
  accessFirst?: boolean;
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
  accessFirst = false,
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
  /** Dial on the left, entries in the middle. Only meaningful on a wide tile. */
  const swapped = accessFirst && wide;

  /**
   * The SQUEEZED treatment — smaller figure, inline dial, shrunken pills, tighter padding.
   *
   * It exists to fit a phone, so it is gated on `compact` and NOT on `wide` alone. A desktop
   * has the room for the full-size tile, and a scroll is a better trade than shrinking type
   * nobody needed to shrink. Every size in this file keys off THIS, so the two treatments
   * cannot drift apart.
   */
  const tight = wide && compact;

  const bandPad = tight ? "8px 10px" : compact ? "10px 11px" : "14px 17px";
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
  //
  // EXCEPT on the tight treatment, where it is dropped. That is not a reversal of the above:
  // on a phone the wide tile already carries the struck price in its identity band ("$500
  // $250"), so the tag is the same fact a third time — and it lands beside the ribbon on a
  // ~86px button, where two pills leave neither readable. The saving is still stated; it is
  // just stated once.
  const showDiscountTag = discountPercent != null && !tight;


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
          padding: tight ? "7px 11px" : bandPad,
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
          // The FIXED column is the dial, the 1fr is the entries figure. `accessFirst` swaps
          // which side each occupies; the widths themselves do not change.
          gridTemplateColumns: swapped
            ? tight
              ? "82px 1px 1fr"
              : "96px 1px 1fr"
            : tight
              ? "1fr 1px 82px"
              : compact
                ? "1fr 1px 62px"
                : "1fr 1px 96px",
          gap: compact ? 9 : 14,
          padding: bandPad,
          ...seamStyle,
        }}
      >
        {/* Reordered with CSS `order`, not by duplicating the JSX — one source of truth for
            the column's contents, and the DOM order stays entries-then-dial so a screen reader
            reads the figure before the qualifier regardless of which way it is painted. */}
        <div
          className={cn("relative flex min-w-0 flex-col", swapped && "items-center text-center")}
          style={swapped ? { order: 3 } : undefined}
        >
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
                // 44 on a wide desktop tile, not 56: the badge reserves a lane in the entries
                // row, and at 56 that lane plus a 36px "1000" plus its struck value exceeded the
                // column and wrapped. Non-wide tiles keep the full 56.
                width: tight ? 36 : wide ? 44 : compact ? 40 : 56,
                height: tight ? 36 : wide ? 44 : compact ? 40 : 56,
                // Nudged past the corner so the starburst's transparent margin does not read
                // as a gap. It overhangs the column, never the tile.
                // Lifted clear of the row on the tight treatment so it reads as a sticker laid
                // over the tile rather than a character in the sentence. It is absolute, so the
                // extra size costs nothing in either axis — it overlaps the seam into the band
                // above instead of pushing anything.
                top: tight ? -24 : -8,
                right: tight ? -14 : -6,
                filter: "drop-shadow(0 3px 10px rgba(0,0,0,.55))",
              }}
            />
          )}

          {/* ONE baseline row: the boosted figure, then `was N` AFTER it. Reading order matches
              the sentence a member says out loud — "150, was 15" — and putting `was` above the
              number cost a whole row on the tile whose purpose is fitting three of itself on
              screen at once. */}
          <div
            className={cn(
              "flex min-w-0 flex-wrap items-baseline gap-y-0.5",
              // 4px at tight, and that last 2px is not cosmetic: at 360px the VIP row measured
              // 110px inside a 109px column. Anything wider here and the largest pack wraps
              // while the others do not, which is the exact inconsistency this sizing exists
              // to remove.
              tight ? "gap-x-1" : "gap-x-1.5",
              swapped && "justify-center"
            )}
            // Reserve the badge lane. Measured on the Boss tile: the row ran 141px inside a
            // 135px column, so the absolutely-positioned starburst landed 25px on top of the
            // struck value. Padding the row keeps text out of the corner the badge owns, and
            // the widths above (narrower ring column, smaller figure and struck value) buy
            // back enough room that it still fits on one line.
            // No reserved lane on tight any more: the badge now sits ABOVE the row rather than
            // beside it, so the figure gets the full column back.
            style={badgeShown && !tight ? { paddingRight: 30 } : undefined}
          >
            <span
              className="font-poppins font-black tabular-nums"
              style={{
                // 30 on wide, not 36. Measured: "1000" + "was 100" + the starburst came to
                // 178px of content in a 177px column, so the row wrapped and that ONE tile grew
                // 20px taller than its siblings. The widest real value has to fit on one line.
                // ONE size per density, and each is set by the LONGEST real value — the VIP
                // pack at "15000 was 1500" — not by a comfortable-looking default. A figure that
                // fits four digits and wraps at five makes one row in a set look broken, which
                // is worse than every row being a little smaller.
                //
                // The wide desktop figure is 28 rather than the 36 a stacked tile can carry:
                // with the struck value INLINE it has to share the row, and 36 only ever fitted
                // because "was N" used to sit above the number.
                fontSize: tight ? 14 : wide ? 28 : compact ? 21 : 36,
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
                style={{ fontSize: tight ? 10 : compact ? 10.5 : 12, textDecorationThickness: 2 }}
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

        <span aria-hidden className="self-stretch" style={{ background: seam, ...(swapped ? { order: 2 } : {}) }} />

        <div style={swapped ? { order: 1 } : undefined}>
          <AccessRing pct={accessPct} caption={accessCaption} compact={compact} wide={wide} tight={tight} />
        </div>
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
            ? { borderTop: "none", borderLeft: `1px solid ${seam}`, boxShadow: `inset 1px 0 0 ${seamHi}`, width: tight ? 86 : 190, flex: "none" }
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
                top: compact ? -6 : -8,
                // NEGATIVE on wide: the two pills sit at opposite ends of a ~90-106px button
                // and were meeting in the middle. Overhanging the button into the band padding
                // buys ~20px of separation without shrinking either label. The tile clips at
                // its own border, which is further out still, so nothing is cut off.
                left: tight ? -6 : compact ? 6 : 10,
                fontSize: tight ? 6.5 : compact ? 7 : 7.5,
                lineHeight: 1,
                letterSpacing: tight ? "0.03em" : compact ? "0.04em" : "0.1em",
                padding: tight ? "2px 4px" : compact ? "2.5px 5px" : "3.5px 8px",
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
                right: tight ? -6 : compact ? 6 : 10,
                gap: tight ? 2 : compact ? 2.5 : 3.5,
                fontSize: tight ? 6.5 : compact ? 7 : 9.5,
                lineHeight: 1,
                letterSpacing: "0.03em",
                padding: tight ? "2px 4px" : compact ? "2.5px 5px" : "3.5px 8px",
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
            title={selected && tight ? "Selected" : undefined}
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
            {/* On the tight treatment the button is ~86px wide, where "Selected" beside a tick
                truncates to nonsense. The tick ALONE is unambiguous there — the tile also wears
                the selected ring and border — so the word is dropped rather than clipped.
                `aria-pressed` on the tile already carries the state for a screen reader, and
                the label is kept in the title for a pointer user. */}
            {selected && <Check size={tight ? 18 : 14} strokeWidth={3} />}
            {isCurrent
              ? "Current plan"
              : selected
                ? tight
                  ? null
                  : "Selected"
                : (ctaLabel ?? "Select")}
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
  wide = false,
  tight = false,
}: {
  pct: number;
  caption: string;
  compact: boolean;
  /** Wide tile — drives the caption size so it breaks to two rows, not three. */
  wide?: boolean;
  /** Squeeze the dial for the phone-sized treatment — see `tight` in PackageTile. */
  tight?: boolean;
}) {
  // The wide tile is height-constrained, and this dial is the tallest thing in its stats band
  // (ring + a caption that wraps to two or three lines). Shrinking the ring and tightening the
  // caption's leading is the cheapest height available without dropping information.
  const size = tight ? 40 : compact ? 44 : 58;
  const stroke = tight ? 4.5 : compact ? 5 : 6.5;
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
      className={cn("flex", tight ? "flex-row items-center justify-center" : "flex-col items-center")}
      style={{ gap: tight ? 8 : 6 }}
    >
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        {/* Dial face behind the ring.
            DARK ON EVERY TIER, deliberately. The ring used to stroke in `currentColor`, which
            is the tile's ink — and `needsDarkInk` flips that to near-black on the lime and
            amber tiers. Each dial was individually contrast-correct, but stacked in one modal
            they read as five different components: two black gauges among three white ones.
            Giving the dial its own dark face makes it a self-contained instrument, so one
            light ring and one light percentage work on every tier. The caption beneath still
            uses the tile's ink, because it sits on the tile, not on the dial. */}
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: size * 0.76,
            height: size * 0.76,
            background:
              "radial-gradient(circle at 50% 30%, rgba(255,255,255,.14), rgba(6,6,8,.82) 78%)",
            boxShadow: full
              ? "inset 0 1px 2px rgba(0,0,0,.5), inset 0 -1px 1px rgba(255,255,255,.14), 0 0 26px -2px rgba(255,214,120,.9)"
              : "inset 0 1px 2px rgba(0,0,0,.5), inset 0 -1px 1px rgba(255,255,255,.14)",
          }}
        />
        <svg
          width={size}
          height={size}
          className="absolute"
          style={{
            filter: full
              ? "drop-shadow(0 0 7px rgba(255,250,228,.95)) drop-shadow(0 0 16px rgba(255,208,116,.9))"
              : "drop-shadow(0 1px 3px rgba(0,0,0,.45))",
          }}
          aria-hidden
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={full ? 0.3 : 0.24}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={full ? "#fff4d2" : "#ffffff"}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <span
          className="relative font-poppins font-black leading-none tabular-nums"
          style={{
            // "100%" is four characters where every other value is three, so at one fixed size
            // it runs into the ring it sits inside — and 100% is the tier the eye lands on.
            // Scaling the type to the value keeps the dial small (width the entries figure
            // needs) instead of growing the circle to fit its widest label.
            fontSize: (tight ? 11 : compact ? 12 : 16) * (pct >= 100 ? 0.82 : 1),
            color: "#ffffff",
          }}
        >
          {pct}%
        </span>
      </div>
      <span
        className="text-center font-sans font-bold uppercase opacity-80"
        style={{
          // 8.5 on a wide desktop tile, down from 9.5. At 9.5 the caption broke one word per
          // line — "PARTNER / DISCOUNT / ACCESS" — because "PARTNER DISCOUNT" measured ~98px in
          // a 96px column. 8.5 fits two words on the first line, so both real captions land on
          // TWO rows: "10-DAY PARTNER / DISCOUNT ACCESS" and "PARTNER DISCOUNT / ACCESS".
          fontSize: tight ? 7 : wide ? 8.5 : compact ? 7.5 : 9.5,
          // 1.15 on wide: the caption still wraps ("2-day discount access" is three words), but
          // beside the ring rather than under it, so its lines no longer add to the tile height
          // — they fill space the ring already occupies.
          lineHeight: tight ? 1.15 : 1.25,
          letterSpacing: compact ? "0.01em" : "0.05em",
          // Deliberately NARROW so the caption wraps to three short lines ("2-DAY /
          // DISCOUNT / ACCESS") rather than two long ones. Beside the ring those lines are
          // free — they fill height the dial already occupies — and every px not spent here
          // goes to the entries figure, which is the column that was wrapping.
          maxWidth: tight ? 42 : compact ? 80 : 96,
        }}
      >
        {caption}
      </span>
    </div>
  );
}
