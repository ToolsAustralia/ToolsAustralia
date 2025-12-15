/**
 * Klaviyo Client Wrapper
 *
 * Thin wrapper around the core Klaviyo tracking helpers. This provides a
 * clean, discoverable API surface for the rest of the app and mirrors how
 * other tracking utilities are structured.
 *
 * New developers: prefer importing from this file or the `useKlaviyoTracking`
 * hook instead of calling `window.klaviyo` directly. This keeps all logic
 * consent-aware and easier to evolve over time.
 */

import { identifyKlaviyoUser, trackKlaviyoEvent, trackKlaviyoPageView } from "./klaviyo-helpers";

export const klaviyoClient = {
  /**
   * Identify the current user in Klaviyo.
   * This links the browser session to a Klaviyo profile.
   */
  identify: identifyKlaviyoUser,

  /**
   * Track a generic Klaviyo event (e.g. "Placed Order", "Added to Cart").
   */
  track: trackKlaviyoEvent,

  /**
   * Track a page view in Klaviyo.
   */
  page: trackKlaviyoPageView,
};
