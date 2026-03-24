import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import AffiliateCommission, {
  type CommissionType,
  type IAffiliateCommission,
} from "@/models/AffiliateCommission";
import User from "@/models/User";
import { calculateCommission, COMMISSION_RATE } from "@/lib/affiliate";
import mongoose from "mongoose";

/**
 * Resolve the affiliate ObjectId for commission attribution from a user document.
 * Single place for future rules (e.g. fraud holds).
 */
export function resolveReferralAffiliateId(
  user: { affiliateReferral?: { affiliateId?: mongoose.Types.ObjectId } } | null | undefined
): mongoose.Types.ObjectId | null {
  if (!user?.affiliateReferral?.affiliateId) return null;
  return user.affiliateReferral.affiliateId;
}

/**
 * Normalize Stripe payment identifiers so idempotency matches across code paths.
 * Subscription invoice payments are stored as `invoice_${stripeInvoiceId}` (e.g. invoice_in_xxx).
 * If a raw invoice id `in_xxx` is passed, prefix with `invoice_` to match grantBenefits / webhooks.
 */
export function normalizeStripePaymentIntentKeyForCommission(raw: string): string {
  const id = raw?.trim();
  if (!id) return id;
  if (id.startsWith("invoice_")) return id;
  if (id.startsWith("in_")) return `invoice_${id}`;
  return id;
}

export async function getAffiliateCommissionRate(affiliateId: mongoose.Types.ObjectId): Promise<number> {
  const affiliate = await Affiliate.findById(affiliateId).select("commissionRate").lean();
  return affiliate?.commissionRate ?? COMMISSION_RATE;
}

export type RecordAffiliateCommissionInput = {
  affiliateId: mongoose.Types.ObjectId;
  referredUserId: mongoose.Types.ObjectId;
  commissionType: CommissionType;
  purchaseType: IAffiliateCommission["purchaseType"];
  packageId?: string;
  packageName?: string;
  purchaseAmount: number; // cents
  /** Use for PI-based checkouts; normalized internally */
  stripePaymentIntentId?: string;
  /** Use for invoice-keyed rows (e.g. membership-recurring); raw Stripe invoice id in_xxx */
  stripeInvoiceId?: string;
  stripeSubscriptionId?: string;
  isFirstTimePurchase: boolean;
  isRecurringPayment: boolean;
};

/**
 * Idempotent commission insert: one row per Stripe money movement per commission type.
 * Applies Affiliate totalSales / totalCommissions increments only on successful new inserts.
 */
export async function recordAffiliateCommission(
  input: RecordAffiliateCommissionInput
): Promise<IAffiliateCommission | null> {
  await connectDB();

  const {
    affiliateId,
    referredUserId,
    commissionType,
    purchaseType,
    packageId,
    packageName,
    purchaseAmount,
    stripeSubscriptionId,
    isFirstTimePurchase,
    isRecurringPayment,
  } = input;

  let stripePaymentIntentId = input.stripePaymentIntentId;
  if (stripePaymentIntentId) {
    stripePaymentIntentId = normalizeStripePaymentIntentKeyForCommission(stripePaymentIntentId);
  }
  const stripeInvoiceId = input.stripeInvoiceId?.trim() || undefined;

  if (!stripePaymentIntentId && !stripeInvoiceId) {
    console.error("[AffiliateAttribution] recordAffiliateCommission: missing stripe ids");
    return null;
  }

  const existing =
    stripeInvoiceId != null
      ? await AffiliateCommission.findOne({
          affiliateId,
          referredUserId,
          stripeInvoiceId,
          commissionType,
        })
      : await AffiliateCommission.findOne({
          affiliateId,
          referredUserId,
          stripePaymentIntentId,
          commissionType,
        });

  if (existing) {
    return existing;
  }

  const commissionRate = await getAffiliateCommissionRate(affiliateId);
  const commissionAmount = calculateCommission(purchaseAmount, commissionRate);

  const doc = new AffiliateCommission({
    affiliateId,
    referredUserId,
    commissionType,
    status: "pending",
    purchaseType,
    packageId,
    packageName,
    purchaseAmount,
    commissionRate,
    commissionAmount,
    ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
    ...(stripeInvoiceId ? { stripeInvoiceId } : {}),
    ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
    isFirstTimePurchase,
    isRecurringPayment,
    earnedAt: new Date(),
  });

  try {
    await doc.save();
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code?: number }).code : undefined;
    if (code === 11000) {
      const dup =
        stripeInvoiceId != null
          ? await AffiliateCommission.findOne({
              affiliateId,
              referredUserId,
              stripeInvoiceId,
              commissionType,
            })
          : await AffiliateCommission.findOne({
              affiliateId,
              referredUserId,
              stripePaymentIntentId,
              commissionType,
            });
      return dup;
    }
    throw err;
  }

  await Affiliate.findByIdAndUpdate(affiliateId, {
    $inc: {
      totalSales: purchaseAmount,
      totalCommissions: commissionAmount,
    },
  });

  return doc;
}
