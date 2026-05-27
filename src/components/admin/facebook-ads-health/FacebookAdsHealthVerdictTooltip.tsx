"use client";
import React from "react";
import { createPortal } from "react-dom";

interface VerdictReason {
  section: string;
  rule: string;
  source: "meta" | "tunable";
  passed: boolean | "info";
  value: string;
}

interface Props {
  verdict: "scale" | "hold" | "investigate" | "cut";
  reasons: VerdictReason[];
  actionText: string;
  /**
   * Optional anchor — when present, the tooltip portals into document.body and
   * positions itself fixed near the anchor element. This avoids the parent
   * table's overflow:auto from clipping the tooltip or auto-adding scrollbars.
   * When absent (mobile cards), the tooltip renders inline at full container
   * width so it doesn't overflow the parent card.
   */
  anchorRect?: DOMRect | null;
}

const VERDICT_META: Record<Props["verdict"], { label: string; color: string }> = {
  scale: { label: "SCALE +20%", color: "text-emerald-700 dark:text-emerald-300" },
  hold: { label: "HOLD", color: "text-amber-800 dark:text-amber-300" },
  investigate: { label: "INVESTIGATE", color: "text-blue-700 dark:text-blue-300" },
  cut: { label: "CUT?", color: "text-red-700 dark:text-red-300" },
};

const TOOLTIP_WIDTH = 380;
const VIEWPORT_PAD = 12;

/**
 * Compute viewport-clamped fixed position for the portal'd tooltip so it
 * never falls off-screen on any axis.
 */
function clampToViewport(rect: DOMRect): { top: number; left: number; width: number } {
  if (typeof window === "undefined") return { top: 0, left: 0, width: TOOLTIP_WIDTH };
  const width = Math.min(TOOLTIP_WIDTH, window.innerWidth - VIEWPORT_PAD * 2);
  let left = rect.right - width;
  let top = rect.bottom + 4;
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
  if (left + width > window.innerWidth - VIEWPORT_PAD) left = window.innerWidth - VIEWPORT_PAD - width;
  const estimatedHeight = 320;
  if (top + estimatedHeight > window.innerHeight - VIEWPORT_PAD) {
    top = Math.max(VIEWPORT_PAD, rect.top - estimatedHeight - 4);
  }
  return { top, left, width };
}

interface BodyProps {
  verdict: Props["verdict"];
  reasons: VerdictReason[];
  actionText: string;
  /** When set, the tooltip uses this CSS width; otherwise stretches to its container. */
  width?: number | string;
}

function TooltipBody({ verdict, reasons, actionText, width }: BodyProps) {
  const sections = Array.from(new Set(reasons.map((r) => r.section)));
  const style = width !== undefined ? { width: typeof width === "number" ? `${width}px` : width } : undefined;
  return (
    <div
      className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl text-xs [overflow-wrap:anywhere]"
      style={style}
    >
      <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">
        <div className={`font-bold text-[13px] ${VERDICT_META[verdict].color}`}>{VERDICT_META[verdict].label}</div>
      </div>
      {sections.map((section) => (
        <div key={section} className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
          <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">{section}</div>
          {reasons.filter((r) => r.section === section).map((r, idx) => (
            <div key={idx} className="flex items-start gap-2 py-0.5 leading-snug">
              <span className="w-3 text-center shrink-0" aria-hidden>
                {r.passed === true ? <span className="text-emerald-600">✓</span> : r.passed === false ? <span className="text-red-600">✗</span> : <span className="text-zinc-400">·</span>}
              </span>
              <div className="flex-1 min-w-0 text-zinc-800 dark:text-zinc-100">
                <span className="font-medium">{r.rule}:</span>{" "}
                <span className="font-semibold">{r.value}</span>
                <span className={`inline-block ml-1.5 text-[8px] font-bold px-1 py-px rounded ${r.source === "meta" ? "bg-blue-800 text-white" : "bg-zinc-500 text-white"}`}>{r.source === "meta" ? "META" : "TUNABLE"}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
      <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-b-md">
        <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1">What to do next</div>
        <div className="text-zinc-800 dark:text-zinc-100 leading-snug">{actionText}</div>
      </div>
    </div>
  );
}

export function FacebookAdsHealthVerdictTooltip({ verdict, reasons, actionText, anchorRect }: Props) {
  // Portal mode (desktop, hovered chip): position fixed near the anchor in the
  // viewport. SSR-safe via typeof document — no mount-flicker because we don't
  // briefly render the inline body before the portal.
  if (anchorRect) {
    if (typeof document === "undefined") return null;
    const { top, left, width } = clampToViewport(anchorRect);
    return createPortal(
      <div
        className="z-[9999] fixed pointer-events-none"
        style={{ top, left, width }}
      >
        <TooltipBody verdict={verdict} reasons={reasons} actionText={actionText} width="100%" />
      </div>,
      document.body,
    );
  }

  // Inline mode (mobile cards): stretch to fill the parent card. Never let
  // the tooltip be wider than its container — the card has its own padding,
  // so any fixed/viewport width here would overflow it.
  return <TooltipBody verdict={verdict} reasons={reasons} actionText={actionText} width="100%" />;
}
