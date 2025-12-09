/**
 * Auth Service
 *
 * Handles authentication-related business logic.
 * Extracted from API routes for reusability and testability.
 *
 * @module services/user/AuthService
 */

import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { logger } from '@/utils/logger';
import { ValidationError, ConflictError } from '@/lib/errors';
import { AUTH } from '@/constants';

/**
 * Registration data
 */
export interface RegistrationData {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  password?: string;
  affiliateCode?: string;
  promotionSlug?: string;
}

/**
 * Auth Service class
 */
export class AuthService {
  /**
   * Register a new user
   */
  async register(data: RegistrationData): Promise<{ userId: string; email: string; firstName: string; lastName: string; mobile: string }> {
    try {
      const { firstName, lastName, email, mobile, password, affiliateCode, promotionSlug } = data;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email: email.toLowerCase() }, { mobile: mobile.replace(/\s+/g, '') }],
      });

      if (existingUser) {
        // Check if account has made purchases (non-plain account)
        const hasPurchases =
          existingUser.oneTimePackages?.length > 0 ||
          existingUser.stripeSubscriptionId ||
          existingUser.accumulatedEntries > 0;

        if (hasPurchases) {
          throw new ConflictError('An account with this email or mobile already exists and has made purchases', {
            isExistingAccount: true,
            existingAccountEmail: existingUser.email,
            field: existingUser.email.toLowerCase() === email.toLowerCase() ? 'email' : 'mobile',
          });
        }

        // Plain account - can be used
        logger.debug('User already exists (plain account), proceeding with registration', {
          email: existingUser.email,
        });
      }

      // Hash password if provided
      let hashedPassword: string | undefined;
      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
      }

      // Create new user
      const user = new User({
        firstName,
        lastName,
        email: email.toLowerCase(),
        mobile: mobile.replace(/\s+/g, ''),
        ...(hashedPassword && { password: hashedPassword }),
        ...(affiliateCode && { affiliateCode }),
        ...(promotionSlug && { promotionSlug }),
      });

      await user.save();

      logger.info('User registered successfully', {
        userId: user._id.toString(),
        email: user.email,
      });

      return {
        userId: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        mobile: user.mobile,
      };
    } catch (error) {
      if (error instanceof ConflictError) {
        throw error;
      }
      logger.error('Failed to register user', error, { email: data.email });
      throw new ValidationError('Failed to register user', { originalError: error });
    }
  }

  /**
   * Validate password
   */
  async validatePassword(userId: string, password: string): Promise<boolean> {
    try {
      const user = await User.findById(userId);
      if (!user || !user.password) {
        return false;
      }
      return await bcrypt.compare(password, user.password);
    } catch (error) {
      logger.error('Failed to validate password', error, { userId });
      return false;
    }
  }
}

// Export singleton instance
export const authService = new AuthService();

