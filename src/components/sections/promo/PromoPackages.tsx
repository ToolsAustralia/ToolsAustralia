"use client";

import MembershipSection from "@/components/sections/MembershipSection";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { SectionContainer } from "@/components/ui";
import PromoMembershipDesign from "./PromoMembershipDesign";

export default function PromoPackages() {
  // Get variant config from context
  const { variantConfig } = useVariantContext();

  // Extract packages config (passed to MembershipSection when it supports it)
  const packagesConfig = variantConfig?.packages;

  // A/B TREATMENT: render the /membership tier + one-time-packs design.
  // MembershipTierChooser (via PromoMembershipDesign) owns its own full-bleed <section id="packages">,
  // so we do NOT wrap it in the control's section/container.
  if (packagesConfig?.design === "membership") {
    return <PromoMembershipDesign />;
  }

  // CONTROL: current promo package block (unchanged).
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
