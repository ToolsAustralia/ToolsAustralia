"use client";

/**
 * Dashboard promo banner — ported from the prototype `PromoBanner`.
 *
 * The "50% off one-time packages" line is REAL: it is the member-only **Additional
 * packages** benefit (packages priced at 50% of the one-time price, gated by
 * `hasAdditionalPackageAccess` — see src/utils/membership/additional-package-mapping.ts).
 * So the 50%-off headline shows only when the user actually has that access; the
 * purchase-time free-entry **multiplier** (from `useResolvedMultiplier`) layers on top.
 *
 * Shows when the user has additional-package access OR a multiplier promo is live.
 * Only the palette escalates with the multiplier (gold 1–3× → hot 5×/10×).
 */
import { ArrowRight, Flame } from "lucide-react";
import { useLeafTimer } from "@/hooks/useLeafTimer";
import { getNextMidnightAEST } from "@/utils/common/timezone";
import { cn } from "@/utils/cn";

interface DashboardPromoBannerProps {
  multiplier: number;
  /** Whether the user gets 50%-off Additional packages (members / current-draw entrants). */
  hasAdditionalAccess: boolean;
  onGetPackage: () => void;
  /** Desktop wide layout. */
  wide?: boolean;
  className?: string;
}

function promoTheme(mult: number) {
  if (mult >= 10) return { grad: "linear-gradient(120deg,#ff8a2b,#ff2d55 46%,#b3007a)", ink: "#fff", hot: true };
  if (mult >= 5) return { grad: "linear-gradient(120deg,#ff6a3d,#e0245e 60%,#a1004b)", ink: "#fff", hot: true };
  return { grad: "linear-gradient(120deg,#f6dd8c,#d4af37 58%,#a87f1d)", ink: "#241a02", hot: false };
}

export default function DashboardPromoBanner({
  multiplier,
  hasAdditionalAccess,
  onGetPackage,
  wide,
  className,
}: DashboardPromoBannerProps) {
  const active = multiplier > 1;
  const now = useLeafTimer(1000);
  // Nothing accurate to promote: no 50%-off access and no live multiplier.
  if (!hasAdditionalAccess && !active) return null;

  const t = promoTheme(multiplier);
  const ms = Math.max(0, getNextMidnightAEST().getTime() - now);
  const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
  const timer = `${pad(ms / 3_600_000)}:${pad((ms / 60_000) % 60)}:${pad((ms / 1000) % 60)}`;

  // The offer specifics (50% off, {n}× entries) now live inline in the SPECIAL PROMO
  // strip below, so the body carries just one short context line — no redundant repeat.
  const heading = hasAdditionalAccess ? "On every one-time package" : "Bonus free entries";

  return (
    <section className={className}>
      <div
        className="relative overflow-hidden rounded-[.875rem] shadow-[0_16px_34px_-18px_rgba(212,175,55,.5)]"
        style={{ background: t.grad, color: t.ink }}
      >
        {active && (
          <span
            aria-hidden
            className="promo-banner-shimmer pointer-events-none absolute inset-y-0 left-[-60%] w-[42%]"
            style={{ background: "linear-gradient(105deg,transparent,rgba(255,255,255,.5),transparent)", transform: "skewX(-18deg)" }}
          />
        )}
        <span aria-hidden className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full" style={{ background: "radial-gradient(circle,rgba(255,255,255,.4),transparent 70%)" }} />

        {(hasAdditionalAccess || active) && (
          <div
            className={cn("relative flex items-center justify-between gap-2.5 overflow-hidden", wide ? "px-[22px] py-2.5" : "px-4 py-2")}
            style={{ background: t.hot ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.16)", borderBottom: `1px solid ${t.hot ? "rgba(255,255,255,.28)" : "rgba(0,0,0,.14)"}` }}
          >
            {/* sheen sweep across the strip */}
            <span aria-hidden className="promo-strip-shine pointer-events-none absolute inset-y-0 -left-1/3 w-1/4" style={{ background: "linear-gradient(105deg,transparent,rgba(255,255,255,.55),transparent)" }} />
            <span className="relative inline-flex items-center gap-1.5">
              <Flame className="h-[15px] w-[15px] motion-safe:animate-pulse" style={{ filter: "drop-shadow(0 0 6px rgba(255,190,70,.95))" }} />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ textShadow: "0 1px 3px rgba(0,0,0,.32)" }}>Special promo</span>
            </span>
            {active && (
              <span className="relative inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: t.hot ? "rgba(0,0,0,.25)" : "rgba(255,255,255,.4)" }}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff5a3c] opacity-80" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#ff5a3c]" />
                </span>
                Ends in <span className="num font-black tabular-nums tracking-[.03em]">{timer}</span>
              </span>
            )}
          </div>
        )}

        <div className={cn("relative flex items-center", wide ? "gap-4 px-[22px] py-[15px]" : "gap-3 px-4 py-[13px]")}>
          <div className="min-w-0 flex-1">
            <b className={cn("font-['Poppins'] font-extrabold leading-tight", wide ? "text-[15px]" : "text-[12.5px]")}>{heading}</b>
          </div>
          {/* Offer badges live ON the CTA (50% off / n× entries) so the body text has
              room and doesn't wrap hard — a gold pill each, like the mini-draw sheet. */}
          <div className="relative shrink-0">
            {hasAdditionalAccess && (
              <span className="absolute -left-1.5 -top-2.5 z-10 whitespace-nowrap rounded-full bg-gradient-to-b from-[#f6dd8c] to-[#d4af37] px-1.5 py-0.5 text-[8.5px] font-black text-[#241a02] shadow-[0_6px_12px_-5px_rgba(0,0,0,.5)]">50% off</span>
            )}
            {active && (
              <span className="absolute -right-1.5 -top-2.5 z-10 whitespace-nowrap rounded-full bg-gradient-to-b from-[#f6dd8c] to-[#d4af37] px-1.5 py-0.5 text-[8.5px] font-black text-[#241a02] shadow-[0_6px_12px_-5px_rgba(0,0,0,.5)]">{multiplier}× entries</span>
            )}
            <button
              type="button"
              onClick={onGetPackage}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full font-extrabold shadow-[0_10px_22px_-10px_rgba(0,0,0,.6)] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-safe:active:translate-y-px",
                wide ? "px-5 py-3 text-[13px]" : "px-[15px] py-2.5 text-[12px]",
              )}
              style={t.hot ? { background: "#fff", color: "#c40d0d" } : { background: "linear-gradient(180deg,#2a2109,#151002)", color: "#f6dd8c" }}
            >
              Get a package <ArrowRight className={wide ? "h-4 w-4" : "h-[15px] w-[15px]"} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
