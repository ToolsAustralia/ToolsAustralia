"use client";
import React, { useEffect, useState } from "react";
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
function clampToViewport(rect: DOMRect): { top: number; left: number } {
  if (typeof window === "undefined") return { top: 0, left: 0 };
  const w = Math.min(TOOLTIP_WIDTH, window.innerWidth - VIEWPORT_PAD * 2);
  // Default: position below + right-aligned with the anchor
  let left = rect.right - w;
  let top = rect.bottom + 4;
  // Keep on screen horizontally
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
  if (left + w > window.innerWidth - VIEWPORT_PAD) left = window.innerWidth - VIEWPORT_PAD - w;
  // If the tooltip would overflow the bottom, flip above the anchor
  // (the tooltip can be tall; we don't know exact height, but assume up to 320px)
  const estimatedHeight = 320;
  if (top + estimatedHeight > window.innerHeight - VIEWPORT_PAD) {
    top = Math.max(VIEWPORT_PAD, rect.top - estimatedHeight - 4);
  }
  return { top, left };
}

export function FacebookAdsHealthVerdictTooltip({ verdict, reasons, actionText, anchorRect }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const sections = Array.from(new Set(reasons.map((r) => r.section)));

  const body = (
    <div className="w-[min(380px,calc(100vw-1.5rem))] max-w-[380px] rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl text-xs break-words">
      <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">
        <div className={`font-bold text-[13px] ${VERDICT_META[verdict].color}`}>{VERDICT_META[verdict].label}</div>
      </div>
      {sections.map((section) => (
        <div key={section} className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
          <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">{section}</div>
          {reasons.filter((r) => r.section === section).map((r, idx) => (
            <div key={idx} className="flex items-start gap-2 py-0.5 leading-snug">
              <span className="w-3 text-center" aria-hidden>
                {r.passed === true ? <span className="text-emerald-600">✓</span> : r.passed === false ? <span className="text-red-600">✗</span> : <span className="text-zinc-400">·</span>}
              </span>
              <div className="flex-1 text-zinc-800 dark:text-zinc-100">
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

  // Portal-mounted variant: positioned fixed relative to the anchor rect, so the
  // tooltip escapes any ancestor overflow:auto / scroll boundaries (the pivot
  // table's horizontal scroller in particular).
  if (anchorRect && mounted) {
    const { top, left } = clampToViewport(anchorRect);
    return createPortal(
      <div
        className="z-[9999] fixed pointer-events-none"
        style={{ top, left }}
        // pointer-events-none on the wrapper keeps the underlying chip hoverable;
        // the tooltip body itself doesn't need to be interactive for v1.
      >
        {body}
      </div>,
      document.body,
    );
  }

  // Inline fallback (used by mobile cards, which embed the tooltip in-flow under
  // each card and don't have an overflow-clipping ancestor).
  return body;
}
