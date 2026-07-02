"use client";

import { Crown, Flame } from "lucide-react";
import { cn } from "@/utils/cn";
import type { MembershipCardCta } from "@/hooks/useMembershipCardCta";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { TIER_HEX, tierKeyFromName, glossGrad, inkOn } from "@/utils/membership/tier-visuals";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";

interface MembershipTierListProps {
  cta: MembershipCardCta;
  /** Whether the user is an active member (drives "Change your tier" vs "Choose a membership"). */
  isMember: boolean;
}

/**
 * Compact tier list + one-time-pack scroll for the account Membership page —
 * ported from the prototype `MembershipPage`. Dumb rows driven by the verified
 * `useMembershipCardCta` state machine (upgrade/downgrade/current/past-due/guest).
 */
export default function MembershipTierList({ cta, isMember }: MembershipTierListProps) {
  return (
    <>
      <section>
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">
          {isMember ? "Change your tier" : "Choose a membership"}
        </span>
        <div className="mt-3 flex flex-col gap-2.5">
          {cta.membershipPlans.map((plan: LocalMembershipPlan) => {
            const key = tierKeyFromName(plan.name);
            const hex = TIER_HEX[key];
            const access = getPartnerCatalogAccessPercentForPlanId(`${key}-subscription`);
            const entries = plan.metadata?.entriesCount ?? 0;
            const promo = (plan.metadata?.promoMultiplier as number | undefined) ?? 1;
            const isCurrent = cta.ctaLabelFor(plan) === "Current Plan";
            const showUpgrade = promo > 1 && !isCurrent;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => cta.onSelect(plan)}
                className={cn(
                  "flex items-center gap-3 rounded-[1.1rem] border bg-surface p-[15px] text-left shadow-sm transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px",
                  isCurrent ? "border-[1.5px]" : "border-token",
                )}
                style={isCurrent ? { borderColor: hex } : undefined}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: glossGrad(hex), color: inkOn(hex) }}>
                  <Crown className="h-[19px] w-[19px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-['Poppins'] text-sm font-extrabold text-primary-token dark:text-white">{plan.name}</span>
                    {isCurrent && (
                      <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ color: hex, borderColor: `${hex}66` }}>Current</span>
                    )}
                    {showUpgrade && (
                      <span className="inline-flex items-center gap-0.5 rounded-md border border-[#d4af37] bg-gradient-to-b from-[#fff3cc] to-[#f4d873] px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide text-[#241a02]">
                        <Flame className="h-2.5 w-2.5" /> {promo}× entries
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-muted-token">
                    {showUpgrade ? `${entries} entries (${promo}×)` : `${entries} entries`} · {access}% access
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-['Poppins'] text-base font-black" style={{ color: hex }}>${plan.price}</div>
                  <div className="mt-0.5 text-[9px] font-semibold text-muted-token">/mo</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {cta.oneTimePlans.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">One-time packages</span>
            <span className="text-[11px] font-bold text-muted-token">No subscription</span>
          </div>
          <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
            {cta.oneTimePlans.map((pk: LocalMembershipPlan) => {
              const key = tierKeyFromName(pk.name);
              const hex = TIER_HEX[key];
              const entries = pk.metadata?.entriesCount ?? 0;
              const days = pk.metadata?.partnerDiscountDays as number | undefined;
              return (
                <button
                  key={pk.id}
                  type="button"
                  onClick={() => cta.onSelect(pk)}
                  className="relative w-[132px] shrink-0 overflow-hidden rounded-[.875rem] p-3.5 text-left shadow-[0_12px_26px_-16px_rgba(0,0,0,.5)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  style={{ background: glossGrad(hex), color: inkOn(hex) }}
                >
                  <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(135deg,rgba(255,255,255,.1) 0 1px,transparent 1px 13px)" }} />
                  <div className="relative">
                    <div className="font-['Poppins'] text-[13px] font-extrabold">{pk.name}</div>
                    <div className="mt-2.5 font-['Poppins'] text-2xl font-black">${pk.price}</div>
                    <div className="mt-2 text-[10px] font-bold leading-[1.3] opacity-80">
                      {entries} entries
                      {days != null && (
                        <>
                          <br />
                          {days}d access
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
