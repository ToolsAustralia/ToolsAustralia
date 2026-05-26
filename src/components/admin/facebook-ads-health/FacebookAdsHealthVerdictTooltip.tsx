"use client";
import React from "react";

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
}

const VERDICT_META: Record<Props["verdict"], { label: string; color: string }> = {
  scale: { label: "SCALE +20%", color: "text-emerald-700 dark:text-emerald-300" },
  hold: { label: "HOLD", color: "text-amber-800 dark:text-amber-300" },
  investigate: { label: "INVESTIGATE", color: "text-blue-700 dark:text-blue-300" },
  cut: { label: "CUT?", color: "text-red-700 dark:text-red-300" },
};

export function FacebookAdsHealthVerdictTooltip({ verdict, reasons, actionText }: Props) {
  const sections = Array.from(new Set(reasons.map((r) => r.section)));
  return (
    <div className="w-[380px] rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl text-xs">
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
}
