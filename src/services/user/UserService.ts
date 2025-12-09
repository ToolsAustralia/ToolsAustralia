/**
 * User Service
 *
 * Handles user CRUD operations and user-related business logic.
 * Extracted from API routes for reusability and testability.
 *
 * @module services/user/UserService
 */

import User, { IUser } from "@/models/User";
import { logger } from "@/utils/logger";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * User Service class
 */
export class UserService {
  /**
   * Find user by ID
   */
  async findById(userId: string): Promise<IUser | null> {
    try {
      const user = await User.findById(userId);
      return user;
    } catch (error) {
      logger.error("Failed to find user by ID", error, { userId });
      throw new NotFoundError("User");
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<IUser | null> {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      return user;
    } catch (error) {
      logger.error("Failed to find user by email", error, { email });
      return null;
    }
  }

  /**
   * Update user
   */
  async updateUser(userId: string, updates: Partial<IUser>): Promise<IUser> {
    try {
      const user = await User.findByIdAndUpdate(userId, updates, { new: true });
      if (!user) {
        throw new NotFoundError("User");
      }
      logger.debug("User updated", { userId, updates: Object.keys(updates) });
      return user;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error("Failed to update user", error, { userId });
      throw new ValidationError("Failed to update user");
    }
  }

  /**
   * Get user's saved payment methods count
   */
  async getPaymentMethodsCount(userId: string): Promise<number> {
    try {
      const user = await this.findById(userId);
      if (!user) {
        return 0;
      }
      return user.savedPaymentMethods?.length || 0;
    } catch (error) {
      logger.error("Failed to get payment methods count", error, { userId });
      return 0;
    }
  }
}

// Export singleton instance
export const userService = new UserService();
