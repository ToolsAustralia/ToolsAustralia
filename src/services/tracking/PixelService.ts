/**
 * Pixel Service
 *
 * Handles Facebook and TikTok pixel tracking.
 * Provides a clean service interface for pixel events.
 *
 * @module services/tracking/PixelService
 */

import { trackPixelPurchase, PixelPurchaseParams } from '@/utils/tracking/pixel-purchase-tracking';
import { logger } from '@/utils/logger';
import { env } from '@/config/env';

/**
 * Pixel Service class
 */
export class PixelService {
  /**
   * Track purchase event
   */
  async trackPurchase(params: PixelPurchaseParams): Promise<void> {
    try {
      // Only track if pixels are enabled
      if (!env.facebook.isEnabled && !env.tiktok.isEnabled) {
        logger.debug('Pixel tracking skipped - pixels not enabled');
        return;
      }

      await trackPixelPurchase(params);
      logger.debug('Pixel purchase tracked', {
        orderId: params.orderId,
        value: params.value,
        packageType: params.packageType,
      });
    } catch (error) {
      logger.error('Failed to track pixel purchase', error, { orderId: params.orderId });
      // Non-blocking - don't throw error
    }
  }

  /**
   * Check if Facebook pixel is enabled
   */
  isFacebookEnabled(): boolean {
    return env.facebook.isEnabled;
  }

  /**
   * Check if TikTok pixel is enabled
   */
  isTikTokEnabled(): boolean {
    return env.tiktok.isEnabled;
  }
}

// Export singleton instance
export const pixelService = new PixelService();

