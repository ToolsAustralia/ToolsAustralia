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
    
    // ✅ Convert experimentId to ObjectId if it's a string
    const experimentObjectId = typeof experimentId === "string" 
      ? new mongoose.Types.ObjectId(experimentId)
      : experimentId;
    
    try {
      return await ExperimentHistory.create({
        experimentId: experimentObjectId,
        action,
        changedBy,
        changes,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("[ExperimentHistoryRepository] Error creating history entry:", {
        experimentId,
        action,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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

const experimentHistoryRepository = new ExperimentHistoryRepository();
export default experimentHistoryRepository;

