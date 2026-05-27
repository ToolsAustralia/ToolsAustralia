"use client";
import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
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
  campaignId: string;
  campaignName: string;
  adsetId?: string;
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

// Build a YYYY-MM-DD list covering [start..end] inclusive. We string-walk by day
// rather than constructing Date objects so DST transitions and TZ offsets can't
// shift a column off by one — the API and Mongo both speak YYYY-MM-DD strings.
function enumerateDates(startStr: string, endStr: string): string[] {
  if (!startStr || !endStr || endStr < startStr) return [];
  const out: string[] = [];
  let cursor = startStr;
  while (cursor <= endStr) {
    out.push(cursor);
    const d = new Date(cursor + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    cursor = d.toISOString().slice(0, 10);
    if (out.length > 366) break; // safety
  }
  return out;
}

function levelLabel(level: "campaign" | "adset" | "ad"): string {
  if (level === "campaign") return "Campaign";
  if (level === "adset") return "Ad Set";
  return "Ad";
}

interface Props {
  rows: PivotRow[];
  metric: Metric;
  startDate: string;
  endDate: string;
  level: "campaign" | "adset" | "ad";
}

export function FacebookAdsHealthPivotTable({ rows, metric, startDate, endDate, level }: Props) {
  const [hover, setHover] = useState<{ id: string; rect: DOMRect } | null>(null);
  // Collapsed group keys: prefixed "c:<campaignId>" or "a:<adsetId>"
  // Default is everything expanded (empty set).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Date columns reflect the SELECTED range, not the dates with data. A day
  // with no insights still gets a column rendered as "—" so users can see the
  // span they asked for. Falls back to the union of row dates only if range
  // wasn't passed (defensive — should always be passed by the View).
  const dates = useMemo(() => {
    const enumerated = enumerateDates(startDate, endDate);
    if (enumerated.length) return enumerated;
    const set = new Set<string>();
    rows.forEach((r) => r.daily.forEach((d) => set.add(d.date)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [startDate, endDate, rows]);

  // Pre-index each row's daily array by date for O(1) per-cell lookup.
  const rowDailyByDate = useMemo(() => {
    const map = new Map<string, Map<string, DailyCell>>();
    rows.forEach((r) => {
      const m = new Map<string, DailyCell>();
      r.daily.forEach((d) => m.set(d.date, d));
      map.set(r.id, m);
    });
    return map;
  }, [rows]);

  const totalsByDate = useMemo(
    () =>
      dates.map((date) =>
        rows.reduce((sum, r) => {
          const cell = rowDailyByDate.get(r.id)?.get(date);
          return sum + (cell ? metricValue(cell, metric) : 0);
        }, 0),
      ),
    [dates, rows, rowDailyByDate, metric],
  );

  // Group rows by (campaign) when level=adset, by (campaign > adset) when level=ad.
  // At campaign level we render flat — no grouping needed.
  type AdsetGroup = { adsetId: string; adsetName: string; items: PivotRow[] };
  type CampaignGroup = { campaignId: string; campaignName: string; items: PivotRow[]; adsets: AdsetGroup[] };
  const grouped: CampaignGroup[] | null = useMemo(() => {
    if (level === "campaign") return null;
    const byCampaign = new Map<string, CampaignGroup>();
    for (const row of rows) {
      const cid = row.campaignId || "(none)";
      const cname = row.campaignName || "Unknown Campaign";
      let g = byCampaign.get(cid);
      if (!g) {
        g = { campaignId: cid, campaignName: cname, items: [], adsets: [] };
        byCampaign.set(cid, g);
      }
      if (level === "adset") {
        g.items.push(row);
      } else {
        // level === "ad" — nest under adset
        const aid = row.adsetId || "(none)";
        const aname = row.adsetName || "Unknown Ad Set";
        let a = g.adsets.find((x) => x.adsetId === aid);
        if (!a) {
          a = { adsetId: aid, adsetName: aname, items: [] };
          g.adsets.push(a);
        }
        a.items.push(row);
      }
    }
    return Array.from(byCampaign.values());
  }, [rows, level]);

  // Total columns: date columns + first column + Total + Verdict + ExternalLink = dates.length + 4
  const totalColSpan = dates.length + 4;

  const renderDataRow = (row: PivotRow, indentClass: string) => {
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
        <td className={`sticky left-0 bg-white dark:bg-zinc-900 px-3 py-2 align-top ${indentClass}`}>
          <div className="font-semibold text-zinc-900 dark:text-zinc-100">{row.name}</div>
          <div className="flex gap-1.5 items-center text-[10px] text-zinc-500 mt-0.5">
            <span className={`px-1.5 py-px rounded-full text-[9px] font-semibold uppercase ${STATUS_BADGE[row.learningStatus]}`}>{row.learningStatus}</span>
            {level === "ad" && row.adsetName ? <span>{row.adsetName}</span> : <span>{row.campaignName}</span>}
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
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
      <table className="w-full border-collapse text-xs min-w-[900px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-800 text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-700 min-w-[200px]">{levelLabel(level)}</th>
            {dates.map((date) => (
              <th key={date} className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-700 min-w-[56px]">
                <div className="font-normal text-[9px] text-zinc-400">{new Date(date + "T12:00:00Z").toLocaleDateString("en-AU", { weekday: "short" })}</div>
                <div>{date.slice(5)}</div>
              </th>
            ))}
            <th className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800">Total</th>
            <th className="text-center px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-700">Verdict</th>
            <th className="border-b border-zinc-200 dark:border-zinc-700"></th>
          </tr>
        </thead>
        <tbody>
          {grouped ? (
            grouped.map((g) => {
              const ckey = `c:${g.campaignId}`;
              const cCollapsed = collapsed.has(ckey);
              return (
                <React.Fragment key={g.campaignId}>
                  <tr
                    className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onClick={() => toggle(ckey)}
                  >
                    <td colSpan={totalColSpan} className="sticky left-0 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-1.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 select-none">
                      <span className="inline-flex items-center gap-1">
                        {cCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                        <span>{g.campaignName}</span>
                        <span className="text-zinc-400 text-[10px]">
                          · {level === "adset" ? `${g.items.length} ad sets` : `${g.adsets.length} ad sets, ${g.adsets.reduce((s, a) => s + a.items.length, 0)} ads`}
                        </span>
                      </span>
                    </td>
                  </tr>
                  {!cCollapsed && level === "adset" && g.items.map((row) => renderDataRow(row, "pl-6"))}
                  {!cCollapsed && level === "ad" && g.adsets.map((a) => {
                    const akey = `a:${a.adsetId}`;
                    const aCollapsed = collapsed.has(akey);
                    return (
                      <React.Fragment key={a.adsetId}>
                        <tr
                          className="bg-zinc-50/50 dark:bg-zinc-800/30 border-b border-zinc-100 dark:border-zinc-800 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                          onClick={() => toggle(akey)}
                        >
                          <td colSpan={totalColSpan} className="sticky left-0 bg-zinc-50/50 dark:bg-zinc-800/30 px-3 py-1 text-[10px] text-zinc-500 dark:text-zinc-400 select-none pl-6">
                            <span className="inline-flex items-center gap-1">
                              {aCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                              <span>{a.adsetName}</span>
                              <span className="text-zinc-400 text-[10px]">· {a.items.length} ads</span>
                            </span>
                          </td>
                        </tr>
                        {!aCollapsed && a.items.map((row) => renderDataRow(row, "pl-10"))}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })
          ) : (
            rows.map((row) => renderDataRow(row, ""))
          )}
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
