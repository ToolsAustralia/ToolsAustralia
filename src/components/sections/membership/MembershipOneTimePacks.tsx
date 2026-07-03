"use client";

import { useState } from "react";
import Image from "next/image";
import { Bolt, Crown, ChevronDown, ArrowRight, Ticket } from "lucide-react";
import AccessRing from "@/components/ui/AccessRing";
import type { MembershipCardCta } from "@/hooks/useMembershipCardCta";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { getPackageIcon } from "@/utils/images/package-icons";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { getPackageColorScheme } from "@/utils/package-colors/packageColorScheme";
import { glossGrad, inkOn, multiplierBadgeSrc } from "@/utils/membership/tier-visuals";
import { getAdditionalPackDiscount } from "@/utils/membership/additional-pack-discount";
import { cn } from "@/utils/cn";

function trackFor(ink: string): string {
  return ink === "#ffffff" ? "rgba(255,255,255,.22)" : "rgba(10,10,10,.22)";
}

export function PackCard({
  plan,
  cta,
  ctaLabel,
  colorHex,
}: {
  plan: LocalMembershipPlan;
  cta: MembershipCardCta;
  /** When set, renders a visual "Enter Now"-style CTA footer inside the card (promo treatment). */
  ctaLabel?: string;
  /** Override the derived accent hex (treatment-only color alignment); everything derives from it. */
  colorHex?: string;
}) {
  const scheme = getPackageColorScheme(plan.id);
  const hex = colorHex ?? scheme.accentHex;
  const ink = inkOn(hex);
  const access = getPartnerCatalogAccessPercentForPlanId(plan.id);
  const icon = getPackageIcon(plan.id);
  const days = plan.metadata?.partnerDiscountDays as number | undefined;
  const entries = plan.metadata?.entriesCount ?? 0;
  const promo = (plan.metadata?.promoMultiplier as number | undefined) ?? 1;
  const boosted = promo > 1;
  const badgeSrc = multiplierBadgeSrc(promo);
  const locked = cta.isLocked(plan);
  // Additional (member) packs are discounted off the public one-time price → a coupon
  // badge in the top-LEFT (the promo-multiplier badge lives top-right). Null for public packs.
  const discount = getAdditionalPackDiscount(plan.id);
  const isVip = /vip/i.test(plan.id);
  // VIP gets the premium black-and-gold treatment instead of the gold gloss.
  const cardBg = isVip ? "linear-gradient(165deg,#2a241a 0%,#19150e 46%,#0b0906 100%)" : glossGrad(hex);
  const cardInk = isVip ? "#f3d98f" : ink;
  const cardBorder = isVip ? "rgba(212,175,55,.6)" : "rgba(255,255,255,.2)";
  const cardShadow = isVip
    ? "0 0 0 1.5px rgba(212,175,55,.85),0 0 30px -4px rgba(212,175,55,.5),0 22px 46px -22px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,236,180,.3)"
    : `0 0 0 1px ${hex},0 16px 36px -18px ${hex},0 22px 44px -26px rgba(15,23,42,.5),inset 0 1px 0 rgba(255,255,255,.4)`;
  return (
    <button
      type="button"
      onClick={() => !locked && cta.onSelect(plan)}
      className="group relative overflow-hidden rounded-[16px] border text-center transition-transform hover:-translate-y-1.5 disabled:cursor-default"
      style={{ background: cardBg, color: cardInk, borderColor: cardBorder, boxShadow: cardShadow }}
      disabled={locked}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[42%]" style={{ background: isVip ? "linear-gradient(180deg,rgba(255,236,180,.12),transparent)" : "linear-gradient(180deg,rgba(255,255,255,.22),transparent)" }} />
      <span className="pointer-events-none absolute inset-0 rounded-[16px]" style={{ background: "linear-gradient(180deg,transparent 58%,rgba(0,0,0,.16))" }} />
      {isVip && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-1/2 animate-[vip-sheen_3.8s_ease-in-out_infinite]"
          style={{ background: "linear-gradient(90deg,transparent,rgba(255,250,235,.5),transparent)" }}
        />
      )}
      {boosted &&
        (badgeSrc ? (
          <Image
            src={badgeSrc}
            alt={`${promo}x entries`}
            width={140}
            height={140}
            className="pointer-events-none absolute right-0.5 top-5 z-[4] h-[54px] w-[54px] object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,.55)]"
          />
        ) : (
          <span className="absolute right-1.5 top-6 z-[4] inline-flex items-center rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-black text-white">{promo}×</span>
        ))}
      {discount && (
        <span className="absolute left-0 top-5 z-[4] inline-flex items-center gap-1 rounded-r-[9px] bg-gradient-to-r from-[#ee0000] to-[#b00000] py-1 pl-2 pr-2.5 text-[10px] font-black uppercase tracking-[0.04em] text-white shadow-[0_5px_12px_-5px_rgba(238,0,0,.85)]">
          <Ticket className="h-3 w-3" /> {discount.percentOff}% off
        </span>
      )}
      <div className="relative z-[2] bg-black/[0.18] py-[7px] text-[8.5px] font-black uppercase tracking-[0.12em]">One-time payment</div>
      <div className="relative z-[2] flex flex-col items-center gap-2 px-2.5 pb-4 pt-3.5">
        {icon && <Image src={icon} alt="" width={46} height={46} className="h-[46px] w-[46px] object-contain drop-shadow" />}
        {isVip ? (
          <span className="relative z-[2] inline-flex items-center gap-1.5">
            <Crown className="h-4 w-4" style={{ color: "#e8c75a" }} />
            <span
              className="font-['Poppins'] text-[15px] font-black uppercase tracking-[0.2em]"
              style={{ background: "linear-gradient(180deg,#fff1c4,#e8c75a 48%,#c8a13a)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
            >
              {getPackageDisplayName(plan)}
            </span>
          </span>
        ) : (
          <span className="font-['Poppins'] text-[13px] font-black uppercase leading-tight tracking-[0.06em]">{getPackageDisplayName(plan)}</span>
        )}
        <AccessRing
          percent={access}
          size={56}
          stroke={6}
          color={isVip ? "#f0d27a" : ink}
          trackColor={isVip ? "rgba(212,175,55,.28)" : trackFor(ink)}
          glow={isVip ? "rgba(255,214,120,.9)" : undefined}
          pulse={isVip}
        >
          <span className="font-['Poppins'] text-[14px] font-black" style={isVip ? { color: "#fff1c4", textShadow: "0 0 8px rgba(255,214,120,.7)" } : undefined}>
            {access}%
          </span>
        </AccessRing>
        <span className="text-[9px] font-bold uppercase tracking-[0.06em] opacity-80">catalogue access</span>
        {typeof days === "number" && days > 0 && <span className="text-[10.5px] opacity-80">{days}-day window</span>}
        <span className="inline-flex items-center gap-1 text-[11.5px] font-extrabold">
          <Bolt className="h-3 w-3" /> {entries.toLocaleString()} free entries
        </span>
        <div className="mt-0.5 font-['Poppins'] text-[20px] font-black">${plan.price}</div>
        {ctaLabel && (
          <span
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[12px] px-3 py-2 font-['Poppins'] text-[12.5px] font-black"
            style={
              isVip
                ? {
                    // VIP card is near-black — a dark button vanishes. Gold button + dark ink,
                    // matching the VIP gold text/theme, so the CTA reads clearly.
                    background: "linear-gradient(180deg,#fbe9b0,#e8c75a 46%,#c8a13a)",
                    color: "#1a1206",
                    boxShadow:
                      "0 8px 20px -12px rgba(212,175,55,.75),inset 0 1px 0 rgba(255,244,210,.65),inset 0 -1px 0 rgba(120,90,20,.5)",
                  }
                : {
                    background: "linear-gradient(180deg,#18181e,#0b0b0d)",
                    color: "#ffffff",
                    boxShadow: "0 8px 20px -12px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.14),inset 0 -1px 0 rgba(0,0,0,.5)",
                  }
            }
          >
            {ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * "Not subscribing?" one-time packs — collapsed by default and tucked under the
 * subscription tier cards (a secondary cross-sell, not the headline offer).
 * Expands with a smooth grid-rows reveal; overflow is freed once open so the
 * cards' hover-lift and glow shadows aren't clipped.
 */
export default function MembershipOneTimePacks({ cta }: { cta: MembershipCardCta }) {
  const [open, setOpen] = useState(false);
  const [clip, setClip] = useState(true);

  const toggle = () => {
    if (open) setClip(true); // re-clip before collapsing so the shrink stays tidy
    setOpen((o) => !o);
  };

  // Collapsed-handle teaser — every surfaced fact is derived from live plan data
  // (from-price, live multiplier, chip peek); nothing hardcoded.
  const plans = cta.oneTimePlans ?? [];
  const total = plans.length;
  const priceFrom = total ? Math.min(...plans.map((p) => p.price)) : null;
  const liveMult = (plans[0]?.metadata?.promoMultiplier as number | undefined) ?? 1;
  const boosted = liveMult > 1;
  const liveBadge = boosted ? multiplierBadgeSrc(liveMult) : null;
  const visibleChips = plans.slice(0, 4); // cap the peek so it never wraps on mobile
  const overflowChips = total - visibleChips.length;

  return (
    <div className="mt-12">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? "Hide one-time pack catalogue" : "Show one-time pack catalogue"}
        className="group/handle relative mx-auto flex min-h-[60px] w-full max-w-2xl items-center gap-3 overflow-hidden rounded-[20px] border border-token bg-card px-4 py-3 text-left shadow-[0_1px_0_rgba(255,255,255,.6)_inset,0_12px_30px_-18px_rgba(15,23,42,.5)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-red-500/40 hover:shadow-[0_1px_0_rgba(255,255,255,.6)_inset,0_20px_44px_-20px_rgba(238,0,0,.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 dark:shadow-[0_1px_0_rgba(255,255,255,.08)_inset,0_12px_30px_-18px_rgba(0,0,0,.7)] sm:gap-4 sm:px-5 sm:py-3.5"
      >
        {/* top red→gold hairline — ties the page's two brand accents into one detail */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{ background: "linear-gradient(90deg,rgba(238,0,0,.9),rgba(212,175,55,.95) 78%,rgba(241,217,154,.5))" }}
        />
        {/* faint brand wash so the handle never reads as a flat default card */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70 transition-opacity duration-300 group-hover/handle:opacity-100"
          style={{ background: "radial-gradient(120% 140% at 0% 0%, rgba(212,175,55,.10), transparent 55%), radial-gradient(120% 160% at 100% 100%, rgba(238,0,0,.08), transparent 55%)" }}
        />

        {/* copy block — price-anchor woven into the sub-line (its only home) */}
        <span className="relative z-[2] flex min-w-0 flex-none flex-col">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-600">Not subscribing?</span>
          <span className="hidden text-[12.5px] leading-tight text-muted-token sm:block">
            Pay once{priceFrom != null ? ` from $${priceFrom}` : ""} — pick your access window.
          </span>
        </span>

        {/* glossy pack-chip teaser strip — the peek that sells the drawer.
            overflow-hidden + left-fade mask clip the chips at the strip's own left
            edge, so on narrow phones they can never bleed over the eyebrow text. */}
        <span
          className="relative z-[2] ml-auto flex min-w-0 flex-1 items-center justify-end overflow-hidden"
          style={{
            WebkitMaskImage: "linear-gradient(90deg,transparent,#000 26%)",
            maskImage: "linear-gradient(90deg,transparent,#000 26%)",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
          }}
          aria-hidden
        >
          <span className="flex items-center">
            {/* live entries-multiplier badge — art when available, gold text pill otherwise */}
            {boosted &&
              (liveBadge ? (
                <Image
                  src={liveBadge}
                  alt=""
                  width={64}
                  height={64}
                  className="mr-1.5 hidden h-8 w-8 flex-none object-contain drop-shadow-[0_2px_5px_rgba(0,0,0,.45)] sm:block"
                />
              ) : (
                <span
                  className="mr-1.5 hidden flex-none items-center rounded-full px-2 py-0.5 text-[11px] font-black sm:inline-flex"
                  style={{
                    color: "#f1d99a",
                    background: "linear-gradient(180deg,rgba(212,175,55,.18),rgba(212,175,55,.05))",
                    border: "1px solid rgba(212,175,55,.5)",
                    boxShadow: "0 0 22px -12px rgba(212,175,55,.7)",
                  }}
                >
                  {liveMult}× entries
                </span>
              ))}

            {/* overlapping glossy chips (fade handled by the strip wrapper) */}
            <span className="relative flex items-center pr-1">
              {visibleChips.map((p, i) => {
                const isVip = /vip/i.test(p.id);
                const accent = getPackageColorScheme(p.id).accentHex;
                const chipBg = isVip ? "linear-gradient(160deg,#2a241a,#0b0906)" : glossGrad(accent);
                const chipInk = isVip ? "#f3d98f" : inkOn(accent);
                const icon = getPackageIcon(p.id);
                return (
                  <span
                    key={p.id}
                    className="relative grid h-9 w-9 flex-none place-items-center rounded-[11px] border sm:h-10 sm:w-10"
                    style={{
                      marginLeft: i === 0 ? 0 : "-10px",
                      zIndex: i + 1,
                      background: chipBg,
                      color: chipInk,
                      borderColor: isVip ? "rgba(212,175,55,.6)" : "rgba(255,255,255,.55)",
                      boxShadow: isVip
                        ? "0 0 0 1px rgba(212,175,55,.7),0 6px 14px -8px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,236,180,.35)"
                        : `0 0 0 1px ${accent}66,0 6px 14px -8px ${accent},inset 0 1px 0 rgba(255,255,255,.55)`,
                    }}
                  >
                    <span
                      className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[11px]"
                      style={{ background: "linear-gradient(180deg,rgba(255,255,255,.35),transparent)" }}
                    />
                    {isVip ? (
                      <Crown className="relative h-4 w-4" style={{ color: "#e8c75a" }} />
                    ) : icon ? (
                      <Image src={icon} alt="" width={28} height={28} className="relative h-5 w-5 object-contain drop-shadow-sm" />
                    ) : (
                      <span className="relative text-[12px] font-black">{p.name.charAt(0)}</span>
                    )}
                  </span>
                );
              })}

              {/* +N "see all" chip — gold eyebrow recipe */}
              {overflowChips > 0 && (
                <span
                  className="relative -ml-[10px] grid h-9 w-9 flex-none place-items-center rounded-[11px] text-[11px] font-black sm:h-10 sm:w-10"
                  style={{
                    zIndex: visibleChips.length + 1,
                    color: "#f1d99a",
                    background: "linear-gradient(180deg,rgba(212,175,55,.18),rgba(212,175,55,.05))",
                    border: "1px solid rgba(212,175,55,.5)",
                    boxShadow: "0 0 22px -10px rgba(212,175,55,.7),inset 0 1px 0 rgba(255,236,180,.3)",
                  }}
                >
                  +{overflowChips}
                </span>
              )}
            </span>
          </span>
        </span>

        {/* glossy near-black chevron disc — same recipe as the tier-card CTAs; rotates on open */}
        <span
          aria-hidden
          className="relative z-[2] grid h-10 w-10 flex-none place-items-center rounded-[13px] text-white transition-transform duration-300 group-hover/handle:-translate-y-0.5"
          style={{
            background: "linear-gradient(180deg,#18181e,#0b0b0d)",
            boxShadow: "0 10px 24px -12px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.14),inset 0 -1px 0 rgba(0,0,0,.5),0 0 0 1px rgba(212,175,55,.22)",
          }}
        >
          <ChevronDown className={cn("h-5 w-5 transition-transform duration-300", open && "rotate-180")} style={{ color: "#f1d99a" }} />
        </span>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-500 ease-out",
          open ? "mt-6 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        onTransitionEnd={() => {
          if (open) setClip(false);
        }}
      >
        <div className={cn(clip ? "overflow-hidden" : "overflow-visible")}>
          <div className="mx-auto grid max-w-[1180px] grid-cols-2 justify-center gap-3.5 px-0.5 py-1 sm:grid-cols-3 lg:grid-cols-6">
            {cta.oneTimePlans.map((p) => (
              <PackCard key={p.id} plan={p} cta={cta} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
