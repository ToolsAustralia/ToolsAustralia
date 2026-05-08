"use client";

import React, { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { formatNumber, formatPercentage, formatCurrency } from "@/utils/metrics/formatters";
import { formatCampaignDisplay, formatMediumDisplay } from "@/utils/promo-analytics/display-formatters";

interface CampaignRow {
  utmSource?: string;
  utmMedium: string;
  utmCampaign: string;
  visits: number;
  signups: number;
  conversions: number;
  revenue: number;
  visitToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
}

type SortableColumn = "visits" | "signups" | "conversions" | "revenue";

interface UTMCampaignBreakdownTableProps {
  rows: CampaignRow[];
  loading?: boolean;
  emptyMessage?: string;
  showSourceColumn?: boolean;
}

export default function UTMCampaignBreakdownTable({
  rows,
  loading = false,
  emptyMessage = "No campaign data for this period.",
  showSourceColumn = true,
}: UTMCampaignBreakdownTableProps) {
  const [sortColumn, setSortColumn] = useState<SortableColumn>("visits");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });
    return arr;
  }, [rows, sortColumn, sortOrder]);

  const handleSort = (col: SortableColumn) => {
    if (sortColumn === col) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortOrder("desc");
    }
  };

  const getSortIcon = (col: SortableColumn) => {
    if (sortColumn !== col)
      return <ArrowUpDown className="w-3.5 h-3.5 opacity-50 text-gray-500 dark:text-neutral-500 shrink-0" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
    );
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500 dark:text-neutral-400">Loading...</div>;
  }

  if (rows.length === 0) {
    return <div className="p-8 text-center text-gray-500 dark:text-neutral-400">{emptyMessage}</div>;
  }

  const cellPad = "p-1.5 sm:p-2 md:p-3";
  const textSize = "text-xs sm:text-sm";

  return (
    <div className="overflow-x-auto -mx-1 sm:mx-0">
      <table className={`w-full min-w-[360px] ${textSize}`}>
        <thead className="bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700">
          <tr>
            {showSourceColumn && (
              <th
                className={`text-left ${cellPad} font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap`}
              >
                Channel
              </th>
            )}
            <th
              className={`text-left ${cellPad} font-semibold text-gray-800 dark:text-neutral-100 min-w-[100px]`}
            >
              Campaign
            </th>
            <th
              className={`text-left ${cellPad} font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap`}
            >
              Medium
            </th>
            <th
              className={`text-right ${cellPad} font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap`}
            >
              <button
                onClick={() => handleSort("visits")}
                className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
              >
                Visits {getSortIcon("visits")}
              </button>
            </th>
            <th
              className={`text-right ${cellPad} font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap`}
            >
              <button
                onClick={() => handleSort("signups")}
                className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
              >
                Signups {getSortIcon("signups")}
              </button>
            </th>
            <th
              className={`text-right ${cellPad} font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap`}
            >
              <button
                onClick={() => handleSort("conversions")}
                className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
              >
                Conv {getSortIcon("conversions")}
              </button>
            </th>
            <th
              className={`text-right ${cellPad} font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap`}
            >
              <button
                onClick={() => handleSort("revenue")}
                className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600 dark:hover:text-red-400"
              >
                Rev {getSortIcon("revenue")}
              </button>
            </th>
            <th
              className={`hidden md:table-cell text-right ${cellPad} font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap`}
            >
              V→S
            </th>
            <th
              className={`hidden md:table-cell text-right ${cellPad} font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap`}
            >
              S→C
            </th>
            <th
              className={`hidden md:table-cell text-right ${cellPad} font-semibold text-gray-800 dark:text-neutral-100 whitespace-nowrap`}
            >
              Conv
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => {
            const key = `${row.utmSource ?? ""}-${row.utmMedium}-${row.utmCampaign}-${i}`;
            return (
              <tr
                key={key}
                className="border-t border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800/60"
              >
                {showSourceColumn && (
                  <td className={cellPad}>
                    <span
                      className={`inline-block px-1.5 sm:px-2 py-0.5 rounded text-2xs sm:text-xs font-medium whitespace-nowrap ${
                        row.utmSource === "Direct"
                          ? "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 border border-gray-200/80 dark:border-neutral-600"
                          : "bg-indigo-100 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/50"
                      }`}
                    >
                      {row.utmSource}
                    </span>
                  </td>
                )}
                <td
                  className={`${cellPad} font-medium text-gray-900 dark:text-white break-words`}
                  title={formatCampaignDisplay(row.utmCampaign)}
                >
                  {formatCampaignDisplay(row.utmCampaign)}
                </td>
                <td className={cellPad}>
                  <span
                    className={`inline-block px-1.5 sm:px-2 py-0.5 rounded text-2xs sm:text-xs font-medium whitespace-nowrap ${
                      row.utmMedium?.toLowerCase() === "email"
                        ? "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/50"
                        : row.utmMedium?.toLowerCase() === "sms"
                          ? "bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-300 border border-green-200/80 dark:border-green-800/50"
                          : "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 border border-gray-200/80 dark:border-neutral-600"
                    }`}
                  >
                    {formatMediumDisplay(row.utmMedium)}
                  </span>
                </td>
                <td
                  className={`${cellPad} text-right font-mono text-gray-900 dark:text-white tabular-nums`}
                >
                  {formatNumber(row.visits)}
                </td>
                <td
                  className={`${cellPad} text-right font-mono text-gray-900 dark:text-white tabular-nums`}
                >
                  {formatNumber(row.signups)}
                </td>
                <td
                  className={`${cellPad} text-right font-mono text-gray-900 dark:text-white tabular-nums`}
                >
                  {formatNumber(row.conversions)}
                </td>
                <td
                  className={`${cellPad} text-right font-mono text-gray-900 dark:text-white tabular-nums`}
                >
                  {formatCurrency(row.revenue)}
                </td>
                <td className={`hidden md:table-cell ${cellPad} text-right text-gray-600 dark:text-neutral-400 tabular-nums`}>{formatPercentage(row.visitToSignupRate)}</td>
                <td className={`hidden md:table-cell ${cellPad} text-right text-gray-600 dark:text-neutral-400 tabular-nums`}>{formatPercentage(row.signupToConversionRate)}</td>
                <td className={`hidden md:table-cell ${cellPad} text-right text-gray-600 dark:text-neutral-400 tabular-nums`}>{formatPercentage(row.overallConversionRate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
