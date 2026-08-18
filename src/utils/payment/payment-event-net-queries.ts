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
import type { PipelineStage } from "mongoose";

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
