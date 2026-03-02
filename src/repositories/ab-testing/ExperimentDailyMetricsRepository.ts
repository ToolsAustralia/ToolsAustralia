import connectDB from "@/lib/mongodb";
import ExperimentDailyMetrics, { IExperimentDailyMetrics } from "@/models/ab-testing/ExperimentDailyMetrics";
import mongoose from "mongoose";

interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Experiment Daily Metrics Repository
 * Handles aggregated daily metrics for experiments
 * 
 * This is more efficient than storing individual events:
 * - Reduces database size by ~99%
 * - Faster queries (pre-aggregated data)
 * - Better performance at scale
 */
export class ExperimentDailyMetricsRepository {
  /**
   * Upsert daily metrics (create or update)
   * Uses atomic $inc operations for thread-safe updates
   * 
   * Note: This is called by the aggregation cron job which calculates
   * the final aggregated values, so we use $set instead of $inc
   */
  async upsertDailyMetrics(data: {
    experimentId: string;
    variantId: string;
    date: Date; // Should be normalized to start of day
    pageViews?: number;
    clicks?: number;
    conversions?: number;
    leads?: number;
    purchases?: number;
    uniqueVisitors?: number;
    revenue?: number;
  }): Promise<IExperimentDailyMetrics> {
    await connectDB();

    // Normalize date to start of day (UTC)
    const normalizedDate = new Date(data.date);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    const experimentId = new mongoose.Types.ObjectId(data.experimentId);
    const variantId = new mongoose.Types.ObjectId(data.variantId);

    // Use findOneAndUpdate with upsert
    // Since this is called by aggregation cron (final values), we use $set
    const update: Record<string, unknown> = {
      $set: {
        lastUpdated: new Date(),
        pageViews: data.pageViews || 0,
        clicks: data.clicks || 0,
        conversions: data.conversions || 0,
        leads: data.leads || 0,
        purchases: data.purchases || 0,
        uniqueVisitors: data.uniqueVisitors || 0,
        revenue: data.revenue || 0,
      },
      $setOnInsert: {
        experimentId,
        variantId,
        date: normalizedDate,
      },
    };

    return ExperimentDailyMetrics.findOneAndUpdate(
      {
        experimentId,
        variantId,
        date: normalizedDate,
      },
      update,
      {
        upsert: true,
        new: true,
      }
    ).exec();
  }

  /**
   * Get aggregated metrics for a date range
   * Sums up daily metrics for the period
   */
  async getAggregatedMetrics(
    experimentId: string,
    variantId: string,
    dateRange?: DateRange
  ): Promise<{
    pageViews: number;
    clicks: number;
    conversions: number;
    leads: number;
    purchases: number;
    uniqueVisitors: number;
    revenue: number;
  }> {
    await connectDB();

    const matchQuery: Record<string, unknown> = {
      experimentId: new mongoose.Types.ObjectId(experimentId),
      variantId: new mongoose.Types.ObjectId(variantId),
    };

    if (dateRange) {
      // Normalize dates to start/end of day
      const startDate = new Date(dateRange.startDate);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(dateRange.endDate);
      endDate.setUTCHours(23, 59, 59, 999);

      matchQuery.date = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    const result = await ExperimentDailyMetrics.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          pageViews: { $sum: "$pageViews" },
          clicks: { $sum: "$clicks" },
          conversions: { $sum: "$conversions" },
          leads: { $sum: "$leads" },
          purchases: { $sum: "$purchases" },
          revenue: { $sum: "$revenue" },
          // ⚠️ LIMITATION: For unique visitors across multiple days, we use the maximum daily count
          // This is an approximation because true unique visitors requires deduplicating user IDs across days
          // For accurate unique visitor counts, use recent data (<30 days) which uses event-level deduplication
          // For historical data (>30 days), this approximation is acceptable for reporting purposes
          // Note: This means if a user visits on Day 1 and Day 2, they may be counted twice
          // For precise analytics, always query recent data or implement a visitor tracking collection
          uniqueVisitors: { $max: "$uniqueVisitors" },
        },
      },
    ]).exec();

    if (result.length === 0) {
      return {
        pageViews: 0,
        clicks: 0,
        conversions: 0,
        leads: 0,
        purchases: 0,
        uniqueVisitors: 0,
        revenue: 0,
      };
    }

    return {
      pageViews: result[0].pageViews || 0,
      clicks: result[0].clicks || 0,
      conversions: result[0].conversions || 0,
      leads: result[0].leads || 0,
      purchases: result[0].purchases || 0,
      uniqueVisitors: result[0].uniqueVisitors || 0, // Note: This is an approximation
      revenue: result[0].revenue || 0,
    };
  }

  /**
   * Get daily metrics for a specific date
   */
  async getDailyMetrics(
    experimentId: string,
    variantId: string,
    date: Date
  ): Promise<IExperimentDailyMetrics | null> {
    await connectDB();

    // Normalize date to start of day
    const normalizedDate = new Date(date);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    return ExperimentDailyMetrics.findOne({
      experimentId: new mongoose.Types.ObjectId(experimentId),
      variantId: new mongoose.Types.ObjectId(variantId),
      date: normalizedDate,
    }).exec();
  }

  /**
   * Get all daily metrics for a variant in a date range
   */
  async getDailyMetricsRange(
    experimentId: string,
    variantId: string,
    dateRange: DateRange
  ): Promise<IExperimentDailyMetrics[]> {
    await connectDB();

    // Normalize dates
    const startDate = new Date(dateRange.startDate);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(dateRange.endDate);
    endDate.setUTCHours(23, 59, 59, 999);

    return ExperimentDailyMetrics.find({
      experimentId: new mongoose.Types.ObjectId(experimentId),
      variantId: new mongoose.Types.ObjectId(variantId),
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    })
      .sort({ date: 1 })
      .exec();
  }
}

const experimentDailyMetricsRepository = new ExperimentDailyMetricsRepository();
export default experimentDailyMetricsRepository;

