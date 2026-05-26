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

export function FacebookAdsHealthMobileCards({ rows }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      {rows.map((row) => {
        const max = Math.max(...row.daily.map((d) => d.conversions));
        return (
          <div key={row.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-semibold text-sm">{row.name}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{row.campaignName} · {row.learningStatus}</div>
              </div>
              <a href={row.metaAdsManagerUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400">
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
            <div className="flex justify-between items-center pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
              <span><strong>{row.window.conversions}</strong> conv · Total</span>
              <button onClick={() => setOpenId(openId === row.id ? null : row.id)} className="text-[10px] underline">Why?</button>
            </div>
            {openId === row.id && (
              <div className="mt-2"><FacebookAdsHealthVerdictTooltip verdict={row.verdict} reasons={row.verdictReasons} actionText={row.actionText} /></div>
            )}
          </div>
        );
      })}
    </div>
  );
}
