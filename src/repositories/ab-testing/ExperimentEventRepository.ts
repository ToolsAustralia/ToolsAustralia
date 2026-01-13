import connectDB from "@/lib/mongodb";
import ExperimentEvent, { IExperimentEvent, ExperimentEventType } from "@/models/ab-testing/ExperimentEvent";

interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Experiment Event Repository
 * Handles all database operations for experiment events
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
      ...data,
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
      experimentId,
      variantId,
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
      experimentId,
      variantId,
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
      experimentId,
      variantId,
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
   */
  async getUniqueVisitors(experimentId: string, variantId: string, dateRange?: DateRange): Promise<number> {
    await connectDB();

    const query: Record<string, unknown> = {
      experimentId,
      variantId,
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
  }> {
    await connectDB();

    const matchQuery: Record<string, unknown> = {
      experimentId,
      variantId,
    };

    if (dateRange) {
      matchQuery.timestamp = {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate,
      };
    }

    const [pageViews, clicks, conversions, leads, purchases, uniqueVisitors] = await Promise.all([
      this.getPageViews(experimentId, variantId, dateRange),
      this.getClicks(experimentId, variantId, dateRange),
      this.getEventsByVariant(experimentId, variantId, "conversion", dateRange).then((events) => events.length),
      this.getEventsByVariant(experimentId, variantId, "lead", dateRange).then((events) => events.length),
      this.getEventsByVariant(experimentId, variantId, "purchase", dateRange).then((events) => events.length),
      this.getUniqueVisitors(experimentId, variantId, dateRange),
    ]);

    return {
      pageViews,
      clicks,
      conversions,
      leads,
      purchases,
      uniqueVisitors,
    };
  }
}

export default new ExperimentEventRepository();

