"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";
import DrawsPageShell from "./DrawsPageShell";
import DrawsKpiStrip from "./DrawsKpiStrip";
import DrawsToolbar from "./DrawsToolbar";
import DrawsTable from "./DrawsTable";
import DrawInspector from "./DrawInspector";
import type {
  DrawFilter,
  DrawGroup,
  DrawKpi,
  DrawRow,
  DrawToolbarAction,
  DrawsDataState,
  DrawsListVariant,
} from "./types";

/**
 * The shared list screen behind BOTH /admin/draw-results and
 * /admin/upcoming-draws.
 *
 * Layout: KPI strip → toolbar → split view (fluid table + fixed 320px
 * inspector). Below 900px the split stacks and the inspector becomes a bottom
 * sheet opened by tapping a card.
 *
 * This component owns LAYOUT only. Fetching, filter state, pagination and every
 * modal stay in the two containers — they already own that logic and lifting
 * half of it here would split one piece of state across two files.
 */
export default function DrawsListPage({
  variant,
  kpis,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  openFilterKey,
  onToggleFilter,
  onPickFilter,
  actions,
  groups,
  dataState,
  selectedRow,
  onSelectRow,
  onClearFilters,
  onRetry,
  emptyTitle,
  emptyBody,
  errorEndpoint,
  verificationUrl,
  onInspectorPrimary,
  onEditDraw,
  onExport,
  onRemoveWinner,
  onOpenWinnerUser,
  footer,
}: {
  variant: DrawsListVariant;
  kpis: DrawKpi[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters: DrawFilter[];
  openFilterKey: string | null;
  onToggleFilter: (key: string | null) => void;
  onPickFilter: (key: string, value: string) => void;
  actions?: DrawToolbarAction[];
  groups: DrawGroup[];
  dataState: DrawsDataState;
  selectedRow: DrawRow | null;
  onSelectRow: (row: DrawRow | null) => void;
  onClearFilters: () => void;
  onRetry: () => void;
  emptyTitle: string;
  emptyBody: string;
  errorEndpoint: string;
  verificationUrl?: string | null;
  onInspectorPrimary: (row: DrawRow) => void;
  onEditDraw: (row: DrawRow) => void;
  onExport: (row: DrawRow) => void;
  onRemoveWinner?: (row: DrawRow) => void;
  onOpenWinnerUser?: (row: DrawRow) => void;
  /** Pagination, rendered under the table. */
  footer?: React.ReactNode;
}) {
  // Escape closes the mobile detail sheet. The toolbar's dropdown handler runs
  // in the capture phase and stops propagation, so a dropdown always closes
  // first — dropdown → sheet, per the design's layer order.
  useEffect(() => {
    if (!selectedRow) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSelectRow(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedRow, onSelectRow]);

  const inspectorProps = {
    variant,
    row: selectedRow,
    verificationUrl,
    onPrimary: onInspectorPrimary,
    onEditDraw,
    onExport,
    onRemoveWinner,
    onOpenWinnerUser,
  };

  return (
    <DrawsPageShell>
      <DrawsKpiStrip kpis={kpis} isLoading={dataState === "loading"} />

      <DrawsToolbar
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
        filters={filters}
        openFilterKey={openFilterKey}
        onToggleFilter={onToggleFilter}
        onPickFilter={onPickFilter}
        actions={actions}
      />

      <div className="grid min-w-0 grid-cols-[var(--m-splitCols)] items-start gap-[var(--m-gap)]">
        <div className="flex min-w-0 flex-col gap-[var(--m-gap)]">
          <DrawsTable
            variant={variant}
            groups={groups}
            dataState={dataState}
            selectedId={selectedRow?.id ?? null}
            onSelect={onSelectRow}
            onClearFilters={onClearFilters}
            onRetry={onRetry}
            emptyTitle={emptyTitle}
            emptyBody={emptyBody}
            errorEndpoint={errorEndpoint}
          />
          {footer}
        </div>

        {/* Desktop inspector — hidden below the breakpoint, where the sheet takes over. */}
        <DrawInspector {...inspectorProps} className="hidden draws:block" />
      </div>

      {/* Mobile detail sheet: same content, same handlers, different presentation. */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/85 backdrop-blur-md draws:hidden">
          <button
            type="button"
            aria-label="Close details"
            className="absolute inset-0 cursor-default"
            onClick={() => onSelectRow(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedRow.name} details`}
            className={cn(
              "relative max-h-[85svh] w-full overflow-y-auto rounded-t-[18px] border-t border-[var(--line)]",
              "bg-[var(--panel)] pb-[env(safe-area-inset-bottom)]"
            )}
          >
            <div className="sticky top-0 flex items-center justify-between bg-[var(--panel)] px-[14px] pb-[6px] pt-[10px]">
              <div className="mx-auto h-[4px] w-[38px] rounded-full bg-[var(--line)]" aria-hidden />
              <button
                type="button"
                onClick={() => onSelectRow(null)}
                aria-label="Close"
                className="absolute right-[10px] top-[8px] flex h-[var(--m-icon)] w-[var(--m-icon)] items-center justify-center rounded-[7px] text-[var(--text3)] hover:bg-[var(--hover)]"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>
            <DrawInspector {...inspectorProps} className="border-0 shadow-none" />
          </div>
        </div>
      )}
    </DrawsPageShell>
  );
}
