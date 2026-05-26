"use client";

import React from "react";
import { AlertTriangle, XCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

interface AlertBannerProps extends VariantProps<typeof banner> {
  /** Optional bold title above the message. */
  title?: string;
  /** Body text. Optional — banner can be title-only. */
  message?: string;
}

const banner = cva(
  "rounded-xl border mb-3 sm:mb-4 p-3 sm:p-4 flex items-start gap-2",
  {
    variants: {
      variant: {
        warn: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-200",
        error: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300",
      },
    },
    defaultVariants: { variant: "warn" },
  }
);

const iconColor = cva("flex-shrink-0 mt-0.5 w-4 h-4 sm:w-5 sm:h-5", {
  variants: {
    variant: {
      warn: "text-amber-700 dark:text-amber-400",
      error: "text-red-600 dark:text-red-400",
    },
  },
  defaultVariants: { variant: "warn" },
});

const AlertBanner: React.FC<AlertBannerProps> = ({ variant = "warn", title, message }) => {
  const Icon = variant === "error" ? XCircle : AlertTriangle;

  return (
    <div className={cn(banner({ variant }))} role="alert">
      <Icon className={cn(iconColor({ variant }))} aria-hidden />
      <div className="flex-1 min-w-0">
        {title ? (
          <h4
            className={cn(
              "text-xs sm:text-sm font-semibold mb-1",
              variant === "warn" ? "text-amber-900 dark:text-amber-200" : "text-red-900 dark:text-red-200"
            )}
          >
            {title}
          </h4>
        ) : null}
        {message ? (
          <p
            className={cn(
              "text-xs sm:text-sm",
              variant === "warn" ? "text-amber-800 dark:text-amber-200" : "text-red-700 dark:text-red-300"
            )}
          >
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default AlertBanner;
