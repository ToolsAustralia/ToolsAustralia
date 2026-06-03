/**
 * Payment Event Repository
 * 
 * Data access layer for PaymentEvent model.
 * Provides methods for querying payment events for metrics aggregation.
 * 
 * IMPORTANT: PaymentEvent.data.price is stored in DOLLARS
 * - Stripe amounts are in cents, but are converted to dollars when PaymentEvent is created
 * - Example: Stripe amount 5000 cents → PaymentEvent.data.price = 50.00 dollars
 * - This matches the format used throughout the application for revenue calculations
 *
 * Revenue methods exclude payments that have a RefundProcessed row (same paymentIntentId) — Option B net revenue.
 */

import PaymentEvent from "@/models/PaymentEvent";
import type { IPaymentEvent } from "@/models/PaymentEvent";
import {
  aggregateNetCountWithMatch,
  aggregateNetRevenueSum,
  excludeRefundedBenefitsGrantedStages,
  fetchNetBenefitsGrantedInRange,
} from "@/utils/payment/payment-event-net-queries";
import { ATTRIBUTED_PLATFORM_KEYS, type AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";

export class PaymentEventRepository {
  /**
   * Find payment events by date range
   * @param startDate - Start date (inclusive)
   * @param endDate - End date (inclusive)
   * @returns Array of payment events
   */
  async findByDateRange(startDate: Date, endDate: Date): Promise<IPaymentEvent[]> {
    console.log(`[PaymentEventRepo] Querying net payment events:`, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    const results = (await fetchNetBenefitsGrantedInRange(startDate, endDate)) as unknown as IPaymentEvent[];

    console.log(`[PaymentEventRepo] Found ${results.length} net payment events`);
    if (results.length > 0) {
      console.log(`[PaymentEventRepo] Sample event:`, {
        _id: results[0]._id,
        timestamp: results[0].timestamp,
        price: results[0].data?.price,
        packageType: results[0].packageType,
      });
    }

    return results;
  }

  /**
   * Get revenue sum for a date range
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Total revenue in DOLLARS (PaymentEvent.data.price is already in dollars)
   */
  async getRevenueSum(startDate: Date, endDate: Date): Promise<number> {
    return aggregateNetRevenueSum(startDate, endDate);
  }

  /**
   * Get sales count for a date range
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Total number of sales
   */
  async getSalesCount(startDate: Date, endDate: Date): Promise<number> {
    return aggregateNetCountWithMatch({
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    });
  }

  /**
   * Get revenue by package type for a date range
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Revenue breakdown by package type
   */
  async getRevenueByPackageType(startDate: Date, endDate: Date): Promise<Record<string, number>> {
    const result = await PaymentEvent.aggregate([
      {
        $match: {
          eventType: "BenefitsGranted",
          timestamp: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      ...excludeRefundedBenefitsGrantedStages(),
      {
        $group: {
          _id: "$packageType",
          revenue: {
            $sum: { $ifNull: ["$data.price", 0] },
          },
        },
      },
    ]).exec();

    const breakdown: Record<string, number> = {};
    result.forEach((item) => {
      breakdown[item._id] = item.revenue;
    });

    return breakdown;
  }

  /**
   * Hour-of-day (AEST, 0-23) revenue + conversions grouped by convertingPlatform,
   * over [startUTC, endUTC). SHARED aggregator behind every per-platform hourly view.
   *
   * Same acquisition basis as the daily snapshot aggregator (aggregateRevenueForDay):
   * excludes membership renewals (billingReason "subscription_cycle"), excludes whole
   * rows with any RefundProcessed (all-time), coalesces null platform -> "direct".
   * `endUTC` is EXCLUSIVE (next-midnight-AEST-in-UTC) so it reconciles bit-for-bit
   * with the daily snapshot's $lt boundary.
   *
   * @returns per-platform map keyed by AttributedPlatformKey; each value = 24 zero-filled buckets.
   */
  async aggregateRevenueByHourAndPlatform(
    startUTC: Date,
    endUTC: Date
  ): Promise<Record<AttributedPlatformKey, { hour: number; revenue: number; conversions: number }[]>> {
    const AEST_TIMEZONE = "Australia/Sydney";

    const result = await PaymentEvent.aggregate<{
      _id: { hour: number; platform: string };
      revenue: number;
      conversions: number;
    }>([
      {
        $match: {
          eventType: "BenefitsGranted",
          timestamp: { $gte: startUTC, $lt: endUTC },
          // Acquisition basis: exclude membership renewals (matches aggregateRevenueForDay).
          $nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }],
        },
      },
      ...excludeRefundedBenefitsGrantedStages(),
      {
        $group: {
          _id: {
            hour: { $hour: { date: "$timestamp", timezone: AEST_TIMEZONE } },
            platform: { $ifNull: ["$convertingPlatform", "direct"] },
          },
          revenue: { $sum: { $ifNull: ["$data.price", 0] } },
          conversions: { $sum: 1 },
        },
      },
    ]).exec();

    // Zero-fill all 8 platforms x 24 hours.
    const out = {} as Record<AttributedPlatformKey, { hour: number; revenue: number; conversions: number }[]>;
    for (const p of ATTRIBUTED_PLATFORM_KEYS) {
      out[p] = Array.from({ length: 24 }, (_, hour) => ({ hour, revenue: 0, conversions: 0 }));
    }
    for (const r of result) {
      const platform = r._id.platform as AttributedPlatformKey;
      const hour = r._id.hour;
      if (!out[platform] || hour < 0 || hour > 23) continue; // ignore any out-of-enum / bad hour
      out[platform][hour] = { hour, revenue: r.revenue, conversions: r.conversions };
    }
    return out;
  }
}

