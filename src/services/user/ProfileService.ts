/**
 * Profile Service
 *
 * Handles user profile management.
 * Extracted from API routes for reusability and testability.
 *
 * @module services/user/ProfileService
 */

import User, { IUser } from '@/models/User';
import { logger } from '@/utils/logger';
import { NotFoundError, ValidationError } from '@/lib/errors';

/**
 * Profile update data
 */
export interface ProfileUpdateData {
  firstName?: string;
  lastName?: string;
  email?: string;
  mobile?: string;
}

/**
 * Profile Service class
 */
export class ProfileService {
  /**
   * Get user profile
   */
  async getProfile(userId: string): Promise<IUser | null> {
    try {
      const user = await User.findById(userId).select('-password');
      return user;
    } catch (error) {
      logger.error('Failed to get user profile', error, { userId });
      throw new NotFoundError('User');
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: ProfileUpdateData): Promise<IUser> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User');
      }

      // Update fields
      if (data.firstName !== undefined) {
        user.firstName = data.firstName;
      }
      if (data.lastName !== undefined) {
        user.lastName = data.lastName;
      }
      if (data.email !== undefined) {
        // Check if email is already taken
        const existingUser = await User.findOne({ email: data.email.toLowerCase() });
        if (existingUser && existingUser._id.toString() !== userId) {
          throw new ValidationError('Email is already taken');
        }
        user.email = data.email.toLowerCase();
      }
      if (data.mobile !== undefined) {
        // Check if mobile is already taken
        const existingUser = await User.findOne({ mobile: data.mobile.replace(/\s+/g, '') });
        if (existingUser && existingUser._id.toString() !== userId) {
          throw new ValidationError('Mobile number is already taken');
        }
        user.mobile = data.mobile.replace(/\s+/g, '');
      }

      await user.save();

      logger.info('User profile updated', { userId, updatedFields: Object.keys(data) });

      return user;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }
      logger.error('Failed to update user profile', error, { userId });
      throw new ValidationError('Failed to update profile', { originalError: error });
    }
  }
}

// Export singleton instance
export const profileService = new ProfileService();

