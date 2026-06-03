"use client";

import { createPortal } from "react-dom";
import { DateRangeDropdown } from "@/components/admin/overview/DateRangeDropdown";
import { AdminMobileLayoutDateRangeShell } from "@/app/admin/component/AdminMobileLayoutDateRangeShell";
import { useAdminMobileDateToolbarSlot } from "@/hooks/useAdminMobileDateToolbarSlot";
import CustomDateRangeModal from "./CustomDateRangeModal";
import { useMajorDrawsForDateRange } from "@/hooks/queries/useAdminQueries";
import type { AdminDateFilter } from "@/hooks/useAdminDateFilter";

/**
 * Standard admin date-range toolbar (preset dropdown + custom-range modal), wired
 * to a `useAdminDateFilter` instance. Mirrors the FacebookAds tab's control so all
 * date-filtered admin tabs share one: the dropdown portals into the mobile header
 * slot when present (tab must be in ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR),
 * else renders inline; desktop renders inline. Exactly one of the three renders.
 */
export function AdminDateRangeToolbar({
  filter,
  accent,
}: {
  filter: AdminDateFilter;
  accent?: string;
}) {
  const { isLgUp, slotEl } = useAdminMobileDateToolbarSlot();
  const { data: majorDraws } = useMajorDrawsForDateRange();

  const dropdown = (
    <DateRangeDropdown
      selectedRange={filter.dateRange}
      onRangeChange={filter.handleRangeChange}
      onCustomClick={() => filter.setIsCustomOpen(true)}
      displayDate={filter.displayDate || undefined}
      accent={accent}
    />
  );

  return (
    <>
      {!isLgUp && slotEl
        ? createPortal(<AdminMobileLayoutDateRangeShell>{dropdown}</AdminMobileLayoutDateRangeShell>, slotEl)
        : null}
      {!isLgUp && !slotEl ? (
        <div className="flex-shrink-0 min-w-0 w-full max-w-full">
          <AdminMobileLayoutDateRangeShell>{dropdown}</AdminMobileLayoutDateRangeShell>
        </div>
      ) : null}
      {isLgUp ? <div className="flex-shrink-0 min-w-0 max-w-full sm:w-auto">{dropdown}</div> : null}

      <CustomDateRangeModal
        isOpen={filter.isCustomOpen}
        onClose={() => filter.setIsCustomOpen(false)}
        onApply={(s, e) => filter.applyCustom(s, e)}
        currentStartDate={filter.startDate}
        currentEndDate={filter.endDate}
        majorDraws={majorDraws}
      />
    </>
  );
}
