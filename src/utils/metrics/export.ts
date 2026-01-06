/**
 * Export utilities for metrics data
 */

import type { IDailyMetrics } from "@/types/metrics/DailyMetrics";
import { format } from "date-fns";

export interface ExportOptions {
  filename?: string;
  format?: "csv" | "excel";
}

/**
 * Export daily metrics to CSV
 */
export function exportDailyMetricsToCSV(
  metrics: IDailyMetrics[],
  options: ExportOptions = {}
): void {
  const filename = options.filename || `daily-metrics-${format(new Date(), "yyyy-MM-dd")}.csv`;

  // CSV headers
  const headers = [
    "Date",
    "Ad Spend",
    "Revenue",
    "Sales Count",
    "Profit",
    "ROAS",
    "Conversions",
    "Impressions",
    "Clicks",
    "CTR",
    "CPC",
  ];

  // CSV rows
  const rows = metrics.map((metric) => [
    format(new Date(metric.date), "yyyy-MM-dd"),
    metric.adSpend.toFixed(2),
    metric.revenue.toFixed(2),
    metric.salesCount.toString(),
    metric.profit.toFixed(2),
    metric.roas.toFixed(2),
    metric.conversions.toString(),
    metric.impressions.toString(),
    metric.clicks.toString(),
    metric.ctr.toFixed(2),
    metric.cpc.toFixed(2),
  ]);

  // Combine headers and rows
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  // Create blob and download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export daily metrics to Excel (using CSV format for simplicity)
 * For full Excel support, would need to use exceljs library
 */
export function exportDailyMetricsToExcel(
  metrics: IDailyMetrics[],
  options: ExportOptions = {}
): void {
  // For now, export as CSV (can be opened in Excel)
  // In the future, can use exceljs for proper .xlsx format
  exportDailyMetricsToCSV(metrics, {
    ...options,
    filename: options.filename?.replace(".csv", ".csv") || `daily-metrics-${format(new Date(), "yyyy-MM-dd")}.csv`,
  });
}


