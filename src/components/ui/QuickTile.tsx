"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";

interface QuickTileProps {
  icon: LucideIcon;
  label: string;
  /** Small red count/promo badge (e.g. 2, "+100", "3×"). */
  badge?: number | string;
  /** Accent hex for the glossy icon chip. */
  accentHex?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Renders a muted "Soon" pill and blocks navigation (built-but-hidden feature). */
  comingSoon?: boolean;
  className?: string;
}

/**
 * Glossy quick-action tile — a 56px icon chip + label, ≥44px hit target.
 * Renders a Link when `href` is set (and not disabled/comingSoon), else a button.
 */
export function QuickTile({
  icon: Icon,
  label,
  badge,
  accentHex = "#ee0000",
  href,
  onClick,
  disabled,
  comingSoon,
  className,
}: QuickTileProps) {
  const inactive = disabled || comingSoon;

  const inner = (
    <>
      <span className="relative inline-grid place-items-center">
        <span
          className="grid h-14 w-14 place-items-center rounded-2xl text-white shadow-sm"
          style={{ background: `linear-gradient(150deg, ${accentHex}, ${accentHex}cc)` }}
        >
          <Icon className="h-6 w-6" strokeWidth={2} />
        </span>
        {badge != null && !comingSoon && (
          <span className="absolute -right-1.5 -top-1.5 grid min-w-[20px] place-items-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-extrabold text-white dark:bg-red-500">
            {badge}
          </span>
        )}
        {comingSoon && (
          <span className="absolute -right-2 -top-2 rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
            Soon
          </span>
        )}
      </span>
      <span className="text-center text-xs font-medium text-primary-token dark:text-white">{label}</span>
    </>
  );

  const base = cn(
    "group flex min-h-[44px] flex-col items-center gap-2 rounded-2xl p-2 transition-transform",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2",
    "motion-safe:active:translate-y-px motion-safe:active:scale-[.99]",
    inactive && "cursor-default opacity-60",
    className,
  );

  if (href && !inactive) {
    return (
      <Link href={href} className={base} aria-label={label}>
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={inactive ? undefined : onClick}
      disabled={disabled}
      aria-disabled={inactive || undefined}
      className={base}
    >
      {inner}
    </button>
  );
}

export default QuickTile;
