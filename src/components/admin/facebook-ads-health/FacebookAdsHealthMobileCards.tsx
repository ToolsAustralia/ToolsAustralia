"use client";
import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { PivotRow } from "./FacebookAdsHealthPivotTable";
import { FacebookAdsHealthVerdictTooltip } from "./FacebookAdsHealthVerdictTooltip";

interface Props {
  rows: PivotRow[];
}

function classForCount(count: number, max: number): string {
  if (count === 0 && max > 0) return "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300";
  if (max <= 0) return "bg-zinc-100 dark:bg-zinc-800 text-zinc-500";
  const pct = count / max;
  if (pct >= 0.7) return "bg-blue-600 text-white";
  if (pct >= 0.4) return "bg-blue-400 text-white";
  return "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100";
}

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

export function FacebookAdsHealthMobileCards({ rows }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      {rows.map((row) => {
        const max = row.daily.length ? Math.max(...row.daily.map((d) => d.conversions)) : 0;
        const isOpen = openId === row.id;
        return (
          <div key={row.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3">
            <div className="flex justify-between items-start mb-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm break-words">{row.name}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5 break-words">{row.campaignName} · {row.learningStatus}</div>
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
              {row.daily.slice(-7).map((d) => (
                <div key={d.date} className={`rounded text-center py-1 text-[10px] font-mono font-semibold ${classForCount(d.conversions, max)}`}>{d.conversions}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {row.daily.slice(-7).map((d) => (
                <div key={d.date} className="text-center text-[8px] text-zinc-400 uppercase">{new Date(d.date).toLocaleDateString("en-AU", { weekday: "narrow" })}</div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs gap-2">
              <span className="min-w-0 truncate"><strong>{row.window.conversions}</strong> conv · Total</span>
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
            {isOpen && (
              <div className="mt-2">
                <FacebookAdsHealthVerdictTooltip verdict={row.verdict} reasons={row.verdictReasons} actionText={row.actionText} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
