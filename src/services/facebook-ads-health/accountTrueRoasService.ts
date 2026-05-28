import PaymentEvent from "@/models/PaymentEvent";
import { fetchFacebookInsights } from "@/lib/facebook-marketing";

export interface AccountTrueRoasInput {
  startDate: Date;
  endDate: Date;
  fbSince: string; // yyyy-mm-dd
  fbUntil: string; // yyyy-mm-dd
  accessToken: string;
  adAccountId: string;
}

export interface AccountTrueRoasOutput {
  localRevenueAud: number;
  localEventCount: number;
  metaSpendAud: number;
  metaPurchaseRevenueAud: number | null;
  metaPurchaseConversions: number | null;
  ratioLocalOverMetaSpend: number; // TRUE ROAS proxy
  ratioMetaOverLocal: number | null; // how much Meta over- or under-attributes
  error: string | null;
}

export async function computeAccountTrueRoas(
  input: AccountTrueRoasInput,
): Promise<AccountTrueRoasOutput> {
  // Local revenue: non-renewal BenefitsGranted events
  const localEvents = await PaymentEvent.find({
    eventType: "BenefitsGranted",
    timestamp: { $gte: input.startDate, $lte: input.endDate },
    $nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }],
  })
    .select("data.price")
    .lean();

  let localRevenueAud = 0;
  for (const ev of localEvents) {
    const p = (ev as { data?: { price?: number } }).data?.price;
    if (typeof p === "number" && Number.isFinite(p)) localRevenueAud += p;
  }

  let metaSpendAud = 0;
  let metaPurchaseRevenueAud: number | null = null;
  let metaPurchaseConversions: number | null = null;
  let error: string | null = null;

  try {
    const insights = await fetchFacebookInsights(
      input.adAccountId,
      input.accessToken,
      { since: input.fbSince, until: input.fbUntil },
      "account",
    );
    let revenueCents = 0;
    let spendCents = 0;
    let conv = 0;
    for (const row of insights) {
      revenueCents += row.metrics.revenue;
      spendCents += row.metrics.spend;
      conv += row.metrics.conversions;
    }
    metaPurchaseRevenueAud = revenueCents / 100;
    metaSpendAud = spendCents / 100;
    metaPurchaseConversions = conv;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const ratioLocalOverMetaSpend = metaSpendAud > 0 ? localRevenueAud / metaSpendAud : 0;
  const ratioMetaOverLocal =
    localRevenueAud > 0 && metaPurchaseRevenueAud !== null
      ? metaPurchaseRevenueAud / localRevenueAud
      : null;

  return {
    localRevenueAud,
    localEventCount: localEvents.length,
    metaSpendAud,
    metaPurchaseRevenueAud,
    metaPurchaseConversions,
    ratioLocalOverMetaSpend,
    ratioMetaOverLocal,
    error,
  };
}
