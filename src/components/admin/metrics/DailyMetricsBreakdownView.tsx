"use client";

import React, { useState, useMemo } from "react";
import { DailyMetricsBreakdownTable, type BreakdownItem } from "./DailyMetricsBreakdownTable";
import { useDailyMetricsBreakdown } from "@/hooks/useDailyMetricsBreakdown";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Filter } from "lucide-react";

interface DailyMetricsBreakdownViewProps {
  startDate: Date;
  endDate: Date;
  level: "campaign" | "adset" | "ad";
  onItemSelect?: (item: BreakdownItem, level: "campaign" | "adset" | "ad") => void;
  selectedCampaignId?: string;
  selectedAdsetId?: string;
}

export function DailyMetricsBreakdownView({
  startDate,
  endDate,
  level,
  onItemSelect,
  selectedCampaignId,
  selectedAdsetId,
}: DailyMetricsBreakdownViewProps) {
  const { data: breakdownItems, isLoading, error } = useDailyMetricsBreakdown({
    startDate,
    endDate,
    level,
    campaignId: selectedCampaignId,
    adsetId: selectedAdsetId,
  });

  const handleRowClick = (item: BreakdownItem) => {
    onItemSelect?.(item, level);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
        <Skeleton className="h-10 w-full mb-4" />
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-full mb-2" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <p className="text-red-700">
          Error loading breakdown: {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  if (!breakdownItems || breakdownItems.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 text-center">
        <Filter className="w-12 h-12 mx-auto mb-2 text-gray-400" />
        <p className="text-gray-600">No {level} data available for the selected period.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        {selectedCampaignId && (
          <>
            <span>Campaign Filter</span>
            <ChevronRight className="w-4 h-4" />
          </>
        )}
        {selectedAdsetId && (
          <>
            <span>Adset Filter</span>
            <ChevronRight className="w-4 h-4" />
          </>
        )}
        <span className="font-semibold text-gray-900 capitalize">{level}s</span>
      </div>
      <DailyMetricsBreakdownTable items={breakdownItems} onRowClick={handleRowClick} />
    </div>
  );
}

