"use client";

/**
 * Dashboard promo card — sells the purchase-time free-entry multiplier to drive
 * package buys. A compact, dashboard-native surface (NOT the full-bleed marketing
 * PromoBanner, whose scroll-morphing layout is irreconcilable with a card). Only
 * the palette escalates with the multiplier; the layout is constant.
 *
 * Renders only when a real multiplier promo is live (multiplier > 1) — the copy
 * sells that real, resolved multiplier (never a fabricated price discount; the
 * "50% off" line is scoped to the post-purchase upsell per BUSINESS.md, not here).
 */
import Image from "next/image";
import { ArrowRight, Flame } from "lucide-react";
import { multiplierBadgeSrc } from "@/utils/membership/tier-visuals";

interface DashboardPromoBannerProps {
  multiplier: number;
  onGetPackage: () => void;
  className?: string;
}

function promoTheme(mult: number): { gradient: string; ink: string; hot: boolean } {
  if (mult >= 10) return { gradient: "linear-gradient(120deg,#ff8a2b,#ff2d55 46%,#b3007a)", ink: "#ffffff", hot: true };
  if (mult >= 5) return { gradient: "linear-gradient(120deg,#ff6a3d,#e0245e 60%,#a1004b)", ink: "#ffffff", hot: true };
  return { gradient: "linear-gradient(120deg,#f6dd8c,#d4af37 58%,#a87f1d)", ink: "#241a02", hot: false };
}

export default function DashboardPromoBanner({ multiplier, onGetPackage, className }: DashboardPromoBannerProps) {
  if (!multiplier || multiplier <= 1) return null;

  const theme = promoTheme(multiplier);
  const badgeSrc = multiplierBadgeSrc(multiplier);

  return (
    <section
      className={className}
      style={{ color: theme.ink }}
    >
      <div className="relative overflow-hidden rounded-3xl p-5 shadow-lg" style={{ background: theme.gradient }}>
        {theme.hot && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-30 motion-safe:animate-[shimmer_3.4s_linear_infinite]"
            style={{ background: "linear-gradient(115deg, transparent 30%, rgba(255,255,255,.35) 50%, transparent 70%)" }}
          />
        )}

        <div className="relative flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
          <Flame className="h-4 w-4" /> Special promo
        </div>

        <div className="relative mt-2 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-['Poppins'] text-lg font-extrabold leading-tight">Limited-time entry boost</h3>
            <p className="mt-0.5 text-sm font-medium opacity-90">{multiplier}× free entries on every one-time package</p>
          </div>

          <button
            type="button"
            onClick={onGetPackage}
            className="relative inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/85 px-4 py-2 text-sm font-bold text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-safe:active:translate-y-px"
          >
            Get a package <ArrowRight className="h-4 w-4" />
            <span className="absolute -right-2 -top-3">
              {badgeSrc ? (
                <Image src={badgeSrc} alt={`${multiplier}× entries`} width={34} height={34} className="h-8 w-8 object-contain drop-shadow" />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-amber-700 text-[11px] font-black text-white ring-2 ring-white/60">
                  {multiplier}×
                </span>
              )}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
