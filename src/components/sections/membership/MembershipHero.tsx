"use client";

import { ArrowRight, Trophy, Crown } from "lucide-react";
import MetallicButton from "@/components/ui/MetallicButton";
import AccessRing from "@/components/ui/AccessRing";
import type { MembershipCardCta } from "@/hooks/useMembershipCardCta";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { TIER_HEX, tierKeyFromName, glossGrad, inkOn } from "@/utils/membership/tier-visuals";
import { cn } from "@/utils/cn";

function baseEntries(plan: LocalMembershipPlan): number {
  // hero deck shows BASE entries (not promo-boosted), matching the prototype
  return (plan.metadata?.originalEntries as number | undefined) ?? plan.metadata?.entriesCount ?? 0;
}

function trackFor(ink: string): string {
  return ink === "#ffffff" ? "rgba(255,255,255,.22)" : "rgba(10,10,10,.22)";
}

function DeckCard({ plan, cta }: { plan: LocalMembershipPlan; cta: MembershipCardCta }) {
  const key = tierKeyFromName(plan.name);
  const hex = TIER_HEX[key];
  const ink = inkOn(hex);
  const access = getPartnerCatalogAccessPercentForPlanId(`${key}-subscription`);
  const apex = key === "boss";
  const pos =
    apex
      ? "translate(-50%,-50%) translateY(-12px) scale(1.07)"
      : key === "tradie"
        ? "translate(-50%,-50%) translateX(-80%) translateY(16px) rotateY(22deg) scale(.88)"
        : "translate(-50%,-50%) translateX(80%) translateY(16px) rotateY(-22deg) scale(.88)";
  const shadow = apex
    ? `0 0 0 1px ${hex},0 36px 74px -22px ${hex},0 44px 84px -30px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.55)`
    : `0 0 0 1px ${hex},0 30px 60px -24px ${hex},0 38px 70px -30px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.45)`;
  return (
    <div
      className={cn("group absolute left-1/2 top-1/2 hover:z-30", apex ? "z-[3]" : "z-[1]")}
      style={{ transform: pos }}
    >
      {/* hover bloom — the tier colour glows brighter around the card on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[22px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ boxShadow: `0 0 54px 2px ${hex}` }}
      />
      <button
        type="button"
        onClick={() => cta.onSelect(plan)}
        aria-label={`Choose ${plan.name} — $${plan.price}/mo, ${access}% partner access`}
        className="relative block w-[192px] cursor-pointer overflow-hidden rounded-[22px] border border-white/25 p-0 text-center transition-transform duration-300 ease-out will-change-transform hover:-translate-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        style={{ background: glossGrad(hex), color: ink, boxShadow: shadow }}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[46%]" style={{ background: "linear-gradient(180deg,rgba(255,255,255,.26),transparent)" }} />
        <span
          className="pointer-events-none absolute inset-0 rounded-[22px]"
          style={{ background: "linear-gradient(180deg,rgba(255,255,255,.22),transparent 24%,transparent 70%,rgba(0,0,0,.18))" }}
        />
        {/* sheen sweep on hover */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 opacity-0 transition-all duration-700 ease-out group-hover:left-[120%] group-hover:opacity-100"
          style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent)" }}
        />
        <div className="relative flex flex-col items-center gap-[13px] px-4 pb-[23px] pt-[22px] text-center">
          <span className="font-['Poppins'] text-[15px] font-black uppercase tracking-[0.12em]">{plan.name}</span>
          <AccessRing percent={access} size={84} stroke={8} color={ink} trackColor={trackFor(ink)}>
            <span className="font-['Poppins'] text-[19px] font-extrabold">{access}%</span>
          </AccessRing>
          <span className="-mt-1 text-[9.5px] font-extrabold uppercase tracking-[0.14em] opacity-90">Partner access</span>
          <div className="text-xs leading-tight opacity-85">
            <b className="block font-['Poppins'] text-[18px] font-extrabold leading-tight">{baseEntries(plan)}</b>
            free entries / mo
          </div>
          <div className="font-['Poppins'] text-[23px] font-black">
            ${plan.price}
            <span className="text-xs font-semibold opacity-60">/mo</span>
          </div>
        </div>
      </button>
    </div>
  );
}

export default function MembershipHero({ cta }: { cta: MembershipCardCta }) {
  const plans = cta.membershipPlans;
  const tradie = plans.find((p) => tierKeyFromName(p.name) === "tradie") ?? plans[0];
  return (
    <section
      className="relative overflow-hidden pt-[var(--app-header-h)] text-white lg:pt-[var(--app-header-h-lg)]"
      style={{
        background:
          "radial-gradient(1000px 640px at 82% -12%, rgba(238,0,0,.55), transparent 60%),radial-gradient(760px 560px at 6% 116%, rgba(212,175,55,.28), transparent 60%),linear-gradient(155deg,#1c0e0e 0%,#0b0a0d 52%,#170d18 100%)",
      }}
    >
      <span
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "repeating-linear-gradient(135deg,rgba(255,255,255,.04) 0 1px,transparent 1px 16px)" }}
        aria-hidden
      />
      <div className="relative z-[1] mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:gap-14 lg:py-24">
        {/* Copy */}
        <div>
          <span
            className="inline-flex items-center gap-2.5 rounded-full border px-4 py-2.5 text-[11.5px] font-extrabold uppercase tracking-[0.16em]"
            style={{
              color: "#f1d99a",
              background: "linear-gradient(180deg,rgba(212,175,55,.18),rgba(212,175,55,.05))",
              borderColor: "rgba(212,175,55,.5)",
              boxShadow: "0 0 28px -12px rgba(212,175,55,.7)",
            }}
          >
            <Crown className="h-3.5 w-3.5" style={{ color: "#d4af37" }} /> Tools Australia Membership
          </span>
          <h1 className="mt-5 font-['Poppins'] text-[48px] font-black leading-[0.95] tracking-[-0.03em] sm:text-7xl">
            Save big.
            <br />
            <span style={{ background: "linear-gradient(92deg,#ffe066,#ffb300 70%,#ff8a00)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              Win bigger.
            </span>
          </h1>
          <p className="mt-5 max-w-[520px] text-base leading-relaxed text-white/[0.78] sm:text-lg">
            Member discounts across <b className="font-extrabold text-white">our partner brands</b> — plus free entries
            to win the <b className="font-extrabold text-white">Ultimate Tradie Setup</b>, live on Facebook every month.
          </p>
          <div className="mt-8 flex flex-nowrap items-stretch gap-2.5 sm:gap-3">
            <MetallicButton
              variant="primary"
              size="md"
              borderRadius="full"
              onClick={() => tradie && cta.onSelect(tradie)}
              icon={<ArrowRight className="h-4 w-4" />}
              className="justify-center whitespace-nowrap !rounded-xl !px-4 !text-sm sm:!rounded-full sm:!px-8 sm:!text-base"
            >
              Become a member
            </MetallicButton>
            <a
              href="#prize"
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-4 py-3 text-sm font-extrabold text-[#1a1407] transition-transform hover:-translate-y-0.5 sm:rounded-full sm:px-8 sm:py-4 sm:text-base"
              style={{ background: "linear-gradient(180deg,#ffe9a8,#e6b955 55%,#caa23e)", borderColor: "rgba(255,240,190,.6)", boxShadow: "0 14px 30px -14px rgba(212,175,55,.7)" }}
            >
              See the prize <Trophy className="h-4 w-4" />
            </a>
          </div>
        </div>

        {/* Tier deck (fanned glossy cards) */}
        <div className="relative mx-auto h-[380px] w-full max-w-[600px] [perspective:1400px] sm:h-[420px]">
          {plans.map((p) => (
            <DeckCard key={p.id} plan={p} cta={cta} />
          ))}
        </div>
      </div>
    </section>
  );
}
