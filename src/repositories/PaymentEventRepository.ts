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
   * Aggregate revenue and conversions by hour of day (AEST timezone).
   * Only includes purchases (excludes membership renewals): one-time, upsell, mini-draw,
   * and membership initial purchases; excludes packageType "membership" with data.billingReason "subscription_cycle".
   *
   * @param startDate - Start date (inclusive)
   * @param endDate - End date (inclusive)
   * @param options - Optional filters: utmSource (e.g. "facebook") for platform-specific revenue
   * @returns Array of 24 hourly aggregations (hour 0-23)
   */
  async aggregateRevenueAndCountByHourOfDay(
    startDate: Date,
    endDate: Date,
    options?: { utmSource?: string }
  ): Promise<{ hour: number; revenue: number; conversions: number }[]> {
    const AEST_TIMEZONE = "Australia/Sydney";

    const matchQuery: Record<string, unknown> = {
      eventType: "BenefitsGranted",
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
      // Exclude membership renewals; only count purchases (one-time, upsell, mini-draw, initial membership)
      $nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }],
    };

    if (options?.utmSource) {
      const escaped = options.utmSource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      matchQuery["data.utmSource"] = { $regex: new RegExp(`^${escaped}$`, "i") };
    }

    const result = await PaymentEvent.aggregate([
      {
        $match: matchQuery,
      },
      ...excludeRefundedBenefitsGrantedStages(),
      {
        $project: {
          // Convert timestamp to AEST and extract hour (0-23)
          hour: {
            $hour: {
              date: "$timestamp",
              timezone: AEST_TIMEZONE,
            },
          },
          price: { $ifNull: ["$data.price", 0] },
        },
      },
      {
        $group: {
          _id: "$hour",
          revenue: { $sum: "$price" },
          conversions: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]).exec();

    // Initialize all 24 hours with zeros
    const hourlyData: { hour: number; revenue: number; conversions: number }[] = Array.from(
      { length: 24 },
      (_, hour) => ({
        hour,
        revenue: 0,
        conversions: 0,
      })
    );

    // Populate with actual data
    result.forEach((item) => {
      const hour = item._id;
      if (hour >= 0 && hour < 24) {
        hourlyData[hour] = {
          hour,
          revenue: item.revenue,
          conversions: item.conversions,
        };
      }
    });

    return hourlyData;
  }
}

