"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/utils/cn";
import type { DrawRow, DrawsListVariant } from "./types";

/**
 * The persistent right panel — NOT a modal. 320px fixed on desktop; below the
 * breakpoint the container renders the same content as a bottom sheet instead.
 *
 * Action layout follows the design exactly: a full-width primary over two
 * secondaries. `Remove winner` has no slot in the design, so it renders as a
 * subordinated danger row below a hairline (plan decision 6) — visible, clearly
 * separate, and only when the draw actually has a winner.
 */
export default function DrawInspector({
  variant,
  row,
  verificationUrl,
  onPrimary,
  onEditDraw,
  onExport,
  onRemoveWinner,
  onOpenWinnerUser,
  className,
}: {
  variant: DrawsListVariant;
  row: DrawRow | null;
  /** randomdraws result link, when the draw has one. */
  verificationUrl?: string | null;
  onPrimary: (row: DrawRow) => void;
  onEditDraw: (row: DrawRow) => void;
  onExport: (row: DrawRow) => void;
  /** Omit to hide the danger row entirely (e.g. Upcoming, or no permission). */
  onRemoveWinner?: (row: DrawRow) => void;
  /**
   * Opens the admin user modal for the winner. Preserves the drill-through the
   * old card list had via ClickableUserDisplay — the design doesn't show it, but
   * dropping a working route to the user record would be a net regression.
   */
  onOpenWinnerUser?: (row: DrawRow) => void;
  className?: string;
}) {
  if (!row) {
    return (
      <aside
        className={cn(
          "hidden rounded-[var(--m-radius)] border border-[var(--line)] bg-[var(--panel)] p-[16px] draws:block",
          "shadow-[var(--shadow-inspector)]",
          className
        )}
      >
        <p className="text-[12.5px] leading-[1.6] text-[var(--text3)]">
          Select a draw to see its entries, revenue and winner details here.
        </p>
      </aside>
    );
  }

  const primaryLabel = variant === "upcoming" ? "Edit this draw" : "Edit winner & testimony";

  return (
    <aside
      className={cn(
        "rounded-[var(--m-radius)] border border-[var(--line)] bg-[var(--panel)] p-[16px]",
        "shadow-[var(--shadow-inspector)]",
        className
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--text3)]">
        {row.status} · {row.date}
      </div>
      <h2 className="mt-[4px] font-poppins text-[17px] font-bold leading-[1.25] tracking-[-.02em] text-[var(--text)]">
        {row.name}
      </h2>

      {/* 2×2 stat grid */}
      <div className="mt-[14px] grid grid-cols-2 gap-[8px]">
        <InspectorStat label="Entries" value={row.entriesLabel} />
        <InspectorStat label="Revenue" value={row.revenueLabel} tone="ok" />
        <InspectorStat label="Per entry" value={row.revenuePerEntryLabel} />
        <InspectorStat label="Prize value" value={row.prizeValueLabel} />
      </div>

      {/* Winner / gate block */}
      <div className="mt-[14px] rounded-[11px] border border-[var(--line)] bg-[var(--panel2)] p-[12px]">
        <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--text3)]">
          {variant === "upcoming" ? "This month's prize" : "Published winner"}
        </div>
        {onOpenWinnerUser && row.hasWinner ? (
          <button
            type="button"
            onClick={() => onOpenWinnerUser(row)}
            className="mt-[4px] block text-left text-[13.5px] font-semibold text-[var(--text)] underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--accent)] hover:decoration-[var(--accent)]"
          >
            {row.trailing}
          </button>
        ) : (
          <div className="mt-[4px] text-[13.5px] font-semibold text-[var(--text)]">{row.trailing}</div>
        )}
        <div className="mt-[2px] text-[11.5px] leading-[1.5] text-[var(--text3)]">{row.trailingSub}</div>
        {verificationUrl && (
          <a
            href={verificationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-[8px] inline-flex items-center gap-[5px] text-[11.5px] font-semibold text-[var(--accent)] hover:underline"
          >
            View result
            <ExternalLink className="h-[12px] w-[12px]" />
          </a>
        )}
      </div>

      {/* Actions: full-width primary over two secondaries — the design's three. */}
      <div className="mt-[14px] flex flex-col gap-[8px]">
        <button
          type="button"
          onClick={() => onPrimary(row)}
          className="flex h-[var(--m-btn-h)] w-full items-center justify-center rounded-[9px] bg-[var(--accent)] px-[14px] text-[12.5px] font-semibold text-white hover:opacity-90"
        >
          {primaryLabel}
        </button>

        <div className="grid grid-cols-2 gap-[8px]">
          <button
            type="button"
            onClick={() => onEditDraw(row)}
            className="flex h-[var(--m-btn-h)] items-center justify-center rounded-[9px] border border-[var(--line)] bg-[var(--panel)] px-[10px] text-[12.5px] font-semibold text-[var(--text)] hover:border-[var(--accent-line)] hover:text-[var(--accent)]"
          >
            Edit draw
          </button>
          <button
            type="button"
            onClick={() => onExport(row)}
            className="flex h-[var(--m-btn-h)] items-center justify-center rounded-[9px] border border-[var(--line)] bg-[var(--panel)] px-[10px] text-[12.5px] font-semibold text-[var(--text)] hover:border-[var(--accent-line)] hover:text-[var(--accent)]"
          >
            Export
          </button>
        </div>

        {/* Subordinated danger row — only when a winner exists to remove. */}
        {onRemoveWinner && row.hasWinner && (
          <>
            <div className="mt-[2px] border-t border-[var(--line)]" />
            <button
              type="button"
              onClick={() => onRemoveWinner(row)}
              className="flex min-h-[var(--m-btn-sm)] w-full items-center justify-center rounded-[9px] px-[10px] text-[12.5px] font-semibold text-[var(--danger)] hover:bg-[var(--danger-bg)]"
            >
              Remove winner
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

function InspectorStat({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div className="min-w-0 rounded-[9px] border border-[var(--line)] bg-[var(--panel2)] px-[10px] py-[8px]">
      <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--text3)]">{label}</div>
      <div
        data-figure
        className={cn(
          "mt-[2px] truncate font-poppins text-[15px] font-bold tracking-[-.02em]",
          tone === "ok" ? "text-[var(--ok)]" : "text-[var(--text)]"
        )}
      >
        {value}
      </div>
    </div>
  );
}
