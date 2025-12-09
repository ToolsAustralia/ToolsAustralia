/**
 * Klaviyo Service
 *
 * Wraps Klaviyo client for event tracking and profile management.
 * Provides a clean service interface for business logic.
 *
 * @module services/tracking/KlaviyoService
 */

import { klaviyo } from '@/lib/klaviyo';
import { logger } from '@/utils/logger';
import { ExternalServiceError } from '@/lib/errors';
import type { KlaviyoProfile, KlaviyoEvent, TrackEventOptions } from '@/types/klaviyo';

/**
 * Klaviyo Service class
 */
export class KlaviyoService {
  /**
   * Track an event
   */
  async trackEvent(event: KlaviyoEvent, options?: TrackEventOptions): Promise<void> {
    try {
      await klaviyo.trackEvent(event, options);
      logger.debug('Klaviyo event tracked', { eventName: event.event });
    } catch (error) {
      logger.error('Failed to track Klaviyo event', error, { eventName: event.event });
      // Non-blocking - don't throw error
    }
  }

  /**
   * Update or create profile
   */
  async updateProfile(profile: KlaviyoProfile): Promise<void> {
    try {
      await klaviyo.updateProfile(profile);
      logger.debug('Klaviyo profile updated', { email: profile.email });
    } catch (error) {
      logger.error('Failed to update Klaviyo profile', error, { email: profile.email });
      // Non-blocking - don't throw error
    }
  }

  /**
   * Check if Klaviyo is enabled
   */
  isEnabled(): boolean {
    return klaviyo.isEnabled();
  }
}

// Export singleton instance
export const klaviyoService = new KlaviyoService();

