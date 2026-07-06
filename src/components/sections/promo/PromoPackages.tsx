"use client";

import MembershipSection from "@/components/sections/MembershipSection";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { SectionContainer } from "@/components/ui";

// The 2026-07 packages-design A/B test ended with this (the original promo
// design) as the winner — the "membership" treatment branch was removed.
// See docs/ab-testing/promo-packages-design-runbook.md for the record.
export default function PromoPackages() {
  // Variant config still flows for future experiments (hidePackages / displayOrder).
  const { variantConfig } = useVariantContext();
  const packagesConfig = variantConfig?.packages;

  return (
    <>
      {/* Packages Section with scroll target */}
      <section id="packages" className="bg-white dark:bg-neutral-900/50">
        <SectionContainer>
          <MembershipSection
            title="Choose Your Entry Package"
            padding="py-4 sm:py-8"
            variantConfig={packagesConfig}
          />
        </SectionContainer>
      </section>
    </>
  );
}
