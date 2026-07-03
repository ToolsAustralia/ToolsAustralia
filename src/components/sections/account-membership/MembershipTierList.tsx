"use client";

import Image from "next/image";
import { Package, Flame, ShieldCheck } from "lucide-react";
import { cn } from "@/utils/cn";
import type { MembershipCardCta } from "@/hooks/useMembershipCardCta";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { TIER_HEX, tierKeyFromName, glossGrad, inkOn } from "@/utils/membership/tier-visuals";
import OneTimePacksGrid from "@/components/sections/membership/OneTimePacksGrid";
import { getPackageIcon } from "@/utils/images/package-icons";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";

interface MembershipTierListProps {
  cta: MembershipCardCta;
  /** Active member → "Change your tier"; tapping a DIFFERENT tier opens the change flow. */
  isMember: boolean;
  /** Member taps the CURRENT tier → open the manage flow (billing). */
  onManagePlan: () => void;
  /** Member taps a DIFFERENT tier → open the upgrade/downgrade confirm for that tier name. */
  onChangeTier?: (planName: string) => void;
}

const RANK: Record<string, number> = { tradie: 0, foreman: 1, boss: 2 };

/**
 * Compact tier list + one-time-pack scroll for the account Membership page —
 * ported from the prototype `MembershipPage`. Real per-package colors + icons
 * (`getPackageColorScheme` / `getPackageIcon`); base-entry strikethrough when a
 * promo multiplier is live; upgrade badge only for tiers above the current one.
 */
export default function MembershipTierList({ cta, isMember, onManagePlan, onChangeTier }: MembershipTierListProps) {
  const currentPlan = cta.membershipPlans.find((p) => cta.ctaLabelFor(p) === "Current Plan");
  const currentRank = currentPlan ? RANK[tierKeyFromName(currentPlan.name)] ?? -1 : -1;

  return (
    <>
      <section>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">
            {isMember ? "Change your tier" : "Choose a membership"}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Cancel anytime
          </span>
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          {cta.membershipPlans.map((plan: LocalMembershipPlan) => {
            const key = tierKeyFromName(plan.name);
            const hex = TIER_HEX[key];
            const access = getPartnerCatalogAccessPercentForPlanId(`${key}-subscription`);
            const entries = plan.metadata?.entriesCount ?? 0;
            const base = (plan.metadata?.originalEntries as number | undefined) ?? entries;
            const promo = (plan.metadata?.promoMultiplier as number | undefined) ?? 1;
            const boosted = promo > 1;
            const isCurrent = cta.ctaLabelFor(plan) === "Current Plan";
            // Upgrade badge only for tiers above the current one (or any, for non-members).
            const showUpgrade = boosted && (!isMember || RANK[key] > currentRank);
            const icon = getPackageIcon(plan.id);
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => (isMember ? (isCurrent ? onManagePlan() : onChangeTier?.(plan.name)) : cta.onSelect(plan))}
                className={cn(
                  "flex items-center gap-3 rounded-[1.1rem] border bg-surface p-[15px] text-left shadow-sm transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px",
                  isCurrent ? "border-[1.5px]" : "border-token",
                )}
                style={isCurrent ? { borderColor: hex } : undefined}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: glossGrad(hex), color: inkOn(hex) }}>
                  {icon ? <Image src={icon} alt="" width={26} height={26} className="h-[26px] w-[26px] object-contain drop-shadow" /> : <Package className="h-[19px] w-[19px]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-['Poppins'] text-sm font-extrabold text-primary-token dark:text-white">{plan.name}</span>
                    {isCurrent && <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ color: hex, borderColor: `${hex}66` }}>Current</span>}
                    {showUpgrade && (
                      <span className="inline-flex items-center gap-0.5 rounded-md border border-[#d4af37] bg-gradient-to-b from-[#fff3cc] to-[#f4d873] px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide text-[#241a02]">
                        <Flame className="h-2.5 w-2.5" /> {promo}× entries
                      </span>
                    )}
                  </div>
                  {/* Access first, then entries (with base strikethrough when boosted). */}
                  <div className="mt-1 text-[11px] font-semibold text-muted-token">
                    {access}% access ·{" "}
                    {boosted ? (
                      <>
                        <s className="opacity-60">{base}</s> <b className="text-primary-token dark:text-white">{entries}</b> free entries / mo
                      </>
                    ) : (
                      <>{entries} free entries / mo</>
                    )}
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
          {/* Reuse the /membership "Not subscribing?" PackCard styling (was a compact scroll). */}
          <OneTimePacksGrid className="mt-3" cta={cta} />
        </section>
      )}
    </>
  );
}
