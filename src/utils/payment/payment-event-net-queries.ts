/**
 * Net revenue from PaymentEvent (Option B, aligned with admin user total spent).
 *
 * - BenefitsGranted.data.price is in DOLLARS (application convention).
 * - RefundProcessed.data.refundAmount is in CENTS (Stripe); net revenue here EXCLUDES
 *   entire BenefitsGranted rows when a RefundProcessed exists for the same paymentIntentId,
 *   so we never mix units in aggregations.
 *
 * Collection name must match Mongoose model: `paymentevents`.
 */

import PaymentEvent from "@/models/PaymentEvent";
import type { PipelineStage, Types } from "mongoose";

export const PAYMENTEVENTS_COLLECTION = "paymentevents";

/**
 * Pipeline stages: keep only BenefitsGranted rows with no matching RefundProcessed
 * for the same paymentIntentId.
 */
export function excludeRefundedBenefitsGrantedStages(): PipelineStage[] {
  return [
    {
      $lookup: {
        from: PAYMENTEVENTS_COLLECTION,
        let: { pid: "$paymentIntentId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ["$paymentIntentId", "$$pid"] }, { $eq: ["$eventType", "RefundProcessed"] }],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "_refundMatch",
      },
    },
    { $match: { _refundMatch: { $size: 0 } } },
    { $unset: "_refundMatch" },
  ];
}

export type NetBenefitsGrantedMatch = {
  eventType: "BenefitsGranted";
  timestamp: { $gte: Date; $lte: Date };
} & Record<string, unknown>;

/**
 * Distinct paymentIntentIds that have a RefundProcessed event (all-time).
 */
export async function getRefundedPaymentIntentIds(): Promise<string[]> {
  return PaymentEvent.distinct("paymentIntentId", { eventType: "RefundProcessed" });
}

/**
 * Total net revenue (dollars) for BenefitsGranted in [startDate, endDate] with no refund.
 */
export async function aggregateNetRevenueSum(startDate: Date, endDate: Date): Promise<number> {
  const result = await PaymentEvent.aggregate<{ totalRevenue: number }>([
    {
      $match: {
        eventType: "BenefitsGranted",
        timestamp: { $gte: startDate, $lte: endDate },
      },
    },
    ...excludeRefundedBenefitsGrantedStages(),
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: { $ifNull: ["$data.price", 0] } },
      },
    },
  ]).exec();

  return result[0]?.totalRevenue ?? 0;
}

/**
 * Count of net purchases (BenefitsGranted minus refunded) in range.
 */
export async function aggregateNetSalesCount(startDate: Date, endDate: Date): Promise<number> {
  const result = await PaymentEvent.aggregate<{ c: number }>([
    {
      $match: {
        eventType: "BenefitsGranted",
        timestamp: { $gte: startDate, $lte: endDate },
      },
    },
    ...excludeRefundedBenefitsGrantedStages(),
    { $count: "c" },
  ]).exec();

  return result[0]?.c ?? 0;
}

/** Lean docs: BenefitsGranted in range with no RefundProcessed for same paymentIntentId (net revenue basis). */
export async function fetchNetBenefitsGrantedInRange(
  startDate: Date,
  endDate: Date,
  project?: Record<string, 1 | 0>
): Promise<
  Array<{
    _id?: string;
    userId?: unknown;
    packageType?: string;
    packageId?: string;
    packageName?: string;
    data?: { price?: number; billingReason?: string; [key: string]: unknown };
    timestamp?: Date;
  }>
> {
  return fetchNetBenefitsGrantedWithMatch(
    { timestamp: { $gte: startDate, $lte: endDate } },
    project
  );
}

/**
 * BenefitsGranted matching additional filters (e.g. category, experiment) excluding refunded payments.
 * `match` must not set eventType (always BenefitsGranted).
 */
export async function fetchNetBenefitsGrantedWithMatch(
  match: Record<string, unknown>,
  project?: Record<string, 1 | 0>
): Promise<
  Array<{
    _id?: string;
    userId?: unknown;
    packageType?: string;
    packageId?: string;
    packageName?: string;
    data?: { price?: number; billingReason?: string; [key: string]: unknown };
    timestamp?: Date;
  }>
> {
  const pipeline: PipelineStage[] = [
    { $match: { eventType: "BenefitsGranted", ...match } },
    ...excludeRefundedBenefitsGrantedStages(),
  ];
  if (project && Object.keys(project).length > 0) {
    pipeline.push({ $project: project });
  }
  return PaymentEvent.aggregate(pipeline).allowDiskUse(true).exec();
}

/** Sum net revenue (dollars) for BenefitsGranted matching `match` (excluding refunded). */
export async function aggregateNetRevenueSumWithMatch(match: Record<string, unknown>): Promise<number> {
  const result = await PaymentEvent.aggregate<{ totalRevenue: number }>([
    { $match: { eventType: "BenefitsGranted", ...match } },
    ...excludeRefundedBenefitsGrantedStages(),
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: { $ifNull: ["$data.price", 0] } },
      },
    },
  ]).exec();

  return result[0]?.totalRevenue ?? 0;
}

/**
 * Count + revenue + per-packageType breakdown for net BenefitsGranted matching `match`,
 * in ONE round-trip, with the counting done by MongoDB instead of in JS.
 *
 * Replaces the `fetchNetBenefitsGrantedInRange(...)` + JS-loop pattern for callers that only
 * need the aggregates: that pattern shipped every matching document across the wire purely to
 * sum a number (2,304 documents on the all-time admin metrics range, measured 2026-08-17).
 *
 * Deliberately ADDITIVE — `fetchNetBenefitsGrantedInRange` is unchanged because
 * `revenue-breakdown`, `MembershipAnalyticsService` and `PaymentEventRepository` need its
 * document output.
 *
 * Grouping is by `packageType` (a handful of distinct values), so the result set is bounded and
 * the final reduce in JS is over ~4 rows, not over every payment.
 *
 * Parity note: the JS original used `event.packageType || "unknown"` and `event.data?.price || 0`,
 * so empty-string packageType folded into "unknown" and missing prices became 0. Both are
 * reproduced exactly below — `$ifNull` alone would NOT, since it preserves `""`.
 */
export async function aggregateNetBenefitsSummaryWithMatch(match: Record<string, unknown>): Promise<{
  count: number;
  totalRevenue: number;
  byPackageType: Record<string, number>;
}> {
  const rows = await PaymentEvent.aggregate<{ _id: string; c: number; revenue: number }>([
    { $match: { eventType: "BenefitsGranted", ...match } },
    ...excludeRefundedBenefitsGrantedStages(),
    {
      $group: {
        _id: {
          $let: {
            vars: { pt: "$packageType" },
            in: {
              $cond: [
                { $in: ["$$pt", [null, "", undefined]] },
                "unknown",
                "$$pt",
              ],
            },
          },
        },
        c: { $sum: 1 },
        revenue: { $sum: { $ifNull: ["$data.price", 0] } },
      },
    },
  ]).exec();

  let count = 0;
  let totalRevenue = 0;
  const byPackageType: Record<string, number> = {};
  for (const row of rows) {
    count += row.c;
    totalRevenue += row.revenue;
    byPackageType[row._id] = (byPackageType[row._id] || 0) + row.c;
  }

  return { count, totalRevenue, byPackageType };
}

/** Count net BenefitsGranted rows matching `match` (excluding refunded). */
export async function aggregateNetCountWithMatch(match: Record<string, unknown>): Promise<number> {
  const result = await PaymentEvent.aggregate<{ c: number }>([
    { $match: { eventType: "BenefitsGranted", ...match } },
    ...excludeRefundedBenefitsGrantedStages(),
    { $count: "c" },
  ]).exec();

  return result[0]?.c ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Per-user grant ledger
//
// Added 2026-08-26. The Klaviyo profile projection used to RECONSTRUCT a member's entries as
// `catalogue.entriesPerMonth x floor(elapsed / 30 days)`. Measured against production that
// was wrong for 4,904 of 4,904 active members — understated by x5 to x14 — because the
// catalogue cannot see promo multipliers, upgrades that reset `startDate`, or resubscribes.
//
// `PaymentEvent` already records what was ACTUALLY granted and charged, per grant, indexed on
// `userId_1_timestamp_-1`. So we read the ledger instead of guessing at it.
// ─────────────────────────────────────────────────────────────────────────────────────────

/** The four paid grant sources. Mirrors the `PaymentEvent.packageType` enum. */
const PACKAGE_TYPE_TO_BUCKET = {
  membership: "memberEntries",
  "one-time": "oneTimeEntries",
  upsell: "upsellEntries",
  "mini-draw": "miniDrawEntries",
} as const;

export type GrantPackageType = keyof typeof PACKAGE_TYPE_TO_BUCKET;

/** One `$group` row out of `aggregateNetGrantsByUser`'s pipeline. */
export interface GrantRow {
  userId: string;
  packageType: GrantPackageType;
  entries: number | null | undefined;
  price: number | null | undefined;
}

/**
 * A user's lifetime PAID grants, refund-netted.
 *
 * EXCLUDES free grants (referral, promo-link, cancellation-upsell, streak, bonus-entry-promo)
 * by construction — those never produce a `BenefitsGranted` PaymentEvent. The all-sources
 * lifetime total lives on `user.accumulatedEntries`.
 *
 * `netSpend` is in DOLLARS, matching the `BenefitsGranted.data.price` convention documented
 * at the top of this file.
 */
export interface UserGrantLedger {
  memberEntries: number;
  oneTimeEntries: number;
  upsellEntries: number;
  miniDrawEntries: number;
  netSpend: number;
}

export function emptyGrantLedger(): UserGrantLedger {
  return {
    memberEntries: 0,
    oneTimeEntries: 0,
    upsellEntries: 0,
    miniDrawEntries: 0,
    netSpend: 0,
  };
}

/**
 * Pure fold of aggregation rows into per-user ledgers.
 *
 * Split out from the query so the arithmetic is testable without a database — the bug this
 * replaces was arithmetic, not I/O.
 */
export function foldGrantRows(rows: GrantRow[]): Map<string, UserGrantLedger> {
  const out = new Map<string, UserGrantLedger>();

  for (const row of rows) {
    const key = String(row.userId);
    const ledger = out.get(key) ?? emptyGrantLedger();
    const bucket = PACKAGE_TYPE_TO_BUCKET[row.packageType];

    // An unrecognised packageType (e.g. a future "shop") is not a paid entry grant. Record the
    // user so callers see a real ledger rather than a missing key, but bank nothing.
    if (bucket) {
      ledger[bucket] += Number(row.entries) || 0;
      ledger.netSpend += Number(row.price) || 0;
    }

    out.set(key, ledger);
  }

  return out;
}

/**
 * Lifetime paid grants for the given users, refund-netted.
 *
 * Excludes any `BenefitsGranted` row whose `paymentIntentId` has a matching
 * `RefundProcessed` — the same Option B netting the admin revenue breakdown uses, so the
 * two never disagree.
 *
 * Users with no grants are ABSENT from the returned Map; callers should fall back to
 * `emptyGrantLedger()`.
 */
export async function aggregateNetGrantsByUser(
  // Accepts strings as well as ObjectIds: `IUser._id` is declared `string` in this codebase,
  // and Mongoose casts on the way into `$in` because `PaymentEvent.userId` is an ObjectId ref.
  userIds: Array<Types.ObjectId | string>
): Promise<Map<string, UserGrantLedger>> {
  if (userIds.length === 0) return new Map();

  const rows = await PaymentEvent.aggregate<{
    _id: { userId: Types.ObjectId; packageType: GrantPackageType };
    entries: number;
    price: number;
  }>([
    { $match: { userId: { $in: userIds }, eventType: "BenefitsGranted" } },
    ...excludeRefundedBenefitsGrantedStages(),
    {
      $group: {
        _id: { userId: "$userId", packageType: "$packageType" },
        entries: { $sum: { $ifNull: ["$data.entries", 0] } },
        price: { $sum: { $ifNull: ["$data.price", 0] } },
      },
    },
  ]).exec();

  return foldGrantRows(
    rows.map((r) => ({
      userId: String(r._id.userId),
      packageType: r._id.packageType,
      entries: r.entries,
      price: r.price,
    }))
  );
}
