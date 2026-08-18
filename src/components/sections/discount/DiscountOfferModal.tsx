"use client";

/**
 * The offer popup — everything about one offer, and the gate that says whether it can be
 * redeemed.
 *
 * The gate is the whole point: the offer's detail is never withheld, so the panel's job is
 * to state the ONE thing a membership changes. Locked, it names the level, draws the notch
 * on the access bar and hands over the two routes past it. Redeemable, it turns green and
 * gives the member the portal.
 *
 * Centred on desktop, a bottom sheet on a phone so the primary button lands in thumb reach.
 *
 * @module components/sections/discount/DiscountOfferModal
 */

import React from "react";
import { X, Lock, Check, ArrowRight } from "lucide-react";
import { useScrollLock, useModalA11y } from "@/hooks/useModalBlocking";
import { DiscountAccessBar, DiscountPlate, DiscountUnlockRoutes } from "./DiscountPrimitives";
import {
  buildGate,
  resolveDiscountRoutes,
  redeemableCount,
  DUPLICATE_HIGHLIGHT,
  DUPLICATE_HIGHLIGHT_COUNT,
  fmtAu,
  type DiscountRow,
  type DiscountUnlockRoute,
} from "@/utils/partner-discounts/discount-catalogue";
import { useIsLgUp } from "@/hooks/useIsLgUp";
import { Z_INDEX } from "@/constants/z-index";

export interface DiscountOfferModalProps {
  row: DiscountRow;
  viewerPct: number;
  signedIn: boolean;
  sourceLabel: string;
  onClose: () => void;
  /** Fired by "Redeem in portal" — the caller owns the SSO hand-off. */
  onRedeem: (row: DiscountRow) => void;
  /** Fired by any "log in" CTA. */
  onLogin: () => void;
  /** Fired by a route tile's CTA — the caller opens the membership modal in place. */
  onSelectRoute: (route: DiscountUnlockRoute) => void;
}

export default function DiscountOfferModal({
  row,
  viewerPct,
  signedIn,
  sourceLabel,
  onClose,
  onRedeem,
  onLogin,
  onSelectRoute,
}: DiscountOfferModalProps) {
  const isLgUp = useIsLgUp();
  const gate = React.useMemo(() => buildGate(row, viewerPct, signedIn), [row, viewerPct, signedIn]);
  const routes = React.useMemo(
    () =>
      gate.showRoutes ? resolveDiscountRoutes(row.pct, redeemableCount(viewerPct, signedIn)) : [],
    [gate.showRoutes, row.pct, viewerPct, signedIn]
  );

  // Scroll lock + focus trap + Escape + focus restore. Replaces the local Escape-only effect
  // that used to live here: this surface declares `aria-modal="true"`, and until now nothing
  // made that true — the catalogue scrolled behind it and Tab walked the offer tiles hidden
  // under the scrim. See src/hooks/useModalBlocking.ts for why the lock is ref-counted.
  const panelRef = React.useRef<HTMLDivElement>(null);
  useScrollLock(true);
  useModalA11y(true, panelRef, onClose);

  const open = !gate.locked;
  const hasHighlight = Boolean(row.highlight && row.highlight.trim());

  return (
    <div
      className="fixed inset-0 flex flex-col justify-end sm:items-center sm:justify-start sm:overflow-y-auto sm:p-6"
      style={{ zIndex: Z_INDEX.MODAL_BASE }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="ta-dc-scrim fixed inset-0"
        style={{ background: "rgba(6,6,8,.75)", backdropFilter: "blur(7px)" }}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={row.name}
        className="ta-dc-popup ta-dc-panel ta-dc-noscroll relative flex flex-col overflow-auto overscroll-contain"
        style={{
          background: "var(--dc-sf)",
          border: "1px solid var(--dc-ln2)",
          boxShadow: "0 44px 96px -44px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.06)",
        }}
      >
        {/* Eyebrow: the category, the vendor's own offer id, and the close. The id is here
            because it is the only stable handle a member can quote to support. */}
        <div className="relative z-[6] flex items-center gap-3 p-[15px_15px_0]">
          <span
            className="flex-none whitespace-nowrap font-sans font-bold uppercase"
            style={{
              fontSize: 9.5,
              lineHeight: 1,
              letterSpacing: ".09em",
              padding: "6px 9px",
              borderRadius: 6,
              background: "var(--dc-chip)",
              border: `1px solid ${row.kind === "direct" ? "rgba(238,0,0,.32)" : "var(--dc-ln)"}`,
              color: row.kind === "direct" ? "#ff6b6b" : "var(--dc-mu2)",
            }}
          >
            {row.cat}
          </span>
          <span className="font-mono font-bold" style={{ fontSize: 10, color: "var(--dc-mu2)" }}>
            {row.kind === "direct" ? "Direct partner" : `Offer #${row.id}`}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ta-dc-ib grid flex-none place-items-center"
            style={{
              width: 44,
              height: 44,
              borderRadius: 13,
              border: "1px solid var(--dc-ln)",
              background: "var(--dc-chip)",
              color: "var(--dc-mu)",
              cursor: "pointer",
            }}
          >
            <X size={17} strokeWidth={2.3} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 p-[13px_15px_15px]">
          <div className="flex items-center gap-3">
            <DiscountPlate row={row} size={52} />
            <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
              <span
                className="overflow-hidden font-poppins font-black"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  fontSize: 15.5,
                  lineHeight: 1.22,
                  letterSpacing: "-.01em",
                  color: "var(--dc-tx)",
                  textWrap: "pretty",
                }}
              >
                {row.name}
              </span>
              <span
                className="font-sans font-extrabold uppercase"
                style={{ fontSize: 9, lineHeight: 1.3, letterSpacing: ".14em", color: "var(--dc-mu2)" }}
              >
                {row.kind === "direct" ? `${row.cat} · direct partner` : row.cat}
              </span>
            </span>
          </div>

          {/* Artwork honesty. The vendor's image can carry a different trading name than the
              offer (800575 is "GUNNEDAH HYDRAULICS" and its logo reads "AG-FIX HYDRAULICS"),
              so the page says so rather than letting a member think they misread it. */}
          {row.imageSrc && (
            <span
              className="font-sans font-semibold"
              style={{ fontSize: 10.5, lineHeight: 1.4, color: "var(--dc-mu2)" }}
            >
              One image per offer, from our rewards partner. It can show a different trading
              name than the offer.
            </span>
          )}

          <div className="flex flex-col gap-[7px]">
            <span
              className="font-sans font-extrabold uppercase"
              style={{ fontSize: 9, lineHeight: 1, letterSpacing: ".15em", color: "var(--dc-mu2)" }}
            >
              The offer
            </span>
            <span
              className="block font-poppins font-extrabold"
              style={{
                fontSize: 19,
                lineHeight: 1.32,
                letterSpacing: "-.01em",
                color: hasHighlight ? "var(--dc-tx)" : "var(--dc-mu2)",
                fontStyle: hasHighlight ? "normal" : "italic",
                textWrap: "pretty",
              }}
            >
              {hasHighlight ? row.highlight : "No value line supplied"}
            </span>
            {row.highlight === DUPLICATE_HIGHLIGHT && (
              <span
                className="font-sans font-semibold"
                style={{ fontSize: 10.5, lineHeight: 1.4, color: "var(--dc-mu2)" }}
              >
                This exact line appears on {fmtAu(DUPLICATE_HIGHLIGHT_COUNT)} offers in the
                catalogue.
              </span>
            )}
          </div>

          {/* ---- The gate ---- */}
          <div
            className="relative block overflow-hidden"
            style={{
              borderRadius: 17,
              padding: "16px 17px",
              background: open
                ? "linear-gradient(150deg,#0b1712,#080d0b 60%,#0a1410)"
                : "linear-gradient(150deg,#19150f,#0b0a08 58%,#15101a)",
              border: `1px solid ${open ? "rgba(52,211,153,.44)" : "rgba(212,175,55,.44)"}`,
              boxShadow: "0 24px 54px -28px rgba(0,0,0,.85)",
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

            <div className="relative flex items-start gap-3">
              <span
                className={open ? "grid flex-none place-items-center" : "ta-dc-halo grid flex-none place-items-center"}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 13,
                  color: open ? "#04281c" : "#221a02",
                  background: open
                    ? "linear-gradient(180deg,#6ee7b7,#0f9d6b)"
                    : "linear-gradient(180deg,#f6dd8c,#d4af37 62%,#a87f1d)",
                }}
              >
                {open ? <Check size={19} strokeWidth={2.6} /> : <Lock size={19} strokeWidth={2.3} />}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
                <span
                  className="font-poppins font-black"
                  style={{
                    fontSize: 15.5,
                    lineHeight: 1.2,
                    letterSpacing: "-.01em",
                    color: open ? "#eafff6" : "#fff",
                  }}
                >
                  {gate.title}
                </span>
                <span
                  className="font-sans font-semibold"
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.45,
                    color: "rgba(255,255,255,.66)",
                    textWrap: "pretty",
                  }}
                >
                  {gate.body}
                </span>
              </div>
            </div>

            {gate.showBar && (
              <div className="relative mt-3.5">
                <DiscountAccessBar
                  pct={signedIn ? viewerPct : 0}
                  label={signedIn ? sourceLabel : "Not signed in"}
                  notchPct={gate.notchPct}
                  compact={!isLgUp}
                />
              </div>
            )}

            <div
              className="relative mt-3.5 flex items-end gap-3.5 pt-3"
              style={{ borderTop: "1px solid rgba(255,255,255,.1)" }}
            >
              <span className="flex flex-none flex-col gap-1 whitespace-nowrap">
                <TallyLabel>{gate.tallyLabel}</TallyLabel>
                <span
                  className="font-mono font-extrabold tabular-nums"
                  style={{
                    fontSize: 16,
                    lineHeight: 1,
                    letterSpacing: "-.02em",
                    color: open ? "#6ee7b7" : "#f1d99a",
                  }}
                >
                  {gate.tallyValue}
                </span>
              </span>
              <span className="min-w-[8px] flex-1" />
              <span className="flex flex-none flex-col gap-1 whitespace-nowrap text-right">
                <TallyLabel>{gate.tallyLabel2}</TallyLabel>
                <span
                  className="font-sans font-bold"
                  style={{ fontSize: 12, lineHeight: 1, color: "rgba(255,255,255,.75)" }}
                >
                  {gate.tallyValue2}
                </span>
              </span>
            </div>

            {gate.showRoutes && routes.length > 0 && (
              <div
                className="relative mt-3.5 flex flex-col gap-[9px] pt-3"
                style={{ borderTop: "1px solid rgba(255,255,255,.1)" }}
              >
                <span
                  className="font-sans font-black uppercase"
                  style={{ fontSize: 11, lineHeight: 1, letterSpacing: ".13em", color: "#fff" }}
                >
                  Two ways to unlock it
                </span>
                <DiscountUnlockRoutes routes={routes} compact={!isLgUp} onSelectRoute={onSelectRoute} />
              </div>
            )}

            {gate.showLoginCta && (
              <button
                type="button"
                onClick={onLogin}
                className="ta-dc-btn relative mt-3.5 flex w-full items-center justify-center gap-[9px] font-poppins font-black"
                style={{
                  height: 48,
                  borderRadius: 14,
                  border: 0,
                  cursor: "pointer",
                  fontSize: 13.5,
                  background: "linear-gradient(180deg,#f6dd8c,#d4af37 62%,#a87f1d)",
                  color: "#221a02",
                  boxShadow:
                    "0 14px 30px -12px rgba(212,175,55,.7),inset 0 1px 0 rgba(255,255,255,.4)",
                }}
              >
                <span className="whitespace-nowrap">Log in to redeem</span>
                <ArrowRight size={15} strokeWidth={2.5} className="flex-none" />
              </button>
            )}
          </div>

          {/* ---- Footer ----
              "Back" only exists as the SECONDARY half of a pair. On its own it duplicated the
              close button two inches above it and the scrim behind it — three ways to do one
              thing, costing a full 50px row on a phone. When there is no primary action the
              footer is simply not rendered. */}
          {gate.ctaLabel && (
          <div className="flex w-full flex-col gap-[9px] sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="ta-dc-btn flex items-center justify-center whitespace-nowrap font-sans font-extrabold"
              style={{
                flex: "none",
                minWidth: 0,
                height: 50,
                padding: "0 18px",
                borderRadius: 15,
                border: "1px solid var(--dc-ln2)",
                background: "var(--dc-chip)",
                color: "var(--dc-tx)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Back
            </button>

            {gate.ctaLabel && (
              <PrimaryCta
                label={gate.ctaLabel}
                green={open && row.kind === "vendor"}
                onClick={() => {
                  if (row.kind === "direct") {
                    if (row.link) window.open(row.link, "_blank", "noopener,noreferrer");
                    return;
                  }
                  onRedeem(row);
                }}
              />
            )}
          </div>
          )}

          {gate.footNote && (
            <p
              className="m-0 font-sans font-semibold"
              style={{ fontSize: 10.5, lineHeight: 1.45, color: "var(--dc-mu2)", textWrap: "pretty" }}
            >
              {gate.footNote}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function TallyLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-sans font-extrabold uppercase"
      style={{ fontSize: 8.5, lineHeight: 1.2, letterSpacing: ".13em", color: "rgba(255,255,255,.5)" }}
    >
      {children}
    </span>
  );
}

function PrimaryCta({
  label,
  green,
  onClick,
}: {
  label: string;
  green: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ta-dc-btn flex flex-1 items-center justify-center gap-[9px] font-poppins font-black"
      style={{
        minWidth: 0,
        height: 50,
        borderRadius: 15,
        border: 0,
        cursor: "pointer",
        fontSize: 13.5,
        letterSpacing: ".02em",
        background: green
          ? "linear-gradient(180deg,#3ddc9a,#0f9d6b)"
          : "linear-gradient(180deg,#ff2a2a,#ee0000 62%,#c40d0d)",
        color: green ? "#04281c" : "#fff",
        boxShadow: green
          ? "0 14px 30px -12px rgba(15,157,107,.75),inset 0 1px 0 rgba(255,255,255,.4)"
          : "0 14px 30px -12px rgba(238,0,0,.8),inset 0 1px 0 rgba(255,255,255,.26)",
      }}
    >
      <span className="whitespace-nowrap">{label}</span>
      <ArrowRight size={16} strokeWidth={2.4} className="flex-none" />
    </button>
  );
}
