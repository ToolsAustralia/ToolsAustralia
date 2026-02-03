"use client";

import MembershipSection from "@/components/sections/MembershipSection";
import { useVariantContext } from "@/components/ab-testing/VariantProvider";

export default function PromoPackages() {
  // Get variant config from context
  const { variantConfig } = useVariantContext();
  
  // Extract packages config (will be passed to MembershipSection if it supports it)
  const packagesConfig = variantConfig?.packages;

  return (
    <>
      {/* Packages Section with scroll target */}
      <section id="packages" className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <MembershipSection 
            title="Choose Your Entry Package" 
            padding="py-4 sm:py-8"
            variantConfig={packagesConfig}
          />
        </div>
      </section>
    </>
  );
}
