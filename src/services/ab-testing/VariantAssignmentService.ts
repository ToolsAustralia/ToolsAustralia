import crypto from "crypto";
import mongoose from "mongoose";
import VariantAssignmentRepository from "@/repositories/ab-testing/VariantAssignmentRepository";
import VariantRepository from "@/repositories/ab-testing/VariantRepository";
import User from "@/models/User";

/**
 * Variant Assignment Service
 * Handles variant assignment logic with consistent hashing
 */
export class VariantAssignmentService {
  /**
   * Check if user is admin/internal (should be excluded from assignment)
   */
  async isAdminUser(userId?: string): Promise<boolean> {
    if (!userId) return false;

    try {
      const user = await User.findById(userId).select("role").lean();
      return user?.role === "admin";
    } catch {
      return false;
    }
  }

  /**
   * Deterministic hash function for consistent variant assignment
   */
  private hash(input: string): number {
    const hash = crypto.createHash("sha256").update(input).digest("hex");
    // Convert first 8 characters to integer (0-4294967295)
    return parseInt(hash.substring(0, 8), 16);
  }

  /**
   * Assign variant to user using consistent hashing
   */
  async assignVariant(
    experimentId: string,
    userId?: string,
    anonymousId?: string
  ): Promise<{ variantId: string; assignmentId: string } | null> {
    // Exclude admins from assignment
    if (userId && (await this.isAdminUser(userId))) {
      return null;
    }

    // Check for existing assignment
    const existing = await VariantAssignmentRepository.findAssignment(experimentId, userId, anonymousId);
    if (existing) {
      // Update last seen
      const existingId = existing._id instanceof mongoose.Types.ObjectId 
        ? existing._id.toString() 
        : String(existing._id);
      await VariantAssignmentRepository.updateLastSeen(existingId);
      return {
        variantId: existing.variantId.toString(),
        assignmentId: existingId,
      };
    }

    // Get all variants for the experiment
    const variants = await VariantRepository.findByExperimentId(experimentId);
    if (variants.length === 0) {
      return null;
    }

    // Create hash input: experimentId + userId/anonymousId
    const identifier = userId || anonymousId || "";
    const hashInput = `${experimentId}_${identifier}`;
    const hashValue = this.hash(hashInput);
    const bucket = hashValue % 100; // 0-99 bucket

    // Map bucket to variant based on traffic split
    let cumulativePercentage = 0;
    let selectedVariant = variants[0]; // Default to first variant

    for (const variant of variants) {
      cumulativePercentage += variant.trafficPercentage;
      if (bucket < cumulativePercentage) {
        selectedVariant = variant;
        break;
      }
    }

    // Create assignment
    const selectedVariantId = selectedVariant._id instanceof mongoose.Types.ObjectId 
      ? selectedVariant._id.toString() 
      : String(selectedVariant._id);
    const assignment = await VariantAssignmentRepository.createAssignment({
      experimentId,
      variantId: selectedVariantId,
      userId,
      anonymousId,
    });

    const assignmentId = assignment._id instanceof mongoose.Types.ObjectId 
      ? assignment._id.toString() 
      : String(assignment._id);
    return {
      variantId: selectedVariantId,
      assignmentId,
    };
  }

  /**
   * Get assigned variant for user
   */
  async getAssignedVariant(
    experimentId: string,
    userId?: string,
    anonymousId?: string
  ): Promise<{ variantId: string; assignmentId: string } | null> {
    // Exclude admins
    if (userId && (await this.isAdminUser(userId))) {
      return null;
    }

    const assignment = await VariantAssignmentRepository.findAssignment(experimentId, userId, anonymousId);
    
    if (!assignment) {
      return null;
    }

    // Update last seen
    const assignmentId = assignment._id instanceof mongoose.Types.ObjectId 
      ? assignment._id.toString() 
      : String(assignment._id);
    await VariantAssignmentRepository.updateLastSeen(assignmentId);

    return {
      variantId: assignment.variantId.toString(),
      assignmentId,
    };
  }

  /**
   * Merge anonymous assignments to logged-in user
   * Called when anonymous user logs in
   */
  async mergeAnonymousToUser(anonymousId: string, userId: string): Promise<{ merged: number }> {
    const result = await VariantAssignmentRepository.mergeAnonymousToUser(anonymousId, userId);
    return { merged: result.updated };
  }
}

export default new VariantAssignmentService();

