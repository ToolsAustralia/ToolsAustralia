import mongoose from "mongoose";
import VariantAssignmentRepository from "@/repositories/ab-testing/VariantAssignmentRepository";
import ExperimentRepository from "@/repositories/ab-testing/ExperimentRepository";

/**
 * Get user's active experiment assignment
 * Used when recording conversions to link them to the experiment/variant
 */
export async function getUserActiveExperimentAssignment(
  userId: string,
  slug?: string
): Promise<{ experimentId: string; variantId: string } | null> {
  try {
    // Find all active experiments
    const now = new Date();
    const activeExperiments = await ExperimentRepository.findAll({
      status: "active",
      page: 1,
      limit: 100,
    });

    // Filter experiments that match the slug (if provided) or target all pages
    const matchingExperiments = activeExperiments.experiments.filter((exp) => {
      if (!exp.isActive()) return false;
      if (slug) {
        return exp.matchesSlug(slug);
      }
      return exp.slugTargets.includes("*");
    });

    if (matchingExperiments.length === 0) {
      return null;
    }

    // Get the most recent active experiment (or first one if multiple)
    const experiment = matchingExperiments[0];

    // Find user's assignment for this experiment
    const experimentId = experiment._id instanceof mongoose.Types.ObjectId 
      ? experiment._id.toString() 
      : String(experiment._id);
    const assignment = await VariantAssignmentRepository.findAssignment(experimentId, userId);

    if (!assignment) {
      return null;
    }

    return {
      experimentId,
      variantId: assignment.variantId.toString(),
    };
  } catch (error) {
    console.error("Error getting user experiment assignment:", error);
    return null;
  }
}

