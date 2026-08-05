"use client";

/**
 * Shared leaf pieces for `/discount` — the access bar, the artwork plate, the category tag
 * and the two unlock routes.
 *
 * They live together because each is used by BOTH the list and the popups, and each is
 * small enough that a file apiece would be filing rather than structure. Anything with its
 * own state or layout responsibility gets its own file instead.
 *
 * @module components/sections/discount/DiscountPrimitives
 */

import React from "react";
import Image from "next/image";
import PackageTile from "@/components/modals/PackageTile";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { plateLetter, type DiscountRow, type DiscountUnlockRoute } from "@/utils/partner-discounts/discount-catalogue";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { cn } from "@/utils/cn";

/* ─────────────────────────────── Access bar ─────────────────────────────── */

/**
 * One continuous bar rather than three tier segments, because the ladder has ELEVEN levels
 * and only three of them are memberships — segments would imply the other eight do not
 * exist. A gold notch marks the level of the offer being viewed, so the gap the member has
 * to close is literal rather than described.
 */
export function DiscountAccessBar({
  pct,
  label,
  notchPct,
  compact = false,
}: {
  pct: number;
  label: string;
  /** Level of the offer in view; drawn as a notch when it sits above `pct`. */
  notchPct?: number | null;
  compact?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const showNotch = notchPct != null && notchPct > clamped;

  return (
    <div className="flex flex-col gap-[7px]">
      <span
        className="relative block w-full overflow-hidden"
        style={{
          height: 10,
          borderRadius: 6,
          background: "rgba(255,255,255,.13)",
          border: "1px solid rgba(255,255,255,.12)",
        }}
      >
        <span
          className="ta-dc-fill block h-full"
          style={{
            width: `${clamped}%`,
            borderRadius: 6,
            background:
              clamped >= 100
                ? "linear-gradient(90deg,#f6dd8c,#d4af37 70%,#a87f1d)"
                : "linear-gradient(90deg,#ff6b6b,#ee0000)",
          }}
        />
        {showNotch && (
          <span
            aria-hidden
            className="absolute bottom-0 top-0"
            style={{
              left: `${notchPct}%`,
              width: 2,
              background: "#f1d99a",
              boxShadow: "0 0 8px rgba(212,175,55,.95)",
            }}
          />
        )}
      </span>
      <div className="flex items-center justify-between gap-2.5">
        <span
          className="whitespace-nowrap font-sans font-extrabold uppercase"
          style={{
            fontSize: 9.5,
            lineHeight: 1,
            letterSpacing: ".14em",
            color: label ? "#f1d99a" : "rgba(255,255,255,.55)",
          }}
        >
          {label}
        </span>
        {showNotch && !compact && (
          <span
            className="whitespace-nowrap font-sans font-bold uppercase"
            style={{ fontSize: 9, lineHeight: 1, letterSpacing: ".1em", color: "#d4af37" }}
          >
            redeemable at {notchPct}%
          </span>
        )}
        <span
          className="whitespace-nowrap font-mono font-extrabold tabular-nums"
          style={{ fontSize: 11.5, lineHeight: 1, letterSpacing: "-.02em", color: "#fff" }}
        >
          {clamped}%
        </span>
      </div>
    </div>
  );
}

/* ────────────────────────────────── Plate ───────────────────────────────── */

/**
 * Fixed-ratio neutral plate, safe for either artwork source.
 *
 * The vendor's images are uncontrolled: 948 are per-offer photos (often 640×480), 856 are
 * harvested references that may resolve to a merchant logo on an arbitrary background, and
 * 29 offers have none at all. A fixed box with `object-fit: contain` over a neutral backing
 * is the only treatment that survives all three without cropping a logo or letterboxing a
 * photo into a stripe. The letter is the documented fallback, not an error state.
 *
 * Direct-partner logos sit over the site's own partner-logo backing plate — several are
 * dark ink on transparency and vanish on a dark surface.
 */
export function DiscountPlate({
  row,
  size,
  className,
}: {
  row: DiscountRow;
  size: number;
  className?: string;
}) {
  const radius = size >= 90 ? 13 : 11;

  if (row.kind === "direct" && row.logo) {
    return (
      <span
        aria-hidden
        className={cn("grid flex-none place-items-center overflow-hidden", className)}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          border: "1px solid var(--dc-ln)",
          backgroundColor: "#0b0b0d",
          backgroundImage: `url("${row.logo}"), url("/images/partnerBrandLogos/partnerlogoBg.webp")`,
          backgroundSize: "74%, cover",
          backgroundRepeat: "no-repeat, no-repeat",
          backgroundPosition: "center, center",
        }}
      />
    );
  }

  return (
    <span
      className={cn("relative grid flex-none place-items-center overflow-hidden", className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "var(--dc-chip)",
        border: "1px solid var(--dc-ln)",
      }}
    >
      {row.imageSrc ? (
        <Image
          src={row.imageSrc}
          alt=""
          width={size}
          height={size}
          // Vendor files are unoptimised and run to several hundred KB, so every one of
          // them is lazy and goes through the optimiser. `contain` because the set mixes
          // logos with photos — `cover` would crop the wordmark off a logo.
          loading="lazy"
          className="h-full w-full object-contain"
          style={{ padding: size >= 90 ? 8 : 5 }}
        />
      ) : (
        <span
          className="font-mono font-extrabold"
          style={{ fontSize: Math.round(size * 0.4), lineHeight: 1, color: "var(--dc-mu)" }}
        >
          {plateLetter(row.name)}
        </span>
      )}
    </span>
  );
}

/* ──────────────────────────────── Category tag ──────────────────────────── */

/**
 * Direct-partner categories render red so they are never mistaken for one of the 11 vendor
 * categories — the two sets are different vocabularies in one list.
 */
export function DiscountCategoryTag({
  row,
  small = false,
}: {
  row: DiscountRow;
  small?: boolean;
}) {
  const direct = row.kind === "direct";
  return (
    <span
      className="flex-none whitespace-nowrap font-sans font-bold uppercase"
      style={{
        fontSize: small ? 8.5 : 9.5,
        lineHeight: 1,
        letterSpacing: ".09em",
        padding: small ? "5px 7px" : "6px 9px",
        borderRadius: 6,
        background: "var(--dc-chip)",
        border: `1px solid ${direct ? "rgba(238,0,0,.32)" : "var(--dc-ln)"}`,
        color: direct ? "#ff6b6b" : "var(--dc-mu2)",
      }}
    >
      {row.cat}
    </span>
  );
}

/* ──────────────────────────── The two unlock routes ─────────────────────── */

/**
 * The cheapest membership and the cheapest one-time pack that reach a level, each rendered
 * on the REAL `PackageTile` — the same component the package modals use, so a tile here and
 * a tile there can never drift apart.
 *
 * Around the tile sits only what the tile has no field for: a fixed-height header naming
 * the route, and the payoff line beneath it. The header height is fixed on purpose — a
 * wrapping tag on one side would otherwise stagger the two columns by a line.
 *
 * The mount carries an explicit height so the tile's `h-full` resolves to the same number
 * in both columns.
 */
export function DiscountUnlockRoutes({
  routes,
  compact = false,
  onSelectRoute,
}: {
  routes: DiscountUnlockRoute[];
  compact?: boolean;
  /**
   * Buy this route. The caller opens the membership modal on THIS page rather than
   * navigating: the member is mid-thought about one specific offer, and a page change would
   * throw away the popup, their filters and their scroll to re-ask a question they have
   * already answered.
   */
  onSelectRoute: (route: DiscountUnlockRoute) => void;
}) {
  // The SAME resolved multipliers every other package surface reads (scheduled > toggle >
  // alternating), so a live promo shows here too. Without this the unlock routes quoted base
  // entries while the membership modal one tap later quoted the boosted figure — the tile
  // that made the offer would have undersold it against the page that closed it.
  const membershipMultiplier = useResolvedMultiplier("membership-packages", "display") ?? 1;
  const oneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display") ?? 1;

  if (routes.length === 0) return null;

  const mountHeight = compact ? 250 : 266;

  return (
    <div
      className={cn("grid items-stretch gap-[11px]", compact ? "grid-cols-1" : "grid-cols-2")}
    >
      {routes.map((route) => {
        const membership = route.kind === "membership";
        const scheme = membership
          ? getMembershipSectionColorScheme(route.packageId, true)
          : getElectricPackageColorScheme(route.packageId);

        const multiplier = membership ? membershipMultiplier : oneTimeMultiplier;
        const promoActive = multiplier > 1;
        const entries = promoActive ? route.entries * multiplier : route.entries;

        return (
          <div key={`${route.kind}-${route.packageId}`} className="flex min-w-0 flex-col gap-[7px]">
            <div
              className="flex flex-col items-start gap-[5px]"
              style={{ height: compact ? 30 : 32 }}
            >
              <span
                className="flex-none whitespace-nowrap font-sans font-extrabold uppercase"
                style={{
                  fontSize: compact ? 8 : 8.5,
                  lineHeight: 1,
                  letterSpacing: ".14em",
                  color: membership ? "#f1d99a" : "rgba(255,255,255,.62)",
                }}
              >
                {route.kindLabel}
              </span>
              <span
                className="flex-none whitespace-nowrap font-sans font-extrabold uppercase"
                style={{
                  fontSize: compact ? 8 : 8.5,
                  lineHeight: 1,
                  letterSpacing: ".1em",
                  padding: "4px 7px",
                  borderRadius: 5,
                  background: membership ? "rgba(212,175,55,.2)" : "rgba(255,255,255,.08)",
                  border: `1px solid ${membership ? "rgba(212,175,55,.4)" : "rgba(255,255,255,.16)"}`,
                  color: membership ? "#f6dd8c" : "rgba(255,255,255,.74)",
                }}
              >
                {route.tagLabel}
              </span>
            </div>

            <div className="grid w-full" style={{ height: mountHeight }}>
              <PackageTile
                planId={route.packageId}
                name={route.name}
                accentHex={scheme.accentHex}
                entries={entries}
                wasEntries={promoActive ? route.entries : null}
                promoActive={promoActive}
                multiplier={promoActive ? multiplier : null}
                accessPct={route.pct}
                accessCaption={route.accessCaption}
                price={route.price}
                periodLabel={route.periodLabel}
                ribbon={null}
                isSelected={false}
                isCurrent={false}
                ctaLabel={route.ctaLabel}
                // This tile is surrounded by partner-offer language, so "15 free entries" has
                // to name the draw or it reads as entries into the discount itself.
                entriesSubLabel="into the Major Draw"
                compact
                onSelect={() => onSelectRoute(route)}
              />
            </div>

            <span
              className="font-sans font-bold"
              style={{
                fontSize: compact ? 10 : 10.5,
                lineHeight: 1.35,
                color: membership ? "#f1d99a" : "rgba(255,255,255,.7)",
                textWrap: "pretty",
              }}
            >
              {route.gainLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
