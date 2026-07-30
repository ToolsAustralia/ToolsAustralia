"use client";

import React from "react";
import { cn } from "@/utils/cn";

/**
 * The draw-night ribbon: the one strip an admin watches while a draw runs.
 *
 * Dark in BOTH themes (--ribbon is #101828 light / #000 dark), so its internals
 * use the fixed --ribbon-* tokens rather than the themed palette.
 *
 * A stat's `sub` is optional on purpose. The design shows "+2,714 in 24 h" under
 * Entries, but no 24-hour delta exists in the data — omitting the line is
 * correct; inventing the number would be a fabricated figure on an ops screen.
 */
export interface RibbonStat {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "positive" | "urgent";
}

export default function DrawStatusRibbon({
  eyebrow,
  title,
  subtitle,
  stats,
  progressPercent,
  actions,
  utility,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  stats: RibbonStat[];
  /** 0–100. The red→amber bar along the bottom. */
  progressPercent: number;
  /**
   * Full-width CTAs. Rendered only at `draws:` and up — below the breakpoint the
   * pinned bottom action bar carries them, and repeating them here would give a
   * secondary action a full-width row at the top of a phone screen.
   */
  actions?: React.ReactNode;
  /**
   * Compact icon-only control pinned to the header's top-right. Mobile's
   * quick-access affordance for a secondary action (e.g. Export pool) that does
   * not deserve a labelled row of its own.
   */
  utility?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[14px] bg-[var(--ribbon)] px-[18px] pb-0 pt-[14px]">
      <div className="flex flex-col gap-[12px] draws:flex-row draws:items-start draws:justify-between">
        <div className="flex items-start justify-between gap-[10px] draws:min-w-0 draws:block">
          <div className="min-w-0">
            <div className="flex items-center gap-[7px]">
              <span className="h-[8px] w-[8px] shrink-0 rounded-full bg-[var(--ribbon-dot)]" aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#98a2b3]">{eyebrow}</span>
            </div>
            <h2 className="mt-[6px] font-poppins text-[22px] font-bold leading-[1.15] tracking-[-.02em] text-[var(--ribbonText)] draws:text-[26px]">
              {title}
            </h2>
            <p className="mt-[4px] text-[12.5px] leading-[1.5] text-[#98a2b3]">{subtitle}</p>
          </div>

          {utility && <div className="shrink-0 draws:hidden">{utility}</div>}
        </div>

        {actions && (
          <div className="hidden shrink-0 gap-[8px] draws:flex draws:flex-row draws:items-center">{actions}</div>
        )}
      </div>

      {/* Four-stat strip with hairline dividers. */}
      <div className="mt-[14px] grid grid-cols-2 draws:grid-cols-4">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={cn(
              "min-w-0 py-[12px]",
              i % 2 === 1 && "border-l border-[var(--ribbon-divider)] pl-[14px]",
              i >= 2 && "border-t border-[var(--ribbon-divider)]",
              i % 4 !== 0 && "draws:border-l draws:border-[var(--ribbon-divider)] draws:pl-[14px]",
              "draws:border-t-0"
            )}
          >
            <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#98a2b3]">{stat.label}</div>
            <div
              data-figure
              className={cn(
                "mt-[3px] font-poppins text-[20px] font-bold leading-none tracking-[-.02em]",
                stat.tone === "positive"
                  ? "text-[var(--ribbon-pos)]"
                  : stat.tone === "urgent"
                    ? "text-[var(--ribbon-neg)]"
                    : "text-white"
              )}
            >
              {stat.value}
            </div>
            {stat.sub && <div className="mt-[3px] text-[11px] text-[#98a2b3]">{stat.sub}</div>}
          </div>
        ))}
      </div>

      {/* Progress toward the draw: 4px track, red→amber fill. */}
      <div
        className="h-[4px] w-full bg-[var(--ribbon-track)]"
        role="progressbar"
        aria-valuenow={Math.round(progressPercent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progress toward draw"
      >
        <div
          className="h-full bg-gradient-to-r from-[#ee0000] to-[#fbbf24] transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
    </section>
  );
}
