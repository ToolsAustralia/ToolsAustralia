"use client";

import React, { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";
import styles from "./styles.module.css";

export type Tier = "tradie" | "foreman" | "boss";

interface ShellProps {
  isOpen: boolean;
  onClose: () => void;
  /** Drives the frame-level [data-tier] CSS custom properties for the destination tier. */
  toTier: Tier;
  /** Modal body content. */
  children: ReactNode;
}

const Shell: React.FC<ShellProps> = ({ isOpen, onClose, toTier, children }) => {
  /** Body scroll lock + Escape handler.
   * MUST always clear to empty on cleanup (do NOT restore captured state).
   * See audit hazard #1: matches original L55-69 pattern exactly. */
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

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 overflow-hidden"
      style={{ zIndex: 90 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />

      {/* Stage */}
      <div
        className="relative w-full max-w-[520px] font-sans text-neutral-950 antialiased max-h-[82dvh] flex max-xs:max-h-[88dvh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="uc-headline"
      >
        {/* Close button — absolute top-right of stage */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-[30px] h-[30px] rounded-full bg-black/55 text-white/95 inline-flex items-center justify-center border border-white/20 transition-colors duration-150 backdrop-blur-md hover:bg-black/75 hover:text-white max-xs:top-2 max-xs:right-2 max-xs:w-[26px] max-xs:h-[26px]"
        >
          <X size={14} strokeWidth={2} />
        </button>

        {/* Frame: tier-themed via data-tier; scrollable container with custom scrollbar */}
        <div
          data-tier={toTier}
          className={cn(
            "relative rounded-[20px] bg-white dark:bg-neutral-950 shadow-[0_30px_80px_rgba(0,0,0,0.45),0_8px_24px_rgba(0,0,0,0.2)] w-full max-h-full overflow-y-auto overflow-x-hidden [-webkit-overflow-scrolling:touch] max-xs:rounded-2xl",
            styles.scrollFrame
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default Shell;
