"use client";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import { formatCell, heatClass, metricValue, type Metric, type PivotRow } from "./FacebookAdsHealthPivotTable";
import { FacebookAdsHealthVerdictTooltip } from "./FacebookAdsHealthVerdictTooltip";
import { LearningStatusPill, LiveStatusPill } from "./FacebookAdsHealthStatusBadges";

interface Props {
  rows: PivotRow[];
  level: "campaign" | "adset" | "ad";
  metric: Metric;
}

const METRIC_LABEL: Record<Metric, string> = {
  spend: "spend",
  conversions: "conv",
  revenue: "revenue",
  roas: "ROAS",
  linkClicks: "link clicks",
  linkCtr: "link CTR",
  costPerLinkClick: "cost/lc",
};

const VERDICT_CHIP: Record<PivotRow["verdict"], string> = {
  scale: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  hold: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  investigate: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  cut: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
};

function verdictLabel(verdict: PivotRow["verdict"]): string {
  if (verdict === "scale") return "Scale +20%";
  if (verdict === "cut") return "Cut?";
  return verdict[0]!.toUpperCase() + verdict.slice(1);
}

export function FacebookAdsHealthMobileCards({ rows, level, metric }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openRow = openId ? rows.find((r) => r.id === openId) ?? null : null;

  // Body scroll lock + Esc close while the verdict sheet is open. Same drawer
  // contract used elsewhere in the codebase.
  useEffect(() => {
    if (!openRow) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [openRow]);

  return (
    <div className="grid gap-3">
      {rows.map((row) => {
        // Per-row max across visible daily cells, computed in the SELECTED
        // metric — was hardcoded to conversions, which made the sparkline
        // heatmap ignore the user's metric pick and always show conv intensity.
        const max = row.daily.length ? Math.max(...row.daily.map((d) => metricValue(d, metric))) : 0;
        // Window total in the selected metric. For ratio metrics (ROAS, CTR,
        // cost-per-link-click) we derive from component sums rather than
        // averaging the daily ratios — same weighted-aggregation rule as the
        // pivot table's footer.
        const totalSpendCents = row.daily.reduce((s, d) => s + d.spendCents, 0);
        const totalRevenueCents = row.daily.reduce((s, d) => s + d.revenueCents, 0);
        const totalLinkClicks = row.daily.reduce((s, d) => s + d.linkClicks, 0);
        const totalImpressions = row.daily.reduce((s, d) => s + d.impressions, 0);
        const windowTotal =
          metric === "spend" ? totalSpendCents / 100 :
          metric === "conversions" ? row.window.conversions :
          metric === "revenue" ? totalRevenueCents / 100 :
          metric === "linkClicks" ? totalLinkClicks :
          metric === "roas" ? (totalSpendCents > 0 ? totalRevenueCents / totalSpendCents : 0) :
          metric === "linkCtr" ? (totalImpressions > 0 ? (totalLinkClicks / totalImpressions) * 100 : 0) :
          /* costPerLinkClick */ (totalLinkClicks > 0 ? totalSpendCents / totalLinkClicks / 100 : 0);
        const isOpen = openId === row.id;
        return (
          <div key={row.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3">
            <div className="flex justify-between items-start mb-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm break-words">{row.name}</div>
                {level !== "campaign" && (
                  <div className="flex flex-wrap gap-1 items-center mt-0.5">
                    <LiveStatusPill status={row.effectiveStatus} />
                    <LearningStatusPill status={row.learningStatus} />
                  </div>
                )}
                <div className="text-[10px] text-zinc-500 mt-0.5 break-words">
                  {level === "ad" && row.adsetName ? `${row.adsetName} · ${row.campaignName}` : row.campaignName}
                </div>
              </div>
              <a
                href={row.metaAdsManagerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 shrink-0 ml-2"
                aria-label="Open in Meta Ads Manager"
              >
                <ExternalLink size={14} />
              </a>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {row.daily.slice(-7).map((d) => {
                const v = metricValue(d, metric);
                return (
                  <div key={d.date} className={`rounded text-center py-1 text-[10px] font-mono font-semibold ${heatClass(v, max)}`}>
                    {formatCell(v, metric)}
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {row.daily.slice(-7).map((d) => (
                <div key={d.date} className="text-center uppercase leading-tight">
                  {/* Two-line stacked label: narrow weekday on top, day-of-month
                      below. Before this each cell only showed the weekday letter
                      (T/F/S/S/M/T/W) and users couldn't tell which date it was —
                      especially confusing across DST transitions or month rollovers. */}
                  <div className="text-[8px] text-zinc-400">{new Date(d.date + "T12:00:00Z").toLocaleDateString("en-AU", { weekday: "narrow" })}</div>
                  <div className="text-[9px] font-semibold text-zinc-500 dark:text-zinc-400 font-mono">{d.date.slice(8, 10)}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs gap-2">
              <span className="min-w-0 truncate"><strong>{formatCell(windowTotal, metric)}</strong> {METRIC_LABEL[metric]} · Total</span>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : row.id)}
                className={`text-[10px] px-2.5 py-1 rounded font-semibold cursor-pointer transition-opacity ${VERDICT_CHIP[row.verdict]} ${isOpen ? "ring-2 ring-zinc-400 dark:ring-zinc-500" : "hover:opacity-80"}`}
                aria-expanded={isOpen}
                aria-label={`${verdictLabel(row.verdict)} — tap to ${isOpen ? "hide" : "see"} reasoning`}
              >
                {verdictLabel(row.verdict)}
              </button>
            </div>
          </div>
        );
      })}

      {/* Verdict reasoning sheet — slides up from bottom over the cards. MUST be
          portaled to document.body to escape any sticky/backdrop-blur ancestors
          that would clip a `fixed` element. Max-height 80vh + internal scroll so
          long reason lists don't force the whole page to scroll. */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {openRow && (
              <div className="fixed inset-0 z-[110]">
                <motion.div
                  className="absolute inset-0 bg-black/50"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setOpenId(null)}
                  aria-hidden
                />
                <motion.div
                  className="absolute left-0 right-0 bottom-0 max-h-[80vh] bg-white dark:bg-neutral-900 rounded-t-2xl shadow-2xl flex flex-col"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  role="dialog"
                  aria-label="Verdict reasoning"
                  aria-modal="true"
                >
                  {/* Drag-handle visual cue + sticky header with close button */}
                  <div className="pt-2 pb-1 flex justify-center">
                    <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden />
                  </div>
                  <div className="px-4 pb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm break-words">{openRow.name}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 break-words">{openRow.campaignName}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenId(null)}
                      className="p-1.5 -m-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                      aria-label="Close"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="overflow-y-auto px-3 pb-4">
                    <FacebookAdsHealthVerdictTooltip
                      verdict={openRow.verdict}
                      reasons={openRow.verdictReasons}
                      actionText={openRow.actionText}
                    />
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
