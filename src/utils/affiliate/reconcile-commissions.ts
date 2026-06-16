/**
 * Affiliate commission reconciliation core (shared by the CLI script and the
 * daily cron).
 *
 * WHY: commission creation in the webhook is fire-and-forget (non-blocking, so a
 * commission hiccup never fails a payment), which means a transient failure can
 * silently drop a commission. The robust, scalable answer — and the pattern this
 * repo already uses for the same class of problem (reconcile-major-draw-entries,
 * reconcile-blocked-transactions) — is at-least-once + idempotent + a
 * reconciliation backstop that re-derives the commission ledger from the durable
 * `PaymentEvent` source of truth.
 *
 * SCALABLE: pass `since` to bound the scan to a trailing window (the cron uses
 * ~35 days). Work is O(recent payments), not O(all-time). `since = null` does a
 * full sweep (on-demand only).
 *
 * SAFE: only ever creates commissions that are genuinely OWED (real purchase +
 * referred user + no existing row), via the idempotent `recordAffiliateCommission`
 * (re-checks, correct per-affiliate rate, `$inc`s totals only on a real insert).
 * It DETECTS over-paid commissions (a still-active commission on a refunded
 * payment) but never auto-acts on them — clawback handling is a separate,
 * deferred workstream (see docs/affiliate/gotchas.md "Refund clawback").
 */

import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";
import PaymentEvent from "@/models/PaymentEvent";
import AffiliateCommission from "@/models/AffiliateCommission";
import User from "@/models/User";
import {
  recordAffiliateCommission,
  normalizeStripePaymentIntentKeyForCommission,
  stripeInvoiceIdLookupVariants,
} from "@/utils/affiliate/affiliate-attribution";

/** BenefitsGranted package types that earn a commission (shop is intentionally excluded — see docs). */
export const COMMISSION_ELIGIBLE_PACKAGE_TYPES = ["membership", "one-time", "upsell", "mini-draw"] as const;
type EligiblePackageType = (typeof COMMISSION_ELIGIBLE_PACKAGE_TYPES)[number];

export type ReconcileCommissionType =
  | "one-time-package"
  | "upsell"
  | "membership-first"
  | "membership-recurring"
  | "mini-draw-package";

export function commissionTypeFor(packageType: EligiblePackageType, isRenewal: boolean): ReconcileCommissionType {
  if (packageType === "one-time") return "one-time-package";
  if (packageType === "upsell") return "upsell";
  if (packageType === "mini-draw") return "mini-draw-package";
  return isRenewal ? "membership-recurring" : "membership-first";
}

export interface MissingCommissionRow {
  userId: string;
  affiliateId: string;
  commissionType: ReconcileCommissionType;
  packageType: EligiblePackageType;
  isRenewal: boolean;
  purchaseAmountCents: number;
  paymentIntentId: string;
  date: string; // YYYY-MM-DD
}

export interface OverPaidCommissionRow {
  commissionId: string;
  commissionType: string;
  status: string;
  commissionAmountCents: number;
  stripePaymentIntentId: string | null;
  stripeInvoiceId: string | null;
}

export interface ReconcileResult {
  windowSince: Date | null;
  eligibleBenefits: number;
  referredBenefits: number;
  missing: MissingCommissionRow[];
  created: number;
  overPaid: OverPaidCommissionRow[];
}

export interface ReconcileOptions {
  /** Only consider BenefitsGranted / refunds at-or-after this time. null = all-time (full sweep). */
  since?: Date | null;
  /** When true, create the missing commissions (idempotently). When false, audit only. */
  apply: boolean;
}

/**
 * Re-derive the affiliate commission ledger from PaymentEvents and (optionally)
 * backfill any missing rows. Idempotent and safe to run repeatedly.
 */
export async function reconcileAffiliateCommissions(opts: ReconcileOptions): Promise<ReconcileResult> {
  const since = opts.since ?? null;
  await connectDB();

  const timeMatch = since ? { timestamp: { $gte: since } } : {};

  // 1. Window-bounded: all eligible BenefitsGranted in the window.
  const benefits = await PaymentEvent.find(
    { eventType: "BenefitsGranted", packageType: { $in: COMMISSION_ELIGIBLE_PACKAGE_TYPES }, ...timeMatch },
    { paymentIntentId: 1, userId: 1, packageType: 1, packageId: 1, packageName: 1, isRenewal: 1, "data.price": 1, "data.billingReason": 1, timestamp: 1 }
  )
    .sort({ timestamp: 1 })
    .lean();

  // 2. Resolve which buyers are referred (only the ones who actually purchased in-window).
  const buyerIds = Array.from(new Set(benefits.map((b) => String(b.userId)).filter(Boolean))).map(
    (id) => new mongoose.Types.ObjectId(id)
  );
  const referredUsers = buyerIds.length
    ? await User.find(
        { _id: { $in: buyerIds }, "affiliateReferral.affiliateId": { $exists: true, $ne: null } },
        { _id: 1, "affiliateReferral.affiliateId": 1, stripeSubscriptionId: 1 }
      ).lean()
    : [];
  const affiliateByUser = new Map<string, mongoose.Types.ObjectId>();
  const subByUser = new Map<string, string | undefined>();
  for (const u of referredUsers) {
    affiliateByUser.set(String(u._id), u.affiliateReferral!.affiliateId as mongoose.Types.ObjectId);
    subByUser.set(String(u._id), (u as { stripeSubscriptionId?: string }).stripeSubscriptionId);
  }

  // 3. Fully-refunded payment intents in-window (exclude from backfill).
  const refundedPIs = new Set<string>(
    await PaymentEvent.distinct("paymentIntentId", { eventType: "RefundProcessed", ...timeMatch })
  );

  const missing: MissingCommissionRow[] = [];
  let referredBenefits = 0;
  let created = 0;

  for (const b of benefits) {
    const userId = String(b.userId);
    const affiliateId = affiliateByUser.get(userId);
    if (!affiliateId) continue; // not a referred buyer
    referredBenefits++;

    const pid: string = b.paymentIntentId;
    if (!pid || refundedPIs.has(pid)) continue; // no PI, or fully refunded → no commission owed

    const packageType = b.packageType as EligiblePackageType;
    const isRenewal = !!b.isRenewal;
    const commissionType = commissionTypeFor(packageType, isRenewal);
    const purchaseAmount = Math.round(((b.data as { price?: number } | undefined)?.price ?? 0) * 100);
    if (purchaseAmount <= 0) continue;

    // Existence check mirrors recordAffiliateCommission's own keys.
    const isInvoiceKeyed = commissionType === "membership-recurring";
    const rawInvoiceId = pid.startsWith("invoice_") ? pid.slice("invoice_".length) : pid;
    const invoiceVariants = stripeInvoiceIdLookupVariants(rawInvoiceId);
    const piNormalized = normalizeStripePaymentIntentKeyForCommission(pid);

    const existing = isInvoiceKeyed
      ? await AffiliateCommission.findOne({ affiliateId, referredUserId: b.userId, commissionType, stripeInvoiceId: { $in: invoiceVariants } }).lean()
      : await AffiliateCommission.findOne({ affiliateId, referredUserId: b.userId, commissionType, stripePaymentIntentId: piNormalized }).lean();
    if (existing) continue;

    missing.push({
      userId,
      affiliateId: String(affiliateId),
      commissionType,
      packageType,
      isRenewal,
      purchaseAmountCents: purchaseAmount,
      paymentIntentId: pid,
      date: new Date(b.timestamp as Date).toISOString().slice(0, 10),
    });

    if (opts.apply) {
      const row = await recordAffiliateCommission({
        affiliateId,
        referredUserId: b.userId as mongoose.Types.ObjectId,
        commissionType,
        purchaseType: packageType,
        packageId: b.packageId,
        packageName: b.packageName,
        purchaseAmount,
        ...(isInvoiceKeyed ? { stripeInvoiceId: rawInvoiceId } : { stripePaymentIntentId: pid }),
        ...(subByUser.get(userId) ? { stripeSubscriptionId: subByUser.get(userId) } : {}),
        isFirstTimePurchase: commissionType === "membership-first",
        isRecurringPayment: isInvoiceKeyed,
        earnedAt: new Date(b.timestamp as Date),
      });
      if (row) created++;
    }
  }

  // 4. Over-paid: active commissions on a (window) refunded payment — DETECT only.
  const refundedVariants = [...refundedPIs].flatMap((p) => {
    const set = new Set([p]);
    if (p.startsWith("invoice_")) set.add(p.slice("invoice_".length));
    else set.add(`invoice_${p}`);
    return [...set];
  });
  const overPaidDocs = refundedVariants.length
    ? await AffiliateCommission.find(
        {
          status: { $ne: "cancelled" },
          $or: [{ stripePaymentIntentId: { $in: refundedVariants } }, { stripeInvoiceId: { $in: refundedVariants } }],
        },
        { commissionType: 1, status: 1, commissionAmount: 1, stripePaymentIntentId: 1, stripeInvoiceId: 1 }
      ).lean()
    : [];
  const overPaid: OverPaidCommissionRow[] = overPaidDocs.map((c) => ({
    commissionId: String(c._id),
    commissionType: String(c.commissionType),
    status: String(c.status),
    commissionAmountCents: (c.commissionAmount as number) ?? 0,
    stripePaymentIntentId: (c.stripePaymentIntentId as string) ?? null,
    stripeInvoiceId: (c.stripeInvoiceId as string) ?? null,
  }));

  return {
    windowSince: since,
    eligibleBenefits: benefits.length,
    referredBenefits,
    missing,
    created,
    overPaid,
  };
}
