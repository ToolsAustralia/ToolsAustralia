"use client";

import React from "react";
import DateRangeToggle, { DateRange } from "@/components/admin/DateRangeToggle";

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

  const inner = (
    <div className="w-full min-w-0 lg:w-auto">
      <DateRangeToggle
        selectedRange={dateRange}
        onRangeChange={onRangeChange}
        onCustomClick={onCustomClick}
        collapsed={false}
        displayDate={displayDate}
        onExpand={() => {}}
        className="w-full"
      />
    </div>
  );

  if (isLayout) {
    return <div className="w-full flex justify-center">{inner}</div>;
  }

  return (
    <div className="sticky top-0 z-30 -mx-4 lg:-mx-6 px-4 lg:px-6 pt-0 pb-3 w-full flex justify-center lg:justify-end">
      {inner}
    </div>
  );
}
