"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { DateRangeDropdown } from "@/components/admin/overview/DateRangeDropdown";
import { DateRangePresetRow } from "@/components/admin/overview/DateRangePresetRow";
import { AdminMobileLayoutDateRangeShell } from "@/app/admin/component/AdminMobileLayoutDateRangeShell";
import { useAdminDateToolbarSlot } from "@/hooks/useAdminDateToolbarSlot";
import CustomDateRangeModal from "./CustomDateRangeModal";
import { useMajorDrawsForDateRange } from "@/hooks/queries/useAdminQueries";
import type { AdminDateFilter } from "@/hooks/useAdminDateFilter";

/**
 * THE admin date-range toolbar, wired to a `useAdminDateFilter` instance. Every date-filtered
 * admin tab renders this one component — the Overview used to ship its own near-identical
 * `OverviewToolbar`, which is how one surface ended up sticky and the other eight did not.
 *
 * It renders into the ADMIN HEADER on every breakpoint, via a portal into
 * `ADMIN_DATE_TOOLBAR_SLOT_ID`. Two forms, chosen by breakpoint:
 *
 *  - **mobile** → `DateRangeDropdown`, a compact trigger + popover. Six presets will not fit on
 *    a phone.
 *  - **desktop** → `DateRangePresetRow`, every preset inline as one right-aligned row. No
 *    dropdown: with the room available, hiding five of six choices behind a click is pure cost.
 *
 * ── Why the header, and not the page (2026-08-20) ──────────────────────────────────────────
 *
 * Desktop previously rendered a `sticky top-0` bar INSIDE the scroll container. Because content
 * scrolled underneath it, the bar had to paint an opaque backdrop with negative insets to cover
 * the full content width — and that backdrop is what sat over the rows behind it. It also cost
 * every analytics page a permanent band of vertical space.
 *
 * The header is already ABOVE the scroll container, so putting the control there makes it
 * permanently visible for free: no sticky positioning, no backdrop, no reserved band, and no
 * chance of the two classic sticky failures (a short parent, or a clipping/transformed ancestor)
 * silently un-pinning it.
 *
 * A tab must be listed in `ADMIN_TABS_WITH_DATE_TOOLBAR` for the slot to exist. When it is not —
 * or on the very first paint, before the layout effect resolves the slot — the control falls back
 * to rendering inline so it is never simply missing.
 *
 * `leading` is for a tab with its own controls to sit beside the filter (TikTok's Ads /
 * Spend-by-URL switch). It always renders INLINE in the page, never in the header: the header row
 * is shared with the page title and the theme toggle and has no room for per-tab controls.
 */
export function AdminDateRangeToolbar({
  filter,
  accent,
  leading,
}: {
  filter: AdminDateFilter;
  accent?: string;
  /** Per-tab controls, rendered inline in the page above the content. */
  leading?: ReactNode;
}) {
  const { isLgUp, slotEl } = useAdminDateToolbarSlot();
  const { data: majorDraws } = useMajorDrawsForDateRange();

  const control = isLgUp ? (
    <DateRangePresetRow
      selectedRange={filter.dateRange}
      onRangeChange={filter.handleRangeChange}
      onCustomClick={() => filter.setIsCustomOpen(true)}
      displayDate={filter.displayDate || undefined}
      accent={accent}
    />
  ) : (
    <AdminMobileLayoutDateRangeShell>
      <DateRangeDropdown
        selectedRange={filter.dateRange}
        onRangeChange={filter.handleRangeChange}
        onCustomClick={() => filter.setIsCustomOpen(true)}
        displayDate={filter.displayDate || undefined}
        accent={accent}
      />
    </AdminMobileLayoutDateRangeShell>
  );

  return (
    <>
      {slotEl ? createPortal(control, slotEl) : null}

      {/* Inline row: `leading` always, plus the control itself when the header slot is absent
          (a tab not in ADMIN_TABS_WITH_DATE_TOOLBAR, or the first paint before the slot resolves).
          Renders nothing at all when there is neither — no empty box, no stray gap. */}
      {leading || !slotEl ? (
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {leading}
          {!slotEl ? <div className="min-w-0 flex-shrink-0">{control}</div> : null}
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
