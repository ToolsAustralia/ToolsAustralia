"use client";
import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import { FacebookAdsHealthVerdictTooltip } from "./FacebookAdsHealthVerdictTooltip";

type Metric = "spend" | "conversions" | "revenue" | "roas" | "linkClicks" | "linkCtr" | "costPerLinkClick";

interface DailyCell {
  date: string;
  spendCents: number;
  conversions: number;
  revenueCents: number;
  linkClicks: number;
  impressions: number;
  linkCtr: number;
  costPerLinkClick: number;
  roas: number;
}

export interface PivotRow {
  id: string;
  name: string;
  campaignName: string;
  adsetName?: string;
  learningStatus: "Active" | "Learning" | "LearningLimited" | "Unknown";
  daily: DailyCell[];
  window: { spendCents: number; conversions: number; revenueCents: number };
  lastBudgetChangePct: number | null;
  verdict: "scale" | "hold" | "investigate" | "cut";
  verdictReasons: Array<{ section: string; rule: string; source: "meta" | "tunable"; passed: boolean | "info"; value: string }>;
  actionText: string;
  metaAdsManagerUrl: string;
  snoozedUntil: string | null;
}

function metricValue(cell: DailyCell, metric: Metric): number {
  switch (metric) {
    case "spend": return cell.spendCents / 100;
    case "conversions": return cell.conversions;
    case "revenue": return cell.revenueCents / 100;
    case "roas": return cell.roas;
    case "linkClicks": return cell.linkClicks;
    case "linkCtr": return cell.linkCtr;
    case "costPerLinkClick": return cell.costPerLinkClick / 100;
  }
}

function heatClass(value: number, max: number): string {
  if (value === 0 && max > 0) return "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300";
  if (max <= 0) return "";
  const pct = value / max;
  if (pct >= 0.85) return "bg-blue-700 text-white";
  if (pct >= 0.65) return "bg-blue-500 text-white";
  if (pct >= 0.40) return "bg-blue-300 dark:bg-blue-900 text-blue-900 dark:text-blue-100";
  if (pct >= 0.15) return "bg-blue-100 dark:bg-blue-950 text-blue-900 dark:text-blue-100";
  return "bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100";
}

function formatCell(value: number, metric: Metric): string {
  if (metric === "spend" || metric === "revenue" || metric === "costPerLinkClick") return `$${value.toFixed(0)}`;
  if (metric === "roas") return value.toFixed(2);
  if (metric === "linkCtr") return `${value.toFixed(1)}%`;
  return value.toFixed(0);
}

const STATUS_BADGE: Record<PivotRow["learningStatus"], string> = {
  Active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  Learning: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  LearningLimited: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  Unknown: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const VERDICT_CHIP: Record<PivotRow["verdict"], string> = {
  scale: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  hold: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  investigate: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  cut: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
};

interface Props {
  rows: PivotRow[];
  metric: Metric;
}

export function FacebookAdsHealthPivotTable({ rows, metric }: Props) {
  const [hover, setHover] = useState<{ id: string; rect: DOMRect } | null>(null);
  // Build a UNION of all dates seen across all rows. Using rows[0]?.daily alone
  // breaks when adsets have differing coverage (newer adsets, paused days, etc.) —
  // cells slid left under wrong headers and the totals row misaligned.
  const dateSet = new Set<string>();
  rows.forEach((r) => r.daily.forEach((d) => dateSet.add(d.date)));
  const dates = Array.from(dateSet).sort((a, b) => a.localeCompare(b));
  // Pre-index each row's daily array by date for O(1) per-cell lookup.
  const rowDailyByDate = new Map<string, Map<string, DailyCell>>();
  rows.forEach((r) => {
    const m = new Map<string, DailyCell>();
    r.daily.forEach((d) => m.set(d.date, d));
    rowDailyByDate.set(r.id, m);
  });
  const totalsByDate = dates.map((date) => {
    return rows.reduce((sum, r) => {
      const cell = rowDailyByDate.get(r.id)?.get(date);
      return sum + (cell ? metricValue(cell, metric) : 0);
    }, 0);
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
      <table className="w-full border-collapse text-xs min-w-[900px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-800 text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-700 min-w-[200px]">Adset</th>
            {dates.map((date) => (
              <th key={date} className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-700 min-w-[56px]">
                <div className="font-normal text-[9px] text-zinc-400">{new Date(date).toLocaleDateString("en-AU", { weekday: "short" })}</div>
                <div>{date.slice(5)}</div>
              </th>
            ))}
            <th className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800">Total</th>
            <th className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-700">Verdict</th>
            <th className="border-b border-zinc-200 dark:border-zinc-700"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowDaily = rowDailyByDate.get(row.id) ?? new Map<string, DailyCell>();
            const rowMax = row.daily.length
              ? Math.max(...row.daily.map((d) => metricValue(d, metric)))
              : 0;
            const windowTotal =
              metric === "spend" ? row.window.spendCents / 100 :
              metric === "conversions" ? row.window.conversions :
              metric === "revenue" ? row.window.revenueCents / 100 :
              row.daily.reduce((s, d) => s + metricValue(d, metric), 0);
            return (
              <tr key={row.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="sticky left-0 bg-white dark:bg-zinc-900 px-3 py-2 align-top">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">{row.name}</div>
                  <div className="flex gap-1.5 items-center text-[10px] text-zinc-500 mt-0.5">
                    <span className={`px-1.5 py-px rounded-full text-[9px] font-semibold uppercase ${STATUS_BADGE[row.learningStatus]}`}>{row.learningStatus}</span>
                    <span>{row.campaignName}</span>
                  </div>
                </td>
                {dates.map((date) => {
                  const cell = rowDaily.get(date);
                  if (!cell) {
                    return (
                      <td key={date} className="text-center font-mono text-[11px] text-zinc-300 dark:text-zinc-700">—</td>
                    );
                  }
                  const v = metricValue(cell, metric);
                  return (
                    <td key={date} className={`text-center font-mono font-semibold text-[11px] ${cell.conversions === 0 && metric === "conversions" ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300" : heatClass(v, rowMax)}`}>
                      {formatCell(v, metric)}
                    </td>
                  );
                })}
                <td className="text-right font-mono font-bold px-2 bg-zinc-50 dark:bg-zinc-800">{formatCell(windowTotal, metric)}</td>
                <td className="text-center px-2">
                  <span
                    className={`text-[10px] px-2.5 py-1 rounded font-semibold cursor-help ${VERDICT_CHIP[row.verdict]}`}
                    onMouseEnter={(e) => setHover({ id: row.id, rect: e.currentTarget.getBoundingClientRect() })}
                    onMouseLeave={() => setHover(null)}
                  >
                    {row.verdict === "scale" ? "Scale +20%" : row.verdict === "cut" ? "Cut?" : row.verdict[0]!.toUpperCase() + row.verdict.slice(1)}
                  </span>
                  {hover?.id === row.id && (
                    <FacebookAdsHealthVerdictTooltip
                      verdict={row.verdict}
                      reasons={row.verdictReasons}
                      actionText={row.actionText}
                      anchorRect={hover.rect}
                    />
                  )}
                </td>
                <td className="px-2">
                  <a href={row.metaAdsManagerUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-blue-600">
                    <ExternalLink size={14} />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-zinc-100 dark:bg-zinc-800 font-bold">
            <td className="sticky left-0 bg-zinc-100 dark:bg-zinc-800 px-3 py-2">Totals (visible)</td>
            {totalsByDate.map((t, i) => (
              <td key={i} className="text-center font-mono text-[11px]">{formatCell(t, metric)}</td>
            ))}
            <td className="text-right font-mono px-2">{formatCell(totalsByDate.reduce((a, b) => a + b, 0), metric)}</td>
            <td></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
