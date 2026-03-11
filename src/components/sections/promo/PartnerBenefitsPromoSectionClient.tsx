"use client";

import dynamic from "next/dynamic";

/**
 * Client wrapper that dynamically loads PartnerBenefitsPromoSection with ssr: false.
 * Required because ssr: false is not allowed in Server Components.
 */
const PartnerBenefitsPromoSection = dynamic(
  () => import("./PartnerBenefitsPromoSection"),
  { ssr: false }
);

export default function PartnerBenefitsPromoSectionClient() {
  return <PartnerBenefitsPromoSection />;
}
