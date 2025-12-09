/**
 * Major Draw Service
 *
 * Handles major draw operations.
 * Extracted from utilities for reusability and testability.
 *
 * @module services/draws/MajorDrawService
 */

import MajorDraw, { IMajorDraw } from '@/models/MajorDraw';
import { logger } from '@/utils/logger';
import { NotFoundError } from '@/lib/errors';

/**
 * Major Draw Service class
 */
export class MajorDrawService {
  /**
   * Get active major draw
   */
  async getActiveDraw(): Promise<IMajorDraw | null> {
    try {
      const draw = await MajorDraw.findOne({ status: 'active' }).sort({ createdAt: -1 });
      return draw;
    } catch (error) {
      logger.error('Failed to get active major draw', error);
      return null;
    }
  }

  /**
   * Get draw by ID
   */
  async getDrawById(drawId: string): Promise<IMajorDraw | null> {
    try {
      const draw = await MajorDraw.findById(drawId);
      return draw;
    } catch (error) {
      logger.error('Failed to get major draw by ID', error, { drawId });
      return null;
    }
  }

  /**
   * Create a new major draw
   */
  async createDraw(drawData: Partial<IMajorDraw>): Promise<IMajorDraw> {
    try {
      const draw = new MajorDraw(drawData);
      await draw.save();
      logger.info('Major draw created', { drawId: draw._id.toString() });
      return draw;
    } catch (error) {
      logger.error('Failed to create major draw', error, drawData);
      throw new Error('Failed to create major draw');
    }
  }

  /**
   * Update draw
   */
  async updateDraw(drawId: string, updates: Partial<IMajorDraw>): Promise<IMajorDraw> {
    try {
      const draw = await MajorDraw.findByIdAndUpdate(drawId, updates, { new: true });
      if (!draw) {
        throw new NotFoundError('Major draw');
      }
      logger.info('Major draw updated', { drawId });
      return draw;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Failed to update major draw', error, { drawId });
      throw new Error('Failed to update major draw');
    }
  }
}

// Export singleton instance
export const majorDrawService = new MajorDrawService();

