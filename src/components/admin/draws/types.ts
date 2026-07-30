/**
 * Shared types for the admin draws list pages.
 *
 * Draw Results and Upcoming Draws are ONE presentation built twice from two
 * configs — the design prototype's own `isList` branch proves they are the same
 * screen, differing only in data, filters and grouping. These types are the
 * contract between the two containers (which own fetching + state) and the
 * presentation components in this folder (which own layout).
 */
import type { LucideIcon } from "lucide-react";

/** Which of the two list pages is rendering. Drives labels, filters and grouping. */
export type DrawsListVariant = "results" | "upcoming";

/** Status pill vocabulary — the MajorDraw status enum, unchanged. */
export type DrawStatus = "queued" | "active" | "frozen" | "completed" | "cancelled";

/**
 * A table row, already formatted for display.
 *
 * The container formats currency/dates (it owns the locale helpers and the raw
 * documents); the table only lays out. Keeping raw numbers alongside the
 * formatted strings lets the table right-align and mark figures as tabular
 * without re-parsing text.
 */
export interface DrawRow {
  id: string;
  name: string;
  /** e.g. "Major draw" / "Live now" — the design's second line under the name. */
  kind: string;
  /** Preformatted draw date, e.g. "27 Jun, 8:30 PM". */
  date: string;
  status: DrawStatus;
  entries: number;
  entriesLabel: string;
  revenue: number;
  revenueLabel: string;
  /** Preformatted revenue-per-entry, or "—" when the draw has no entries. */
  revenuePerEntryLabel: string;
  prizeValueLabel: string;
  /** Column 6: winner name (Results) or gate state (Upcoming). */
  trailing: string;
  /** Secondary line under column 6, e.g. "randomdraws · verified". */
  trailingSub: string;
  /** True when configurationLocked — every edit entry point must route to the notice. */
  locked: boolean;
  /** True when the draw has a published winner. Gates the Remove-winner action. */
  hasWinner: boolean;
}

/** A sticky group header plus its rows. Results groups by year; Upcoming by live/scheduled. */
export interface DrawGroup {
  label: string;
  /** e.g. "6 draws · $272,000 revenue · 1 winner outstanding". */
  meta: string;
  rows: DrawRow[];
}

/**
 * The four table states. The shell, KPI strip, toolbar and inspector must NOT
 * move between them — only the table body swaps.
 */
export type DrawsDataState = "ready" | "loading" | "empty" | "error";

/** One KPI cell. No delta field: there is no prior-period data (plan decision 2). */
export interface DrawKpi {
  label: string;
  value: string;
}

/** A toolbar dropdown filter. */
export interface DrawFilter {
  key: string;
  label: string;
  value: string;
  options: string[];
}

/** A toolbar action button. */
export interface DrawToolbarAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  variant?: "primary" | "secondary";
}
