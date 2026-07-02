"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end lg:items-center lg:justify-center lg:p-6" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      <div
        className={cn(
          "relative flex max-h-[90%] w-full flex-col overflow-hidden border border-token bg-surface shadow-[0_-20px_50px_-20px_rgba(0,0,0,.5)]",
          "rounded-t-[26px] lg:max-h-[86%] lg:max-w-[468px] lg:rounded-3xl lg:shadow-[0_40px_90px_-30px_rgba(0,0,0,.7)]",
          className,
        )}
      >
        <span aria-hidden className="mx-auto mt-3 mb-0.5 h-[5px] w-10 shrink-0 rounded-full bg-black/15 lg:hidden dark:bg-white/20" />
        {children}
      </div>
    </div>
  );
}

/** Shared sheet header — title + optional sub + close button. */
export function SheetHead({ title, sub, onClose, id }: { title: string; sub?: string; onClose: () => void; id?: string }) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3.5">
      <div className="min-w-0">
        <div id={id} className="font-['Poppins'] text-[19px] font-extrabold leading-tight text-primary-token dark:text-white">{title}</div>
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
