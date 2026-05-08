"use client";

import React, { type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

/**
 * InfoGrid — N-cell information grid with icon + heading + optional desc.
 *
 * Pattern extracted from CancellationUpsellModal/LoseGrid.tsx. The `framing`
 * variant drives the icon-badge tint (loss=red, gain=green, neutral=gray).
 *
 * Each cell renders: icon-badge → bold heading → muted description.
 * Vertical separators between cells are rendered automatically.
 */

interface InfoGridCell {
  /** Icon to render inside the rounded badge. */
  icon: ReactNode;
  /** Heading text — bold, with optional inline accented spans. */
  title: ReactNode;
  /** Optional description below heading. */
  desc?: ReactNode;
}

const grid = cva(
  "bg-white dark:bg-neutral-950 px-4 pt-3 pb-3 max-xs:px-3 max-xs:pt-2.5 max-xs:pb-2.5"
);

const iconBadge = cva(
  "w-[34px] h-[34px] rounded-lg border inline-flex items-center justify-center mb-1.5 max-xs:w-7 max-xs:h-7 max-xs:rounded-md max-xs:mb-1",
  {
    variants: {
      framing: {
        loss: "bg-gradient-to-b from-[#fff5f5] to-[#fef2f2] dark:from-red-950/40 dark:to-red-900/30 border-red-100 dark:border-red-900/60 text-red-700 dark:text-red-300",
        gain: "bg-gradient-to-b from-[#f0fdf4] to-[#ecfdf5] dark:from-emerald-950/40 dark:to-emerald-900/30 border-green-100 dark:border-emerald-900/60 text-green-700 dark:text-emerald-300",
        neutral: "bg-gradient-to-b from-neutral-50 to-neutral-100 dark:from-neutral-800 dark:to-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300",
      },
    },
    defaultVariants: { framing: "neutral" },
  }
);

interface InfoGridProps extends VariantProps<typeof iconBadge> {
  cells: InfoGridCell[];
  /** Optional title row at top (uppercase small label with side dividers). */
  title?: ReactNode;
  /** Optional className override. */
  className?: string;
}

const InfoGrid: React.FC<InfoGridProps> = ({ cells, title, framing = "neutral", className }) => {
  const cols = cells.length === 2 ? "grid-cols-2" : cells.length === 4 ? "grid-cols-4" : "grid-cols-3";
  return (
    <div className={cn(grid(), className)}>
      {title ? (
        <div className="text-center font-extrabold text-2xs tracking-[0.18em] uppercase text-neutral-600 dark:text-neutral-400 mb-2.5 relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:w-7 before:h-px before:bg-neutral-200 dark:before:bg-neutral-700 before:[transform:translateX(calc(-100%-130px))] after:content-[''] after:absolute after:top-1/2 after:right-1/2 after:w-7 after:h-px after:bg-neutral-200 dark:after:bg-neutral-700 after:[transform:translateX(calc(100%+130px))] max-xs:text-[9px] max-xs:mb-2 max-xs:before:hidden max-xs:after:hidden">
          {title}
        </div>
      ) : null}

      <div className={cn("grid gap-0 items-stretch", cols)}>
        {cells.map((cell, idx) => (
          <div
            key={idx}
            className={cn(
              "text-center px-2 pt-0.5 relative flex flex-col items-center max-xs:px-1",
              idx > 0 && "before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-1.5 before:w-px before:bg-neutral-200 dark:before:bg-neutral-700 max-xs:before:top-1 max-xs:before:bottom-1"
            )}
          >
            <div className={cn(iconBadge({ framing }))}>{cell.icon}</div>
            <div className="font-extrabold text-xs text-neutral-950 dark:text-white mb-0.5 leading-[1.25] flex-1 max-xs:text-[11px] max-xs:mb-px">
              {cell.title}
            </div>
            {cell.desc ? (
              <div className="text-2xs text-neutral-600 dark:text-neutral-400 leading-[1.35] max-xs:text-[9px] max-xs:leading-[1.3]">
                {cell.desc}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

export default InfoGrid;
export { type InfoGridCell, type InfoGridProps };
