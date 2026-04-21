import PaymentEvent from "@/models/PaymentEvent";
import type { DrawGrantLedgerRow, IPaymentGrantLedger } from "@/types/payment-ledger";

/**
 * Atomically increment numeric fields on data.grants for a BenefitsGranted event.
 */
export async function incLedgerGrants(
  benefitsEventId: string,
  inc: Partial<
    Pick<
      IPaymentGrantLedger,
      "bonusPromoEntries" | "promoLinkEntries" | "campaignEntries" | "rewardsPoints"
    >
  >
): Promise<void> {
  const $inc: Record<string, number> = {};
  for (const [k, v] of Object.entries(inc)) {
    if (v !== undefined && v !== 0) {
      $inc[`data.grants.${k}`] = v;
    }
  }
  if (Object.keys($inc).length === 0) return;
  await PaymentEvent.updateOne({ _id: benefitsEventId }, { $inc });
}

export async function setLedgerPromoLink(
  benefitsEventId: string,
  promo: { promoLinkId: string; code: string }
): Promise<void> {
  await PaymentEvent.updateOne(
    { _id: benefitsEventId },
    { $set: { "data.grants.promoLink": promo } }
  );
}

export async function setLedgerCampaign(
  benefitsEventId: string,
  campaign: NonNullable<IPaymentGrantLedger["campaign"]>
): Promise<void> {
  await PaymentEvent.updateOne(
    { _id: benefitsEventId },
    { $set: { "data.grants.campaign": campaign } }
  );
}

export async function pushDrawGrant(benefitsEventId: string, row: DrawGrantLedgerRow): Promise<void> {
  await PaymentEvent.updateOne(
    { _id: benefitsEventId },
    { $push: { "data.grants.drawGrants": row } }
  );
}

export async function addMilestoneIssuanceIds(
  benefitsEventId: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  await PaymentEvent.updateOne(
    { _id: benefitsEventId },
    { $addToSet: { "data.grants.milestoneIssuanceIds": { $each: ids } } }
  );
}
