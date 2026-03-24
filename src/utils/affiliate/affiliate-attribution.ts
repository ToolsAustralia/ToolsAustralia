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

/** Stripe invoice ids may be stored as `in_xxx` or legacy `invoice_in_xxx` — treat as equivalent for lookups. */
export function stripeInvoiceIdLookupVariants(raw: string | undefined): string[] {
  const id = raw?.trim();
  if (!id) return [];
  const set = new Set<string>([id]);
  if (id.startsWith("invoice_")) {
    const rest = id.slice("invoice_".length);
    if (rest) set.add(rest);
  } else if (id.startsWith("in_")) {
    set.add(`invoice_${id}`);
  }
  return [...set];
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
  /** When the purchase actually happened (defaults to now if omitted). */
  earnedAt?: Date;
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
  const rawInvoiceId = input.stripeInvoiceId?.trim() || undefined;
  const invoiceVariants = rawInvoiceId ? stripeInvoiceIdLookupVariants(rawInvoiceId) : [];
  /** Prefer raw `in_` for new docs so we match Stripe’s invoice id string. */
  const canonicalStripeInvoiceId =
    rawInvoiceId && invoiceVariants.length > 0
      ? invoiceVariants.find((v) => v.startsWith("in_")) ?? invoiceVariants[0]
      : undefined;

  if (!stripePaymentIntentId && !canonicalStripeInvoiceId) {
    console.error("[AffiliateAttribution] recordAffiliateCommission: missing stripe ids", {
      hasPaymentIntent: !!input.stripePaymentIntentId,
      hasInvoice: !!input.stripeInvoiceId,
    });
    return null;
  }

  const existing =
    canonicalStripeInvoiceId != null
      ? await AffiliateCommission.findOne({
          affiliateId,
          referredUserId,
          commissionType,
          stripeInvoiceId: { $in: invoiceVariants },
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
  const earnedAt = input.earnedAt ?? new Date();

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
    ...(canonicalStripeInvoiceId ? { stripeInvoiceId: canonicalStripeInvoiceId } : {}),
    ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
    isFirstTimePurchase,
    isRecurringPayment,
    earnedAt,
  });

  try {
    await doc.save();
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code?: number }).code : undefined;
    if (code === 11000) {
      const dup =
        canonicalStripeInvoiceId != null
          ? await AffiliateCommission.findOne({
              affiliateId,
              referredUserId,
              commissionType,
              stripeInvoiceId: { $in: invoiceVariants },
            })
          : await AffiliateCommission.findOne({
              affiliateId,
              referredUserId,
              stripePaymentIntentId,
              commissionType,
            });
      if (dup) {
        return dup;
      }
      const dupByInvoice =
        canonicalStripeInvoiceId != null
          ? await AffiliateCommission.findOne({
              referredUserId,
              commissionType,
              stripeInvoiceId: { $in: invoiceVariants },
            })
          : null;
      if (dupByInvoice) {
        console.warn(
          "[AffiliateAttribution] recordAffiliateCommission: duplicate key recovered (invoice id variants / affiliate mismatch)",
          {
            referredUserId: referredUserId.toString(),
            commissionType,
            stripeInvoiceId: canonicalStripeInvoiceId,
          }
        );
        return dupByInvoice;
      }
      const msg = err && typeof err === "object" && "message" in err ? String((err as Error).message) : String(err);
      console.error("[AffiliateAttribution] recordAffiliateCommission: duplicate key but no recovery match", {
        message: msg,
        affiliateId: affiliateId.toString(),
        referredUserId: referredUserId.toString(),
        commissionType,
        invoiceVariants,
      });
      return null;
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
