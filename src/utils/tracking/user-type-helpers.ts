/**
 * User Type Helper Utilities
 *
 * Provides utility functions for determining user type based on authentication status.
 * Ensures consistent user type determination across the application.
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import type { UserType } from "@/types/tracking";

/**
 * Determines user type based on authentication status
 *
 * @param isAuthenticated - Whether the user is authenticated
 * @returns "guest" if not authenticated, "member" if authenticated
 *
 * @example
 * const userType = getUserType(true); // Returns "member"
 * const userType = getUserType(false); // Returns "guest"
 */
export function getUserType(isAuthenticated: boolean): UserType {
  return isAuthenticated ? "member" : "guest";
}

