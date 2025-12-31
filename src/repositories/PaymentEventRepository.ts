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
 */

import PaymentEvent from "@/models/PaymentEvent";
import type { IPaymentEvent } from "@/models/PaymentEvent";
import mongoose from "mongoose";

export class PaymentEventRepository {
  /**
   * Find payment events by date range
   * @param startDate - Start date (inclusive)
   * @param endDate - End date (inclusive)
   * @returns Array of payment events
   */
  async findByDateRange(startDate: Date, endDate: Date): Promise<IPaymentEvent[]> {
    const query = {
      eventType: "BenefitsGranted", // Only successful payments
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    };
    
    console.log(`[PaymentEventRepo] Querying payment events:`, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
    
    const results = await PaymentEvent.find(query).lean().exec();
    
    console.log(`[PaymentEventRepo] Found ${results.length} payment events`);
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
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: { $ifNull: ["$data.price", 0] },
          },
        },
      },
    ]).exec();

    return result[0]?.totalRevenue || 0;
  }

  /**
   * Get sales count for a date range
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Total number of sales
   */
  async getSalesCount(startDate: Date, endDate: Date): Promise<number> {
    return PaymentEvent.countDocuments({
      eventType: "BenefitsGranted",
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    }).exec();
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
}

