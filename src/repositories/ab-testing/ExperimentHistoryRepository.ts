import connectDB from "@/lib/mongodb";
import ExperimentHistory, { IExperimentHistory, ExperimentHistoryAction } from "@/models/ab-testing/ExperimentHistory";
import mongoose from "mongoose";

/**
 * Experiment History Repository
 * Handles all database operations for experiment history/audit log
 */
export class ExperimentHistoryRepository {
  /**
   * Create history entry
   */
  async createHistoryEntry(
    experimentId: string,
    action: ExperimentHistoryAction,
    changedBy: mongoose.Types.ObjectId,
    changes?: {
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }
  ): Promise<IExperimentHistory> {
    await connectDB();
    return ExperimentHistory.create({
      experimentId,
      action,
      changedBy,
      changes,
      timestamp: new Date(),
    });
  }

  /**
   * Get all history entries for an experiment
   */
  async getHistory(experimentId: string): Promise<IExperimentHistory[]> {
    await connectDB();
    return ExperimentHistory.find({ experimentId })
      .sort({ timestamp: -1 })
      .populate("changedBy", "firstName lastName email")
      .exec();
  }

  /**
   * Get latest configuration version (for debugging)
   */
  async getLatestConfig(experimentId: string): Promise<IExperimentHistory | null> {
    await connectDB();
    return ExperimentHistory.findOne({ experimentId, action: { $in: ["created", "updated"] } })
      .sort({ timestamp: -1 })
      .exec();
  }
}

export default new ExperimentHistoryRepository();

