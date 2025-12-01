/**
 * Additional Package Access Utility
 *
 * Determines if a user has access to additional packages (previously "member-only" packages).
 * Access is granted if the user has EITHER:
 * 1. An active subscription, OR
 * 2. Entries in the current/active major draw
 *
 * This is the single source of truth for additional package access checks,
 * ensuring scalability and maintainability across the codebase.
 */

import { UserData } from "@/hooks/queries/useUserQueries";
import { UserMajorDrawStats } from "@/hooks/queries/useMajorDrawQueries";

/**
 * Check if user has access to additional packages
 * @param userData - User data from UserContext or API
 * @param userMajorDrawStats - User's major draw statistics (optional, can be null/undefined)
 * @returns true if user has active subscription OR has entries in current draw
 */
export function hasAdditionalPackageAccess(
  userData: UserData | null | undefined,
  userMajorDrawStats: UserMajorDrawStats | null | undefined
): boolean {
  // Check for active subscription
  const hasActiveSubscription = userData?.subscription?.isActive === true;

  // Check for current draw entries
  const hasCurrentDrawEntries = (userMajorDrawStats?.currentDrawEntries ?? 0) > 0;

  // Access granted if user has either subscription OR current draw entries
  return hasActiveSubscription || hasCurrentDrawEntries;
}
