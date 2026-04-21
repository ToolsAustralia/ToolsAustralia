/**
 * Ledger stored on PaymentEvent.data.grants — single source of truth for refund reversal.
 * @see docs/REFUND_REVERSAL.md
 */

export type SubscriptionCalculationType = "initial" | "renewal" | "upgrade" | "resubscribe";

/** One allocation of entries to a draw (major or mini) with a specific source bucket. */
export type DrawGrantLedgerRow = {
  kind: "major" | "mini";
  /** MajorDraw or MiniDraw _id as string */
  drawId: string;
  /** Must match entriesBySource key used when granting (e.g. membership, bonus-entry-promo, promo-link). */
  sourceKey: string;
  entries: number;
};

export interface IPaymentGrantLedger {
  baseEntries: number;
  bonusPromoEntries: number;
  promoLinkEntries: number;
  campaignEntries: number;
  rewardsPoints: number;
  milestoneIssuanceIds: string[];
  drawGrants: DrawGrantLedgerRow[];
  promoLink?: { promoLinkId: string; code: string };
  campaign?: {
    code: string;
    monthlyIssuanceId?: string;
    milestoneIssuanceId?: string;
    redemptionKind?: "monthly-coupon" | "milestone";
  };
  /** Membership: contribution to subscription.lastMonthAccumulatedEntries for this invoice. */
  lastMonthDelta?: number;
  calculationType?: SubscriptionCalculationType;
}

export function createEmptyGrants(
  base: { entries: number; points: number },
  subscription?: { lastMonthDelta?: number; calculationType?: SubscriptionCalculationType }
): IPaymentGrantLedger {
  return {
    baseEntries: base.entries,
    bonusPromoEntries: 0,
    promoLinkEntries: 0,
    campaignEntries: 0,
    rewardsPoints: base.points,
    milestoneIssuanceIds: [],
    drawGrants: [],
    ...(subscription?.lastMonthDelta !== undefined && { lastMonthDelta: subscription.lastMonthDelta }),
    ...(subscription?.calculationType && { calculationType: subscription.calculationType }),
  };
}

export function benefitsGrantedEventId(paymentIntentId: string): string {
  return `BenefitsGranted-${paymentIntentId}`;
}
