import connectDB from "@/lib/mongodb";
import VariantAssignment, { IVariantAssignment } from "@/models/ab-testing/VariantAssignment";
import mongoose from "mongoose";

/**
 * Variant Assignment Repository
 * Handles all database operations for variant assignments
 */
export class VariantAssignmentRepository {
  /**
   * Find existing assignment for user or anonymous ID
   */
  async findAssignment(
    experimentId: string,
    userId?: string,
    anonymousId?: string
  ): Promise<IVariantAssignment | null> {
    await connectDB();

    const query: Record<string, unknown> = { experimentId };

    if (userId) {
      query.userId = new mongoose.Types.ObjectId(userId);
    } else if (anonymousId) {
      query.anonymousId = anonymousId;
    } else {
      return null;
    }

    return VariantAssignment.findOne(query).exec();
  }

  /**
   * Create new assignment
   */
  async createAssignment(data: {
    experimentId: string;
    variantId: string;
    userId?: string;
    anonymousId?: string;
  }): Promise<IVariantAssignment> {
    await connectDB();
    return VariantAssignment.create({
      ...data,
      assignedAt: new Date(),
      lastSeenAt: new Date(),
    });
  }

  /**
   * Update last seen timestamp
   */
  async updateLastSeen(assignmentId: string): Promise<IVariantAssignment | null> {
    await connectDB();
    return VariantAssignment.findByIdAndUpdate(
      assignmentId,
      { lastSeenAt: new Date() },
      { new: true }
    ).exec();
  }

  /**
   * Get all assignments for an experiment (for analytics)
   */
  async getAssignmentsByExperiment(experimentId: string): Promise<IVariantAssignment[]> {
    await connectDB();
    return VariantAssignment.find({ experimentId }).exec();
  }

  /**
   * Get assignments for a specific variant (for analytics)
   */
  async getAssignmentsByVariant(variantId: string): Promise<IVariantAssignment[]> {
    await connectDB();
    return VariantAssignment.find({ variantId }).exec();
  }

  /**
   * Merge anonymous assignment to user ID (for user login)
   */
  async mergeAnonymousToUser(
    anonymousId: string,
    userId: string,
    experimentId?: string
  ): Promise<{ updated: number }> {
    await connectDB();

    const query: Record<string, unknown> = {
      anonymousId,
      userId: { $exists: false }, // Only merge assignments that don't already have a userId
    };

    if (experimentId) {
      query.experimentId = new mongoose.Types.ObjectId(experimentId);
    }

    const result = await VariantAssignment.updateMany(
      query,
      {
        $set: {
          userId: new mongoose.Types.ObjectId(userId),
          mergedAt: new Date(),
        },
        $unset: {
          anonymousId: "",
        },
      }
    ).exec();

    return { updated: result.modifiedCount };
  }
}

export default new VariantAssignmentRepository();

