/**
 * Daily Metrics Aggregation Job
 * 
 * Background job to aggregate daily metrics.
 * Can be called by cron job or scheduled task.
 * 
 * This job is idempotent - safe to run multiple times.
 */

import { DailyMetricsService } from "@/services/metrics/DailyMetricsService";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { getStartOfTodayInAEST } from "@/utils/common/timezone";

const dailyMetricsService = new DailyMetricsService();

/**
 * Aggregate daily metrics for yesterday
 * Typically runs once per day (e.g., at 2 AM)
 */
export async function aggregateYesterdayMetrics(): Promise<{
  success: boolean;
  date: Date;
  error?: string;
}> {
  try {
    const today = getStartOfTodayInAEST();
    const yesterday = subDays(today, 1);
    
    const startOfYesterday = startOfDay(yesterday);
    const endOfYesterday = endOfDay(yesterday);

    console.log(`[AGGREGATION JOB] Starting aggregation for ${startOfYesterday.toISOString()}`);

    await dailyMetricsService.ensureDailyMetricsAggregated(startOfYesterday, endOfYesterday);

    console.log(`[AGGREGATION JOB] Completed aggregation for ${startOfYesterday.toISOString()}`);

    return {
      success: true,
      date: startOfYesterday,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[AGGREGATION JOB] Error aggregating metrics:`, errorMessage);
    
    return {
      success: false,
      date: subDays(getStartOfTodayInAEST(), 1),
      error: errorMessage,
    };
  }
}

/**
 * Aggregate daily metrics for a date range
 * Useful for backfilling missing data
 */
export async function aggregateDateRangeMetrics(
  startDate: Date,
  endDate: Date
): Promise<{
  success: boolean;
  datesProcessed: number;
  errors: Array<{ date: Date; error: string }>;
}> {
  const errors: Array<{ date: Date; error: string }> = [];
  let datesProcessed = 0;

  try {
    await dailyMetricsService.ensureDailyMetricsAggregated(startDate, endDate);
    
    // Calculate number of days processed
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    datesProcessed = diffDays;

    console.log(`[AGGREGATION JOB] Processed ${datesProcessed} days from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    return {
      success: true,
      datesProcessed,
      errors,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[AGGREGATION JOB] Error in date range aggregation:`, errorMessage);
    
    return {
      success: false,
      datesProcessed,
      errors: [{ date: startDate, error: errorMessage }],
    };
  }
}

