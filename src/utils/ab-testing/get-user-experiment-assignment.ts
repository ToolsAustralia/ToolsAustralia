import mongoose from "mongoose";
import VariantAssignmentRepository from "@/repositories/ab-testing/VariantAssignmentRepository";
import ExperimentRepository from "@/repositories/ab-testing/ExperimentRepository";

/** Cosmetic site-wide experiments that must never be credited with purchases. */
export const NON_CONVERSION_SENTINEL_SLUGS = new Set([
  "__membership-theme__",
  "__promo-theme__",
]);

/**
 * Rank experiments for purchase attribution when no slug is provided.
 * Lower number = higher priority.
 *
 *   0 = page-targeted (slugTargets list real prize/toolset slugs)
 *   1 = global wildcard ("*")
 *   2 = cosmetic site-wide sentinel (excluded entirely — never returned)
 */
export function attributionRank(slugTargets: string[]): number {
  if (slugTargets.every((s) => NON_CONVERSION_SENTINEL_SLUGS.has(s))) return 2;
  if (slugTargets.includes("*")) return 1;
  return 0;
}

/**
 * Get user's active experiment assignment
 * Used when recording conversions to link them to the experiment/variant
 *
 * Priority rule (when no `slug` is provided, e.g. from payment metadata):
 *   page-targeted experiments win over wildcard, and the membership-theme
 *   sentinel is excluded entirely so a cosmetic UI test cannot steal purchase
 *   credit from a real promo experiment the same user is also in.
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

    // Order: page-targeted first, wildcard second, sentinel last (and sentinel is
    // dropped before assignment lookup so it can never be returned for purchase
    // attribution). Within a tier preserve repo order.
    const orderedExperiments = [...activeExperiments.experiments]
      .map((exp) => ({ exp, rank: attributionRank(exp.slugTargets) }))
      .filter(({ rank }) => rank < 2)
      .sort((a, b) => a.rank - b.rank)
      .map(({ exp }) => exp);

    // First, try to find user's assignment for any active experiment (without slug filter)
    // This handles cases where slug is not available (e.g., from payment metadata)
    // This ensures purchases are tracked even if we don't know which page they came from
    for (const exp of orderedExperiments) {
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
      // Sort so page-targeted experiments beat wildcard matches for the same slug.
      const matchingExperiments = activeExperiments.experiments
        .filter((exp) => exp.isActive() && exp.matchesSlug(slug))
        .sort((a, b) => attributionRank(a.slugTargets) - attributionRank(b.slugTargets));

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

