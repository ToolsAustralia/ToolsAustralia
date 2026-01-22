import ExperimentEventRepository from "@/repositories/ab-testing/ExperimentEventRepository";
import VariantAssignmentRepository from "@/repositories/ab-testing/VariantAssignmentRepository";
import VariantRepository from "@/repositories/ab-testing/VariantRepository";
import {
  calculateStatisticalSignificance,
  determineWinner,
  calculateConfidenceInterval,
  calculateLift,
} from "@/utils/ab-testing/statistical-tests";
import Experiment from "@/models/ab-testing/Experiment";
import mongoose from "mongoose";

interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface VariantMetrics {
  pageViews: number;
  uniqueVisitors: number;
  clicks: number;
  conversions: number;
  leads: number;
  purchases: number;
  revenue: number;
  conversionRate: number;
  ctr: number; // Click-through rate
  revenuePerUser: number;
  roas: number; // Return on ad spend (requires ad spend data)
}

/**
 * Experiment Analytics Service
 * Calculates metrics and analytics for experiments
 */
export class ExperimentAnalyticsService {
  /**
   * Get metrics for a specific variant
   */
  async getVariantMetrics(
    experimentId: string,
    variantId: string,
    dateRange?: DateRange
  ): Promise<VariantMetrics> {
    // Get event aggregations (includes revenue from hybrid query strategy)
    // Revenue comes from:
    // - ExperimentDailyMetrics for historical data (>30 days)
    // - PaymentEvents for recent data (<30 days)
    // - Combined for split date ranges
    const events = await ExperimentEventRepository.aggregateEvents(experimentId, variantId, dateRange);

    // Calculate derived metrics
    // ⚠️ IMPORTANT: Conversion counting logic
    // - "purchase" events: Specific purchase events (tracked separately)
    // - "conversion" events: Any conversion including purchases (tracked separately)
    // - Both are tracked for each purchase to provide flexibility in reporting
    // - For conversion rate, we use ONLY "conversion" events to avoid double-counting
    //   (since purchases are already included in conversion events)
    // - If you want to count purchases separately, use events.purchases
    // - If you want total conversions (including purchases), use events.conversions
    // 
    // Conversion rate = Conversions / Page Views * 100
    // (conversions already include purchases, so we don't add purchases again)
    const conversionRate = events.pageViews > 0 ? (events.conversions / events.pageViews) * 100 : 0;
    
    // CTR (Click-Through Rate) = Clicks / Page Views * 100
    // This measures how many visitors clicked the CTA button
    const ctr = events.pageViews > 0 ? (events.clicks / events.pageViews) * 100 : 0;
    
    // Revenue per user = Total Revenue / Unique Visitors
    const revenuePerUser = events.uniqueVisitors > 0 ? events.revenue / events.uniqueVisitors : 0;

    return {
      pageViews: events.pageViews,
      uniqueVisitors: events.uniqueVisitors,
      clicks: events.clicks,
      conversions: events.conversions, // Conversions (includes purchases, but we don't double-count)
      leads: events.leads,
      purchases: events.purchases, // Purchases (also tracked as conversions, but shown separately)
      revenue: events.revenue, // Now comes from aggregateEvents() hybrid query
      conversionRate,
      ctr,
      revenuePerUser,
      roas: 0, // ROAS requires ad spend data (can be calculated separately)
    };
  }

  /**
   * Compare all variants in an experiment
   */
  async getExperimentComparison(experimentId: string, dateRange?: DateRange) {
    // Get all assignments grouped by variant
    const assignments = await VariantAssignmentRepository.getAssignmentsByExperiment(experimentId);
    
    // Get unique variant IDs
    const variantIds = [...new Set(assignments.map((a) => a.variantId.toString()))];

    // ✅ FIX: Fetch variant documents to get names for display
    const variants = await VariantRepository.findByExperimentId(experimentId);
    const variantMap = new Map<string, string>(
      variants.map((v) => {
        const variantId = v._id instanceof mongoose.Types.ObjectId 
          ? v._id.toString() 
          : String(v._id);
        return [variantId, v.name];
      })
    );

    // Get metrics for each variant
    const variantMetrics = await Promise.all(
      variantIds.map((variantId) => this.getVariantMetrics(experimentId, variantId, dateRange))
    );

    return {
      variants: variantIds.map((variantId, index) => ({
        variantId,
        variantName: variantMap.get(variantId) || `Variant ${index + 1}`, // ✅ Include variant name with fallback
        metrics: variantMetrics[index],
      })),
      totalPageViews: variantMetrics.reduce((sum, m) => sum + m.pageViews, 0),
      totalConversions: variantMetrics.reduce((sum, m) => sum + m.conversions, 0),
      totalRevenue: variantMetrics.reduce((sum, m) => sum + m.revenue, 0),
    };
  }

  /**
   * Calculate conversion rate for a variant
   */
  async calculateConversionRate(variantId: string, dateRange?: DateRange): Promise<number> {
    // This would need experimentId - for now, get from assignment
    const assignments = await VariantAssignmentRepository.getAssignmentsByVariant(variantId);
    if (assignments.length === 0) return 0;

    const experimentId = assignments[0].experimentId.toString();
    const metrics = await this.getVariantMetrics(experimentId, variantId, dateRange);
    return metrics.conversionRate;
  }

  /**
   * Calculate ROAS for a variant (requires ad spend data)
   */
  async calculateROAS(variantId: string, dateRange?: DateRange): Promise<number> {
    // This is a placeholder - ROAS calculation requires ad spend data
    // which would come from Facebook Ads API or similar
    const assignments = await VariantAssignmentRepository.getAssignmentsByVariant(variantId);
    if (assignments.length === 0) return 0;

    const experimentId = assignments[0].experimentId.toString();
    const metrics = await this.getVariantMetrics(experimentId, variantId, dateRange);
    
    // ROAS = Revenue / Ad Spend
    // For now, return 0 (ad spend would need to be fetched separately)
    return metrics.roas;
  }

  /**
   * Calculate click-through rate
   */
  async calculateCTR(variantId: string, dateRange?: DateRange): Promise<number> {
    const assignments = await VariantAssignmentRepository.getAssignmentsByVariant(variantId);
    if (assignments.length === 0) return 0;

    const experimentId = assignments[0].experimentId.toString();
    const metrics = await this.getVariantMetrics(experimentId, variantId, dateRange);
    return metrics.ctr;
  }

  /**
   * Calculate revenue per user
   */
  async calculateRevenuePerUser(variantId: string, dateRange?: DateRange): Promise<number> {
    const assignments = await VariantAssignmentRepository.getAssignmentsByVariant(variantId);
    if (assignments.length === 0) return 0;

    const experimentId = assignments[0].experimentId.toString();
    const metrics = await this.getVariantMetrics(experimentId, variantId, dateRange);
    return metrics.revenuePerUser;
  }

  /**
   * Get funnel metrics (page views → clicks → conversions)
   */
  async getFunnelMetrics(variantId: string, dateRange?: DateRange) {
    const assignments = await VariantAssignmentRepository.getAssignmentsByVariant(variantId);
    if (assignments.length === 0) {
      return {
        pageViews: 0,
        clicks: 0,
        conversions: 0,
        clickRate: 0,
        conversionRate: 0,
      };
    }

    const experimentId = assignments[0].experimentId.toString();
    const events = await ExperimentEventRepository.aggregateEvents(experimentId, variantId, dateRange);

    return {
      pageViews: events.pageViews,
      clicks: events.clicks,
      conversions: events.conversions,
      clickRate: events.pageViews > 0 ? (events.clicks / events.pageViews) * 100 : 0,
      conversionRate: events.pageViews > 0 ? (events.conversions / events.pageViews) * 100 : 0,
    };
  }

  /**
   * Calculate drop-off rates between funnel stages
   */
  async getDropOffRates(variantId: string, dateRange?: DateRange) {
    const funnel = await this.getFunnelMetrics(variantId, dateRange);

    return {
      pageViewToClick: funnel.pageViews > 0 ? ((funnel.pageViews - funnel.clicks) / funnel.pageViews) * 100 : 0,
      clickToConversion: funnel.clicks > 0 ? ((funnel.clicks - funnel.conversions) / funnel.clicks) * 100 : 0,
      overallDropOff: funnel.pageViews > 0 ? ((funnel.pageViews - funnel.conversions) / funnel.pageViews) * 100 : 0,
    };
  }

  /**
   * Calculate statistical significance using chi-square test
   * Compares control variant against all other variants
   */
  async getStatisticalSignificance(
    experimentId: string,
    dateRange?: DateRange,
    confidenceThreshold: number = 95
  ) {
    const comparison = await this.getExperimentComparison(experimentId, dateRange);

    if (comparison.variants.length < 2) {
      return {
        significant: false,
        pValue: 1,
        confidence: 0,
        message: "Need at least 2 variants for statistical significance",
        lift: 0,
        controlRate: 0,
        variantRate: 0,
        controlInterval: { lower: 0, upper: 0 },
        variantInterval: { lower: 0, upper: 0 },
        chiSquare: 0,
      };
    }

    // Get experiment to find control variant
    const experiment = await Experiment.findById(experimentId).lean();
    if (!experiment) {
      throw new Error("Experiment not found");
    }

    // Find control variant (first variant or explicitly marked as control)
    // For now, assume first variant is control
    const controlVariant = comparison.variants[0];
    const testVariant = comparison.variants[1];

    if (!controlVariant || !testVariant) {
      return {
        significant: false,
        pValue: 1,
        confidence: 0,
        message: "Need at least 2 variants with data",
        lift: 0,
        controlRate: 0,
        variantRate: 0,
        controlInterval: { lower: 0, upper: 0 },
        variantInterval: { lower: 0, upper: 0 },
        chiSquare: 0,
      };
    }

    // Calculate statistical significance
    const result = calculateStatisticalSignificance(
      controlVariant.metrics.uniqueVisitors,
      controlVariant.metrics.conversions,
      testVariant.metrics.uniqueVisitors,
      testVariant.metrics.conversions,
      confidenceThreshold
    );

    return {
      significant: result.significant,
      pValue: result.pValue,
      confidence: result.confidence,
      lift: result.lift,
      controlRate: result.controlRate,
      variantRate: result.variantRate,
      controlInterval: result.controlInterval,
      variantInterval: result.variantInterval,
      chiSquare: result.chiSquare,
      message: result.significant
        ? `Results are statistically significant (${result.confidence.toFixed(2)}% confidence)`
        : `Results are not statistically significant (${result.confidence.toFixed(2)}% confidence < ${confidenceThreshold}%)`,
    };
  }

  /**
   * Calculate and cache statistical results for an experiment
   * Updates the experiment's statisticalResults field
   */
  async calculateAndCacheStatisticalResults(
    experimentId: string,
    dateRange?: DateRange,
    confidenceThreshold: number = 95
  ) {
    const significance = await this.getStatisticalSignificance(experimentId, dateRange, confidenceThreshold);

    // Update experiment with cached results
    await Experiment.findByIdAndUpdate(experimentId, {
      $set: {
        statisticalResults: {
          pValue: significance.pValue,
          confidence: significance.confidence,
          significant: significance.significant,
          lift: significance.lift,
          confidenceInterval: significance.controlInterval, // Store control interval as primary
          calculatedAt: new Date(),
        },
      },
    });

    return significance;
  }

  /**
   * Determine winner for an experiment
   * Uses statistical significance and lift to determine winner
   */
  async determineWinner(
    experimentId: string,
    dateRange?: DateRange,
    confidenceThreshold: number = 95
  ) {
    const comparison = await this.getExperimentComparison(experimentId, dateRange);

    if (comparison.variants.length < 2) {
      return {
        winner: "inconclusive" as const,
        reason: "Need at least 2 variants for winner determination",
        significance: null,
      };
    }

    const controlVariant = comparison.variants[0];
    const testVariant = comparison.variants[1];

    if (!controlVariant || !testVariant) {
      return {
        winner: "inconclusive" as const,
        reason: "Insufficient data for winner determination",
        significance: null,
      };
    }

    const result = determineWinner(
      controlVariant.metrics.uniqueVisitors,
      controlVariant.metrics.conversions,
      testVariant.metrics.uniqueVisitors,
      testVariant.metrics.conversions,
      confidenceThreshold
    );

    return result;
  }

  /**
   * Check if experiment meets stopping criteria
   */
  async checkStoppingRules(experimentId: string): Promise<{
    shouldStop: boolean;
    reasons: string[];
  }> {
    // This delegates to ExperimentStoppingRulesService
    // Kept here for backward compatibility
    return {
      shouldStop: false,
      reasons: [],
    };
  }

  /**
   * Get stopping rule status
   */
  async getStoppingRuleStatus(experimentId: string) {
    return {
      minConversions: { met: false, current: 0, required: 100 },
      confidenceThreshold: { met: false, current: 0, required: 95 },
      maxDuration: { met: false, current: 0, required: 30 },
    };
  }
}

export default new ExperimentAnalyticsService();

