"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import DashboardSection from "./DashboardSection";
import { AgeBreakdownTable } from "@/components/admin/metrics/users/AgeBreakdownTable";
import { ProfessionBreakdownTable } from "@/components/admin/metrics/users/ProfessionBreakdownTable";
import { StateBreakdownTable } from "@/components/admin/metrics/users/StateBreakdownTable";
import { useUserMetrics } from "@/hooks/useUserMetrics";

interface UsersBreakdownSectionProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export default function UsersBreakdownSection({
  isExpanded,
  onToggleExpand,
}: UsersBreakdownSectionProps) {
  const { data, isLoading } = useUserMetrics({ enabled: isExpanded });

  return (
    <DashboardSection
      title="Users Breakdown"
      subtitle="Age groups, professions and state across all users"
      collapsible
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      className="shadow-md"
    >
      {isLoading && (
        <div className="flex items-center justify-center py-5 sm:py-6 text-gray-500 dark:text-neutral-400 text-xs sm:text-sm">
          <RefreshCw className="w-6 h-6 sm:w-8 sm:h-8 animate-spin mr-2 shrink-0" />
          <span>Loading breakdown…</span>
        </div>
      )}

      {!isLoading && data && (
        <div className="divide-y divide-gray-200 dark:divide-neutral-800">
          <div className="pb-4">
            <AgeBreakdownTable data={data.ageGroup} bare />
          </div>
          <div className="py-4">
            <StateBreakdownTable data={data.state} bare />
          </div>
          <div className="pt-4">
            <ProfessionBreakdownTable data={data.profession} bare />
          </div>
        </div>
      )}

      {!isLoading && !data && (
        <p className="text-gray-600 dark:text-neutral-400 text-center py-6 text-sm">
          No breakdown data available.
        </p>
      )}
    </DashboardSection>
  );
}
