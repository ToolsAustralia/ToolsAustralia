"use client";

import MembershipSection from "@/components/sections/MembershipSection";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";
import SectionDivider from "@/components/ui/SectionDivider";

export default function PromoPackages() {
  const { data: activePromo } = usePromoByType("one-time-packages");

  return (
    <>
      {/* Packages Section with scroll target */}
      <section id="packages" className="bg-white">
        <MembershipSection title="Choose Your Entry Package" padding="py-4 sm:py-8 " />
      </section>
    </>
  );
}
