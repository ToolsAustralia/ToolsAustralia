"use client";

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { DEFAULT_PRIZE_SLUG } from "@/config/prize-summaries";
import { useMajorDrawCountdown } from "@/hooks/useMajorDrawCountdown";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { MajorDrawCountdownLeaf } from "@/components/banners/MajorDrawCountdownLeaf";
import PromoBadgeImage from "@/components/ui/PromoBadgeImage";
import type { PromoMultiplier } from "@/types/promo-multiplier";
import { cn } from "@/utils/cn";

/**
 * The draw's entry point INSIDE the hero — one button, carrying a live timer badge.
 *
 * Why it exists (2026-09-03): `FloatingCountdownBanner` used to be pinned bottom-centre from
 * first paint, where it covered the brand marquee on desktop and a large slice of a phone's
 * first screen. Moving the overlay does not fix that — a fixed overlay covers SOMETHING at
 * every size. So the hero carries its own in-flow CTA and the floating banner takes over only
 * once the hero has scrolled away (see the hero-visibility gate in FloatingCountdownBanner).
 *
 * A full countdown CARD was tried here first and dropped (same day, owner's call): entering the
 * giveaway is the page's main conversion, and a button sitting beside "Become a member" asks for
 * the click far more directly than a panel of digits parked in the corner of the photo. The
 * digits survive as the badge, which is the part that creates the urgency.
 */
interface HeroGiveawayCtaProps {
  className?: string;
}

function HeroGiveawayCtaInner({ className }: HeroGiveawayCtaProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { targetMs, gatesClosed, isReady } = useMajorDrawCountdown();

  /**
   * Same entries multiplier the packages advertise — resolved through the shared hook so a
   * scheduled / toggled / alternating promo moves this badge and the package cards together.
   * Only rendered above 1x: "1x PROMO" advertises nothing.
   */
  const membershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const hasMultiplier = typeof membershipMultiplier === "number" && membershipMultiplier > 1;

  // Same destination as the floating banner — the default prize page, which sells, rather than
  // the /promotions showroom (owner, 2026-07-22).
  const handleEnter = () => {
    const affiliateCode = searchParams.get("aff");
    const target = `/promotions/${DEFAULT_PRIZE_SLUG}`;
    router.push(affiliateCode ? `${target}?aff=${affiliateCode}` : target);
  };

  /**
   * The BUTTON paints immediately; only the CLOCK waits on the draw query.
   *
   * This used to `return null` until the query resolved, which meant the page's main conversion
   * was missing from the hero for as long as an API round-trip took — on a cold cache the first
   * thing a visitor saw was a hero with no way into the giveaway. Nothing about the button needs
   * server data: the destination is a static slug and the label is known.
   *
   * `gatesClosed` derives from `status !== "active"`, so it is `true` while the data is still
   * undefined. Reading it before `isReady` would paint "Visit Page" and then snap to
   * "Enter Giveaway" — so the label only switches once we actually know.
   */
  const label = isReady && gatesClosed ? "Visit Page" : "Enter Giveaway";

  return (
    /**
     * Wrapper exists so the badges can straddle the button's edge: the button itself needs
     * `overflow-hidden` to clip the hover sheen to its rounded shape, which would also clip
     * anything hanging outside it. Badges therefore sit on this (non-clipping) parent.
     */
    <div className={cn("relative flex w-full sm:w-auto", className)}>
      {/* Countdown — four separate tiles straddling the TOP EDGE, matching the tile treatment the
          floating banner and the package cards already use, rather than one continuous pill. It
          sits above the label instead of beside it so the button reads as one short call to
          action and the clock stays a separate, glanceable object. Shifts off-centre when the
          multiplier badge is present so the two never collide. */}
      {/* Upper LEFT. Fixed corner rather than centred so it never shifts when the multiplier
          badge (upper right) appears or disappears with a promo. The offset is ~half the badge's
          own height, which is what puts the button's top edge through the badge's middle rather
          than floating it clear of the button. */}
      <div className="absolute -top-2.5 left-3 z-20 flex gap-0.5">
        {isReady && (
        <MajorDrawCountdownLeaf
          targetMs={targetMs}
          // No SECS tile here, so a 1s tick would re-render 60x a minute to paint the same
          // string. 30s is the coarsest interval that still updates MINS promptly enough.
          tickMs={30000}
          render={({ timeLeft, isExpired }) =>
            isExpired ? (
              <span className="whitespace-nowrap rounded-md bg-black/90 px-2 py-1 text-2xs font-bold uppercase tracking-wide text-red-300 shadow-lg ring-1 ring-white/20">
                Live now
              </span>
            ) : (
              <>
                {(
                  [
                    [timeLeft.days, "DAYS"],
                    [timeLeft.hours, "HRS"],
                    [timeLeft.minutes, "MINS"],
                  ] as const
                ).map(([value, unit]) => (
                  <span
                    key={unit}
                    className={cn(
                      "flex min-w-[30px] flex-col items-center rounded-md bg-gradient-to-br px-1 py-0.5 shadow-lg ring-1",
                      gatesClosed
                        ? "from-yellow-500 via-orange-500 to-orange-600 ring-yellow-300/30"
                        : "from-red-500 via-red-600 to-red-700 ring-red-300/30"
                    )}
                  >
                    <span className="font-poppins text-2xs font-bold leading-none tabular-nums text-white">
                      {value.toString().padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "text-[7px] font-medium leading-none",
                        gatesClosed ? "text-yellow-100" : "text-red-100"
                      )}
                    >
                      {unit}
                    </span>
                  </span>
                ))}
              </>
            )
          }
        />
        )}
      </div>

      {/* Entries multiplier, upper RIGHT. The artwork badge (`/images/badge/X5.webp` etc.) rather
          than the CSS pill — it is the same starburst the promo surfaces already use, and it reads
          as a sticker slapped on the button. `PromoBadgeImage` falls back to a CSS badge for any
          multiplier with no bundled artwork, so an unusual value never renders a broken image.

          The offsets are half the badge's own height/width (h-10 = 40px → 5 = 20px), which is what
          puts the button's top-right CORNER through the middle of the starburst rather than
          tucking the badge inside the button. */}
      {hasMultiplier && (
        <span className="pointer-events-none absolute -top-5 -right-5 z-20 rotate-6">
          <PromoBadgeImage
            multiplier={membershipMultiplier as PromoMultiplier}
            size="small"
            className="h-10 w-auto drop-shadow-lg"
          />
        </span>
      )}

      <button
        type="button"
        onClick={handleEnter}
        aria-label={`${label} — time remaining shown on badge`}
        /**
         * `ta-nudge-attention` is the repo's existing per-visit CTA nudge: four pulses on mount,
         * then still. Reused rather than reinvented, and deliberately NOT an infinite throb — the
         * utility's own note is that a permanently pulsing button reads as noise rather than
         * wayfinding. `--ta-attention` retints its ring from brand red to this button's amber.
         *
         * No device-tier freeze needed: globals.css freezes ALWAYS-ON animations for
         * mobile/tablet/save-data, and this one is finite (4 cycles, ~5.2s) and already sits
         * inside a `prefers-reduced-motion: no-preference` block. A `glow-pulse` marker class
         * would not have worked anyway — that tier rule targets the element, while this
         * animation lives on `::after`.
         */
        className={cn(
          // Sizing mirrors MetallicButton `size="md"` (px-8 py-4 text-lg) so this never reads as
          // the lesser of the two hero CTAs — it is the page's main conversion.
          "ta-nudge-attention group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl",
          "bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-500 px-8 py-4 text-lg font-extrabold text-black",
          "shadow-[0_6px_20px_rgba(251,191,36,0.45)] ring-2 ring-white/70",
          "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(251,191,36,0.65)] hover:ring-white",
          "active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200"
        )}
        style={{ ["--ta-attention" as string]: "rgba(251, 191, 36, 0.7)" }}
      >
        {/* Continuous sheen sweep — the always-on attention cue. `ta-cta-sheen` is defined in
            globals.css inside a `prefers-reduced-motion: no-preference` block, so reduced-motion
            users get a static button and no class-level guard is needed here. */}
        <span
          aria-hidden
          className="ta-cta-sheen pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent"
        />
        {gatesClosed && <Lock className="relative h-4 w-4 flex-shrink-0" />}
        <span className="relative whitespace-nowrap">{label}</span>
      </button>
    </div>
  );
}

/**
 * Suspense self-wrap: `useSearchParams` needs a boundary on a prerendered marketing-class page
 * — docs/security-csp/rules.md R8, same reason `FloatingCountdownBanner` wraps itself.
 */
export default function HeroGiveawayCta(props: HeroGiveawayCtaProps) {
  return (
    <Suspense fallback={null}>
      <HeroGiveawayCtaInner {...props} />
    </Suspense>
  );
}
