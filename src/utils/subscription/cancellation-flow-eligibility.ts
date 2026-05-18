import type { OfferType } from "@/models/CancellationFlowEvent";

export interface ConsumedFlags {
  pause30d?: boolean;
  discount50_2mo?: boolean;
  bonusEntries100?: boolean; // sourced from legacy user.cancellationUpsellRedeemed
}
export interface EligibilityCtx {
  pastDue: boolean;
  consumed: ConsumedFlags;
}

const ONE_TIME: Partial<Record<OfferType, keyof ConsumedFlags>> = {
  pause_30d: "pause30d",
  discount_50_2mo: "discount50_2mo",
  bonus_entries_100: "bonusEntries100",
};

/** Offers whose backend is shipped. Phase 2 ships these two; later tasks
 *  (14/16/17) each ADD one entry as their phase lands — preventing dead UI.
 *  As of Task 17 ALL OfferTypes are implemented — no unimplemented offers
 *  remain (Phase 5 complete). */
export const IMPLEMENTED_OFFERS: ReadonlySet<OfferType> = new Set<OfferType>([
  "bonus_entries_100",
  "tier_downgrade",
  "pause_30d", // ← added in Task 14
  "discount_50_2mo", // ← added in Task 16
  "unsubscribe_marketing", // ← added in Task 17 (all OfferTypes now implemented)
]);

export function eligibleOffers(sequence: OfferType[], ctx: EligibilityCtx): OfferType[] {
  if (ctx.pastDue) return []; // past-due skips all retention rungs (spec §3a)
  return sequence.filter((offer) => {
    if (!IMPLEMENTED_OFFERS.has(offer)) return false;
    const flag = ONE_TIME[offer];
    if (!flag) return true; // tier_downgrade / unsubscribe_marketing not one-time gated
    return !ctx.consumed[flag];
  });
}
