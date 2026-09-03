"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { DateRangeDropdown } from "@/components/admin/overview/DateRangeDropdown";
import { AdminLayoutDateRangeShell } from "@/app/admin/component/AdminLayoutDateRangeShell";
import { useAdminDateToolbarSlot } from "@/hooks/useAdminDateToolbarSlot";
import CustomDateRangeModal from "./CustomDateRangeModal";
import { useMajorDrawsForDateRange } from "@/hooks/queries/useAdminQueries";
import type { AdminDateFilter } from "@/hooks/useAdminDateFilter";

/**
 * THE admin date-range toolbar (preset dropdown + custom-range modal), wired to a
 * `useAdminDateFilter` instance. Every date-filtered admin tab renders this one component —
 * the Overview used to ship its own near-identical `OverviewToolbar`, which is how one surface
 * ended up behaving differently from the other eight.
 *
 * TWO placements, exactly one of which renders:
 *  - slot present → portal into the admin header slot, at EVERY breakpoint. The tab must be in
 *    ADMIN_TABS_WITH_LAYOUT_DATE_TOOLBAR. Always visible for free: the slot lives in the admin
 *    header, ABOVE the `flex-1 overflow-y-auto` scroll container, so it cannot scroll away and
 *    cannot overlay page content.
 *  - slot not yet mounted → inline fallback for that first paint only.
 *
 * Desktop previously rendered inline with `sticky top-0` and negative insets to cancel the
 * scroll container's padding. That is gone: it floated the control over the cards it was meant
 * to sit above, and it had two silent failure modes (a short parent, or any clipping /
 * transform / contain ancestor, either of which un-sticks it with no error). Portalling into
 * the header has neither problem — placement no longer depends on the ancestor chain at all.
 *
 * `leading` renders inline in both placements: a tab with its own controls on that row
 * (TikTok's Ads / Spend-by-URL switch) keeps them in the page body while the dropdown portals
 * to the header.
 */
export function AdminDateRangeToolbar({
  filter,
  accent,
  leading,
}: {
  filter: AdminDateFilter;
  accent?: string;
  /** Controls rendered inline in the page body, where the toolbar sits. */
  leading?: ReactNode;
}) {
  const { slotEl } = useAdminDateToolbarSlot();
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
      {slotEl ? (
        <>
          {createPortal(<AdminLayoutDateRangeShell>{dropdown}</AdminLayoutDateRangeShell>, slotEl)}
          {leading ? <div className="flex flex-wrap items-center gap-2">{leading}</div> : null}
        </>
      ) : (
        <div className="flex flex-col gap-2 min-w-0 w-full max-w-full">
          {leading ? <div className="flex flex-wrap items-center gap-2">{leading}</div> : null}
          <div className="flex-shrink-0 min-w-0 w-full max-w-full">
            <AdminLayoutDateRangeShell>{dropdown}</AdminLayoutDateRangeShell>
          </div>
        </div>
      )}

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
