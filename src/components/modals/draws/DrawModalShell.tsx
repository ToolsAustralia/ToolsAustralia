"use client";

import React from "react";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";
import { ModalContainer } from "../ui";
import type { ModalContainerProps } from "../ui";

/**
 * The shared shell for every admin draws modal.
 *
 * It WRAPS ModalContainer rather than replacing it — ModalContainer already
 * provides the portal, the `bg-black/85 backdrop-blur-md` scrim the design
 * specifies, mobile bottom-sheet presentation, scroll lock and focus handling.
 * This adds only what was missing: the eyebrow + title + close header, the
 * `--panel2` right-aligned footer, the "N fields need attention" hint, and the
 * pending-state treatment.
 *
 * ── WHY THE `admin-draws` CLASS IS ON THE PANEL ────────────────────────────
 * ModalContainer renders through `createPortal(…, document.body)`. That escapes
 * the React tree, so a modal opened from a draws page is NOT a DOM descendant of
 * DrawsPageShell — the `.admin-draws` token scope does not reach it and every
 * `var(--panel)` / `var(--m-field)` would resolve to nothing.
 *
 * So the shell puts the class on its own panel. Do not remove it, and do not
 * assume tokens work inside a portal just because the opener was inside the scope.
 */
export default function DrawModalShell({
  isOpen,
  onClose,
  eyebrow,
  title,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel = "Cancel",
  onSecondary,
  isSubmitting = false,
  submittingLabel = "Saving…",
  errorCount = 0,
  primaryTone = "accent",
  size = "lg",
  footer,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Small uppercase line above the title, e.g. "July Draw 2026 · entries open". */
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  /** Omit to render a footer with only the secondary (e.g. a read-only modal). */
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  isSubmitting?: boolean;
  /** Verb shown beside the spinner while pending: "Saving…" / "Deleting…". */
  submittingLabel?: string;
  /** Drives the "1 field needs attention" hint. Validate on SUBMIT, not blur. */
  errorCount?: number;
  primaryTone?: "accent" | "danger";
  size?: ModalContainerProps["size"];
  /** Replaces the whole default footer when a modal needs a custom one. */
  footer?: React.ReactNode;
}) {
  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      size={size}
      // `sheet` = flush to the viewport bottom below ModalContainer's own `sm`
      // breakpoint, centered dialog above it — the design's --m-sheetAlign
      // flex-end / center split. The radius override below is keyed to the SAME
      // `sm` so the corners and the alignment flip together; keying it to the
      // draws 900px breakpoint would round the top of a centered dialog.
      presentation="sheet"
      className="admin-draws overflow-hidden !rounded-t-[18px] !rounded-b-none sm:!rounded-[14px]"
    >
      <div className="flex max-h-[inherit] flex-col bg-[var(--panel)] text-[var(--text)]">
        {/* Grab handle — 38×4, bottom-sheet only. */}
        <div className="flex justify-center pt-[8px] sm:hidden" aria-hidden>
          <span className="h-[4px] w-[38px] rounded-full bg-[var(--line)]" />
        </div>

        <header className="flex items-start justify-between gap-[12px] border-b border-[var(--line)] px-[16px] py-[13px]">
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--text3)]">
                {eyebrow}
              </div>
            )}
            <h2 className="mt-[3px] font-poppins text-[17px] font-bold leading-[1.25] tracking-[-.02em] text-[var(--text)]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close"
            className="flex h-[var(--m-icon)] w-[var(--m-icon)] shrink-0 items-center justify-center rounded-[7px] text-[var(--text3)] hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-50"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-[16px] py-[14px]">{children}</div>

        {footer ?? (
          <footer className="flex flex-wrap items-center justify-end gap-[10px] border-t border-[var(--line)] bg-[var(--panel2)] px-[16px] py-[11px]">
            {errorCount > 0 && (
              <p role="alert" className="mr-auto text-[12px] font-semibold text-[var(--accent)]">
                {errorCount} {errorCount === 1 ? "field needs" : "fields need"} attention
              </p>
            )}

            <button
              type="button"
              onClick={onSecondary ?? onClose}
              disabled={isSubmitting}
              className="flex h-[var(--m-btn-h)] items-center rounded-[9px] border border-[var(--line)] bg-[var(--panel)] px-[14px] text-[12.5px] font-semibold text-[var(--text)] hover:border-[var(--accent-line)] hover:text-[var(--accent)] disabled:opacity-50"
            >
              {secondaryLabel}
            </button>

            {primaryLabel && onPrimary && (
              <button
                type="button"
                onClick={onPrimary}
                // Ignores further clicks while pending, per the design.
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className={cn(
                  "flex h-[var(--m-btn-h)] items-center gap-[7px] rounded-[9px] px-[16px] text-[12.5px] font-semibold text-white",
                  primaryTone === "danger" ? "bg-[var(--danger)]" : "bg-[var(--accent)]",
                  isSubmitting ? "cursor-progress opacity-[.82]" : "hover:opacity-90"
                )}
              >
                {isSubmitting && (
                  <span
                    className="admin-draws-spinner h-[13px] w-[13px] rounded-full border-2 border-white/30 border-t-white"
                    aria-hidden
                  />
                )}
                {isSubmitting ? submittingLabel : primaryLabel}
              </button>
            )}
          </footer>
        )}
      </div>
    </ModalContainer>
  );
}
