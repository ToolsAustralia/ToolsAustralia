"use client";

import { PackCard } from "@/components/sections/membership/MembershipOneTimePacks";
import type { MembershipCardCta } from "@/hooks/useMembershipCardCta";
import { cn } from "@/utils/cn";

interface OneTimePacksGridProps {
  /** Provides the access-aware one-time plans + onSelect / isLocked used by PackCard. */
  cta: MembershipCardCta;
  className?: string;
}

/**
 * One-time packages rendered with the SAME `PackCard` the public `/membership`
 * "Not subscribing?" section uses — electric card + CATALOGUE ACCESS ring + N-day
 * window + free-entries + promo-multiplier badge (top-right) + 50%-off coupon
 * (top-left, on Additional packs) — so the dashboard packs match the marketing
 * page. `cta.oneTimePlans` is the access-aware set (Additional variants for
 * members, public packs otherwise; see useMembershipCardCta).
 */
export default function OneTimePacksGrid({ cta, className }: OneTimePacksGridProps) {
  const plans = cta.oneTimePlans ?? [];
  if (plans.length === 0) return null;
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {plans.map((p) => (
        <PackCard key={p.id} plan={p} cta={cta} />
      ))}
    </div>
  );
}
