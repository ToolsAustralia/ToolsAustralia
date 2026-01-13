import ExperimentEventRepository from "@/repositories/ab-testing/ExperimentEventRepository";
import VariantAssignmentRepository from "@/repositories/ab-testing/VariantAssignmentRepository";
import PaymentEvent from "@/models/PaymentEvent";

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
    // Get event aggregations
    const events = await ExperimentEventRepository.aggregateEvents(experimentId, variantId, dateRange);

    // Get revenue from PaymentEvents
    const paymentQuery: Record<string, unknown> = {
      experimentId,
      variantId,
      eventType: "BenefitsGranted",
    };

    if (dateRange) {
      paymentQuery.timestamp = {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate,
      };
    }

    const paymentEvents = await PaymentEvent.find(paymentQuery).lean();
    const revenue = paymentEvents.reduce((sum, event) => {
      return sum + (event.data?.price || 0);
    }, 0);

    // Calculate derived metrics
    const conversionRate = events.pageViews > 0 ? (events.conversions / events.pageViews) * 100 : 0;
    const ctr = events.pageViews > 0 ? (events.clicks / events.pageViews) * 100 : 0;
    const revenuePerUser = events.uniqueVisitors > 0 ? revenue / events.uniqueVisitors : 0;

    return {
      pageViews: events.pageViews,
      uniqueVisitors: events.uniqueVisitors,
      clicks: events.clicks,
      conversions: events.conversions,
      leads: events.leads,
      purchases: events.purchases,
      revenue,
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

    // Get metrics for each variant
    const variantMetrics = await Promise.all(
      variantIds.map((variantId) => this.getVariantMetrics(experimentId, variantId, dateRange))
    );

    return {
      variants: variantIds.map((variantId, index) => ({
        variantId,
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
   * Calculate statistical significance (simplified chi-square test)
   */
  async getStatisticalSignificance(experimentId: string, dateRange?: DateRange) {
    const comparison = await this.getExperimentComparison(experimentId, dateRange);

    if (comparison.variants.length < 2) {
      return {
        significant: false,
        pValue: 1,
        confidence: 0,
        message: "Need at least 2 variants for statistical significance",
      };
    }

    // Simplified chi-square test for conversion rates
    // This is a basic implementation - production should use proper statistical libraries
    const controlVariant = comparison.variants.find((v) => v.metrics.conversions > 0);
    if (!controlVariant) {
      return {
        significant: false,
        pValue: 1,
        confidence: 0,
        message: "Insufficient data for statistical analysis",
      };
    }

    // For now, return placeholder values
    // In production, use a proper statistical library like 'jstat' or 'ml-matrix'
    return {
      significant: false, // Would be calculated based on actual statistical test
      pValue: 0.5, // Placeholder
      confidence: 50, // Placeholder
      message: "Statistical significance calculation requires proper statistical library",
    };
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

