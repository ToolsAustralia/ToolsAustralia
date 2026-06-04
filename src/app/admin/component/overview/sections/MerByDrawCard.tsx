"use client";

import { Fragment, useMemo, useState } from "react";
import { Gauge, ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { Card, Segmented, PlatformLogo } from "@/components/admin/ui";
import { useMetricsFormatting } from "@/hooks/useMetricsFormatting";
import { useMerByDraw } from "@/hooks/queries/useMerByDraw";
import type { MerAdPlatform, MerDrawRow, MerPlatformBreakdown } from "@/types/admin/mer";
import {
  MER_TOGGLE_OPTIONS,
  MER_DEFAULT_PLATFORM,
  platformShortLabel,
  formatMer,
  platformOf,
  visibleBreakdown,
  sortMerRows,
  type MerSortKey,
} from "./merByDrawModel";

const TZ = "Australia/Sydney";
const MUTED = "text-neutral-300 dark:text-neutral-600";
const AWAITING = "text-2xs text-amber-600/80 dark:text-amber-500/80 font-medium";

function formatPeriod(startISO: string, endISO: string): string {
  const start = formatInTimeZone(new Date(startISO), TZ, "d MMM");
  const end = formatInTimeZone(new Date(endISO), TZ, "d MMM yyyy");
  return `${start} – ${end}`;
}

/** MER ratio colour: ≥2x healthy (green), ≥1x break-even-ish (amber), <1x bleeding (red). */
function merClass(mer: number): string {
  if (mer >= 2) return "text-emerald-600 dark:text-emerald-400";
  if (mer >= 1) return "text-amber-600 dark:text-amber-500";
  return "text-red-600 dark:text-red-500";
}

export default function MerByDrawCard() {
  const { data, isLoading, isError } = useMerByDraw();
  const { formatCurrency } = useMetricsFormatting();

  const [platform, setPlatform] = useState<MerAdPlatform>(MER_DEFAULT_PLATFORM);
  const [sort, setSort] = useState<{ key: MerSortKey; dir: 1 | -1 }>({ key: "period", dir: -1 });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const sorted = useMemo(
    () => sortMerRows(rows, sort.key, sort.dir, platform),
    [rows, sort, platform]
  );

  const platformLabel = platformShortLabel(platform);
  const columns: { key: MerSortKey; label: string; align: "left" | "right" }[] = [
    { key: "period", label: "Period", align: "left" },
    { key: "newRevenue", label: "New Revenue", align: "right" },
    { key: "adSpend", label: "Ad Spend", align: "right" },
    { key: "mer", label: "New MER", align: "right" },
    { key: "platformSpend", label: `Ad Spend (${platformLabel})`, align: "right" },
    { key: "platformMer", label: `New MER (${platformLabel})`, align: "right" },
  ];

  const toggleSort = (key: MerSortKey) =>
    setSort((p) => (p.key === key ? { key, dir: (-p.dir) as 1 | -1 } : { key, dir: -1 }));

  // ── cell renderers ────────────────────────────────────────────────────────
  const spendCell = (b: MerPlatformBreakdown | undefined) => {
    if (!b) return <span className={MUTED}>—</span>;
    if (b.spendStatus === "amount" && b.adSpend != null) {
      return <span className="font-semibold num">{formatCurrency(b.adSpend)}</span>;
    }
    if (b.spendStatus === "awaiting") return <span className={AWAITING}>Awaiting sync</span>;
    return <span className={MUTED}>—</span>; // owned
  };

  const merCell = (mer: number | null) => {
    if (mer == null || !Number.isFinite(mer)) return <span className={MUTED}>—</span>;
    return <span className={`num font-semibold ${merClass(mer)}`}>{formatMer(mer)}</span>;
  };

  const blendedSpendCell = (row: MerDrawRow) =>
    row.adSpend > 0 ? (
      <span className="font-semibold num">{formatCurrency(row.adSpend)}</span>
    ) : (
      <span className={MUTED}>—</span>
    );

  return (
    <Card className="p-5 min-w-0">
      {/* Header — stacks on mobile (title over toggle), side-by-side on ≥sm. The
          shared SectionTitle can't stack its `right` slot, which crushed the title
          on narrow screens, so this card lays the header out itself. */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 flex items-center justify-center">
            <Gauge className="w-4 h-4" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-bold text-[15px] sm:text-base text-neutral-900 dark:text-white leading-tight">
              Marketing Efficiency (MER)
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              New revenue ÷ ad spend, per draw — renewals excluded
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline text-2xs text-neutral-400 uppercase tracking-wide">
            Platform columns
          </span>
          <Segmented<MerAdPlatform>
            options={MER_TOGGLE_OPTIONS}
            value={platform}
            onChange={setPlatform}
            size="sm"
          />
        </div>
      </div>

      {isError ? (
        <p className="py-8 text-center text-sm text-red-600 dark:text-red-500">
          Couldn’t load the MER table. Try refreshing.
        </p>
      ) : isLoading && rows.length === 0 ? (
        <div className="space-y-2 py-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-9 rounded bg-neutral-100 dark:bg-neutral-800/60 animate-pulse"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">No draws to show yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`py-2 px-2 text-2xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 cursor-pointer hover:text-neutral-800 dark:hover:text-neutral-200 select-none ${
                      c.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    <span className={`inline-flex items-center gap-1 ${c.align === "right" ? "flex-row-reverse" : ""}`}>
                      {c.label}
                      {sort.key === c.key &&
                        (sort.dir === 1 ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        ))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const isOpen = expandedId === row.drawId;
                const togglePlatform = platformOf(row, platform);
                return (
                  <Fragment key={row.drawId}>
                    <tr
                      onClick={() => setExpandedId(isOpen ? null : row.drawId)}
                      className="border-b border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-2 text-left">
                        <div className="flex items-center gap-1.5">
                          {isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                          )}
                          <div className="flex flex-col leading-tight min-w-0">
                            <span className="font-medium whitespace-nowrap">
                              {formatPeriod(row.periodStart, row.periodEnd)}
                              {row.inProgress && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 align-middle">
                                  In progress
                                </span>
                              )}
                            </span>
                            <span className="text-2xs text-neutral-400 dark:text-neutral-500 truncate max-w-[18ch]">
                              {row.drawName}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <span className="font-semibold num">{formatCurrency(row.newRevenue)}</span>
                      </td>
                      <td className="py-2.5 px-2 text-right">{blendedSpendCell(row)}</td>
                      <td className="py-2.5 px-2 text-right">{merCell(row.mer)}</td>
                      <td className="py-2.5 px-2 text-right">{spendCell(togglePlatform)}</td>
                      <td className="py-2.5 px-2 text-right">{merCell(togglePlatform?.mer ?? null)}</td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-neutral-50/60 dark:bg-neutral-900/40">
                        <td colSpan={columns.length} className="px-3 py-3">
                          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-neutral-400">
                            Per-platform breakdown
                          </p>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-2xs uppercase tracking-wider text-neutral-400">
                                <th className="text-left font-semibold py-1 px-2">Platform</th>
                                <th className="text-right font-semibold py-1 px-2">New Revenue</th>
                                <th className="text-right font-semibold py-1 px-2">Ad Spend</th>
                                <th className="text-right font-semibold py-1 px-2">New MER</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleBreakdown(row).map(({ display, data: b }) => (
                                <tr
                                  key={display.key}
                                  className="border-t border-neutral-200/60 dark:border-neutral-800/60"
                                >
                                  <td className="py-1.5 px-2 text-left">
                                    <div className="flex items-center gap-2 font-medium">
                                      <PlatformLogo platform={display.logo} />
                                      {display.label}
                                    </div>
                                  </td>
                                  <td className="py-1.5 px-2 text-right num">
                                    {formatCurrency(b.newRevenue)}
                                  </td>
                                  <td className="py-1.5 px-2 text-right">{spendCell(b)}</td>
                                  <td className="py-1.5 px-2 text-right">{merCell(b.mer)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
