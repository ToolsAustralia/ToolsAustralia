/**
 * A/B Testing Subscription Assignment Utilities
 *
 * This module provides utilities for getting experiment assignments for subscriptions.
 * Single source of truth with internal caching to prevent duplicate lookups.
 */

import { getUserActiveExperimentAssignment } from "../ab-testing/get-user-experiment-assignment";
import VariantAssignmentService from "@/services/ab-testing/VariantAssignmentService";

/**
 * Cached assignment within request lifecycle
 * Prevents duplicate database queries for the same user
 */
const assignmentCache = new Map<string, { experimentId: string; variantId: string } | null>();

/**
 * Gets experiment assignment for subscription metadata
 * Single source of truth with internal caching to prevent duplicate lookups
 *
 * @param userId - User ID (optional)
 * @param anonymousId - Anonymous ID from cookies (optional)
 * @returns Experiment assignment or null
 */
export async function getExperimentAssignmentForSubscription(
  userId: string | null,
  anonymousId: string | null
): Promise<{ experimentId: string; variantId: string } | null> {
  // Create cache key
  const cacheKey = userId || anonymousId || "unknown";

  // Check cache first
  if (assignmentCache.has(cacheKey)) {
    const cached = assignmentCache.get(cacheKey);
    if (cached) {
      console.log(`✅ [A/B Testing] Using cached assignment for ${cacheKey}`);
    }
    return cached || null;
  }

  // Auto-merge anonymous assignments to userId when user registers/logs in
  if (userId && anonymousId) {
    try {
      const mergeResult = await VariantAssignmentService.mergeAnonymousToUser(anonymousId, userId);
      if (mergeResult.merged > 0) {
        console.log(`✅ [A/B Testing] Auto-merged ${mergeResult.merged} anonymous assignment(s) to user ${userId}`);
      }
    } catch (error) {
      // Silently fail - merge should not block payment creation
      console.error("Error auto-merging anonymous assignments:", error);
    }
  }

  // Get experiment assignment
  let experimentAssignment: { experimentId: string; variantId: string } | null = null;

  if (userId) {
    try {
      // Pass anonymousId to find assignments created before user logged in
      experimentAssignment = await getUserActiveExperimentAssignment(userId, undefined, anonymousId || undefined);

      if (experimentAssignment) {
        console.log(`✅ [A/B Testing] Found assignment for user ${userId}:`, experimentAssignment);
      }
    } catch (error) {
      // Silently fail - experiment tracking should not block payment creation
      console.error("Error getting experiment assignment for subscription metadata:", error);
    }
  }

  // Cache the result (even if null) to prevent duplicate lookups
  assignmentCache.set(cacheKey, experimentAssignment);

  return experimentAssignment;
}

/**
 * Clears the assignment cache
 * Useful for testing or when you need to force a fresh lookup
 */
export function clearAssignmentCache(): void {
  assignmentCache.clear();
}
