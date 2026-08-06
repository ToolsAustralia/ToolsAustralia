"use client";

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";
import { useScrollLock, useModalA11y } from "@/hooks/useModalBlocking";

interface SheetShellProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}

/**
 * Responsive overlay shell — ported from the prototype `SheetShell`:
 * a slide-up bottom sheet on mobile, a centered modal on desktop (max-w 468),
 * over a blurred backdrop. Closes on backdrop click or Escape.
 */
export default function SheetShell({ open, onClose, children, className, labelledBy }: SheetShellProps) {
  /**
   * Replaces a hand-rolled `body.style.overflow` + Escape effect. Two things it got wrong,
   * both of which only show up when a second overlay is involved:
   *
   * - SAVE/RESTORE IS NOT NESTING-SAFE. It captured `prevOverflow` at open and wrote it back
   *   at close. Open a sheet (captures ""), open a modal on top (locks), close the SHEET
   *   first — it restores "" and unlocks the page while the modal is still up. Reference
   *   counting in `useScrollLock` is what makes the last one out the one that releases.
   * - `overflow: hidden` alone does not stop touch-scrolling in iOS Safari, and these five
   *   sheets are mobile-first surfaces.
   *
   * It also declared `aria-modal="true"` with nothing trapping Tab, so focus walked into the
   * dashboard behind the backdrop. `useModalA11y` supplies the trap, initial focus, Escape
   * and focus-restore-on-close that the old effect only half-covered.
   */
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollLock(open);
  useModalA11y(open, panelRef, onClose);

  if (!open) return null;

  // Portal to <body> so the full-viewport backdrop escapes the page's stacking
  // context — sheets opened from deep in a route (e.g. the Draws-tab mini-draw
  // sheet, mounted inside <main>) would otherwise render UNDER the fixed z-40
  // BottomNav and leave the top of the screen uncovered. z sits above the nav +
  // floating chrome but below the payment/modal layer (Z_INDEX 10000).
  const overlay = (
    <div className="fixed inset-0 z-[120] flex flex-col justify-end lg:items-center lg:justify-center lg:p-6" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/55 backdrop-blur-sm motion-safe:animate-[ta-sheet-fade_.25s_ease-out]" />
      <div
        ref={panelRef}
        className={cn(
          "relative flex max-h-[90%] w-full flex-col overflow-hidden overscroll-contain border border-token bg-surface shadow-[0_-20px_50px_-20px_rgba(0,0,0,.5)]",
          "rounded-t-[26px] lg:max-h-[86%] lg:max-w-[468px] lg:rounded-3xl lg:shadow-[0_40px_90px_-30px_rgba(0,0,0,.7)]",
          "motion-safe:animate-[ta-sheet-up_.34s_cubic-bezier(.22,1,.36,1)] lg:motion-safe:animate-[ta-sheet-pop_.28s_cubic-bezier(.22,1,.36,1)]",
          className,
        )}
      >
        <span aria-hidden className="mx-auto mt-3 mb-0.5 h-[5px] w-10 shrink-0 rounded-full bg-black/15 lg:hidden dark:bg-white/20" />
        {children}
      </div>
    </div>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}

/** Shared sheet header — title + optional sub + close button. */
export function SheetHead({ title, sub, onClose, id }: { title: string; sub?: string; onClose: () => void; id?: string }) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3.5">
      <div className="min-w-0">
        <div id={id} className="font-poppins text-[19px] font-extrabold leading-tight text-primary-token dark:text-white">{title}</div>
        {sub && <div className="mt-1.5 text-xs font-semibold text-muted-token">{sub}</div>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-token text-muted-token transition-colors hover:text-primary-token focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
      >
        <X className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}
