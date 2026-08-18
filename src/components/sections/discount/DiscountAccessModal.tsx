"use client";

/**
 * "More access" — the popup behind the meter's CTA.
 *
 * A LEVEL STEPPER rather than a package list. The member's question is "what does the next
 * rung actually get me", and the honest answer is a number: 55% makes 1,009 redeemable, 92
 * more than now. Each press walks the real 11-rung ladder and re-resolves both routes, so
 * the pairing of level → price → payoff stays true at every step instead of only at the
 * three membership tiers.
 *
 * Up disables at 100%, where both routes are the top package and the note says so. Down
 * stops at the member's own next level — stepping below what they already have would offer
 * them a package that buys nothing.
 *
 * @module components/sections/discount/DiscountAccessModal
 */

import React from "react";
import { X, ArrowUp, ArrowDown, ArrowRight } from "lucide-react";
import { useScrollLock, useModalA11y } from "@/hooks/useModalBlocking";
import { DiscountUnlockRoutes } from "./DiscountPrimitives";
import {
  DISCOUNT_LEVELS,
  fmtAu,
  nextLevelAbove,
  offersAtLevel,
  redeemableCount,
  resolveDiscountRoutes,
  PARTNER_CATALOG_TOTAL,
  type DiscountUnlockRoute,
} from "@/utils/partner-discounts/discount-catalogue";
import { useIsLgUp } from "@/hooks/useIsLgUp";
import { Z_INDEX } from "@/constants/z-index";

export interface DiscountAccessModalProps {
  viewerPct: number;
  signedIn: boolean;
  onClose: () => void;
  /** "Open the rewards portal" at 100% — the caller owns the SSO hand-off. */
  onOpenPortal: () => void;
  /** Fired by a route tile's CTA — the caller opens the membership modal in place. */
  onSelectRoute: (route: DiscountUnlockRoute) => void;
}

export default function DiscountAccessModal({
  viewerPct,
  signedIn,
  onClose,
  onOpenPortal,
  onSelectRoute,
}: DiscountAccessModalProps) {
  const isLgUp = useIsLgUp();
  const redeemable = redeemableCount(viewerPct, signedIn);

  // Where the stepper starts. A signed-out visitor has no level of their own, so the ladder
  // starts at the entry membership's 50% rather than at 5% — the lowest rung is a mini pack,
  // which is not the offer being made here.
  const startLevel = signedIn ? nextLevelAbove(viewerPct) : 50;
  const [target, setTarget] = React.useState<number | null>(startLevel);

  // Reopening always re-anchors: a target left over from a previous visit would silently
  // misrepresent what the member is being shown.
  React.useEffect(() => setTarget(startLevel), [startLevel]);

  // Scroll lock + focus trap + Escape + focus restore — replaces the local Escape-only
  // effect. Matters most here for the keyboard path: this modal steps a ladder up and down,
  // so without focus restore a member who closes it lands on <body> and has to tab from the
  // top of the document back to the meter CTA they opened it from.
  const panelRef = React.useRef<HTMLDivElement>(null);
  useScrollLock(true);
  useModalA11y(true, panelRef, onClose);

  const up = target !== null ? (DISCOUNT_LEVELS.find((p) => p > target) ?? null) : null;
  const down =
    target !== null && startLevel !== null && target > startLevel
      ? (DISCOUNT_LEVELS.filter((p) => p >= startLevel && p < target).pop() ?? null)
      : null;

  const targetCount = target !== null ? offersAtLevel(target) : null;
  const routes = React.useMemo(
    () => (target !== null ? resolveDiscountRoutes(target, redeemable) : []),
    [target, redeemable]
  );

  const atTop = target !== null && up === null;
  const title = signedIn ? (startLevel !== null ? "More access" : "Head to the portal") : "Start redeeming";
  const sub = signedIn
    ? `${viewerPct}% now · ${fmtAu(redeemable)} of ${fmtAu(PARTNER_CATALOG_TOTAL)} redeemable`
    : "Reading is free. Redeeming takes access.";

  const heading =
    target === null
      ? "Every offer is redeemable"
      : target === startLevel
        ? signedIn
          ? `Next level up — ${target}%`
          : `Entry level — ${target}%`
        : `${target}% access`;
  const subHeading =
    target === null || targetCount === null
      ? `All ${fmtAu(PARTNER_CATALOG_TOTAL)} are yours to redeem.`
      : `${fmtAu(targetCount)} redeemable, ${fmtAu(targetCount - redeemable)} more than now`;

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
        style={{ background: "rgba(6,6,8,.74)", backdropFilter: "blur(7px)" }}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="ta-dc-popup ta-dc-panel ta-dc-panel-gold ta-dc-noscroll relative flex flex-col gap-3.5 overflow-auto overscroll-contain"
        style={{
          padding: 16,
          background: "linear-gradient(150deg,#19150f,#0b0a08 58%,#15101a)",
          border: "1px solid rgba(212,175,55,.5)",
          boxShadow: "0 40px 90px -36px rgba(0,0,0,.92)",
        }}
      >
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span
              className="font-poppins font-black"
              style={{ fontSize: 17, lineHeight: 1.15, letterSpacing: "-.01em", color: "#fff" }}
            >
              {title}
            </span>
            <span
              className="font-sans font-semibold"
              style={{ fontSize: 12, lineHeight: 1.4, color: "rgba(255,255,255,.62)" }}
            >
              {sub}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ta-dc-btn grid flex-none place-items-center"
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.16)",
              background: "rgba(255,255,255,.05)",
              color: "rgba(255,255,255,.7)",
              cursor: "pointer",
            }}
          >
            <X size={17} strokeWidth={2.3} />
          </button>
        </div>

        {target !== null && (
          <div
            className="flex items-end gap-3 pt-3"
            style={{ borderTop: "1px solid rgba(255,255,255,.1)" }}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span
                className="font-sans font-black uppercase"
                style={{ fontSize: 11, lineHeight: 1.2, letterSpacing: ".13em", color: "#f1d99a" }}
              >
                {heading}
              </span>
              <span
                className="font-sans font-semibold"
                style={{
                  fontSize: 11.5,
                  lineHeight: 1.4,
                  color: "rgba(255,255,255,.6)",
                  textWrap: "pretty",
                }}
              >
                {subHeading}
              </span>
              {atTop && (
                <span
                  className="font-sans font-bold"
                  style={{ fontSize: 10.5, lineHeight: 1.4, color: "#f1d99a" }}
                >
                  Top of both — Boss membership and the VIP pack.
                </span>
              )}
            </div>

            <div className="flex flex-none items-center gap-1.5">
              <StepButton
                dir="down"
                enabled={down !== null}
                label={down !== null ? `Back to ${down}%` : "At the lowest step"}
                onClick={() => down !== null && setTarget(down)}
              />
              <StepButton
                dir="up"
                enabled={up !== null}
                label={up !== null ? `Step up to ${up}%` : "Top of the ladder"}
                onClick={() => up !== null && setTarget(up)}
              />
            </div>
          </div>
        )}

        {routes.length > 0 && (
          <DiscountUnlockRoutes routes={routes} compact={!isLgUp} onSelectRoute={onSelectRoute} />
        )}

        {target === null && (
          <button
            type="button"
            onClick={onOpenPortal}
            className="ta-dc-btn flex w-full items-center justify-center gap-2 font-poppins font-black"
            style={{
              height: 48,
              borderRadius: 14,
              border: 0,
              cursor: "pointer",
              fontSize: 13.5,
              background: "linear-gradient(180deg,#f6dd8c,#d4af37 62%,#a87f1d)",
              color: "#221a02",
              boxShadow: "0 14px 30px -12px rgba(212,175,55,.7),inset 0 1px 0 rgba(255,255,255,.4)",
            }}
          >
            <span className="whitespace-nowrap">Open the rewards portal</span>
            <ArrowRight size={15} strokeWidth={2.4} className="flex-none" />
          </button>
        )}
      </div>
    </div>
  );
}

function StepButton({
  dir,
  enabled,
  label,
  onClick,
}: {
  dir: "up" | "down";
  enabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = dir === "up" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      aria-label={label}
      title={label}
      className="ta-dc-btn grid flex-none place-items-center"
      style={{
        width: 38,
        height: 38,
        borderRadius: 11,
        cursor: enabled ? "pointer" : "not-allowed",
        border: `1px solid ${enabled ? "rgba(212,175,55,.55)" : "rgba(255,255,255,.12)"}`,
        background: enabled ? "rgba(212,175,55,.16)" : "rgba(255,255,255,.03)",
        color: enabled ? "#f6dd8c" : "rgba(255,255,255,.28)",
      }}
    >
      <Icon size={17} strokeWidth={2.6} />
    </button>
  );
}
