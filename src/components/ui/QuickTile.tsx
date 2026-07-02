"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";
import { shade } from "@/utils/membership/tier-visuals";

interface QuickTileProps {
  icon: LucideIcon;
  label: string;
  /** Small badge (count / "+100" / "10×"). Always rendered as the red pill, per prototype. */
  badge?: number | string;
  /** Accent color for the glossy icon chip. */
  accentHex?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Renders a muted "Soon" pill and blocks navigation (built-but-hidden feature). */
  comingSoon?: boolean;
  /** On a dark surface: lighten the label. */
  dark?: boolean;
  className?: string;
}

/**
 * Glossy quick-action tile — ported from the Claude prototype `QuickTile`:
 * a 56px rounded-18 chip with a 158deg gloss gradient + top highlight + white
 * icon, a label below, and a red badge pinned top-right.
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
  dark,
  className,
}: QuickTileProps) {
  const c = accentHex;
  const inactive = disabled || comingSoon;

  const inner = (
    <>
      <span
        className="relative grid h-14 w-14 place-items-center overflow-hidden rounded-[18px] text-white"
        style={{
          background: `linear-gradient(158deg, ${shade(c, 26)}, ${c} 62%, ${shade(c, -14)})`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,.45), 0 10px 20px -10px ${c}, 0 0 0 1px rgba(255,255,255,.06)`,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[52%]"
          style={{ background: "linear-gradient(180deg,rgba(255,255,255,.3),transparent)" }}
        />
        <Icon className="relative h-6 w-6 [filter:drop-shadow(0_1px_1px_rgba(0,0,0,.28))]" strokeWidth={2} />
      </span>
      <span className={cn("text-center text-[10.5px] font-semibold leading-tight", dark ? "text-white/85" : "text-primary-token dark:text-white")}>
        {label}
      </span>
      {badge != null && !comingSoon && (
        <span
          className="absolute -top-1 left-1/2 translate-x-[16px] rounded-md px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-white shadow-[0_6px_12px_-6px_rgba(0,0,0,.5)]"
          style={{ background: "linear-gradient(180deg,#ff3b3b,#c40d0d)" }}
        >
          {badge}
        </span>
      )}
      {comingSoon && (
        <span className="absolute -top-1 left-1/2 translate-x-[16px] rounded-md bg-neutral-200 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
          Soon
        </span>
      )}
    </>
  );

  const base = cn(
    "group relative flex min-h-[44px] flex-col items-center gap-2.5 rounded-2xl border-0 bg-transparent p-1 transition-transform",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2",
    "motion-safe:active:translate-y-px motion-safe:active:scale-[.99]",
    inactive && "cursor-default opacity-70",
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
    <button type="button" onClick={inactive ? undefined : onClick} disabled={disabled} aria-disabled={inactive || undefined} className={base}>
      {inner}
    </button>
  );
}

export default QuickTile;
