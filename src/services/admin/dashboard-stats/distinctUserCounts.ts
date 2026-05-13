import PaymentEvent from "@/models/PaymentEvent";
import type { PipelineStage } from "mongoose";
import { excludeRefundedBenefitsGrantedStages } from "@/utils/payment/payment-event-net-queries";
import { REVENUE_BUCKET_KEYS, classifyRevenueBucket, type RevenueBucketKey } from "./snapshotSchema";

export type DistinctUserCountsByBucket = Record<RevenueBucketKey, number>;

/**
 * Compute distinct userCount per revenue bucket for [startDate, endDate], with
 * refund exclusion. Single aggregation that emits one row per
 * (packageType, packageId, billingReason) tuple using $addToSet on userId —
 * bounded by user count, not event count.
 *
 * For all-time, this scans the full BenefitsGranted set but groups in Mongo;
 * a covered index on {eventType:1, timestamp:1, packageType:1, packageId:1, userId:1}
 * keeps this fast.
 */
export async function computeDistinctUserCounts(
  startDate: Date,
  endDate: Date
): Promise<DistinctUserCountsByBucket> {
  const pipeline: PipelineStage[] = [
    {
      $match: {
        eventType: "BenefitsGranted",
        timestamp: { $gte: startDate, $lte: endDate },
      },
    },
    ...excludeRefundedBenefitsGrantedStages(),
    {
      $project: {
        userId: 1,
        packageType: 1,
        packageId: 1,
        billingReason: "$data.billingReason",
      },
    },
    {
      $group: {
        _id: { packageType: "$packageType", packageId: "$packageId", billingReason: "$billingReason" },
        users: { $addToSet: "$userId" },
      },
    },
  ];

  const rows = (await PaymentEvent.aggregate(pipeline).allowDiskUse(true).exec()) as Array<{
    _id: { packageType: string | undefined; packageId: string | undefined; billingReason: string | undefined };
    users: unknown[];
  }>;

  // Aggregate per bucket across (packageType, packageId, billingReason) tuples.
  // Same user across two tuples within the same bucket must count once — we
  // re-union into a Set per bucket.
  const userSetsByBucket: Record<RevenueBucketKey, Set<string>> = {} as Record<RevenueBucketKey, Set<string>>;
  for (const k of REVENUE_BUCKET_KEYS) userSetsByBucket[k] = new Set();

  for (const row of rows) {
    const bucket = classifyRevenueBucket(row._id);
    if (!bucket) continue;
    for (const u of row.users) {
      if (u != null) userSetsByBucket[bucket].add(String(u));
    }
  }

  const result = {} as DistinctUserCountsByBucket;
  for (const k of REVENUE_BUCKET_KEYS) result[k] = userSetsByBucket[k].size;
  return result;
}
