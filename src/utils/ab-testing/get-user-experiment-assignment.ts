import mongoose from "mongoose";
import VariantAssignmentRepository from "@/repositories/ab-testing/VariantAssignmentRepository";
import ExperimentRepository from "@/repositories/ab-testing/ExperimentRepository";

/**
 * Get user's active experiment assignment
 * Used when recording conversions to link them to the experiment/variant
 * 
 * @param userId - User ID (required)
 * @param slug - Optional slug to filter experiments
 * @param anonymousId - Optional anonymous ID to check for anonymous assignments
 */
export async function getUserActiveExperimentAssignment(
  userId: string,
  slug?: string,
  anonymousId?: string
): Promise<{ experimentId: string; variantId: string } | null> {
  try {
    // Find all active experiments
    const _now = new Date();
    const activeExperiments = await ExperimentRepository.findAll({
      status: "active",
      page: 1,
      limit: 100,
    });

    console.log(`🔍 [A/B Testing] Looking for assignment - userId: ${userId}, slug: ${slug || "none"}, anonymousId: ${anonymousId || "none"}, active experiments: ${activeExperiments.experiments.length}`);

    // First, try to find user's assignment for any active experiment (without slug filter)
    // This handles cases where slug is not available (e.g., from payment metadata)
    // This ensures purchases are tracked even if we don't know which page they came from
    for (const exp of activeExperiments.experiments) {
      if (!exp.isActive()) {
        console.log(`⏭️ [A/B Testing] Skipping inactive experiment: ${exp._id}`);
        continue;
      }
      
      const experimentId = exp._id instanceof mongoose.Types.ObjectId 
        ? exp._id.toString() 
        : String(exp._id);
      
      console.log(`🔍 [A/B Testing] Checking assignment for experiment: ${experimentId}`);
      
      // ✅ FIX: Check both userId and anonymousId if provided
      // This handles cases where user visited as anonymous (assignment has anonymousId)
      // but is now logged in (we have both userId and anonymousId from cookies)
      let assignment = await VariantAssignmentRepository.findAssignment(experimentId, userId, anonymousId);
      
      // If not found, try the fallback method
      if (!assignment && anonymousId) {
        console.log(`🔍 [A/B Testing] No assignment by userId/anonymousId, trying fallback lookup...`);
        assignment = await VariantAssignmentRepository.findAssignmentByUserOrAnonymous(experimentId, userId, anonymousId);
      }
      
      if (assignment) {
        console.log(`✅ [A/B Testing] Found assignment for experiment ${experimentId}:`, {
          variantId: assignment.variantId.toString(),
          userId: assignment.userId?.toString() || "anonymous",
          anonymousId: assignment.anonymousId || "none",
        });
        
        // Found an assignment - check if it matches slug (if provided)
        if (slug) {
          if (exp.matchesSlug(slug)) {
            return {
              experimentId,
              variantId: assignment.variantId.toString(),
            };
          }
        } else {
          // No slug provided, return first assignment found
          // This ensures we track purchases even when slug is not available
          return {
            experimentId,
            variantId: assignment.variantId.toString(),
          };
        }
      } else {
        console.log(`❌ [A/B Testing] No assignment found for experiment ${experimentId} and userId ${userId}`);
      }
    }

    // If no assignment found yet, try filtering by slug (if provided)
    // This handles cases where slug is provided but user wasn't assigned yet
    if (slug) {
      console.log(`🔍 [A/B Testing] Trying slug-based lookup for: ${slug}`);
      const matchingExperiments = activeExperiments.experiments.filter((exp) => {
        if (!exp.isActive()) return false;
        return exp.matchesSlug(slug);
      });

      console.log(`🔍 [A/B Testing] Found ${matchingExperiments.length} experiments matching slug: ${slug}`);

      if (matchingExperiments.length > 0) {
        const experiment = matchingExperiments[0];
        const experimentId = experiment._id instanceof mongoose.Types.ObjectId 
          ? experiment._id.toString() 
          : String(experiment._id);
        // ✅ Also check anonymousId in slug-based lookup
        const assignment = await VariantAssignmentRepository.findAssignment(experimentId, userId, anonymousId);

        if (assignment) {
          console.log(`✅ [A/B Testing] Found assignment via slug lookup:`, {
            experimentId,
            variantId: assignment.variantId.toString(),
          });
          return {
            experimentId,
            variantId: assignment.variantId.toString(),
          };
        }
      }
    }

    console.warn(`⚠️ [A/B Testing] No experiment assignment found for userId: ${userId}, slug: ${slug || "none"}`);
    return null;
  } catch (error) {
    console.error("Error getting user experiment assignment:", error);
    return null;
  }
}

