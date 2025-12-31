"use client";

import React from "react";
import type { MonthlyComparisonData } from "@/types/metrics/MonthlyComparison";
import { MonthlyComparisonTable } from "./MonthlyComparisonTable";
import { MonthlyComparisonChart } from "./MonthlyComparisonChart";
import type { ViewMode } from "../shared/ViewSwitcher";

export interface MonthlyComparisonProps {
  data: MonthlyComparisonData;
  viewMode: ViewMode;
}

export function MonthlyComparison({ data, viewMode }: MonthlyComparisonProps) {
  if (viewMode === "chart") {
    return <MonthlyComparisonChart data={data} />;
  }

  if (viewMode === "side-by-side") {
    return <MonthlyComparisonTable data={data} />;
  }

  // Default to table view
  return <MonthlyComparisonTable data={data} />;
}

