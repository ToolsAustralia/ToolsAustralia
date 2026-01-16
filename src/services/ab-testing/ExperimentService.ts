import ExperimentRepository from "@/repositories/ab-testing/ExperimentRepository";
import ExperimentHistoryRepository from "@/repositories/ab-testing/ExperimentHistoryRepository";
import VariantRepository from "@/repositories/ab-testing/VariantRepository";
import { ExperimentHistoryAction } from "@/models/ab-testing/ExperimentHistory";
import mongoose from "mongoose";

/**
 * Experiment Service
 * Handles business logic for experiments
 */
export class ExperimentService {
  /**
   * Find active experiment for a prize slug
   */
  async getActiveExperimentForSlug(slug: string) {
    return ExperimentRepository.findActiveBySlug(slug);
  }

  /**
   * Check if experiment can be edited (not locked)
   */
  async canEditExperiment(experimentId: string): Promise<boolean> {
    const experiment = await ExperimentRepository.findById(experimentId);
    if (!experiment) return false;
    return !experiment.isLocked();
  }

  /**
   * Validate experiment dates
   */
  validateExperimentDates(startDate?: Date, endDate?: Date): { valid: boolean; message?: string } {
    if (startDate && endDate && startDate >= endDate) {
      return {
        valid: false,
        message: "Start date must be before end date",
      };
    }

    if (startDate && startDate < new Date()) {
      // Allow past start dates for historical experiments
      // But warn if it's too far in the past
      const daysDiff = (new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 365) {
        return {
          valid: false,
          message: "Start date cannot be more than 1 year in the past",
        };
      }
    }

    return { valid: true };
  }

  /**
   * Activate experiment
   */
  async activateExperiment(experimentId: string, changedBy: mongoose.Types.ObjectId): Promise<void> {
    try {
      // Validate prerequisites
      const experiment = await ExperimentRepository.findById(experimentId);
      if (!experiment) {
        throw new Error("Experiment not found");
      }

      console.log(`[ExperimentService] Activating experiment ${experimentId}, current status: ${experiment.status}`);

      // ✅ Allow activating from "draft" or "paused" status
      if (experiment.status !== "draft" && experiment.status !== "paused") {
        throw new Error(`Only draft or paused experiments can be activated. Current status: ${experiment.status}`);
      }

      // Validate traffic split
      const trafficSplit = await VariantRepository.validateTrafficSplit(experimentId);
      if (!trafficSplit.valid) {
        throw new Error(trafficSplit.message || "Traffic split validation failed");
      }

      // Validate dates
      const dateValidation = this.validateExperimentDates(experiment.startDate, experiment.endDate);
      if (!dateValidation.valid) {
        throw new Error(dateValidation.message || "Date validation failed");
      }

      // Determine action type for history
      const isResume = experiment.status === "paused";
      const actionType: ExperimentHistoryAction = isResume ? "resumed" : "activated";

      console.log(`[ExperimentService] Action type: ${actionType}, isResume: ${isResume}`);

      // Update status
      await ExperimentRepository.update(experimentId, { status: "active" });
      console.log(`[ExperimentService] Status updated to active`);

      // Create history entry with before status
      await ExperimentHistoryRepository.createHistoryEntry(experimentId, actionType, changedBy, {
        before: { status: experiment.status },
        after: { status: "active" },
      });
      console.log(`[ExperimentService] History entry created: ${actionType}`);
    } catch (error) {
      console.error(`[ExperimentService] Error in activateExperiment for ${experimentId}:`, error);
      throw error; // Re-throw to preserve original error
    }
  }

  /**
   * Pause active experiment
   */
  async pauseExperiment(experimentId: string, changedBy: mongoose.Types.ObjectId): Promise<void> {
    const experiment = await ExperimentRepository.findById(experimentId);
    if (!experiment) {
      throw new Error("Experiment not found");
    }

    if (experiment.status !== "active") {
      throw new Error("Only active experiments can be paused");
    }

    await ExperimentRepository.update(experimentId, { status: "paused" });

    await ExperimentHistoryRepository.createHistoryEntry(experimentId, "paused", changedBy, {
      before: { status: "active" },
      after: { status: "paused" },
    });
  }

  /**
   * End experiment
   */
  async endExperiment(experimentId: string, changedBy: mongoose.Types.ObjectId): Promise<void> {
    const experiment = await ExperimentRepository.findById(experimentId);
    if (!experiment) {
      throw new Error("Experiment not found");
    }

    await ExperimentRepository.update(experimentId, { status: "ended" });

    await ExperimentHistoryRepository.createHistoryEntry(experimentId, "ended", changedBy, {
      before: { status: experiment.status },
      after: { status: "ended" },
    });
  }

  /**
   * Update experiment
   */
  async updateExperiment(
    experimentId: string,
    data: Partial<{
      name: string;
      status: "draft" | "active" | "paused" | "ended";
      slugTargets: string[];
      startDate: Date;
      endDate: Date;
    }>,
    changedBy: mongoose.Types.ObjectId
  ): Promise<void> {
    // Check if experiment is locked
    if (await this.canEditExperiment(experimentId)) {
      const before = await ExperimentRepository.findById(experimentId);
      await ExperimentRepository.update(experimentId, data);
      const after = await ExperimentRepository.findById(experimentId);

      await ExperimentHistoryRepository.createHistoryEntry(experimentId, "updated", changedBy, {
        before: before ? before.toObject() : undefined,
        after: after ? after.toObject() : undefined,
      });
    } else {
      throw new Error("Cannot edit locked experiment (active or ended)");
    }
  }

  /**
   * Get experiment history
   */
  async getExperimentHistory(experimentId: string) {
    return ExperimentHistoryRepository.getHistory(experimentId);
  }
}

export default new ExperimentService();

