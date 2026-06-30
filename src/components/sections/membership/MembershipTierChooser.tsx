"use client";

import { useRef } from "react";
import Image from "next/image";
import { Check, ArrowRight } from "lucide-react";
import AccessRing from "@/components/ui/AccessRing";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import BestValueBadge from "@/components/ui/BestValueBadge";
import CornerRibbonBadge from "@/components/ui/CornerRibbonBadge";
import { useInViewportAnimation } from "@/hooks/useInViewportAnimation";
import type { MembershipCardCta } from "@/hooks/useMembershipCardCta";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { getPackageIcon } from "@/utils/images/package-icons";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { TIER_HEX, tierKeyFromName, glossGrad, inkOn, inkDark, multiplierBadgeSrc } from "@/utils/membership/tier-visuals";
import { cn } from "@/utils/cn";
import MembershipOneTimePacks from "./MembershipOneTimePacks";

function trackFor(ink: string): string {
  return ink === "#ffffff" ? "rgba(255,255,255,.22)" : "rgba(10,10,10,.22)";
}

function TierCard({ plan, cta }: { plan: LocalMembershipPlan; cta: MembershipCardCta }) {
  const key = tierKeyFromName(plan.name);
  const hex = TIER_HEX[key];
  const ink = inkOn(hex);
  const dark = inkDark(hex);
  const access = getPartnerCatalogAccessPercentForPlanId(`${key}-subscription`);
  const icon = getPackageIcon(plan.id);
  const apex = key === "foreman";
  const promo = (plan.metadata?.promoMultiplier as number | undefined) ?? 1;
  const base = (plan.metadata?.originalEntries as number | undefined) ?? plan.metadata?.entriesCount ?? 0;
  const entries = plan.metadata?.entriesCount ?? 0;
  const boosted = promo > 1;
  const badgeSrc = multiplierBadgeSrc(promo);
  const numRef = useRef<HTMLSpanElement>(null);
  const numInView = useInViewportAnimation(numRef);

  const tint = dark ? "rgba(0,0,0,.07)" : "rgba(255,255,255,.08)";
  const seam = dark ? "rgba(28,20,3,.2)" : "rgba(255,255,255,.18)";
  const feats = [
    `Unlocks ${access}% of the partner catalogue`,
    "Partner discounts stay live while subscribed",
    "Cancel anytime — no lock-in",
  ];

  return (
    <div className="relative h-full">
      {key === "foreman" && <CornerRibbonBadge position="top-left" size="small">Most Popular</CornerRibbonBadge>}
      {key === "boss" && (
        <BestValueBadge
          size="small"
          position="top-left"
          badgeStyle={{ background: "linear-gradient(135deg,#7a5c12 0%,#b8860b 22%,#f0d27a 50%,#b8860b 78%,#5c4510 100%)", boxShadow: "0 5px 14px rgba(0,0,0,.35)", border: "none" }}
        />
      )}
      <div
        className="relative flex h-full flex-col overflow-hidden rounded-[20px] border border-white/20"
        style={{
          background: glossGrad(hex),
          color: ink,
          boxShadow: apex
            ? `inset 0 1px 0 rgba(255,255,255,.45),0 0 0 1px ${hex},0 24px 54px -20px ${hex},0 32px 72px -36px rgba(15,23,42,.6)`
            : `inset 0 1px 0 rgba(255,255,255,.4),0 0 0 1px ${hex},0 18px 44px -22px ${hex}`,
        }}
      >
        <span className="pointer-events-none absolute inset-0 rounded-[20px]" style={{ background: "linear-gradient(180deg,rgba(255,255,255,.22),transparent 24%)" }} />
        <span className="pointer-events-none absolute inset-0 rounded-[20px]" style={{ background: "linear-gradient(180deg,transparent 56%,rgba(0,0,0,.14))" }} />

        {/* Zone 1 — identity */}
        <div className="relative flex items-center gap-3 px-5 py-4">
          <span className="grid h-[52px] w-[52px] flex-none place-items-center rounded-[15px]" style={{ background: "linear-gradient(160deg,rgba(255,255,255,.3),rgba(255,255,255,.08))", boxShadow: "inset 0 1px 0 rgba(255,255,255,.45),inset 0 -1px 2px rgba(0,0,0,.16),0 2px 6px -2px rgba(0,0,0,.32)" }}>
            {icon && <Image src={icon} alt="" width={40} height={40} className="h-10 w-10 object-contain drop-shadow" />}
          </span>
          <span className="font-['Poppins'] text-[16px] font-black uppercase tracking-[0.13em]">{plan.name}</span>
          <div className="ml-auto text-right leading-none">
            <span className="font-['Poppins'] text-[26px] font-black">${plan.price}</span>
            <span className="ml-0.5 text-xs font-semibold opacity-70">/mo</span>
          </div>
        </div>

        {/* Zone 2 — stats */}
        <div className="relative grid grid-cols-[1fr_1px_auto] items-center gap-4 px-5 py-4" style={{ background: tint, borderTop: `1px solid ${seam}` }}>
          <div className="relative flex min-w-0 flex-col">
            {boosted && (
              // Fixed-height header zone. The badge is absolutely positioned and
              // anchored to grow UPWARD, so changing its size never reflows the
              // number or the card — it just floats bigger in the top-right.
              <div className="relative mb-1 h-[26px]">
                <span className="absolute bottom-0 left-0 text-xs font-semibold opacity-70">was <s>{base}</s></span>
                {badgeSrc ? (
                  <Image
                    src={badgeSrc}
                    alt={`${promo}x entries`}
                    width={160}
                    height={160}
                    className="pointer-events-none absolute -bottom-2 -right-8 sm:-bottom-5 sm:-right-4 z-10 h-[66px] w-[66px] object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,.45)] sm:h-[66px] sm:w-[66px]"
                  />
                ) : (
                  <span className="absolute bottom-0 right-0 inline-flex items-center rounded-full bg-black/15 px-2 py-0.5 text-[11px] font-black">{promo}×</span>
                )}
              </div>
            )}
            <span
              ref={numRef}
              className={cn("inline-block font-['Poppins'] text-[50px] font-black leading-[0.9] tracking-[-0.03em]", numInView && "animate-[entries-bounce_0.7s_cubic-bezier(.34,1.56,.64,1)_both]")}
              style={boosted ? { textShadow: `0 0 24px ${hex}` } : undefined}
            >
              <AnimatedNumber value={entries} />
            </span>
            <span className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.04em]">free entries / month</span>
            <span className="mt-0.5 text-[11.5px] font-semibold opacity-[0.72]">they stack while you stay</span>
          </div>
        <span className="h-full self-stretch" style={{ background: seam }} />
        <div className="flex flex-col items-center gap-2">
          <AccessRing percent={access} size={100} stroke={10} color={ink} trackColor={trackFor(ink)}>
            <span className="font-['Poppins'] text-[21px] font-black">{access}%</span>
          </AccessRing>
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-[0.78]">catalogue access</span>
        </div>
      </div>

      {/* Zone 3 — trust */}
      <div className="relative flex flex-col gap-[9px] px-5 py-4" style={{ borderTop: `1px solid ${seam}` }}>
        {feats.map((f) => (
          <div key={f} className="flex items-start gap-[9px] text-[12.5px] font-semibold leading-snug">
            <Check className="mt-0.5 h-3.5 w-3.5 flex-none opacity-90" /> <span>{f}</span>
          </div>
        ))}
      </div>

      {/* Zone 4 — footer */}
      <div className="relative mt-auto px-5 py-4" style={{ background: tint, borderTop: `1px solid ${seam}` }}>
        <button
          type="button"
          onClick={() => cta.onSelect(plan)}
          className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[14px] font-['Poppins'] text-[14.5px] font-black text-white transition-transform hover:-translate-y-0.5"
          style={{ background: "linear-gradient(180deg,#18181e,#0b0b0d)", boxShadow: "0 10px 24px -12px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.14),inset 0 -1px 0 rgba(0,0,0,.5)" }}
        >
          {cta.ctaLabelFor(plan)} <ArrowRight className="h-4 w-4" />
        </button>
        </div>
      </div>
    </div>
  );
}

export default function MembershipTierChooser({ cta }: { cta: MembershipCardCta }) {
  return (
    <section
      id="membership"
      className="relative overflow-hidden bg-page py-16 sm:py-20 lg:py-24"
      style={{
        background:
          "radial-gradient(720px 480px at 8% 2%, rgba(0,194,237,.12), transparent 58%),radial-gradient(860px 560px at 50% -14%, rgba(255,200,0,.1), transparent 56%),radial-gradient(760px 540px at 94% 108%, rgba(238,0,0,.1), transparent 58%)",
      }}
    >
      <div className="relative z-[1] mx-auto max-w-7xl px-5 sm:px-6">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary-token dark:text-white">
            <span className="flex gap-1">
              <i className="h-1.5 w-1.5 rounded-full" style={{ background: "#00c2ed" }} />
              <i className="h-1.5 w-1.5 rounded-full" style={{ background: "#ffd200" }} />
              <i className="h-1.5 w-1.5 rounded-full" style={{ background: "#ee0000" }} />
            </span>
            Choose your tier
          </span>
          <h2 className="mt-3.5 font-['Poppins'] text-3xl font-black tracking-tight text-primary-token sm:text-4xl lg:text-5xl dark:text-white">
            Pick how far{" "}
            <span style={{ background: "linear-gradient(92deg,#ff3b3b,#ee0000 58%,#b40000)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>you go.</span>
          </h2>
          <p className="mx-auto mt-3.5 max-w-2xl text-base text-muted-token sm:text-lg">
            More of the catalogue as you climb, plus more free entries every month you stay.
          </p>
        </div>

        <div className="mt-10 grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cta.membershipPlans.map((p) => (
            <TierCard key={p.id} plan={p} cta={cta} />
          ))}
        </div>

        {/* Secondary cross-sell: one-time packs, collapsed under the tiers. */}
        <MembershipOneTimePacks cta={cta} />
      </div>
    </section>
  );
}
