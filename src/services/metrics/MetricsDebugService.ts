/**
 * Metrics Debug Service
 *
 * Diagnostic helper that returns the recent BenefitsGranted PaymentEvent footprint
 * for a window. Used by the engineer-facing /api/admin/metrics/debug route and the
 * Norm /v1/metrics/debug projection. Not for analytical reporting — shape may change.
 */

import { subDays, startOfDay, endOfDay } from "date-fns";
import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";

export interface MetricsDebugSampleRow {
  timestamp: Date;
  price?: number | null;
  packageType?: string | null;
}

export interface MetricsDebugSnapshot {
  dateRange: {
    start: Date;
    end: Date;
    days: number;
  };
  paymentEvents: {
    count: number;
    /** AUD dollars — sum across the sample slice only, not the full window. */
    totalRevenue: number;
    /** Up to 10 most-recent BenefitsGranted PaymentEvents. */
    sample: MetricsDebugSampleRow[];
  };
  facebookAds: { note: string };
  note: string;
}

const SAMPLE_LIMIT = 10;

export async function getMetricsDebugSnapshot(
  daysBack: number = 7
): Promise<MetricsDebugSnapshot> {
  await connectDB();

  const days = Math.max(1, Math.min(daysBack, 365));
  const today = new Date();
  const startDate = subDays(today, days);
  const startOfRange = startOfDay(startDate);
  const endOfRange = endOfDay(today);

  const filter = {
    eventType: "BenefitsGranted" as const,
    timestamp: { $gte: startOfRange, $lte: endOfRange },
  };

  const [sample, count] = await Promise.all([
    PaymentEvent.find(filter)
      .select("timestamp data.price packageType")
      .lean()
      .limit(SAMPLE_LIMIT),
    PaymentEvent.countDocuments(filter),
  ]);

  const totalRevenue = sample.reduce((sum, e) => sum + (e.data?.price || 0), 0);

  return {
    dateRange: {
      start: startOfRange,
      end: endOfRange,
      days,
    },
    paymentEvents: {
      count,
      totalRevenue,
      sample: sample.map((e) => ({
        timestamp: e.timestamp,
        price: e.data?.price ?? null,
        packageType: e.packageType ?? null,
      })),
    },
    facebookAds: {
      note: "Facebook Ads data is fetched on-the-fly from Facebook Marketing API. No database cache exists.",
    },
    note: "DailyMetrics and FacebookAdsInsight models removed - metrics are now aggregated on-the-fly from source data",
  };
}
