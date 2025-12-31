/**
 * Dashboard Metrics Service
 * 
 * Business logic for enhanced admin dashboard metrics.
 */

import { PaymentEventRepository } from "@/repositories/PaymentEventRepository";
import { FacebookAdsRepository } from "@/repositories/FacebookAdsRepository";
import { MetricsCalculationService } from "../metrics/MetricsCalculationService";
import type { EnhancedDashboardMetrics, TrendData } from "@/types/admin/EnhancedMetrics";
import User from "@/models/User";
import connectDB from "@/lib/mongodb";

export class DashboardMetricsService {
  constructor(
    private paymentEventRepo = new PaymentEventRepository(),
    private facebookAdsRepo = new FacebookAdsRepository(),
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
    
    const adSpend = await this.facebookAdsRepo.getAdSpendSum(startDate, endDate);
    
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

    // Get paying customers (users with at least one payment)
    const payingCustomers = await User.countDocuments({
      "subscription.isActive": true,
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
    const payingUsers = await User.countDocuments({
      "subscription.isActive": true,
      isActive: true,
    });
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

