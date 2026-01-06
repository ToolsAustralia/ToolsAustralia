"use client";

import React from "react";
import type { MajorDrawComparisonData } from "@/types/metrics/MajorDrawComparison";
import { MajorDrawComparisonTable } from "./MajorDrawComparisonTable";
import { MajorDrawComparisonChart } from "./MajorDrawComparisonChart";
import type { ViewMode } from "../shared/ViewSwitcher";

export interface MajorDrawComparisonProps {
  data: MajorDrawComparisonData;
  viewMode: ViewMode;
}

export function MajorDrawComparison({ data, viewMode }: MajorDrawComparisonProps) {
  if (viewMode === "chart") {
    return <MajorDrawComparisonChart data={data} />;
  }

  // Default to table view (side-by-side)
  return <MajorDrawComparisonTable data={data} />;
}

