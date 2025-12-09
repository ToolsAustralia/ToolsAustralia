/**
 * Mini Draw Service
 *
 * Handles mini draw operations.
 * Extracted from utilities for reusability and testability.
 *
 * @module services/draws/MiniDrawService
 */

import MiniDraw, { IMiniDraw } from '@/models/MiniDraw';
import { logger } from '@/utils/logger';
import { NotFoundError } from '@/lib/errors';

/**
 * Mini Draw Service class
 */
export class MiniDrawService {
  /**
   * Get active mini draws
   */
  async getActiveDraws(): Promise<IMiniDraw[]> {
    try {
      const draws = await MiniDraw.find({ status: 'active' }).sort({ createdAt: -1 });
      return draws;
    } catch (error) {
      logger.error('Failed to get active mini draws', error);
      return [];
    }
  }

  /**
   * Get draw by ID
   */
  async getDrawById(drawId: string): Promise<IMiniDraw | null> {
    try {
      const draw = await MiniDraw.findById(drawId);
      return draw;
    } catch (error) {
      logger.error('Failed to get mini draw by ID', error, { drawId });
      return null;
    }
  }

  /**
   * Get draws by brand
   */
  async getDrawsByBrand(brand: string): Promise<IMiniDraw[]> {
    try {
      const draws = await MiniDraw.find({ brand, status: 'active' }).sort({ createdAt: -1 });
      return draws;
    } catch (error) {
      logger.error('Failed to get mini draws by brand', error, { brand });
      return [];
    }
  }

  /**
   * Create a new mini draw
   */
  async createDraw(drawData: Partial<IMiniDraw>): Promise<IMiniDraw> {
    try {
      const draw = new MiniDraw(drawData);
      await draw.save();
      logger.info('Mini draw created', { drawId: draw._id.toString() });
      return draw;
    } catch (error) {
      logger.error('Failed to create mini draw', error, drawData);
      throw new Error('Failed to create mini draw');
    }
  }

  /**
   * Update draw
   */
  async updateDraw(drawId: string, updates: Partial<IMiniDraw>): Promise<IMiniDraw> {
    try {
      const draw = await MiniDraw.findByIdAndUpdate(drawId, updates, { new: true });
      if (!draw) {
        throw new NotFoundError('Mini draw');
      }
      logger.info('Mini draw updated', { drawId });
      return draw;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Failed to update mini draw', error, { drawId });
      throw new Error('Failed to update mini draw');
    }
  }
}

// Export singleton instance
export const miniDrawService = new MiniDrawService();

