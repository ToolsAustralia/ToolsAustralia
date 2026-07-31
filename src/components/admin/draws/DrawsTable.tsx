"use client";

import React from "react";
import { Filter, AlertCircle, RefreshCw, Lock } from "lucide-react";
import { cn } from "@/utils/cn";
import DrawStatusPill from "./DrawStatusPill";
import type { DrawGroup, DrawRow, DrawsDataState, DrawsListVariant } from "./types";

/**
 * The grouped draws table + its four data states.
 *
 * All four states are built together on purpose: the design specifies every one
 * of them, and the surrounding shell / KPI strip / toolbar / inspector must not
 * move between them. Retrofitting states later is how that invariant breaks.
 *
 * Desktop renders a 7-column grid; below 900px the same rows render as cards.
 * BOTH call the same `onSelect` — separate markup for one list is the defect the
 * handoff calls out as most likely to ship (one surface silently going dead).
 */

const HEAD_CELL =
  "text-[10px] font-semibold uppercase tracking-[.09em] text-[var(--text3)] whitespace-nowrap";

export default function DrawsTable({
  variant,
  groups,
  dataState,
  selectedId,
  onSelect,
  onClearFilters,
  onRetry,
  emptyTitle,
  emptyBody,
  errorEndpoint,
}: {
  variant: DrawsListVariant;
  groups: DrawGroup[];
  dataState: DrawsDataState;
  selectedId: string | null;
  onSelect: (row: DrawRow) => void;
  onClearFilters: () => void;
  onRetry: () => void;
  emptyTitle: string;
  emptyBody: string;
  /** Real endpoint + status for the error state, e.g. "GET /api/admin/major-draw/history · 504". */
  errorEndpoint: string;
}) {
  const trailingLabel = variant === "upcoming" ? "Gate" : "Winner";

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-[var(--m-radius)] border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow)]">
      {/* Sticky column header — desktop only; the mobile card list has no columns. */}
      <div
        className={cn(
          "sticky top-0 z-20 hidden border-b border-[var(--line)] bg-[var(--panel2)] px-[14px] draws:grid",
          // Height comes from the same token the group header offsets by.
          "h-[var(--m-theadH)] grid-cols-[var(--m-tblCols)] items-center gap-[10px]"
        )}
      >
        <div className={HEAD_CELL}>Draw</div>
        <div className={HEAD_CELL}>Draw date</div>
        <div className={HEAD_CELL}>Status</div>
        <div className={cn(HEAD_CELL, "text-right")}>Entries</div>
        <div className={cn(HEAD_CELL, "text-right")}>Revenue</div>
        <div className={HEAD_CELL}>{trailingLabel}</div>
        <div className={HEAD_CELL} aria-hidden />
      </div>

      {dataState === "loading" && <LoadingRows />}
      {dataState === "error" && <ErrorState endpoint={errorEndpoint} onRetry={onRetry} />}
      {dataState === "empty" && <EmptyState title={emptyTitle} body={emptyBody} onClearFilters={onClearFilters} />}

      {dataState === "ready" &&
        groups.map((group) => (
          <section key={group.label}>
            {/* Sticks directly below the column header. --m-theadH is 0 on mobile
                (that header is `hidden` there and occupies no height), so a fixed
                offset would leave a dead gap for rows to scroll behind. */}
            <header className="sticky top-[var(--m-theadH)] z-10 flex flex-wrap items-baseline gap-x-[10px] gap-y-[2px] border-b border-[var(--line2)] bg-[var(--panel2)] px-[14px] py-[7px]">
              <h3 className="font-poppins text-[12.5px] font-bold text-[var(--text)]">{group.label}</h3>
              <p className="text-[11px] text-[var(--text3)]">{group.meta}</p>
            </header>

            {group.rows.map((row) => (
              <React.Fragment key={row.id}>
                <DesktopRow row={row} selected={row.id === selectedId} onSelect={onSelect} />
                <MobileCard row={row} selected={row.id === selectedId} onSelect={onSelect} />
              </React.Fragment>
            ))}
          </section>
        ))}
    </div>
  );
}

function DesktopRow({
  row,
  selected,
  onSelect,
}: {
  row: DrawRow;
  selected: boolean;
  onSelect: (row: DrawRow) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "hidden w-full grid-cols-[var(--m-tblCols)] items-center gap-[10px] border-b border-[var(--line2)] px-[14px] py-[11px] text-left draws:grid",
        selected
          ? "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]"
          : "hover:bg-[var(--hover)]"
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-[var(--text)]">{row.name}</div>
        <div className="truncate text-[11px] text-[var(--text3)]">{row.kind}</div>
      </div>

      <div data-figure className="text-[12.5px] text-[var(--text2)]">
        {row.date}
      </div>

      <div className="flex items-center gap-[5px]">
        <DrawStatusPill status={row.status} />
        {row.locked && (
          <Lock className="h-[12px] w-[12px] shrink-0 text-[var(--text3)]" aria-label="Configuration locked" />
        )}
      </div>

      <div className="text-right">
        <div data-figure className="text-[12.5px] font-semibold text-[var(--text)]">
          {row.entriesLabel}
        </div>
        <div data-figure className="text-[11px] text-[var(--text3)]">
          {row.prizeValueLabel}
        </div>
      </div>

      <div className="text-right">
        <div data-figure className="text-[12.5px] font-semibold text-[var(--ok)]">
          {row.revenueLabel}
        </div>
        <div data-figure className="text-[11px] text-[var(--text3)]">
          {row.revenuePerEntryLabel}
        </div>
      </div>

      <div className="min-w-0">
        <div className="truncate text-[12.5px] text-[var(--text)]">{row.trailing}</div>
        <div className="truncate text-[11px] text-[var(--text3)]">{row.trailingSub}</div>
      </div>

      <div className="text-right text-[13px] text-[var(--text3)]" aria-hidden>
        ›
      </div>
    </button>
  );
}

function MobileCard({
  row,
  selected,
  onSelect,
}: {
  row: DrawRow;
  selected: boolean;
  onSelect: (row: DrawRow) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-[8px] border-b border-[var(--line2)] px-[14px] py-[12px] text-left draws:hidden",
        selected && "bg-[var(--accent-soft)] shadow-[inset_3px_0_0_var(--accent)]"
      )}
    >
      <div className="flex items-start justify-between gap-[10px]">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-[var(--text)]">{row.name}</div>
          <div data-figure className="truncate text-[11px] text-[var(--text3)]">
            {row.kind} · {row.date}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-[5px]">
          <DrawStatusPill status={row.status} />
          {row.locked && <Lock className="h-[12px] w-[12px] text-[var(--text3)]" aria-label="Configuration locked" />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-[8px]">
        <MobileStat label="Entries" value={row.entriesLabel} sub={row.prizeValueLabel} />
        <MobileStat label="Revenue" value={row.revenueLabel} sub={row.revenuePerEntryLabel} tone="ok" />
      </div>

      <div className="min-w-0 border-t border-[var(--line2)] pt-[7px]">
        <div className="truncate text-[12.5px] text-[var(--text)]">{row.trailing}</div>
        <div className="truncate text-[11px] text-[var(--text3)]">{row.trailingSub}</div>
      </div>
    </button>
  );
}

function MobileStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "ok";
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--text3)]">{label}</div>
      <div
        data-figure
        className={cn(
          "truncate text-[13px] font-semibold",
          tone === "ok" ? "text-[var(--ok)]" : "text-[var(--text)]"
        )}
      >
        {value}
      </div>
      <div data-figure className="truncate text-[11px] text-[var(--text3)]">
        {sub}
      </div>
    </div>
  );
}

/** Six skeleton rows on the REAL column grid, 1.15s shimmer, aria-busy. */
function LoadingRows() {
  return (
    <div aria-busy="true" aria-label="Loading draws">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-1 items-center gap-[10px] border-b border-[var(--line2)] px-[14px] py-[13px] draws:grid-cols-[var(--m-tblCols)]"
        >
          <div className="admin-draws-skeleton h-[13px] w-[70%] rounded-[5px]" />
          <div className="admin-draws-skeleton hidden h-[11px] w-[80%] rounded-[5px] draws:block" />
          <div className="admin-draws-skeleton hidden h-[21px] w-[64px] rounded-full draws:block" />
          <div className="admin-draws-skeleton hidden h-[13px] w-full rounded-[5px] draws:block" />
          <div className="admin-draws-skeleton hidden h-[13px] w-full rounded-[5px] draws:block" />
          <div className="admin-draws-skeleton hidden h-[13px] w-[60%] rounded-[5px] draws:block" />
          <div className="admin-draws-skeleton hidden h-[13px] w-[10px] rounded-[5px] draws:block" />
        </div>
      ))}
    </div>
  );
}

/**
 * Never a bare "no results": the copy names the filter as the cause and offers
 * the way out. Strings come from the caller so each page uses the design's exact
 * wording (and the search-active variants).
 */
function EmptyState({
  title,
  body,
  onClearFilters,
}: {
  title: string;
  body: string;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-[20px] py-[46px] text-center">
      <Filter className="h-[26px] w-[26px] text-[var(--text3)]" strokeWidth={2} aria-hidden />
      <div className="mt-[12px] font-poppins text-[14.5px] font-bold text-[var(--text)]">{title}</div>
      <p className="mt-[6px] max-w-[330px] text-[12.5px] leading-[1.6] text-[var(--text2)] text-pretty">{body}</p>
      <button
        type="button"
        onClick={onClearFilters}
        className="mt-[15px] flex h-[var(--m-btn-h)] items-center gap-[7px] rounded-[9px] border border-[var(--line)] bg-[var(--panel)] px-[15px] text-[12.5px] font-semibold text-[var(--text)] hover:border-[var(--accent-line)] hover:text-[var(--accent)]"
      >
        Clear filters
      </button>
    </div>
  );
}

/**
 * Reassures that retrying is safe and shows the real endpoint + status in
 * monospace. The handoff's sample string names /api/admin/draws, which does not
 * exist in this app — the caller passes the real one.
 */
function ErrorState({ endpoint, onRetry }: { endpoint: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center px-[20px] py-[46px] text-center">
      <AlertCircle className="h-[26px] w-[26px] text-[var(--danger)]" strokeWidth={2.2} aria-hidden />
      <div className="mt-[12px] font-poppins text-[14.5px] font-bold text-[var(--text)]">Couldn&apos;t load draws</div>
      <p className="mt-[6px] max-w-[330px] text-[12.5px] leading-[1.6] text-[var(--text2)] text-pretty">
        The request to the draws service timed out. Nothing has changed — retrying is safe.
      </p>
      <div className="mt-[10px] font-mono text-[11px] font-medium text-[var(--text3)]">{endpoint}</div>
      <div className="mt-[14px] flex flex-wrap items-center justify-center gap-[8px]">
        <button
          type="button"
          onClick={onRetry}
          className="flex h-[var(--m-btn-h)] items-center gap-[7px] rounded-[9px] bg-[var(--accent)] px-[15px] text-[12.5px] font-semibold text-white hover:opacity-90"
        >
          <RefreshCw className="h-[14px] w-[14px]" />
          Try again
        </button>
        <a
          href="/contact"
          className="flex h-[var(--m-btn-h)] items-center rounded-[9px] border border-[var(--line)] bg-[var(--panel)] px-[15px] text-[12.5px] font-semibold text-[var(--text2)] hover:text-[var(--text)]"
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
