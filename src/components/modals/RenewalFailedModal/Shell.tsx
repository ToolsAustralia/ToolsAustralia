"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import { X, AlertTriangle, CheckCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";
import styles from "./styles.module.css";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ShellProps extends VariantProps<typeof shellTone> {
  isOpen: boolean;
  onClose: () => void;
  /** Eyebrow text — small uppercase label above the headline. */
  eyebrow: string;
  /**
   * Headline content. Wrap accent words in `<span data-rf-accent>…</span>` to
   * apply the tone color automatically (via the CSS module rule on [data-tone]).
   */
  title: ReactNode;
  /**
   * Sub-copy. `<strong>` inside is tone-colored automatically via the CSS
   * module rule `[data-tone] strong { color: var(--tone-accent) }`.
   */
  sub: ReactNode;
  /** Modal body content — renders inside the scrolling white frame. */
  children: ReactNode;
  /**
   * Optional hero visual rendered on the LEFT of the header (e.g. the partner-access
   * "on hold" ring for the initial past-due state). When omitted, a compact tone-colored
   * status icon-tile is shown instead.
   */
  heroAside?: ReactNode;
  /**
   * When false, clicking the backdrop does nothing (Escape still works).
   * Defaults to true.
   */
  closeOnBackdrop?: boolean;
}

// ---------------------------------------------------------------------------
// CVA — tone variant (discriminator + defaultVariants; visual work is done by
// the CSS module's [data-tone] selectors, not by Tailwind classes here).
// ---------------------------------------------------------------------------

const shellTone = cva("", {
  variants: {
    tone: {
      danger: "",
      success: "",
    },
  },
  defaultVariants: { tone: "danger" },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const Shell: React.FC<ShellProps> = ({
  isOpen,
  onClose,
  tone = "danger",
  eyebrow,
  title,
  sub,
  children,
  heroAside,
  closeOnBackdrop = true,
}) => {
  /** Entry-animation gate — 10 ms setTimeout matches CancellationUpsellModal. */
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    }
    setIsVisible(false);
    return undefined;
  }, [isOpen]);

  /**
   * Body scroll lock + Escape handler.
   * Mirrors original RenewalShell lines 82-95. Cleanup ALWAYS resets both
   * overflow properties — we do NOT capture the previous value.
   */
  useEffect(() => {
    if (!isOpen) return;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const StatusIcon = tone === "success" ? CheckCircle : AlertTriangle;
  const isSuccessTone = tone === "success";
  // Light, tone-tinted header (amber past-due / emerald success) — replaces the old dark red-glow hero.
  const toneText = isSuccessTone ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400";
  const toneBg = isSuccessTone ? "from-emerald-50 dark:from-emerald-950/30" : "from-amber-50 dark:from-amber-950/30";
  const toneTile = isSuccessTone
    ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300"
    : "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300";
  const toneHair = isSuccessTone ? "via-emerald-400/50" : "via-amber-400/50";

  // Hero + white-body frame — shared by the overlay (default) and embedded modes.
  const frame = (
    <div
      className={cn(
        "relative rounded-[22px] bg-white dark:bg-neutral-950 overflow-hidden max-xs:rounded-2xl",
        "w-full max-h-full overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] shadow-[0_30px_80px_rgba(0,0,0,0.45),0_8px_24px_rgba(0,0,0,0.2)]",
        styles.scrollFrame
      )}
    >
          {/* ---- Hero — light, tone-tinted, benefit-led ---- */}
          <div className={cn("relative bg-gradient-to-b to-transparent px-5 pt-5 pb-[18px] max-xs:px-4 max-xs:pt-4", toneBg)}>
            <div className="flex items-center gap-4 max-xs:gap-3">
              {/* Left visual — the partner-access "on hold" ring (heroAside) or a tone icon-tile. */}
              {heroAside ?? (
                <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", toneTile)}>
                  <StatusIcon className="h-6 w-6" strokeWidth={2} />
                </span>
              )}
              {/* pr-8 keeps the headline clear of the ✕ close button */}
              <div className="min-w-0 pr-8">
                <span className={cn("inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.16em]", toneText)}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                  {eyebrow}
                </span>
                <h2
                  id="rf-shell-headline"
                  className="mt-1 font-['Poppins'] text-[19px] font-extrabold leading-[1.16] tracking-[-.01em] text-neutral-900 dark:text-white max-xs:text-[17px]"
                >
                  {title}
                </h2>
                <p className="mt-1 text-[12.5px] leading-[1.4] text-neutral-600 dark:text-neutral-300 max-xs:text-[12px]">
                  {sub}
                </p>
              </div>
            </div>
            <span aria-hidden className={cn("absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent to-transparent", toneHair)} />
          </div>

          {/* ---- White body slot ---- */}
          <div className="bg-white dark:bg-neutral-950 px-[22px] pt-4 pb-[18px] max-xs:p-[14px]">
            {children}
          </div>
    </div>
  );

  return (
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center p-2 sm:p-4 overflow-hidden",
        shellTone({ tone })
      )}
      style={{ zIndex: 80 }}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity duration-300",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden
      />

      {/* Dialog panel */}
      <div
        className={cn(
          "relative transform transition-all duration-300 ease-out",
          "w-full max-w-[600px] font-sans text-neutral-950 dark:text-neutral-100 antialiased",
          "max-h-[82dvh] flex max-xs:max-h-[88dvh]",
          isVisible
            ? "scale-100 opacity-100 translate-y-0"
            : "scale-95 opacity-0 translate-y-4"
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rf-shell-headline"
      >
        {/* Close button */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={cn(
            "absolute top-3 right-3 z-10",
            "w-8 h-8 max-xs:top-2 max-xs:right-2 max-xs:w-[26px] max-xs:h-[26px]",
            "rounded-full bg-black/[0.06] text-neutral-500 dark:bg-white/10 dark:text-neutral-300",
            "inline-flex items-center justify-center",
            "border border-black/5 dark:border-white/10",
            "transition-all duration-150",
            "hover:bg-black/10 hover:text-neutral-700 dark:hover:bg-white/15 dark:hover:text-white"
          )}
        >
          <X size={14} strokeWidth={2} />
        </button>

        {frame}
      </div>
    </div>
  );
};

export default Shell;
