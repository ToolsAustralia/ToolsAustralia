import type { CancellationReason, OfferType } from "@/models/CancellationFlowEvent";

/** Ordered offer sequence for each cancellation reason.
 *  Each reason maps to an explicit, user-confirmed sequence — no universal
 *  "final rung" rule. bonus_entries_100 leads for joined_for_giveaway/havent_won
 *  and is last for all other reasons; unsubscribe_marketing only leads
 *  too_many_messages. */
export function resolveOfferSequence(reason: CancellationReason): OfferType[] {
  switch (reason) {
    case "too_expensive":
      return ["discount_50_2mo", "pause_30d", "tier_downgrade", "bonus_entries_100"];
    case "prefer_cheaper":
      return ["tier_downgrade", "discount_50_2mo", "pause_30d", "bonus_entries_100"];
    case "dont_use_benefits":
      return ["pause_30d", "discount_50_2mo", "tier_downgrade", "bonus_entries_100"];
    case "too_many_messages":
      return ["unsubscribe_marketing", "pause_30d", "discount_50_2mo", "tier_downgrade", "bonus_entries_100"];
    case "joined_for_giveaway":
      return ["bonus_entries_100", "discount_50_2mo", "tier_downgrade", "pause_30d"];
    case "havent_won":
      return ["bonus_entries_100", "discount_50_2mo", "tier_downgrade", "pause_30d"];
    case "other":
      return ["discount_50_2mo", "tier_downgrade", "pause_30d", "bonus_entries_100"];
    default: {
      const _exhaustive: never = reason;
      throw new Error(`Unhandled CancellationReason: ${_exhaustive}`);
    }
  }
}
