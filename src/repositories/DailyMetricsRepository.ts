/**
 * Daily Metrics Repository
 * 
 * Data access layer for DailyMetrics model.
 * Abstracts database operations from business logic.
 */

import DailyMetrics from "@/models/DailyMetrics";
import type { IDailyMetrics } from "@/types/metrics/DailyMetrics";
import { formatInTimeZone } from "date-fns-tz";

export class DailyMetricsRepository {
  /**
   * Find daily metrics by date range
   * @param startDate - Start date (inclusive)
   * @param endDate - End date (inclusive)
   * @returns Array of daily metrics, sorted by date ascending
   */
  async findByDateRange(startDate: Date, endDate: Date): Promise<IDailyMetrics[]> {
    return DailyMetrics.find({
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .lean()
      .sort({ date: 1 })
      .exec();
  }

  /**
   * Find daily metrics for a specific month
   * @param monthString - Month in YYYY-MM format
   * @returns Array of daily metrics for the month
   */
  async findByMonth(monthString: string): Promise<IDailyMetrics[]> {
    const [year, month] = monthString.split("-").map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
    
    return this.findByDateRange(startDate, endDate);
  }

  /**
   * Find a single daily metric by date
   * @param date - Date to find
   * @returns Daily metric or null if not found
   */
  /**
   * Find daily metric by exact date
   * @param date - Date to find (should be AEST day normalized to UTC)
   * @returns Daily metric or null if not found
   * 
   * NOTE: Dates are stored as AEST days normalized to UTC.
   * We match by comparing AEST day representation to prevent duplicates.
   */
  async findByDate(date: Date): Promise<IDailyMetrics | null> {
    // Get AEST day representation of the query date
    const queryAESTDay = formatInTimeZone(date, "Australia/Sydney", "yyyy-MM-dd");
    
    // Find all metrics and filter by AEST day (to handle timezone edge cases)
    // We use a range query that covers the entire AEST day
    const allMetrics = await DailyMetrics.find({
      date: {
        $gte: new Date(date.getTime() - 24 * 60 * 60 * 1000), // 1 day before
        $lte: new Date(date.getTime() + 24 * 60 * 60 * 1000), // 1 day after
      },
    })
      .lean()
      .exec();
    
    // Find the metric that matches the AEST day
    for (const metric of allMetrics) {
      const metricAESTDay = formatInTimeZone(metric.date, "Australia/Sydney", "yyyy-MM-dd");
      if (metricAESTDay === queryAESTDay) {
        return metric as IDailyMetrics;
      }
    }
    
    return null;
  }

  /**
   * Create or update a daily metric
   * @param metric - Daily metric data
   * @returns Created or updated daily metric
   * 
   * NOTE: The date should already be normalized to AEST day in UTC format.
   * We don't re-normalize here to preserve the AEST timezone representation.
   */
  async createOrUpdate(metric: IDailyMetrics): Promise<IDailyMetrics> {
    // Get AEST day representation to prevent duplicates (used for logging/debugging)
    // Note: We compare AEST days in findByDate, not here
    
    // Find existing metric with the same AEST day
    const existing = await this.findByDate(metric.date);
    
    if (existing) {
      // Update existing metric (use its date to preserve exact storage format)
      return DailyMetrics.findOneAndUpdate(
        { _id: existing._id },
        {
          $set: {
            ...metric,
            date: existing.date, // Preserve original date format
          },
        },
        {
          new: true,
          runValidators: true,
        }
      )
        .lean()
        .exec() as Promise<IDailyMetrics>;
    } else {
      // Create new metric
      return DailyMetrics.create({
        ...metric,
        date: metric.date, // Use date as-is (already normalized to AEST day in UTC)
      }) as Promise<IDailyMetrics>;
    }
  }

  /**
   * Bulk upsert daily metrics
   * @param metrics - Array of daily metrics to upsert
   * @returns Promise that resolves when all operations complete
   */
  async bulkUpsert(metrics: IDailyMetrics[]): Promise<void> {
    if (metrics.length === 0) {
      return;
    }

    const operations = metrics.map((metric) => {
      // Normalize date to start of day (UTC)
      const date = new Date(metric.date);
      date.setUTCHours(0, 0, 0, 0);
      
      return {
        updateOne: {
          filter: { date },
          update: {
            $set: {
              ...metric,
              date,
            },
          },
          upsert: true,
        },
      };
    });

    await DailyMetrics.bulkWrite(operations);
  }

  /**
   * Check if metrics exist for a date range
   * @param startDate - Start date
   * @param endDate - End date
   * @returns True if all days in range have metrics
   */
  async isRangeComplete(startDate: Date, endDate: Date): Promise<boolean> {
    const count = await DailyMetrics.countDocuments({
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    }).exec();

    // Calculate expected number of days
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    return count >= diffDays;
  }
}

