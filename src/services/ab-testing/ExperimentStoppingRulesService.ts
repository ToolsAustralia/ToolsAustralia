import mongoose from "mongoose";
import ExperimentRepository from "@/repositories/ab-testing/ExperimentRepository";
import VariantRepository from "@/repositories/ab-testing/VariantRepository";
import ExperimentAnalyticsService from "@/services/ab-testing/ExperimentAnalyticsService";

interface StoppingRuleConfig {
  minConversions?: number; // Minimum conversions per variant
  confidenceThreshold?: number; // Statistical significance threshold (default: 95%)
  maxDuration?: number; // Maximum duration in days
}

interface StoppingRuleResult {
  shouldStop: boolean;
  reasons: string[];
  details: {
    minConversions?: { met: boolean; current: number; required: number };
    confidenceThreshold?: { met: boolean; current: number; required: number };
    maxDuration?: { met: boolean; current: number; required: number };
  };
}

/**
 * Experiment Stopping Rules Service
 * Evaluates stopping rules for experiments
 */
export class ExperimentStoppingRulesService {
  /**
   * Evaluate all stopping rules for an experiment
   */
  async evaluateStoppingRules(
    experimentId: string,
    config?: StoppingRuleConfig
  ): Promise<StoppingRuleResult> {
    const experiment = await ExperimentRepository.findById(experimentId);
    if (!experiment) {
      throw new Error("Experiment not found");
    }

    const reasons: string[] = [];
    const details: StoppingRuleResult["details"] = {};

    // Check minimum conversions
    if (config?.minConversions) {
      const minConvResult = await this.checkMinimumConversions(experimentId, config.minConversions);
      details.minConversions = minConvResult;
      if (minConvResult.met) {
        reasons.push(`Minimum conversions met: ${minConvResult.current}/${minConvResult.required}`);
      }
    }

    // Check confidence threshold
    if (config?.confidenceThreshold) {
      const confidenceResult = await this.checkConfidenceThreshold(experimentId, config.confidenceThreshold);
      details.confidenceThreshold = confidenceResult;
      if (confidenceResult.met) {
        reasons.push(`Confidence threshold met: ${confidenceResult.current}% >= ${confidenceResult.required}%`);
      }
    }

    // Check max duration
    if (config?.maxDuration) {
      const durationResult = await this.checkMaxDuration(experimentId, config.maxDuration);
      details.maxDuration = durationResult;
      if (durationResult.met) {
        reasons.push(`Maximum duration exceeded: ${durationResult.current} days >= ${durationResult.required} days`);
      }
    }

    // Determine if experiment should stop
    // Stop if ANY rule is met (OR logic) - can be changed to AND logic if needed
    const shouldStop = Object.values(details).some((detail) => detail?.met === true);

    return {
      shouldStop,
      reasons,
      details,
    };
  }

  /**
   * Check if each variant has minimum conversions
   */
  async checkMinimumConversions(
    experimentId: string,
    minConversions: number
  ): Promise<{ met: boolean; current: number; required: number }> {
    const variants = await VariantRepository.findByExperimentId(experimentId);
    
    if (variants.length === 0) {
      return { met: false, current: 0, required: minConversions };
    }

    // Get minimum conversions across all variants
    let minCurrent = Infinity;
    
    for (const variant of variants) {
      const variantId = variant._id instanceof mongoose.Types.ObjectId 
        ? variant._id.toString() 
        : String(variant._id);
      const metrics = await ExperimentAnalyticsService.getVariantMetrics(
        experimentId,
        variantId
      );
      minCurrent = Math.min(minCurrent, metrics.conversions);
    }

    return {
      met: minCurrent >= minConversions,
      current: minCurrent === Infinity ? 0 : minCurrent,
      required: minConversions,
    };
  }

  /**
   * Check if statistical significance meets confidence threshold
   */
  async checkConfidenceThreshold(
    experimentId: string,
    confidenceLevel: number = 95
  ): Promise<{ met: boolean; current: number; required: number }> {
    const significance = await ExperimentAnalyticsService.getStatisticalSignificance(experimentId);
    
    return {
      met: significance.confidence >= confidenceLevel,
      current: significance.confidence,
      required: confidenceLevel,
    };
  }

  /**
   * Check if experiment exceeded maximum duration
   */
  async checkMaxDuration(experimentId: string, maxDays: number): Promise<{ met: boolean; current: number; required: number }> {
    const experiment = await ExperimentRepository.findById(experimentId);
    if (!experiment || !experiment.startDate) {
      return { met: false, current: 0, required: maxDays };
    }

    const now = new Date();
    const startDate = new Date(experiment.startDate);
    const daysDiff = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    return {
      met: daysDiff >= maxDays,
      current: Math.floor(daysDiff),
      required: maxDays,
    };
  }

  /**
   * Determine if experiment should be stopped
   */
  async shouldStopExperiment(experimentId: string, config?: StoppingRuleConfig): Promise<boolean> {
    const result = await this.evaluateStoppingRules(experimentId, config);
    return result.shouldStop;
  }
}

export default new ExperimentStoppingRulesService();

