"use client";
import React, { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { FacebookAdsHealthVerdictTooltip } from "./FacebookAdsHealthVerdictTooltip";
import { LearningStatusPill, LiveStatusPill } from "./FacebookAdsHealthStatusBadges";
import type { PivotRow } from "./FacebookAdsHealthPivotTable";

interface Props {
  rows: PivotRow[];
  level: "campaign" | "adset" | "ad";
}

function levelLabel(level: "campaign" | "adset" | "ad"): string {
  if (level === "campaign") return "Campaign";
  if (level === "adset") return "Ad Set";
  return "Ad";
}

const VERDICT_CHIP: Record<PivotRow["verdict"], string> = {
  scale: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  hold: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  investigate: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  cut: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
};

/**
 * Flat table used when the reporting window is a single day. The pivot table
 * is pointless at 1-day granularity (just 1 day-column + Total), so this
 * variant inlines every metric as its own column for at-a-glance comparison.
 */
export function FacebookAdsHealthFlatTable({ rows, level }: Props) {
  const [hover, setHover] = useState<{ id: string; rect: DOMRect } | null>(null);
  // Grace-period close timer — see FacebookAdsHealthPivotTable for full rationale.
  // Tooltip body is an interactive hover target; the cursor needs a 120ms grace
  // window to cross from trigger chip into the tooltip body.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, []);
  const openHover = (id: string, rect: DOMRect) => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    setHover({ id, rect });
  };
  const scheduleClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setHover(null), 120);
  };
  const cancelClose = () => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
      <table className="w-full border-collapse text-xs min-w-[900px]">
        <thead>
          <tr className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
            <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 min-w-[220px]">{levelLabel(level)}</th>
            <th className="text-left px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Status</th>
            <th className="text-left px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Learning</th>
            <th className="text-right px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Spend</th>
            <th className="text-right px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Conv</th>
            <th className="text-right px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Revenue</th>
            <th className="text-right px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">ROAS</th>
            <th className="text-right px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Link Clicks</th>
            <th className="text-right px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Link CTR</th>
            <th className="text-right px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Cost/LC</th>
            <th className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Verdict</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const linkClicks = row.daily.reduce((s, d) => s + d.linkClicks, 0);
            const impressions = row.daily.reduce((s, d) => s + d.impressions, 0);
            const spendAud = row.window.spendCents / 100;
            const revenueAud = row.window.revenueCents / 100;
            const roas =
              row.window.spendCents > 0 ? row.window.revenueCents / row.window.spendCents : 0;
            const linkCtr = impressions > 0 ? (linkClicks / impressions) * 100 : 0;
            const costPerLinkClick = linkClicks > 0 ? spendAud / linkClicks : 0;
            return (
              <tr key={row.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="px-3 py-2 align-top">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">{row.name}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{row.campaignName}</div>
                </td>
                <td className="px-2 py-2 align-middle">
                  {/* Both pills are per-adset signals; suppress at campaign level */}
                  {level !== "campaign" && <LiveStatusPill status={row.effectiveStatus} />}
                </td>
                <td className="px-2 py-2 align-middle">
                  {level !== "campaign" && <LearningStatusPill status={row.learningStatus} />}
                </td>
                <td className="text-right font-mono px-2 py-2 align-middle">${spendAud.toFixed(0)}</td>
                <td className={`text-right font-mono px-2 py-2 align-middle ${row.window.conversions === 0 ? "text-red-600" : ""}`}>{row.window.conversions}</td>
                <td className="text-right font-mono px-2 py-2 align-middle">${revenueAud.toFixed(0)}</td>
                <td className={`text-right font-mono px-2 py-2 align-middle ${roas < 1 ? "text-red-600" : "text-emerald-600"}`}>{roas.toFixed(2)}</td>
                <td className="text-right font-mono px-2 py-2 align-middle">{linkClicks}</td>
                <td className="text-right font-mono px-2 py-2 align-middle">{linkCtr.toFixed(1)}%</td>
                <td className="text-right font-mono px-2 py-2 align-middle">${costPerLinkClick.toFixed(2)}</td>
                <td className="text-center px-2 py-2 align-middle">
                  <span
                    className={`text-[10px] px-2.5 py-1 rounded font-semibold cursor-help ${VERDICT_CHIP[row.verdict]}`}
                    onMouseEnter={(e) => openHover(row.id, e.currentTarget.getBoundingClientRect())}
                    onMouseLeave={scheduleClose}
                  >
                    {row.verdict === "scale"
                      ? "Scale +20%"
                      : row.verdict === "cut"
                        ? "Cut?"
                        : row.verdict[0]!.toUpperCase() + row.verdict.slice(1)}
                  </span>
                  {hover?.id === row.id && (
                    <FacebookAdsHealthVerdictTooltip
                      verdict={row.verdict}
                      reasons={row.verdictReasons}
                      actionText={row.actionText}
                      anchorRect={hover.rect}
                      onMouseEnter={cancelClose}
                      onMouseLeave={scheduleClose}
                    />
                  )}
                </td>
                <td className="px-2 align-middle">
                  <a href={row.metaAdsManagerUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-blue-600">
                    <ExternalLink size={14} />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
