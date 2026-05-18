import type { CancellationReason, OfferType } from "@/models/CancellationFlowEvent";

const LEAD: Record<CancellationReason, OfferType[]> = {
  too_expensive: ["discount_50_2mo"],
  prefer_cheaper: ["tier_downgrade"],
  dont_use_benefits: ["pause_30d"],
  too_many_messages: ["unsubscribe_marketing"],
  joined_for_giveaway: ["bonus_entries_100"],
  havent_won: ["bonus_entries_100"],
  other: ["pause_30d", "discount_50_2mo"],
};

/** Ordered offer sequence. +100 entries is the universal final rung unless it
 *  is already the lead (giveaway / havent_won). */
export function resolveOfferSequence(reason: CancellationReason): OfferType[] {
  const lead = LEAD[reason];
  if (lead.length === 1 && lead[0] === "bonus_entries_100") return ["bonus_entries_100"];
  return [...lead, "bonus_entries_100"];
}
