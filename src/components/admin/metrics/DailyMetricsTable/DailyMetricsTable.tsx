"use client";

import React, { useState, useMemo } from "react";
import type { IDailyMetrics } from "@/types/metrics/DailyMetrics";
import { DailyMetricsTableRow } from "./DailyMetricsTableRow";
import { formatCurrency, formatNumber, formatROAS } from "@/utils/metrics/formatters";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export interface DailyMetricsTableProps {
  metrics: IDailyMetrics[];
  loading?: boolean;
}

type SortColumn = "date" | "adSpend" | "revenue" | "salesCount" | "profit" | "roas" | "conversions";
type SortDirection = "asc" | "desc";

export function DailyMetricsTable({ metrics, loading = false }: DailyMetricsTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedMetrics = useMemo(() => {
    const sorted = [...metrics];
    sorted.sort((a, b) => {
      let aValue: number | Date;
      let bValue: number | Date;

      switch (sortColumn) {
        case "date":
          aValue = new Date(a.date);
          bValue = new Date(b.date);
          break;
        case "adSpend":
          aValue = a.adSpend;
          bValue = b.adSpend;
          break;
        case "revenue":
          aValue = a.revenue;
          bValue = b.revenue;
          break;
        case "salesCount":
          aValue = a.salesCount;
          bValue = b.salesCount;
          break;
        case "profit":
          aValue = a.profit;
          bValue = b.profit;
          break;
        case "roas":
          aValue = a.roas;
          bValue = b.roas;
          break;
        case "conversions":
          aValue = a.conversions;
          bValue = b.conversions;
          break;
        default:
          return 0;
      }

      if (aValue instanceof Date && bValue instanceof Date) {
        return sortDirection === "asc" ? aValue.getTime() - bValue.getTime() : bValue.getTime() - aValue.getTime();
      }

      return sortDirection === "asc" ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number);
    });

    return sorted;
  }, [metrics, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-400" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 ml-1 text-gray-700" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1 text-gray-700" />
    );
  };

  // Calculate totals
  const totals = useMemo(() => {
    return metrics.reduce(
      (acc, metric) => ({
        adSpend: acc.adSpend + metric.adSpend,
        revenue: acc.revenue + metric.revenue,
        salesCount: acc.salesCount + metric.salesCount,
        profit: acc.profit + metric.profit,
        conversions: acc.conversions + metric.conversions,
      }),
      {
        adSpend: 0,
        revenue: 0,
        salesCount: 0,
        profit: 0,
        conversions: 0,
      }
    );
  }, [metrics]);

  const totalROAS = totals.adSpend > 0 ? totals.revenue / totals.adSpend : 0;

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 text-center">
        <p className="text-gray-600">No metrics data available for the selected period.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th
                className="text-left py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => handleSort("date")}
              >
                <div className="flex items-center">
                  Date
                  {getSortIcon("date")}
                </div>
              </th>
              <th
                className="text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => handleSort("adSpend")}
              >
                <div className="flex items-center justify-end">
                  Ad Spend
                  {getSortIcon("adSpend")}
                </div>
              </th>
              <th
                className="text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => handleSort("revenue")}
              >
                <div className="flex items-center justify-end">
                  Revenue
                  {getSortIcon("revenue")}
                </div>
              </th>
              <th
                className="text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => handleSort("salesCount")}
              >
                <div className="flex items-center justify-end">
                  Sales
                  {getSortIcon("salesCount")}
                </div>
              </th>
              <th
                className="text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => handleSort("profit")}
              >
                <div className="flex items-center justify-end">
                  Profit
                  {getSortIcon("profit")}
                </div>
              </th>
              <th
                className="text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => handleSort("roas")}
              >
                <div className="flex items-center justify-end">
                  ROAS
                  {getSortIcon("roas")}
                </div>
              </th>
              <th
                className="text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => handleSort("conversions")}
              >
                <div className="flex items-center justify-end">
                  Conversions
                  {getSortIcon("conversions")}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedMetrics.map((metric) => (
              <DailyMetricsTableRow key={metric._id || new Date(metric.date).toISOString()} metric={metric} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
              <td className="py-3 px-4 text-sm text-gray-900">Total</td>
              <td className="py-3 px-4 text-sm text-right text-gray-900">{formatCurrency(totals.adSpend)}</td>
              <td className="py-3 px-4 text-sm text-right text-gray-900">{formatCurrency(totals.revenue)}</td>
              <td className="py-3 px-4 text-sm text-right text-gray-900">{formatNumber(totals.salesCount)}</td>
              <td
                className={`py-3 px-4 text-sm text-right ${
                  totals.profit >= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {formatCurrency(totals.profit)}
              </td>
              <td className="py-3 px-4 text-sm text-right text-gray-900">{formatROAS(totalROAS)}</td>
              <td className="py-3 px-4 text-sm text-right text-gray-900">{formatNumber(totals.conversions)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

