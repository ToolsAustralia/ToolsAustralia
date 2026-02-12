"use client";

import React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { formatCurrency, formatNumber, formatROAS } from "@/utils/metrics/formatters";

export interface BreakdownItem {
  id: string;
  name: string;
  adSpend: number;
  revenue: number;
  profit: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
}

interface DailyMetricsBreakdownTableProps {
  items: BreakdownItem[];
  loading?: boolean;
  onRowClick?: (item: BreakdownItem) => void;
}

type SortColumn = "name" | "adSpend" | "revenue" | "profit" | "roas" | "conversions";
type SortDirection = "asc" | "desc";

export function DailyMetricsBreakdownTable({
  items,
  loading = false,
  onRowClick,
}: DailyMetricsBreakdownTableProps) {
  const [sortColumn, setSortColumn] = React.useState<SortColumn>("revenue");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");

  const sortedItems = React.useMemo(() => {
    const sorted = [...items];
    sorted.sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      switch (sortColumn) {
        case "name":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case "adSpend":
          aValue = a.adSpend;
          bValue = b.adSpend;
          break;
        case "revenue":
          aValue = a.revenue;
          bValue = b.revenue;
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

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }

      return sortDirection === "asc" ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number);
    });

    return sorted;
  }, [items, sortColumn, sortDirection]);

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
  const totals = React.useMemo(() => {
    return items.reduce(
      (acc, item) => ({
        adSpend: acc.adSpend + item.adSpend,
        revenue: acc.revenue + item.revenue,
        profit: acc.profit + item.profit,
        conversions: acc.conversions + item.conversions,
      }),
      {
        adSpend: 0,
        revenue: 0,
        profit: 0,
        conversions: 0,
      }
    );
  }, [items]);

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

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 text-center">
        <p className="text-gray-600">No breakdown data available for the selected period.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 sm:p-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th
                className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-left py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center">
                  Name
                  {getSortIcon("name")}
                </div>
              </th>
              <th
                className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => handleSort("adSpend")}
              >
                <div className="flex items-center justify-end">
                  Ad Spend
                  {getSortIcon("adSpend")}
                </div>
              </th>
              <th
                className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => handleSort("revenue")}
              >
                <div className="flex items-center justify-end">
                  Revenue
                  {getSortIcon("revenue")}
                </div>
              </th>
              <th
                className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => handleSort("profit")}
              >
                <div className="flex items-center justify-end">
                  Profit
                  {getSortIcon("profit")}
                </div>
              </th>
              <th
                className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                onClick={() => handleSort("roas")}
              >
                <div className="flex items-center justify-end">
                  ROAS
                  {getSortIcon("roas")}
                </div>
              </th>
              <th
                className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-right py-3 px-4 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors select-none"
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
            {sortedItems.map((item) => (
              <tr
                key={item.id}
                className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  onRowClick ? "cursor-pointer" : ""
                }`}
                onClick={() => onRowClick?.(item)}
              >
                <td className="py-3 px-4 text-xs sm:text-sm text-gray-900 font-medium">{item.name}</td>
                <td className="py-3 px-4 text-xs sm:text-sm text-right text-gray-900">{formatCurrency(item.adSpend)}</td>
                <td className="py-3 px-4 text-xs sm:text-sm text-right text-gray-900 font-semibold">
                  {formatCurrency(item.revenue)}
                </td>
                <td
                  className={`py-3 px-4 text-xs sm:text-sm text-right font-semibold ${
                    item.profit >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {formatCurrency(item.profit)}
                </td>
                <td className="py-3 px-4 text-xs sm:text-sm text-right text-gray-900">{formatROAS(item.roas)}</td>
                <td className="py-3 px-4 text-xs sm:text-sm text-right text-gray-900">{formatNumber(item.conversions)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
              <td className="py-3 px-4 text-sm text-gray-900">Total</td>
              <td className="py-3 px-4 text-sm text-right text-gray-900">{formatCurrency(totals.adSpend)}</td>
              <td className="py-3 px-4 text-sm text-right text-gray-900">{formatCurrency(totals.revenue)}</td>
              <td
                className={`py-3 px-4 text-sm text-right ${totals.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}
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


