"use client";

import MembershipSection from "@/components/sections/MembershipSection";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";
import { SectionContainer } from "@/components/ui";

export default function PromoPackages() {
  // Get variant config from context
  const { variantConfig } = useVariantContext();
  
  // Extract packages config (will be passed to MembershipSection if it supports it)
  const packagesConfig = variantConfig?.packages;

  return (
    <>
      {/* Packages Section with scroll target */}
      <section id="packages" className="bg-white">
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
