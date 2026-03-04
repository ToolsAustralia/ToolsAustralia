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
    if (sortColumn !== col) return <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />;
    return sortOrder === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />;
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading...</div>;
  }

  if (rows.length === 0) {
    return <div className="p-8 text-center text-gray-500">{emptyMessage}</div>;
  }

  const cellPad = "p-1.5 sm:p-2 md:p-3";
  const textSize = "text-xs sm:text-sm";

  return (
    <div className="overflow-x-auto -mx-1 sm:mx-0">
      <table className={`w-full min-w-[360px] ${textSize}`}>
        <thead className="bg-gray-50">
          <tr>
            {showSourceColumn && (
              <th className={`text-left ${cellPad} font-semibold text-gray-700 whitespace-nowrap`}>Channel</th>
            )}
            <th className={`text-left ${cellPad} font-semibold text-gray-700 min-w-[100px]`}>Campaign</th>
            <th className={`text-left ${cellPad} font-semibold text-gray-700 whitespace-nowrap`}>Medium</th>
            <th className={`text-right ${cellPad} font-semibold whitespace-nowrap`}>
              <button onClick={() => handleSort("visits")} className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600">
                Visits {getSortIcon("visits")}
              </button>
            </th>
            <th className={`text-right ${cellPad} font-semibold whitespace-nowrap`}>
              <button onClick={() => handleSort("signups")} className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600">
                Signups {getSortIcon("signups")}
              </button>
            </th>
            <th className={`text-right ${cellPad} font-semibold whitespace-nowrap`}>
              <button onClick={() => handleSort("conversions")} className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600">
                Conv {getSortIcon("conversions")}
              </button>
            </th>
            <th className={`text-right ${cellPad} font-semibold whitespace-nowrap`}>
              <button onClick={() => handleSort("revenue")} className="flex items-center justify-end gap-0.5 sm:gap-1 w-full hover:text-red-600">
                Rev {getSortIcon("revenue")}
              </button>
            </th>
            <th className={`hidden md:table-cell text-right ${cellPad} font-semibold whitespace-nowrap`}>V→S</th>
            <th className={`hidden md:table-cell text-right ${cellPad} font-semibold whitespace-nowrap`}>S→C</th>
            <th className={`hidden md:table-cell text-right ${cellPad} font-semibold whitespace-nowrap`}>Conv</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => {
            const key = `${row.utmSource ?? ""}-${row.utmMedium}-${row.utmCampaign}-${i}`;
            return (
              <tr key={key} className="border-t border-gray-100 hover:bg-gray-50">
                {showSourceColumn && (
                  <td className={cellPad}>
                    <span
                      className={`inline-block px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap ${
                        row.utmSource === "Direct"
                          ? "bg-gray-100 text-gray-700"
                          : "bg-indigo-100 text-indigo-800"
                      }`}
                    >
                      {row.utmSource}
                    </span>
                  </td>
                )}
                <td className={`${cellPad} font-medium text-gray-900 break-words`} title={formatCampaignDisplay(row.utmCampaign)}>
                  {formatCampaignDisplay(row.utmCampaign)}
                </td>
                <td className={cellPad}>
                  <span
                    className={`inline-block px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap ${
                      row.utmMedium?.toLowerCase() === "email"
                        ? "bg-blue-100 text-blue-800"
                        : row.utmMedium?.toLowerCase() === "sms"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {formatMediumDisplay(row.utmMedium)}
                  </span>
                </td>
                <td className={`${cellPad} text-right font-mono tabular-nums`}>{formatNumber(row.visits)}</td>
                <td className={`${cellPad} text-right font-mono tabular-nums`}>{formatNumber(row.signups)}</td>
                <td className={`${cellPad} text-right font-mono tabular-nums`}>{formatNumber(row.conversions)}</td>
                <td className={`${cellPad} text-right font-mono tabular-nums`}>{formatCurrency(row.revenue)}</td>
                <td className={`hidden md:table-cell ${cellPad} text-right text-gray-600 tabular-nums`}>{formatPercentage(row.visitToSignupRate)}</td>
                <td className={`hidden md:table-cell ${cellPad} text-right text-gray-600 tabular-nums`}>{formatPercentage(row.signupToConversionRate)}</td>
                <td className={`hidden md:table-cell ${cellPad} text-right text-gray-600 tabular-nums`}>{formatPercentage(row.overallConversionRate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
