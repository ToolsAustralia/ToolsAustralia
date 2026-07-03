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
   * When false, clicking the backdrop does nothing (Escape still works).
   * Defaults to true.
   */
  closeOnBackdrop?: boolean;
  /**
   * Embedded mode — render just the hero+body frame inline (no fixed overlay,
   * backdrop, close button, scroll-lock or entry animation) so the resolve flow
   * can live inside another surface (e.g. the dashboard payment sheet).
   */
  embedded?: boolean;
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
  closeOnBackdrop = true,
  embedded = false,
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
    if (!isOpen || embedded) return;
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
  }, [isOpen, onClose, embedded]);

  if (!isOpen) return null;

  const StatusIcon = tone === "success" ? CheckCircle : AlertTriangle;

  // Hero + white-body frame — shared by the overlay (default) and embedded modes.
  const frame = (
    <div
      className={cn(
        "relative rounded-[22px] bg-white dark:bg-neutral-950 overflow-hidden max-xs:rounded-2xl",
        embedded
          ? "w-full"
          : "w-full max-h-full overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] shadow-[0_30px_80px_rgba(0,0,0,0.45),0_8px_24px_rgba(0,0,0,0.2)]",
        styles.scrollFrame
      )}
    >
          {/* ---- Hero ---- */}
          <div
            data-tone={tone}
            className={cn(
              "relative px-5 pt-[18px] pb-4 text-white overflow-hidden",
              "max-xs:px-3.5 max-xs:pt-[14px] max-xs:pb-3",
              styles.heroBg,
              styles.heroStripeOverlay
            )}
          >
            {/* Inner — sits above the stripe overlay (z-index: 2) */}
            <div className="relative z-[2]">

              {/* Status icon */}
              <div className="flex justify-center mb-2 max-xs:mb-1.5">
                <span
                  className={cn(
                    "inline-flex items-center justify-center",
                    tone === "success" ? "text-[#4ade80]" : "text-[#ff6b6b]"
                  )}
                >
                  <StatusIcon
                    size={36}
                    strokeWidth={2}
                    className="max-xs:w-7 max-xs:h-7"
                  />
                </span>
              </div>

              {/* Eyebrow */}
              <div className="flex items-center justify-center gap-2 mb-1.5 max-xs:gap-1.5 max-xs:mb-1">
                {/* Left line — fades from transparent → accent */}
                <span
                  className="flex-none h-px basis-7 max-xs:basis-[18px]"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, var(--tone-accent))",
                  }}
                />
                {/* Pip dot */}
                <span
                  className="w-1.5 h-1.5 rounded-full flex-none"
                  style={{ backgroundColor: "var(--tone-accent)" }}
                  aria-hidden
                />
                {/* Label */}
                <span
                  className="font-extrabold text-[11px] tracking-[0.22em] uppercase max-xs:text-[10px] max-xs:tracking-[0.18em]"
                  style={{ color: "var(--tone-accent)" }}
                >
                  {eyebrow}
                </span>
                {/* Right line — fades from accent → transparent */}
                <span
                  className="flex-none h-px basis-7 max-xs:basis-[18px]"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--tone-accent), transparent)",
                  }}
                />
              </div>

              {/* Headline — data-rf-accent spans + <strong> are auto-colored via
                  the CSS module rule [data-tone] [data-rf-accent], [data-tone] strong. */}
              <h2
                id="rf-shell-headline"
                className={cn(
                  "font-acumin font-normal text-[26px] leading-none",
                  "tracking-[0.005em] text-center uppercase",
                  "mb-1.5 max-xs:text-[22px]"
                )}
              >
                {title}
              </h2>

              {/* Sub-copy — <strong> is auto-colored via CSS module. */}
              <p
                data-rf-sub
                className={cn(
                  "text-center text-xs text-white/70 leading-snug",
                  "max-w-[440px] mx-auto mb-2",
                  "max-xs:text-[11px] max-xs:mb-1.5 max-xs:leading-[1.35]"
                )}
              >
                {sub}
              </p>
            </div>
          </div>

          {/* ---- White body slot ---- */}
          <div className="bg-white dark:bg-neutral-950 px-[22px] pt-4 pb-[18px] max-xs:p-[14px]">
            {children}
          </div>
    </div>
  );

  // Embedded — inline card, no overlay/backdrop/close button/scroll-lock/animation.
  if (embedded) {
    return <div className={cn("relative w-full", shellTone({ tone }))}>{frame}</div>;
  }

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
            "rounded-full bg-black/55 text-white/95",
            "inline-flex items-center justify-center",
            "border border-white/20",
            "transition-all duration-150 backdrop-blur-md",
            "hover:bg-black/75 hover:text-white"
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
