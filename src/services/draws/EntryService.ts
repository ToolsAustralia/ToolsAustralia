/**
 * Entry Service
 *
 * Handles draw entry management (adding, removing entries).
 * Extracted from utilities for reusability and testability.
 *
 * @module services/draws/EntryService
 */

import { logger } from '@/utils/logger';
import { NotFoundError } from '@/lib/errors';
import User, { IUser } from '@/models/User';

/**
 * Entry Service class
 */
export class EntryService {
  /**
   * Add entries to user's entry wallet
   */
  async addEntries(userId: string, entries: number): Promise<IUser> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User');
      }

      // Update entry wallet
      user.entryWallet = (user.entryWallet || 0) + entries;

      // Update accumulated entries for subscription tracking
      if (!user.accumulatedEntries) {
        user.accumulatedEntries = 0;
      }

      await user.save();

      logger.debug('Entries added to user wallet', {
        userId,
        entriesAdded: entries,
        newTotal: user.entryWallet,
      });

      return user;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Failed to add entries', error, { userId, entries });
      throw new Error('Failed to add entries');
    }
  }

  /**
   * Remove entries from user's entry wallet
   */
  async removeEntries(userId: string, entries: number): Promise<IUser> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User');
      }

      // Ensure we don't go negative
      const currentEntries = user.entryWallet || 0;
      user.entryWallet = Math.max(0, currentEntries - entries);

      await user.save();

      logger.debug('Entries removed from user wallet', {
        userId,
        entriesRemoved: entries,
        newTotal: user.entryWallet,
      });

      return user;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Failed to remove entries', error, { userId, entries });
      throw new Error('Failed to remove entries');
    }
  }

  /**
   * Get user's current entry count
   */
  async getEntryCount(userId: string): Promise<number> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('User');
      }
      return user.entryWallet || 0;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Failed to get entry count', error, { userId });
      return 0;
    }
  }
}

// Export singleton instance
export const entryService = new EntryService();

