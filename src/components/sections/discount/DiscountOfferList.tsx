"use client";

/**
 * The banded offer list — the middle of `/discount` and the thing the page is really about.
 *
 * Rows are grouped by the ACCESS LEVEL that opens them, ascending, so scrolling walks up
 * the ladder. Between the last band the member can reach and the first they cannot sits the
 * WALL MARKER: a dashed gold seam that states, in one line, exactly where their access
 * stops and how much is behind it. That seam is the page's argument — everything above it
 * they own, everything below they can read but not redeem.
 *
 * Bands and the wall render only under the ACCESS-LEVEL sort. Under A–Z or Category they
 * would cut across the chosen ordering, so the list goes flat and each row carries its own
 * access state instead.
 *
 * @module components/sections/discount/DiscountOfferList
 */

import React from "react";
import { Lock } from "lucide-react";
import { DiscountPlate, DiscountCategoryTag } from "./DiscountPrimitives";
import type { DiscountBand, DiscountRow } from "@/utils/partner-discounts/discount-catalogue";

export interface DiscountOfferListProps {
  bands: DiscountBand[];
  viewerPct: number;
  signedIn: boolean;
  onOpenOffer: (row: DiscountRow) => void;
}

export default function DiscountOfferList({
  bands,
  viewerPct,
  signedIn,
  onOpenOffer,
}: DiscountOfferListProps) {
  return (
    <div className="flex flex-col gap-[9px]">
      {bands.map((band) => (
        <div key={band.level} className="flex flex-col gap-2">
          {band.wall && <WallMarker band={band} />}

          {band.name && (
            <div className="flex items-center gap-2.5 px-1 py-[5px]">
              <span
                aria-hidden
                className="flex-none"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  background: band.reachable ? "var(--dc-good)" : "#d4af37",
                  boxShadow: band.reachable
                    ? "0 0 10px -1px rgba(52,211,153,.8)"
                    : "0 0 10px -1px rgba(212,175,55,.8)",
                }}
              />
              <h3
                className="flex-none whitespace-nowrap font-sans font-black uppercase"
                style={{
                  fontSize: 11,
                  lineHeight: 1,
                  letterSpacing: ".13em",
                  color: band.reachable ? "var(--dc-tx)" : "#d4af37",
                }}
              >
                {band.name}
              </h3>
              <span aria-hidden className="h-px flex-1" style={{ background: "var(--dc-ln)" }} />
              <span
                className="flex-none whitespace-nowrap font-mono font-bold tabular-nums"
                style={{ fontSize: 10, lineHeight: 1, color: "var(--dc-mu2)" }}
              >
                {band.total}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-[11px] md:grid-cols-2">
            {band.rows.map((row) => (
              <OfferRow
                key={`${row.kind}-${row.id}`}
                row={row}
                viewerPct={viewerPct}
                signedIn={signedIn}
                onOpen={onOpenOffer}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The seam. Deliberately loud — it is the one element on the page allowed to interrupt the
 * rhythm, because "this is where your access ends" is the single fact a member most needs
 * and the vendor's own portal never states anywhere.
 */
function WallMarker({ band }: { band: DiscountBand }) {
  return (
    <div className="relative my-2 flex items-center justify-center sm:my-3.5">
      <span
        aria-hidden
        className="absolute left-0 right-0 top-1/2"
        style={{
          height: 3,
          borderRadius: 2,
          background:
            "repeating-linear-gradient(90deg,#d4af37 0 12px,rgba(212,175,55,.18) 12px 22px)",
        }}
      />
      <span
        className="relative inline-flex items-center gap-2.5"
        style={{
          padding: "9px 16px",
          borderRadius: 999,
          background: "#0d0b07",
          border: "1px solid rgba(212,175,55,.6)",
          boxShadow: "0 12px 30px -14px rgba(0,0,0,.9)",
        }}
      >
        <Lock size={14} strokeWidth={2.5} color="#d4af37" className="flex-none" />
        <span
          className="font-sans font-black uppercase"
          style={{ fontSize: 10.5, lineHeight: 1.3, letterSpacing: ".16em", color: "#f1d99a" }}
        >
          <span className="hidden sm:inline">{band.wallText}</span>
          <span className="sm:hidden">{band.wallTextShort}</span>
        </span>
      </span>
    </div>
  );
}

/**
 * One offer.
 *
 * The VALUE LINE leads, not the name — "Free wheel alignment" is what a member is scanning
 * for, and the vendor's names are noisy ("QUICK FIT TYRE SERVICE YEERONGPILLY"). It clamps
 * to two lines because the field runs to 115 characters, and it renders italic and muted on
 * the 3 offers that have none rather than leaving a hole.
 *
 * The name never takes `text-transform` — 63 of them are already ALL CAPS and would be
 * unchanged, while the rest would be shouted at the reader for no reason.
 */
function OfferRow({
  row,
  viewerPct,
  signedIn,
  onOpen,
}: {
  row: DiscountRow;
  viewerPct: number;
  signedIn: boolean;
  onOpen: (row: DiscountRow) => void;
}) {
  const open = signedIn && row.pct <= viewerPct;
  const direct = row.kind === "direct";
  const hasHighlight = Boolean(row.highlight && row.highlight.trim());

  const ctaText = direct
    ? open
      ? "How to claim it"
      : "Log in to claim"
    : open
      ? "Redeem in portal"
      : signedIn
        ? "How to unlock"
        : "Log in to redeem";

  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="ta-dc-row flex w-full items-stretch gap-3.5 text-left"
      style={{
        padding: 14,
        borderRadius: 16,
        cursor: "pointer",
        background: "var(--dc-sf)",
        border: "1px solid var(--dc-ln)",
        color: "var(--dc-tx)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
      }}
    >
      <DiscountPlate row={row} size={104} className="hidden sm:grid" />
      <DiscountPlate row={row} size={64} className="sm:hidden" />

      <span className="flex min-w-0 flex-1 flex-col gap-2 text-left">
        <span
          className="overflow-hidden font-sans font-bold"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            fontSize: 15,
            lineHeight: 1.36,
            color: hasHighlight ? "var(--dc-tx)" : "var(--dc-mu2)",
            fontStyle: hasHighlight ? "normal" : "italic",
            textWrap: "pretty",
          }}
        >
          {hasHighlight ? row.highlight : "No value line supplied"}
        </span>

        <span
          className="block truncate font-sans font-extrabold"
          style={{ fontSize: 13, lineHeight: 1.3, color: "var(--dc-tx)" }}
        >
          {row.name}
        </span>

        <span className="mt-auto flex items-center gap-2 pt-0.5">
          <DiscountCategoryTag row={row} />
          <span className="flex-1" />
          <span
            className="ta-dc-rowcta hidden whitespace-nowrap font-sans font-extrabold sm:inline"
            style={{
              fontSize: 11,
              lineHeight: 1,
              letterSpacing: ".04em",
              color: open ? "#ff6b6b" : "var(--dc-mu)",
            }}
          >
            {ctaText}
          </span>
        </span>
      </span>
    </button>
  );
}
