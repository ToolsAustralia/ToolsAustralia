/**
 * User Types
 *
 * Type definitions for user-related functionality.
 *
 * @module types/user
 */

/**
 * User role
 */
export type UserRole = 'user' | 'admin';

/**
 * User profile data
 */
export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  mobile?: string;
  role: UserRole;
  entryWallet: number;
  rewardsPoints?: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

