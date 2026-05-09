"use client";

import React, { type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

/**
 * UpsellHero — generic dark-hero section for value-reinforcement modals.
 *
 * Pattern extracted from CancellationUpsellModal/Hero.tsx. Supports an
 * eyebrow row (with optional start/end icons + label), an Anton-font dramatic
 * headline, sub-copy, and a slot for a custom infographic (image / chart /
 * progress bar / etc.).
 *
 * The `tone` variant drives the gradient + accent colors. Tier tones use
 * brand-tier-{tradie/foreman/boss} from Plan 1 tokens.
 */

const heroBg = cva(
  "relative px-4 pt-3.5 pb-3 text-white overflow-hidden max-xs:px-3 max-xs:pt-3 max-xs:pb-2.5",
  {
    variants: {
      tone: {
        neutral: "",
        danger: "",
        success: "",
        "tier-tradie": "",
        "tier-foreman": "",
        "tier-boss": "",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

interface UpsellHeroProps extends VariantProps<typeof heroBg> {
  /** Eyebrow content — typically the small uppercase label above the headline.
   * Pass JSX so callers can include icons + dividers (e.g. trophies + lines). */
  eyebrow: ReactNode;
  /** Anton-font dramatic headline. Inline tone-accented spans use color="var(--upsell-accent)". */
  title: ReactNode;
  /** Sub-copy below headline. */
  sub?: ReactNode;
  /** Optional infographic slot — image, chart, progress bar, etc. */
  infographic?: ReactNode;
  /** ID for the headline (for aria-labelledby on parent dialog). Defaults to "upsell-headline". */
  titleId?: string;
  /** Optional className override for the outer wrapper. */
  className?: string;
}

const TONE_BG: Record<NonNullable<UpsellHeroProps["tone"]>, string> = {
  neutral: "bg-gradient-to-b from-[#0a0a0a] via-[#141416] to-[#0a0a0a]",
  danger: "bg-[radial-gradient(900px_320px_at_50%_-120px,rgba(238,0,0,0.34),transparent_65%),linear-gradient(180deg,#0a0a0a_0%,#141416_60%,#0a0a0a_100%)]",
  success: "bg-[radial-gradient(900px_320px_at_50%_-120px,rgba(34,197,94,0.32),transparent_65%),linear-gradient(180deg,#0a0a0a_0%,#141416_60%,#0a0a0a_100%)]",
  "tier-tradie": "bg-[radial-gradient(900px_320px_at_50%_-120px,rgba(0,194,237,0.32),transparent_65%),linear-gradient(180deg,#0a0a0a_0%,#141416_60%,#0a0a0a_100%)]",
  "tier-foreman": "bg-[radial-gradient(900px_320px_at_50%_-120px,rgba(255,210,0,0.30),transparent_65%),linear-gradient(180deg,#0a0a0a_0%,#141416_60%,#0a0a0a_100%)]",
  "tier-boss": "bg-[radial-gradient(900px_320px_at_50%_-120px,rgba(238,0,0,0.34),transparent_65%),linear-gradient(180deg,#0a0a0a_0%,#141416_60%,#0a0a0a_100%)]",
};

const TONE_ACCENT: Record<NonNullable<UpsellHeroProps["tone"]>, string> = {
  neutral: "#d4af37", // premium-gold
  danger: "#ff6b6b",
  success: "#4ade80",
  "tier-tradie": "#5ce0ff",
  "tier-foreman": "#ffe066",
  "tier-boss": "#ff6b6b",
};

const UpsellHero: React.FC<UpsellHeroProps> = ({
  tone = "neutral",
  eyebrow,
  title,
  sub,
  infographic,
  titleId = "upsell-headline",
  className,
}) => {
  const resolvedTone = tone ?? "neutral";
  const accent = TONE_ACCENT[resolvedTone];
  return (
    <div
      className={cn(heroBg({ tone }), TONE_BG[resolvedTone], className)}
      style={{ ["--upsell-accent" as string]: accent } as React.CSSProperties}
    >
      <div className="relative z-[2]">
        {/* Eyebrow row */}
        <div className="flex items-center justify-center gap-2.5 mb-1.5 max-xs:gap-2 max-xs:mb-1">
          {eyebrow}
        </div>

        {/* Headline — Anton font, dramatic */}
        <h2
          id={titleId}
          className="font-acumin font-normal text-[28px] leading-none tracking-[0.005em] text-center uppercase mb-1.5 max-xs:text-[22px]"
        >
          {title}
        </h2>

        {/* Sub-copy */}
        {sub ? (
          <p className="text-center text-xs text-white/70 max-w-[440px] mx-auto mb-2 leading-snug max-xs:text-[11px] max-xs:mb-1.5 max-xs:leading-[1.35]">
            {sub}
          </p>
        ) : null}

        {/* Infographic slot */}
        {infographic ? <div className="mt-1.5 max-xs:mt-1">{infographic}</div> : null}
      </div>
    </div>
  );
};

export default UpsellHero;
export { TONE_ACCENT, type UpsellHeroProps };
