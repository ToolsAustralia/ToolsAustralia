"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { DateRangeDropdown } from "@/components/admin/overview/DateRangeDropdown";
import { AdminMobileLayoutDateRangeShell } from "@/app/admin/component/AdminMobileLayoutDateRangeShell";
import { useAdminMobileDateToolbarSlot } from "@/hooks/useAdminMobileDateToolbarSlot";
import CustomDateRangeModal from "./CustomDateRangeModal";
import { useMajorDrawsForDateRange } from "@/hooks/queries/useAdminQueries";
import type { AdminDateFilter } from "@/hooks/useAdminDateFilter";

/**
 * THE admin date-range toolbar (preset dropdown + custom-range modal), wired to a
 * `useAdminDateFilter` instance. Every date-filtered admin tab renders this one component —
 * the Overview used to ship its own near-identical `OverviewToolbar`, which is how one surface
 * ended up sticky and the other eight did not.
 *
 * Three mutually exclusive placements, exactly one of which renders:
 *  - mobile + slot present → portal into the header slot (tab must be in
 *    ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR). Always visible for free: the slot lives in
 *    the admin header, ABOVE the scroll container.
 *  - mobile, slot not yet mounted → inline fallback for that first paint.
 *  - desktop → inline, and STICKY (see below).
 *
 * Desktop stickiness: `sticky top-0` pins the control to the top of the admin scroll container
 * (`AdminPage.tsx`, the `flex-1 overflow-y-auto` pane) so the filter stays reachable on these
 * very long analytics pages instead of scrolling away. The negative inset margins cancel that
 * container's `p-4 lg:p-6` so the pinned bar's backdrop covers the full content width and rows
 * scroll UNDER it rather than beside it.
 *
 * ⚠️ TWO ways to silently lose the stickiness, both of which look fine in review:
 *
 *  1. **A short parent.** A sticky element can only travel within its own parent's box, so
 *     wrapping this in a `<div className="flex justify-end">` sized to the control pins it to
 *     nothing. Render it as a DIRECT child of the tab's root scroll-height element.
 *  2. **A clipping/containing ancestor.** `overflow` other than `visible`, or any
 *     `transform` / `filter` / `contain`, re-parents the sticky and it scrolls away.
 *
 * Neither throws. Verify visually when adding this to a new tab.
 *
 * `leading` exists so a tab with its own controls on that row (TikTok's Ads / Spend-by-URL
 * switch) puts them INSIDE the sticky bar instead of wrapping the whole row in a short parent
 * and defeating rule 1. On mobile `leading` renders inline while the dropdown portals away.
 */
export function AdminDateRangeToolbar({
  filter,
  accent,
  leading,
}: {
  filter: AdminDateFilter;
  accent?: string;
  /** Controls rendered at the left of the sticky bar, sharing its row. */
  leading?: ReactNode;
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
      {!isLgUp && slotEl ? (
        <>
          {createPortal(
            <AdminMobileLayoutDateRangeShell>{dropdown}</AdminMobileLayoutDateRangeShell>,
            slotEl,
          )}
          {leading ? <div className="flex flex-wrap items-center gap-2">{leading}</div> : null}
        </>
      ) : null}
      {!isLgUp && !slotEl ? (
        <div className="flex flex-col gap-2 min-w-0 w-full max-w-full">
          {leading ? <div className="flex flex-wrap items-center gap-2">{leading}</div> : null}
          <div className="flex-shrink-0 min-w-0 w-full max-w-full">
            <AdminMobileLayoutDateRangeShell>{dropdown}</AdminMobileLayoutDateRangeShell>
          </div>
        </div>
      ) : null}
      {isLgUp ? (
        // Negative insets cancel the scroll container's `p-4 lg:p-6` so the pinned bar's
        // backdrop spans the full content width and rows scroll UNDER it, not beside it.
        // `-mt-*` + matching `pt-*` closes the gap above it so nothing peeks over the top edge.
        <div className="sticky top-0 z-30 -mx-4 lg:-mx-6 -mt-4 lg:-mt-6 px-4 lg:px-6 pt-4 lg:pt-6 pb-3 flex flex-wrap items-center gap-2 bg-gray-50/95 dark:bg-neutral-950/95 backdrop-blur-sm">
          {leading ? <div className="flex flex-wrap items-center gap-2 min-w-0">{leading}</div> : null}
          <div className="flex-shrink-0 min-w-0 max-w-full sm:w-auto ml-auto">{dropdown}</div>
        </div>
      ) : null}

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
