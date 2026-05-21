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

/** Count net BenefitsGranted rows matching `match` (excluding refunded). */
export async function aggregateNetCountWithMatch(match: Record<string, unknown>): Promise<number> {
  const result = await PaymentEvent.aggregate<{ c: number }>([
    { $match: { eventType: "BenefitsGranted", ...match } },
    ...excludeRefundedBenefitsGrantedStages(),
    { $count: "c" },
  ]).exec();

  return result[0]?.c ?? 0;
}
