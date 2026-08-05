"use client";

/**
 * The gold panel at the top of `/discount` — what the member can redeem, what they cannot,
 * and the one control that does something about it.
 *
 * Two figures, not one. "917 redeemable" alone reads as generous; "916 you cannot redeem
 * yet" beside it is the reason the page exists. Both are real counts from the generated
 * tier table, never a percentage standing in for a number — a percent with no denominator
 * is what the vendor's own portal shows, and it is precisely what members could not act on.
 *
 * @module components/sections/discount/DiscountAccessMeter
 */

import React from "react";
import { DiscountAccessBar } from "./DiscountPrimitives";
import {
  fmtAu,
  nextLevelAbove,
  offersAtLevel,
  resolveDiscountRoutes,
  PARTNER_CATALOG_TOTAL,
} from "@/utils/partner-discounts/discount-catalogue";

/** The cheapest membership tier's access level — what "See memberships" actually opens. */
const ENTRY_LEVEL = 50;

export interface DiscountAccessMeterProps {
  signedIn: boolean;
  viewerPct: number;
  /** e.g. "Tradie membership" — the source of the access, not just the number. */
  sourceLabel: string;
  redeemable: number;
  onOpenAccess: () => void;
}

export default function DiscountAccessMeter({
  signedIn,
  viewerPct,
  sourceLabel,
  redeemable,
  onOpenAccess,
}: DiscountAccessMeterProps) {
  const nextLevel = signedIn ? nextLevelAbove(viewerPct) : null;
  const nextCount = nextLevel !== null ? offersAtLevel(nextLevel) : null;

  const openLabel = signedIn ? `Redeemable on your ${viewerPct}% access` : "Redeemable once you log in";
  const lockLabel = signedIn ? "Cannot redeem yet" : "Need a membership to redeem";

  /**
   * The sub-line earns its place only by carrying a NUMBER the label above it does not.
   *
   * Signed in that is the next rung's payoff. Signed out it is the entry price — the panel
   * shows 0 of 1,833 and a "See memberships" button, and the one thing a visitor wants before
   * pressing it is what the cheapest way in costs and buys. Both states share one sentence
   * shape ("X makes N redeemable") so the panel reads the same before and after joining.
   *
   * The price is RESOLVED, never typed: it is the cheapest membership reaching the entry
   * level, from the same resolver the unlock routes use, so a repricing cannot leave a stale
   * number on the busiest surface on the page.
   */
  const entryRoute = signedIn
    ? null
    : (resolveDiscountRoutes(ENTRY_LEVEL, 0).find((r) => r.kind === "membership") ?? null);
  const entryCount = offersAtLevel(ENTRY_LEVEL);

  const openSub = signedIn
    ? `${viewerPct}% makes ${fmtAu(redeemable)} redeemable.`
    : "Every offer reads in full.";
  const lockSub = signedIn
    ? nextLevel !== null && nextCount !== null
      ? `${nextLevel}% makes ${fmtAu(nextCount)} redeemable.`
      : "Nothing locked — you are at 100%."
    : entryRoute && entryCount !== null
      ? `${entryRoute.name} at $${entryRoute.price}/mo makes ${fmtAu(entryCount)} redeemable.`
      : null;
  const ctaLabel = signedIn ? (nextLevel !== null ? "Get more access" : "Open the portal") : "See memberships";

  return (
    <section
      aria-label="Your partner discount access"
      className="relative overflow-hidden"
      style={{
        borderRadius: 20,
        background: "linear-gradient(150deg,#19150f,#0b0a08 58%,#15101a)",
        border: "1px solid rgba(212,175,55,.4)",
        boxShadow: "0 30px 66px -34px rgba(0,0,0,.8)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg,rgba(255,255,255,.04) 0 1px,transparent 1px 15px)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(620px 260px at 88% -34%,rgba(212,175,55,.2),transparent 62%)",
        }}
      />

      <div className="relative flex flex-col items-stretch lg:flex-row">
        {/* Two stat columns. On mobile they sit side by side above the bar rather than
            stacking, because the comparison between them IS the message. */}
        <div className="flex flex-1">
          <Stat
            label={openLabel}
            labelShort="Redeemable"
            labelColor="#34d399"
            value={signedIn ? fmtAu(redeemable) : "0"}
            unit={`of ${fmtAu(PARTNER_CATALOG_TOTAL)} offers`}
            sub={openSub}
          />
          <span
            aria-hidden
            className="my-5 w-px flex-none"
            style={{
              background: "linear-gradient(180deg,transparent,rgba(255,255,255,.16),transparent)",
            }}
          />
          <Stat
            label={lockLabel}
            labelShort="Cannot redeem"
            labelColor="#d4af37"
            value={fmtAu(signedIn ? PARTNER_CATALOG_TOTAL - redeemable : PARTNER_CATALOG_TOTAL)}
            unit="offers"
            sub={lockSub}
            gold
          />
        </div>

        <div
          className="flex flex-none flex-col gap-[9px] border-t px-5 py-5 sm:px-6 lg:w-[290px] lg:border-l lg:border-t-0"
          style={{ background: "rgba(0,0,0,.3)", borderColor: "rgba(255,255,255,.08)" }}
        >
          <DiscountAccessBar
            pct={signedIn ? viewerPct : 0}
            label={signedIn ? sourceLabel : "Not signed in"}
          />
          <button
            type="button"
            onClick={onOpenAccess}
            className="ta-dc-btn mt-auto flex w-full items-center justify-center font-poppins font-black"
            style={{
              height: 46,
              borderRadius: 14,
              border: 0,
              cursor: "pointer",
              fontSize: 13,
              lineHeight: 1,
              background: "linear-gradient(180deg,#f6dd8c,#d4af37 62%,#a87f1d)",
              color: "#221a02",
              boxShadow:
                "0 14px 30px -12px rgba(212,175,55,.7),inset 0 1px 0 rgba(255,255,255,.45)",
            }}
          >
            <span className="whitespace-nowrap">{ctaLabel}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  labelShort,
  labelColor,
  value,
  unit,
  sub,
  gold = false,
}: {
  label: string;
  labelShort: string;
  labelColor: string;
  value: string;
  unit: string;
  sub: string | null;
  gold?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[7px] px-5 py-5 sm:px-6">
      <span
        className="font-sans font-extrabold uppercase"
        style={{ fontSize: 9.5, lineHeight: 1.3, letterSpacing: ".19em", color: labelColor }}
      >
        {/* The full sentence is the desktop label; a phone gets the short one, because the
            long form wraps to three lines in a half-width column and stops scanning. */}
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{labelShort}</span>
      </span>
      <div className="flex flex-wrap items-baseline gap-x-[9px] gap-y-1">
        <span
          className="font-mono font-extrabold tabular-nums"
          style={{
            fontSize: "clamp(24px, 6vw, 40px)",
            lineHeight: 1,
            letterSpacing: "-.04em",
            color: gold ? "#f1d99a" : "#fff",
            textShadow: gold ? "0 0 30px rgba(212,175,55,.3)" : undefined,
          }}
        >
          {value}
        </span>
        <span
          className="whitespace-nowrap font-sans font-extrabold uppercase"
          style={{
            fontSize: 11.5,
            lineHeight: 1,
            letterSpacing: ".06em",
            color: "rgba(255,255,255,.5)",
          }}
        >
          {unit}
        </span>
      </div>
      {sub && (
        <span
          className="font-sans font-semibold"
          style={{ fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,.62)", textWrap: "pretty" }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}
