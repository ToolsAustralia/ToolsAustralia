"use client";

import React, { type ReactNode } from "react";
import { Star } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

/**
 * UrgencyBanner — value-reinforcement banner with icon + title + sub-copy.
 *
 * Pattern extracted from CancellationUpsellModal/Banner.tsx. The `tone` variant
 * drives the gradient + icon background.
 */

const banner = cva(
  "mt-2.5 border rounded-[10px] px-2.5 py-2 flex gap-2 items-center max-xs:mt-2 max-xs:px-2 max-xs:py-1.5 max-xs:gap-1.5 max-xs:rounded-lg",
  {
    variants: {
      tone: {
        gold: "bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/40 dark:to-amber-900/30 border-amber-200 dark:border-amber-800/50",
        info: "bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/30 border-blue-200 dark:border-blue-800/50",
        warning: "bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/40 dark:to-orange-900/30 border-orange-200 dark:border-orange-800/50",
      },
    },
    defaultVariants: { tone: "gold" },
  }
);

const iconWrap = cva(
  "w-[26px] h-[26px] grow-0 shrink-0 basis-[26px] rounded-full inline-flex items-center justify-center max-xs:w-[22px] max-xs:h-[22px] max-xs:basis-[22px]",
  {
    variants: {
      tone: {
        gold: "bg-gradient-to-br from-[#f4cf6b] to-premium-gold text-neutral-950 shadow-[0_4px_10px_rgba(212,175,55,0.3)]",
        info: "bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-[0_4px_10px_rgba(37,99,235,0.3)]",
        warning: "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-[0_4px_10px_rgba(234,88,12,0.3)]",
      },
    },
    defaultVariants: { tone: "gold" },
  }
);

const subCopy = cva("text-[11px] font-semibold mt-0.5 leading-[1.3] max-xs:text-2xs", {
  variants: {
    tone: {
      gold: "text-[#5b2a02] dark:text-amber-200",
      info: "text-blue-900 dark:text-blue-200",
      warning: "text-orange-900 dark:text-orange-200",
    },
  },
  defaultVariants: { tone: "gold" },
});

interface UrgencyBannerProps extends VariantProps<typeof banner> {
  title: ReactNode;
  sub?: ReactNode;
  /** Optional custom icon. Defaults to lucide Star (filled). */
  icon?: ReactNode;
  className?: string;
}

const UrgencyBanner: React.FC<UrgencyBannerProps> = ({ tone = "gold", title, sub, icon, className }) => {
  return (
    <div className={cn(banner({ tone }), className)}>
      <span className={cn(iconWrap({ tone }))}>
        {icon ?? <Star size={16} fill="currentColor" className="max-xs:size-3" />}
      </span>
      <div>
        <div className="text-xs font-extrabold text-neutral-950 dark:text-white leading-[1.25] max-xs:text-[11px]">
          {title}
        </div>
        {sub ? <div className={cn(subCopy({ tone }))}>{sub}</div> : null}
      </div>
    </div>
  );
};

export default UrgencyBanner;
export { type UrgencyBannerProps };
