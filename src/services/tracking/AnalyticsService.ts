/**
 * Analytics Service
 *
 * Unified analytics interface for tracking events across multiple platforms.
 * Provides a single entry point for all analytics tracking.
 *
 * @module services/tracking/AnalyticsService
 */

import { klaviyoService } from './KlaviyoService';
import { pixelService } from './PixelService';
import { logger } from '@/utils/logger';
import type { KlaviyoEvent, TrackEventOptions } from '@/types/klaviyo';
import { PixelPurchaseParams } from '@/utils/tracking/pixel-purchase-tracking';

/**
 * Analytics Service class
 */
export class AnalyticsService {
  /**
   * Track purchase event across all platforms
   */
  async trackPurchase(params: PixelPurchaseParams & { klaviyoEvent?: KlaviyoEvent }): Promise<void> {
    try {
      // Track pixel events (Facebook, TikTok)
      await pixelService.trackPurchase(params);

      // Track Klaviyo event if provided
      if (params.klaviyoEvent && klaviyoService.isEnabled()) {
        await klaviyoService.trackEvent(params.klaviyoEvent);
      }

      logger.info('Purchase tracked across all platforms', {
        orderId: params.orderId,
        value: params.value,
      });
    } catch (error) {
      logger.error('Failed to track purchase across platforms', error, { orderId: params.orderId });
      // Non-blocking - continue even if tracking fails
    }
  }

  /**
   * Track custom event
   */
  async trackEvent(event: KlaviyoEvent, options?: TrackEventOptions): Promise<void> {
    try {
      if (klaviyoService.isEnabled()) {
        await klaviyoService.trackEvent(event, options);
      }
    } catch (error) {
      logger.error('Failed to track event', error, { eventName: event.event });
      // Non-blocking
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(email: string, profileData: Record<string, unknown>): Promise<void> {
    try {
      if (klaviyoService.isEnabled()) {
        await klaviyoService.updateProfile({
          email,
          ...profileData,
        });
      }
    } catch (error) {
      logger.error('Failed to update profile', error, { email });
      // Non-blocking
    }
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();

