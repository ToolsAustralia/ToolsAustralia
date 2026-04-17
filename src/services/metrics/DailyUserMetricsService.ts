/**
 * Daily User Metrics Service
 * 
 * Business logic for aggregating user metrics by day.
 * Aggregates on-the-fly from source data (User, PaymentEvent, ReferralEvent).
 */

import User from "@/models/User";
import {
  aggregateNetCountWithMatch,
  aggregateNetRevenueSumWithMatch,
} from "@/utils/payment/payment-event-net-queries";
import ReferralEvent from "@/models/ReferralEvent";
import connectDB from "@/lib/mongodb";
import type { IDailyUserMetrics, DailyUserMetricsQuery, DailyUserMetricsResult } from "@/types/metrics/DailyUserMetrics";
import { getDaysInRange } from "@/utils/dates/month-helpers";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import { formatInTimeZone } from "date-fns-tz";

const AEST_TIMEZONE = "Australia/Sydney";

/**
 * Simple in-memory cache for daily user metrics
 */
interface CacheEntry {
  data: IDailyUserMetrics[];
  expiresAt: number;
}

class DailyUserMetricsCache {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  get(key: string): IDailyUserMetrics[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set(key: string, data: IDailyUserMetrics[]): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + this.TTL,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export class DailyUserMetricsService {
  private cache = new DailyUserMetricsCache();

  constructor() {
    // Clean up cache every 10 minutes
    setInterval(() => this.cache.cleanup(), 10 * 60 * 1000);
  }

  /**
   * Get daily user metrics for a date range
   * Aggregates on-the-fly from source data with in-memory caching
   */
  async getDailyUserMetrics(query: DailyUserMetricsQuery): Promise<DailyUserMetricsResult> {
    await connectDB();

    // Generate cache key from date range
    const cacheKey = this.getCacheKey(query.startDate, query.endDate);
    
    // Check in-memory cache first
    const cachedData = this.cache.get(cacheKey);
    if (cachedData) {
      return { data: cachedData, cached: true };
    }

    // Aggregate on-the-fly from source data
    const aggregated = await this.aggregateMetricsForRange(query.startDate, query.endDate);
    
    // Cache the result
    this.cache.set(cacheKey, aggregated);

    return { data: aggregated, cached: false };
  }

  /**
   * Generate cache key from date range
   */
  private getCacheKey(startDate: Date, endDate: Date): string {
    const startStr = formatInTimeZone(startDate, AEST_TIMEZONE, "yyyy-MM-dd");
    const endStr = formatInTimeZone(endDate, AEST_TIMEZONE, "yyyy-MM-dd");
    return `daily_user_metrics_${startStr}_${endStr}`;
  }

  /**
   * Aggregate user metrics for a single day
   */
  async aggregateDailyUserMetrics(date: Date): Promise<IDailyUserMetrics> {
    // Normalize date to start of day in AEST timezone
    const year = parseInt(formatInTimeZone(date, AEST_TIMEZONE, "yyyy"), 10);
    const month = parseInt(formatInTimeZone(date, AEST_TIMEZONE, "M"), 10);
    const day = parseInt(formatInTimeZone(date, AEST_TIMEZONE, "d"), 10);
    
    const startOfDay = createAESTDateAsUTC(year, month, day, 0, 0);
    const endOfDay = createAESTDateAsUTC(year, month, day, 23, 59);
    endOfDay.setUTCSeconds(59, 999);

    // Get users created on this day
    const users = await User.find({
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .select("_id affiliateReferral profession subscription createdAt")
      .lean()
      .exec();

    const newSignups = users.length;

    // Get all users (for total count - this should be cumulative, but for daily view we show new signups)
    // For daily metrics, we'll show new signups per day
    const totalUsers = newSignups; // For daily view, this represents new users that day

    // Get referral events for users created on this day
    const userIds = users.map((u) => u._id);
    const referralEvents = await ReferralEvent.find({
      inviteeUserId: { $in: userIds },
      status: { $in: ["pending", "converted"] },
    })
      .select("inviteeUserId referrerId")
      .lean()
      .exec();

    // Create a set of user IDs who were referred by someone else (not themselves)
    const referredUserIds = new Set<string>();
    referralEvents.forEach((event) => {
      const inviteeId = event.inviteeUserId?.toString();
      const referrerId = event.referrerId?.toString();
      if (inviteeId && referrerId && inviteeId !== referrerId) {
        referredUserIds.add(inviteeId);
      }
    });

    // Aggregate signup sources
    const signupSource = {
      affiliate: 0,
      referral: 0,
      direct: 0,
      organic: 0,
      social: 0,
    };

    // Aggregate professions
    const professions: Record<string, number> = {};

    // Aggregate membership status
    let activeMemberships = 0;
    let cancelledMemberships = 0;
    let expiredMemberships = 0;

    for (const user of users) {
      const userId = user._id.toString();
      
      // Determine signup source
      if (user.affiliateReferral?.affiliateId) {
        signupSource.affiliate++;
      } else if (referredUserIds.has(userId)) {
        signupSource.referral++;
      } else {
        signupSource.direct++;
      }

      // Aggregate profession
      if (user.profession) {
        professions[user.profession] = (professions[user.profession] || 0) + 1;
      }

      // Check membership status
      if (user.subscription) {
        if (user.subscription.isActive) {
          activeMemberships++;
        } else if (user.subscription.status === "canceled" || user.subscription.status === "cancelled") {
          cancelledMemberships++;
        } else if (user.subscription.endDate && new Date(user.subscription.endDate) < new Date()) {
          expiredMemberships++;
        }
      }
    }

    // Renewals (net: exclude subscription_cycle payments that were refunded)
    const renewedMemberships = await aggregateNetCountWithMatch({
      packageType: "membership",
      "data.billingReason": "subscription_cycle",
      timestamp: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    });

    const totalRevenue = await aggregateNetRevenueSumWithMatch({
      timestamp: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    });

    const totalPurchases = await aggregateNetCountWithMatch({
      timestamp: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    });

    const averageOrderValue = totalPurchases > 0 ? totalRevenue / totalPurchases : 0;

    return {
      date: startOfDay,
      totalUsers,
      newSignups,
      activeMemberships,
      cancelledMemberships,
      expiredMemberships,
      renewedMemberships,
      signupSource,
      totalPurchases,
      totalRevenue,
      averageOrderValue,
      professions,
    };
  }

  /**
   * Aggregate metrics for a date range
   */
  private async aggregateMetricsForRange(startDate: Date, endDate: Date): Promise<IDailyUserMetrics[]> {
    const days = getDaysInRange(startDate, endDate);
    const metrics: IDailyUserMetrics[] = [];

    // Process in batches of 10 days for better performance
    const BATCH_SIZE = 10;
    const batches: Date[][] = [];
    
    for (let i = 0; i < days.length; i += BATCH_SIZE) {
      batches.push(days.slice(i, i + BATCH_SIZE));
    }

    // Process batches sequentially, but days within batch in parallel
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(day => this.aggregateDailyUserMetrics(day))
      );

      // Collect successful results
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        
        if (result.status === "fulfilled") {
          metrics.push(result.value);
        } else {
          console.error(`[DailyUserMetrics] Error aggregating metrics for day:`, result.reason);
        }
      }
    }

    return metrics;
  }
}


