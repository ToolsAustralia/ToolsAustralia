"use client";

import React, { useState } from "react";
import { Download } from "lucide-react";
import type { IDailyMetrics } from "@/types/metrics/DailyMetrics";
import { exportDailyMetricsToCSV, exportDailyMetricsToExcel } from "@/utils/metrics/export";

export interface ExportButtonProps {
  data: IDailyMetrics[];
  filename?: string;
  format?: "csv" | "excel";
}

export function ExportButton({ data, filename, format = "csv" }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (data.length === 0) {
      alert("No data to export");
      return;
    }

    setIsExporting(true);
    try {
      if (format === "excel") {
        exportDailyMetricsToExcel(data, { filename });
      } else {
        exportDailyMetricsToCSV(data, { filename });
      }
    } catch (error) {
      console.error("Export error:", error);
      alert("Failed to export data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting || data.length === 0}
      className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
    >
      <Download className="w-4 h-4" />
      {isExporting ? "Exporting..." : `Export ${format.toUpperCase()}`}
    </button>
  );
}


