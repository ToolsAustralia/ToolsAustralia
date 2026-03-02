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
   * ✅ FIX: When userId is provided, also check for assignments by anonymousId
   * This handles cases where user visited as anonymous, then logged in
   */
  async findAssignment(
    experimentId: string,
    userId?: string,
    anonymousId?: string
  ): Promise<IVariantAssignment | null> {
    await connectDB();

    const query: Record<string, unknown> = { experimentId };

    // If both userId and anonymousId are provided, check both
    if (userId && anonymousId) {
      const assignment = await VariantAssignment.findOne({
        experimentId,
        $or: [
          { userId: new mongoose.Types.ObjectId(userId) },
          { anonymousId: anonymousId },
        ],
      }).exec();
      return assignment;
    }

    // Otherwise, check by userId or anonymousId
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
   * Find assignment by userId, also checking anonymousId if provided
   * This is useful when we have userId but the assignment might have been created anonymously
   * ✅ FIX: Removed dangerous fallback that returned ANY anonymous assignment
   * Now only returns assignments that actually belong to this user (by userId or anonymousId)
   */
  async findAssignmentByUserOrAnonymous(
    experimentId: string,
    userId: string,
    anonymousId?: string
  ): Promise<IVariantAssignment | null> {
    await connectDB();

    // First, try the standard lookup (which now checks both userId and anonymousId if both provided)
    const standardAssignment = await this.findAssignment(experimentId, userId, anonymousId);
    if (standardAssignment) {
      return standardAssignment;
    }

    // If not found and we have anonymousId, try by anonymousId only
    // This handles cases where user visited as anonymous, got assigned, then logged in
    if (anonymousId) {
      const anonymousAssignment = await VariantAssignment.findOne({
        experimentId,
        anonymousId,
      }).exec();
      if (anonymousAssignment) {
        return anonymousAssignment;
      }
    }

    // ❌ REMOVED: Dangerous fallback that returned ANY recent anonymous assignment
    // This was causing purchases to be attributed to the wrong variant (always Variant A)
    // If assignment is not found, return null - it's better to not track than to track incorrectly
    
    return null;
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

const variantAssignmentRepository = new VariantAssignmentRepository();
export default variantAssignmentRepository;

