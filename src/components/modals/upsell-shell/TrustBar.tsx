"use client";

import React, { type ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * TrustBar — 3-cell trust footer with icon + bold strong + secondary line.
 *
 * Pattern extracted from CancellationUpsellModal/TrustBar.tsx. Generic over
 * the cell content — pass any 3 cells.
 */

interface TrustBarCell {
  /** Icon (typically lucide). */
  icon: ReactNode;
  /** Bold strong line (e.g. "SSL secure"). */
  strong: string;
  /** Secondary line (e.g. "Entries safe"). */
  secondary: string;
}

interface TrustBarProps {
  cells: [TrustBarCell, TrustBarCell, TrustBarCell];
  className?: string;
}

const TrustBar: React.FC<TrustBarProps> = ({ cells, className }) => {
  return (
    <div className={cn("bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 px-4 py-2.5 grid grid-cols-3 gap-0 max-xs:px-2 max-xs:py-1.5", className)}>
      {cells.map((cell, idx) => (
        <div
          key={idx}
          className={cn(
            "flex items-center gap-2 text-2xs text-neutral-600 dark:text-neutral-400 leading-[1.3] px-2.5 relative max-xs:text-[8px] max-xs:gap-1 max-xs:px-1",
            idx > 0 && "before:content-[''] before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:bg-neutral-200 dark:before:bg-neutral-700"
          )}
        >
          <span className="grow-0 shrink-0 basis-5 w-5 h-5 rounded-[5px] bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 inline-flex items-center justify-center text-red-700 dark:text-red-400 max-xs:basis-[18px] max-xs:w-[18px] max-xs:h-[18px] max-xs:rounded">
            {cell.icon}
          </span>
          <span className="inline-flex flex-col min-w-0">
            <strong className="text-neutral-950 dark:text-white font-bold block">{cell.strong}</strong>
            {cell.secondary}
          </span>
        </div>
      ))}
    </div>
  );
};

export default TrustBar;
export { type TrustBarCell, type TrustBarProps };
