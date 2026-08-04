"use client";

import PartnerBrandWall from "@/components/sections/PartnerBrandWall";
import type { MembershipCardCta } from "@/hooks/useMembershipCardCta";

/**
 * The /membership partner-discounts section. Presentation lives in the shared
 * `PartnerBrandWall` (odometer + three conveyor belts), which the /promotions
 * "Unlock Partner Discounts" section also renders — one implementation, two hosts.
 *
 * This wrapper's only job is binding the CTA to the membership modal.
 */
export default function MembershipBrandShowcase({ cta }: { cta: MembershipCardCta }) {
  return (
    // No `skin` — the wall follows the site theme, as the old section's dark: classes did.
    <PartnerBrandWall onCtaClick={() => cta.membershipPlans[0] && cta.onSelect(cta.membershipPlans[0])} />
  );
}
