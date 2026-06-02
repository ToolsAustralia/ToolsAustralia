"use client";

import React from "react";
import type { DateRange } from "@/components/admin/DateRangeToggle";
import { DateRangeDropdown } from "@/components/admin/overview/DateRangeDropdown";

interface OverviewToolbarProps {
  dateRange: DateRange;
  onRangeChange: (range: DateRange) => void;
  onCustomClick: () => void;
  displayDate?: string;
  /**
   * `layout` — rendered in the main column shell under the header (mobile, not in page scroll).
   * `page` — sticky bar inside the overview scroll area (desktop).
   */
  placement?: "page" | "layout";
}

export default function OverviewToolbar({
  dateRange,
  onRangeChange,
  onCustomClick,
  displayDate,
  placement = "page",
}: OverviewToolbarProps) {
  const isLayout = placement === "layout";

  const dropdown = (
    <DateRangeDropdown
      selectedRange={dateRange}
      onRangeChange={onRangeChange}
      onCustomClick={onCustomClick}
      displayDate={displayDate}
    />
  );

  // `layout` (mobile) renders inline inside the admin header, beside the theme
  // toggle — content-sized, not a centered full-width row.
  if (isLayout) {
    return dropdown;
  }

  return (
    <div className="sticky top-0 z-30 -mx-4 lg:-mx-6 px-4 lg:px-6 pt-0 pb-3 w-full flex justify-center lg:justify-end">
      {dropdown}
    </div>
  );
}
