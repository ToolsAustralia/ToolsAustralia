import connectDB from "@/lib/mongodb";
import ExperimentEvent, { IExperimentEvent, ExperimentEventType } from "@/models/ab-testing/ExperimentEvent";
import ExperimentDailyMetricsRepository from "./ExperimentDailyMetricsRepository";
import PaymentEvent from "@/models/PaymentEvent";
import mongoose from "mongoose";

interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Experiment Event Repository
 * Handles all database operations for experiment events
 * 
 * IMPORTANT: Individual events are kept for 30 days for debugging
 * After 30 days, they are automatically deleted by the aggregation cron job
 * Metrics are stored in ExperimentDailyMetrics for efficient querying
 */
export class ExperimentEventRepository {
  /**
   * Create event record
   */
  async createEvent(data: {
    experimentId: string;
    variantId: string;
    eventType: ExperimentEventType;
    userId?: string;
    anonymousId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<IExperimentEvent> {
    await connectDB();
    return ExperimentEvent.create({
      experimentId: new mongoose.Types.ObjectId(data.experimentId),
      variantId: new mongoose.Types.ObjectId(data.variantId),
      eventType: data.eventType,
      userId: data.userId ? new mongoose.Types.ObjectId(data.userId) : undefined,
      anonymousId: data.anonymousId,
      metadata: data.metadata,
      timestamp: new Date(),
    });
  }

  /**
   * Get events for analytics
   */
  async getEventsByVariant(
    experimentId: string,
    variantId: string,
    eventType?: ExperimentEventType,
    dateRange?: DateRange
  ): Promise<IExperimentEvent[]> {
    await connectDB();

    const query: Record<string, unknown> = {
      experimentId: new mongoose.Types.ObjectId(experimentId),
      variantId: new mongoose.Types.ObjectId(variantId),
    };

    if (eventType) {
      query.eventType = eventType;
    }

    if (dateRange) {
      query.timestamp = {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate,
      };
    }

    return ExperimentEvent.find(query).sort({ timestamp: -1 }).exec();
  }

  /**
   * Get page view counts
   */
  async getPageViews(experimentId: string, variantId: string, dateRange?: DateRange): Promise<number> {
    await connectDB();

    const query: Record<string, unknown> = {
      experimentId: new mongoose.Types.ObjectId(experimentId),
      variantId: new mongoose.Types.ObjectId(variantId),
      eventType: "page_view",
    };

    if (dateRange) {
      query.timestamp = {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate,
      };
    }

    return ExperimentEvent.countDocuments(query).exec();
  }

  /**
   * Get click counts
   */
  async getClicks(experimentId: string, variantId: string, dateRange?: DateRange): Promise<number> {
    await connectDB();

    const query: Record<string, unknown> = {
      experimentId: new mongoose.Types.ObjectId(experimentId),
      variantId: new mongoose.Types.ObjectId(variantId),
      eventType: "click",
    };

    if (dateRange) {
      query.timestamp = {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate,
      };
    }

    return ExperimentEvent.countDocuments(query).exec();
  }

  /**
   * Get unique visitor counts
   * Uses MongoDB aggregation for efficient distinct counting
   */
  async getUniqueVisitors(experimentId: string, variantId: string, dateRange?: DateRange): Promise<number> {
    await connectDB();

    const query: Record<string, unknown> = {
      experimentId: new mongoose.Types.ObjectId(experimentId),
      variantId: new mongoose.Types.ObjectId(variantId),
      eventType: "page_view",
    };

    if (dateRange) {
      query.timestamp = {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate,
      };
    }

    // Count distinct userId or anonymousId
    const result = await ExperimentEvent.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            $cond: [
              { $ifNull: ["$userId", false] },
              "$userId",
              "$anonymousId",
            ],
          },
        },
      },
      { $count: "uniqueVisitors" },
    ]).exec();

    return result[0]?.uniqueVisitors || 0;
  }

  /**
   * Aggregate events for reporting
   * 
   * OPTIMIZED: Uses daily aggregated metrics when available (faster)
   * Falls back to individual events for recent data (last 30 days)
   * 
   * This hybrid approach provides:
   * - Fast queries for historical data (pre-aggregated)
   * - Accurate real-time data for recent events
   * - Reduced database size (99% reduction)
   * - Revenue tracking from PaymentEvents (recent) or ExperimentDailyMetrics (historical)
   */
  async aggregateEvents(
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

    // Hybrid approach: Use aggregated metrics for old data, individual events for recent
    // If date range is provided and is older than 30 days, use aggregated metrics
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

    // Determine if we need to handle split date ranges (spanning both recent and historical)
    const hasDateRange = !!dateRange;
    const startIsHistorical = dateRange ? dateRange.startDate < thirtyDaysAgo : false;
    const endIsHistorical = dateRange ? dateRange.endDate < thirtyDaysAgo : false;
    const useAggregatedMetrics = hasDateRange && startIsHistorical && endIsHistorical;
    const useSplitRange = hasDateRange && startIsHistorical && !endIsHistorical;

    // Helper function to get revenue from PaymentEvents
    // Handles edge cases: missing price data, null/undefined values
    const getRevenueFromPaymentEvents = async (
      expId: string,
      varId: string,
      range?: DateRange
    ): Promise<number> => {
      try {
        const paymentQuery: Record<string, unknown> = {
          experimentId: expId,
          variantId: varId,
          eventType: "BenefitsGranted",
        };

        if (range) {
          paymentQuery.timestamp = {
            $gte: range.startDate,
            $lte: range.endDate,
          };
        }

        const paymentEvents = await PaymentEvent.find(paymentQuery).lean();
        return paymentEvents.reduce((sum, event) => {
          // Handle edge cases: missing data, null price, invalid price
          const price = event.data?.price;
          if (typeof price === "number" && !isNaN(price) && price >= 0) {
            return sum + price;
          }
          return sum;
        }, 0);
      } catch (error) {
        // Log error but don't fail - return 0 revenue to prevent blocking analytics
        console.error(`Error fetching revenue for experiment ${expId}, variant ${varId}:`, error);
        return 0;
      }
    };

    if (useAggregatedMetrics) {
      // Use pre-aggregated daily metrics (fast, efficient) - includes revenue
      const aggregated = await ExperimentDailyMetricsRepository.getAggregatedMetrics(
        experimentId,
        variantId,
        dateRange
      );

      return {
        pageViews: aggregated.pageViews,
        clicks: aggregated.clicks,
        conversions: aggregated.conversions,
        leads: aggregated.leads,
        purchases: aggregated.purchases,
        uniqueVisitors: aggregated.uniqueVisitors,
        revenue: aggregated.revenue,
      };
    }

    if (useSplitRange && dateRange) {
      // Split range: combine historical (daily metrics) + recent (individual events + PaymentEvents)
      const historicalRange: DateRange = {
        startDate: dateRange.startDate,
        endDate: thirtyDaysAgo,
      };
      const recentRange: DateRange = {
        startDate: thirtyDaysAgo,
        endDate: dateRange.endDate,
      };

      // Get historical metrics (includes revenue)
      const historicalMetrics = await ExperimentDailyMetricsRepository.getAggregatedMetrics(
        experimentId,
        variantId,
        historicalRange
      );

      // Get recent events
      const matchQuery: Record<string, unknown> = {
        experimentId: new mongoose.Types.ObjectId(experimentId),
        variantId: new mongoose.Types.ObjectId(variantId),
        timestamp: {
          $gte: recentRange.startDate,
          $lte: recentRange.endDate,
        },
      };

      const recentAggregated = await ExperimentEvent.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            pageViews: {
              $sum: { $cond: [{ $eq: ["$eventType", "page_view"] }, 1, 0] },
            },
            clicks: {
              $sum: { $cond: [{ $eq: ["$eventType", "click"] }, 1, 0] },
            },
            conversions: {
              $sum: { $cond: [{ $eq: ["$eventType", "conversion"] }, 1, 0] },
            },
            leads: {
              $sum: { $cond: [{ $eq: ["$eventType", "lead"] }, 1, 0] },
            },
            purchases: {
              $sum: { $cond: [{ $eq: ["$eventType", "purchase"] }, 1, 0] },
            },
            uniqueVisitors: {
              $addToSet: {
                $cond: [
                  { $ifNull: ["$userId", false] },
                  "$userId",
                  "$anonymousId",
                ],
              },
            },
          },
        },
        {
          $project: {
            pageViews: 1,
            clicks: 1,
            conversions: 1,
            leads: 1,
            purchases: 1,
            uniqueVisitors: { $size: "$uniqueVisitors" },
          },
        },
      ]).exec();

      const recentEvents = recentAggregated[0] || {
        pageViews: 0,
        clicks: 0,
        conversions: 0,
        leads: 0,
        purchases: 0,
        uniqueVisitors: 0,
      };

      // Get recent revenue from PaymentEvents
      const recentRevenue = await getRevenueFromPaymentEvents(experimentId, variantId, recentRange);

      // Combine historical and recent metrics
      return {
        pageViews: historicalMetrics.pageViews + (recentEvents.pageViews || 0),
        clicks: historicalMetrics.clicks + (recentEvents.clicks || 0),
        conversions: historicalMetrics.conversions + (recentEvents.conversions || 0),
        leads: historicalMetrics.leads + (recentEvents.leads || 0),
        purchases: historicalMetrics.purchases + (recentEvents.purchases || 0),
        uniqueVisitors: Math.max(historicalMetrics.uniqueVisitors, recentEvents.uniqueVisitors || 0), // Approximation
        revenue: historicalMetrics.revenue + recentRevenue,
      };
    }

    // For recent data (last 30 days) or no date range, use individual events
    // This ensures real-time accuracy for current experiments
    const matchQuery: Record<string, unknown> = {
      experimentId: new mongoose.Types.ObjectId(experimentId),
      variantId: new mongoose.Types.ObjectId(variantId),
    };

    if (dateRange) {
      matchQuery.timestamp = {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate,
      };
    }

    // Use MongoDB aggregation pipeline for efficient counting
    const aggregated = await ExperimentEvent.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          pageViews: {
            $sum: { $cond: [{ $eq: ["$eventType", "page_view"] }, 1, 0] },
          },
          clicks: {
            $sum: { $cond: [{ $eq: ["$eventType", "click"] }, 1, 0] },
          },
          conversions: {
            $sum: { $cond: [{ $eq: ["$eventType", "conversion"] }, 1, 0] },
          },
          leads: {
            $sum: { $cond: [{ $eq: ["$eventType", "lead"] }, 1, 0] },
          },
          purchases: {
            $sum: { $cond: [{ $eq: ["$eventType", "purchase"] }, 1, 0] },
          },
          uniqueVisitors: {
            $addToSet: {
              $cond: [
                { $ifNull: ["$userId", false] },
                "$userId",
                "$anonymousId",
              ],
            },
          },
        },
      },
      {
        $project: {
          pageViews: 1,
          clicks: 1,
          conversions: 1,
          leads: 1,
          purchases: 1,
          uniqueVisitors: { $size: "$uniqueVisitors" },
        },
      },
    ]).exec();

    // Get revenue from PaymentEvents for recent data
    const revenue = await getRevenueFromPaymentEvents(experimentId, variantId, dateRange);

    if (aggregated.length === 0) {
      return {
        pageViews: 0,
        clicks: 0,
        conversions: 0,
        leads: 0,
        purchases: 0,
        uniqueVisitors: 0,
        revenue,
      };
    }

    return {
      pageViews: aggregated[0].pageViews || 0,
      clicks: aggregated[0].clicks || 0,
      conversions: aggregated[0].conversions || 0,
      leads: aggregated[0].leads || 0,
      purchases: aggregated[0].purchases || 0,
      uniqueVisitors: aggregated[0].uniqueVisitors || 0,
      revenue,
    };
  }
}

export default new ExperimentEventRepository();

