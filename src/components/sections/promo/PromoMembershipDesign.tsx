"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useMembershipCardCta, type MembershipCardCta } from "@/hooks/useMembershipCardCta";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { useExperimentTracking } from "@/hooks/ab-testing/useExperimentTracking";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { TierCard } from "@/components/sections/membership/MembershipTierChooser";
import { PackCard } from "@/components/sections/membership/MembershipOneTimePacks";
import { TIER_HEX } from "@/utils/membership/tier-visuals";
import MultiplierBannerImage from "@/components/ui/MultiplierBannerImage";
import PromoMultiplierBadge from "@/components/ui/PromoMultiplierBadge";
import type { PromoMultiplier } from "@/types/promo-multiplier";

// MembershipModal bundles Stripe + payment forms; lazy-load it (mirrors MembershipPageClient).
const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), { ssr: false });

/**
 * Treatment-only color alignment: the one-time Foreman pack borrows the membership Tradie
 * cyan so the two blues read as ONE color instead of two near-duplicate blues (DJ feedback).
 * Scoped here — never recolor the shared `getPackageColorScheme`, or the A/B CONTROL arm
 * (MembershipSection) would change mid-experiment.
 */
function treatmentPackHex(planId: string): string | undefined {
  if (planId.includes("foreman")) return TIER_HEX.tradie;
  return undefined;
}

/** Static column classes keyed by count so the grid width matches the pack count and the row centers. */
const LG_COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

/**
 * A/B TREATMENT for the promotions package section. Reuses the /membership card visuals
 * (TierCard + PackCard) but arranges them in a PROMO layout — NOT a 1:1 copy of /membership:
 *   • entries-multiplier header image (MultiplierBannerImage) like the control;
 *   • One-Time ↔ Membership Packs toggler (drives cta.activeTab);
 *   • the active tab's cards, centered (columns match the count so 5 Additional packs fill the row);
 *   • "Additional " stripped from pack names for display (getPackageDisplayName, inside the cards);
 *   • "Enter Now" CTA on both tiers and one-time cards;
 *   • includeAdditionalForMembers → members see the same Additional packs the control shows;
 *   • onPackageCtaClick emits the diagnostic A/B "click" event at the SAME modal-open point the
 *     control emits on (funnel parity); no-ops outside an experiment.
 * Owns exactly one MembershipModal (mirrors MembershipPageClient). Renders its own
 * <section id="packages"> so the promo #packages scroll anchor is preserved.
 */
export default function PromoMembershipDesign() {
  const { experimentId, variantId } = useVariantContext();
  const { trackEvent } = useExperimentTracking();

  const baseCta = useMembershipCardCta({
    includeAdditionalForMembers: true,
    onPackageCtaClick: (plan) => {
      if (experimentId && variantId) {
        trackEvent(experimentId, variantId, "click", { element: "package_cta", packageId: plan.id });
      }
    },
  });

  // Promo CTA copy: "Enter Now" for entry actions; preserve real member-management states.
  const cta: MembershipCardCta = {
    ...baseCta,
    ctaLabelFor: (plan: LocalMembershipPlan) => {
      const base = baseCta.ctaLabelFor(plan);
      if (
        base === "Current Plan" ||
        base === "Update payment" ||
        base.startsWith("Upgrade") ||
        base.startsWith("Downgrade")
      ) {
        return base;
      }
      return "Enter Now";
    },
  };

  const promoThemeSlug = usePromoThemeStore((s) => s.slug);
  const promoToolsetSlug = usePromoThemeStore((s) => s.toolsetSlug);
  const membershipMult = useResolvedMultiplier("membership-packages", "display");
  const oneTimeMult = useResolvedMultiplier("one-time-packages", "display");

  const [bannerFailed, setBannerFailed] = useState(false);

  const isMembershipTab = cta.activeTab === "membership";
  const headerMult = (isMembershipTab ? membershipMult : oneTimeMult) ?? 0;
  const showHeader = headerMult > 1;

  const tierPlans = cta.membershipPlans ?? [];
  const oneTimePlans = cta.oneTimePlans ?? [];
  const tierCols = LG_COLS[Math.min(Math.max(tierPlans.length, 1), 5)] ?? "lg:grid-cols-5";
  const oneTimeCols = LG_COLS[Math.min(Math.max(oneTimePlans.length, 1), 6)] ?? "lg:grid-cols-6";

  return (
    <section id="packages" className="relative z-10 w-full overflow-visible px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Entries-multiplier header */}
        {showHeader && (
          <div className="mb-4 flex justify-center">
            {!bannerFailed ? (
              <MultiplierBannerImage
                multiplier={headerMult}
                slug={promoThemeSlug}
                toolsetSlug={promoToolsetSlug}
                alt={`${headerMult}X Promo Activated`}
                className="w-full max-w-2xl lg:max-w-md"
                priority
                onExhausted={() => setBannerFailed(true)}
              />
            ) : (
              <h2 className="text-center font-sans text-[22px] font-black uppercase leading-tight text-primary-token sm:text-2xl lg:text-3xl dark:text-white">
                {headerMult}X PROMO ACTIVATED
              </h2>
            )}
          </div>
        )}

        {/* One-Time ↔ Membership toggler */}
        <div className="mb-6 flex justify-center">
          <div className="w-full max-w-full rounded-[20px] bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 p-[4px] shadow-[0_0_20px_rgba(0,0,0,0.6)] sm:w-auto sm:max-w-none">
            <div className="flex w-full flex-row items-center justify-center">
              <button
                type="button"
                onClick={() => cta.setActiveTab("one-time")}
                className={`relative flex-1 whitespace-nowrap rounded-[16px] px-4 py-2.5 text-[13px] font-black uppercase transition-[colors,box-shadow] focus:outline-none sm:text-[14px] ${
                  !isMembershipTab
                    ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                    : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
                }`}
              >
                One-Time
                {!isMembershipTab && oneTimeMult !== null && oneTimeMult > 1 && (
                  <PromoMultiplierBadge multiplier={oneTimeMult as PromoMultiplier} />
                )}
              </button>
              <button
                type="button"
                onClick={() => cta.setActiveTab("membership")}
                className={`relative flex-1 whitespace-nowrap rounded-[16px] px-4 py-2.5 text-[13px] font-black uppercase transition-[colors,box-shadow] focus:outline-none sm:text-[14px] ${
                  isMembershipTab
                    ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                    : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
                }`}
              >
                Membership Packs
                {isMembershipTab && membershipMult !== null && membershipMult > 1 && (
                  <PromoMultiplierBadge multiplier={membershipMult as PromoMultiplier} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Active tab content — centered (columns match the count) */}
        {isMembershipTab ? (
          <div className={`mx-auto grid max-w-7xl grid-cols-1 items-stretch justify-center gap-4 sm:grid-cols-2 ${tierCols}`}>
            {tierPlans.map((p) => (
              <TierCard key={p.id} plan={p} cta={cta} />
            ))}
          </div>
        ) : (
          <div className={`mx-auto grid max-w-[1180px] grid-cols-2 items-stretch justify-center gap-3.5 sm:grid-cols-3 ${oneTimeCols}`}>
            {oneTimePlans.map((p) => (
              <PackCard key={p.id} plan={p} cta={cta} ctaLabel="Enter Now" colorHex={treatmentPackHex(p.id)} />
            ))}
          </div>
        )}
      </div>

      <MembershipModal
        isOpen={cta.membershipModal.isModalOpen}
        onClose={cta.membershipModal.closeModal}
        selectedPlan={cta.membershipModal.selectedPlan}
        onPlanChange={cta.membershipModal.selectPlan}
      />
    </section>
  );
}
