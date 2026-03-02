/**
 * Dashboard Metrics Service
 * 
 * Business logic for enhanced admin dashboard metrics.
 */

import { PaymentEventRepository } from "@/repositories/PaymentEventRepository";
import { MetricsCalculationService } from "../metrics/MetricsCalculationService";
import { fetchFacebookInsights } from "@/lib/facebook-marketing";
import { formatInTimeZone } from "date-fns-tz";
import type { EnhancedDashboardMetrics } from "@/types/admin/EnhancedMetrics";
import User from "@/models/User";
import connectDB from "@/lib/mongodb";
import { getEverPaidUserFilter } from "@/utils/admin/userFilterBuilder";

export class DashboardMetricsService {
  constructor(
    private paymentEventRepo = new PaymentEventRepository(),
    private calculationService = new MetricsCalculationService()
  ) {}

  /**
   * Get average order value
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Average order value
   */
  async getAverageOrderValue(startDate: Date, endDate: Date): Promise<number> {
    const revenue = await this.paymentEventRepo.getRevenueSum(startDate, endDate);
    const salesCount = await this.paymentEventRepo.getSalesCount(startDate, endDate);

    if (salesCount === 0) {
      return 0;
    }

    return revenue / salesCount;
  }

  /**
   * Get customer acquisition cost
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Customer acquisition cost
   */
  async getCustomerAcquisitionCost(startDate: Date, endDate: Date): Promise<number> {
    await connectDB();
    
    // Fetch ad spend directly from Facebook API
    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
    let adSpend = 0;

    if (adAccountId && accessToken) {
      try {
        const AEST_TIMEZONE = "Australia/Sydney";
        const startYear = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "yyyy"), 10);
        const startMonth = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "M"), 10);
        const startDay = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "d"), 10);
        const startDateStr = `${startYear}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;

        const endYear = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "yyyy"), 10);
        const endMonth = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "M"), 10);
        const endDay = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "d"), 10);
        const endDateStr = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

        const insightsData = await fetchFacebookInsights(
          adAccountId,
          accessToken,
          { since: startDateStr, until: endDateStr },
          "account"
        );

        if (insightsData && insightsData.length > 0) {
          // Sum up ad spend from all insights (in cents, convert to dollars)
          adSpend = insightsData.reduce((sum, insight) => sum + insight.metrics.spend, 0) / 100;
        }
      } catch (error) {
        console.error("Error fetching Facebook ad spend:", error);
        // Return 0 if API fails
      }
    }
    
    // Count new signups in date range
    const newSignups = await User.countDocuments({
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
      isActive: true,
    });

    if (newSignups === 0) {
      return 0;
    }

    return adSpend / newSignups;
  }

  /**
   * Get revenue per user
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Revenue per user
   */
  async getRevenuePerUser(startDate: Date, endDate: Date): Promise<number> {
    await connectDB();
    
    const revenue = await this.paymentEventRepo.getRevenueSum(startDate, endDate);
    
    // Count total active users
    const totalUsers = await User.countDocuments({
      isActive: true,
    });

    if (totalUsers === 0) {
      return 0;
    }

    return revenue / totalUsers;
  }

  /**
   * Get mini draw performance metrics
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Mini draw performance data
   */
  async getMiniDrawPerformance(startDate: Date, endDate: Date) {
    const revenueByType = await this.paymentEventRepo.getRevenueByPackageType(startDate, endDate);
    const miniDrawRevenue = revenueByType["mini-draw"] || 0;
    
    const miniDrawEvents = await this.paymentEventRepo.findByDateRange(startDate, endDate);
    const miniDrawSales = miniDrawEvents.filter((e) => e.packageType === "mini-draw").length;

    // Calculate average revenue per draw (simplified - would need actual draw count)
    const averageRevenuePerDraw = miniDrawSales > 0 ? miniDrawRevenue / miniDrawSales : 0;

    return {
      totalRevenue: miniDrawRevenue,
      totalSales: miniDrawSales,
      averageRevenuePerDraw,
    };
  }

  /**
   * Get conversion funnel data
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Conversion funnel metrics
   */
  async getConversionFunnel(startDate: Date, endDate: Date) {
    await connectDB();
    
    // Get signups in date range
    const signups = await User.countDocuments({
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
      isActive: true,
    });

    // Get paying customers: users who signed up in range AND have ever made a purchase
    const payingCustomers = await User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
      ...getEverPaidUserFilter(false),
      isActive: true,
    });

    // Note: Visitors would need to be tracked separately (analytics integration)
    // For now, we'll estimate based on signups
    const visitors = signups * 10; // Rough estimate: 10% conversion rate

    const visitorToSignup = visitors > 0 ? (signups / visitors) * 100 : 0;
    const signupToPaying = signups > 0 ? (payingCustomers / signups) * 100 : 0;
    const overall = visitors > 0 ? (payingCustomers / visitors) * 100 : 0;

    return {
      visitors,
      signups,
      payingCustomers,
      conversionRates: {
        visitorToSignup,
        signupToPaying,
        overall,
      },
    };
  }

  /**
   * Get enhanced dashboard metrics
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Enhanced dashboard metrics
   */
  async getEnhancedMetrics(startDate: Date, endDate: Date): Promise<EnhancedDashboardMetrics> {
    const [averageOrderValue, customerAcquisitionCost, revenuePerUser, miniDrawPerformance, conversionFunnel] =
      await Promise.all([
        this.getAverageOrderValue(startDate, endDate),
        this.getCustomerAcquisitionCost(startDate, endDate),
        this.getRevenuePerUser(startDate, endDate),
        this.getMiniDrawPerformance(startDate, endDate),
        this.getConversionFunnel(startDate, endDate),
      ]);

    await connectDB();
    const totalUsers = await User.countDocuments({ isActive: true });
    const payingUsers = await User.countDocuments(getEverPaidUserFilter());
    const conversionRate = totalUsers > 0 ? (payingUsers / totalUsers) * 100 : 0;

    return {
      averageOrderValue,
      customerAcquisitionCost,
      revenuePerUser,
      conversionRate,
      miniDrawPerformance,
      conversionFunnel,
    };
  }
}

