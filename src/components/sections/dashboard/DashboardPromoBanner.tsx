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
import Image from "next/image";
import { ArrowRight, Flame, Clock, Ticket } from "lucide-react";
import { useLeafTimer } from "@/hooks/useLeafTimer";
import { getNextMidnightAEST } from "@/utils/common/timezone";
import { multiplierBadgeSrc } from "@/utils/membership/tier-visuals";
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
  const badgeSrc = multiplierBadgeSrc(multiplier);

  const heading = hasAdditionalAccess ? "50% off one-time packages" : "Bonus free entries";
  const subtitle = active ? `${multiplier}× free entries on every package` : "Additional packages — half the one-time price";

  return (
    <section className={className}>
      <div
        className="relative overflow-hidden rounded-[.875rem] shadow-[0_16px_34px_-18px_rgba(212,175,55,.5)]"
        style={{ background: t.grad, color: t.ink }}
      >
        {active && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-[-60%] w-[42%] motion-safe:animate-[shimmer_3.4s_linear_infinite]"
            style={{ background: "linear-gradient(105deg,transparent,rgba(255,255,255,.5),transparent)", transform: "skewX(-18deg)" }}
          />
        )}
        <span aria-hidden className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full" style={{ background: "radial-gradient(circle,rgba(255,255,255,.4),transparent 70%)" }} />

        {active && (
          <div
            className={cn("relative flex items-center justify-between gap-2.5", wide ? "px-[22px] py-[9px]" : "px-4 py-2")}
            style={{ background: t.hot ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.14)", borderBottom: `1px solid ${t.hot ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.1)"}` }}
          >
            <span className="inline-flex items-center gap-1.5 text-[9.5px] font-black uppercase tracking-[0.08em]">
              <Flame className="h-3 w-3" /> Special promo
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold">
              <Clock className="h-3 w-3 opacity-80" /> Ends in <span className="num font-black tabular-nums tracking-[.02em]">{timer}</span>
            </span>
          </div>
        )}

        <div className={cn("relative flex items-center", wide ? "gap-[18px] px-[22px] py-[18px]" : "gap-3 px-4 py-[15px]")}>
          {/* Multiplier badge image — shown container-less and large (matches the
              special-packages modal). Falls back to a ticket glyph when no
              multiplier is live (50%-off-only banner). */}
          {badgeSrc ? (
            <Image
              src={badgeSrc}
              alt={`${multiplier}× entries`}
              width={wide ? 92 : 80}
              height={wide ? 92 : 80}
              className={cn("shrink-0 object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,.42)]", wide ? "h-[76px] w-[76px]" : "h-[64px] w-[64px]")}
            />
          ) : (
            <span
              className={cn("grid shrink-0 place-items-center rounded-xl", wide ? "h-[46px] w-[46px]" : "h-[42px] w-[42px]")}
              style={{ background: t.hot ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.16)" }}
            >
              <Ticket className={wide ? "h-[23px] w-[23px]" : "h-[21px] w-[21px]"} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <b className={cn("font-['Poppins'] font-extrabold leading-tight", wide ? "text-[17px]" : "text-[14.5px]")}>{heading}</b>
            <div className={cn("mt-1 font-bold", wide ? "text-[11.5px]" : "text-[10.5px]")} style={{ color: t.hot ? "rgba(255,255,255,.85)" : "rgba(36,26,2,.72)" }}>
              {subtitle}
            </div>
          </div>
          <button
            type="button"
            onClick={onGetPackage}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full font-extrabold shadow-[0_10px_22px_-10px_rgba(0,0,0,.6)] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-safe:active:translate-y-px",
              wide ? "px-5 py-3 text-[13px]" : "px-[15px] py-3 text-[12px]",
            )}
            style={t.hot ? { background: "#fff", color: "#c40d0d" } : { background: "linear-gradient(180deg,#2a2109,#151002)", color: "#f6dd8c" }}
          >
            Get a package <ArrowRight className={wide ? "h-4 w-4" : "h-[15px] w-[15px]"} />
          </button>
        </div>
      </div>
    </section>
  );
}
