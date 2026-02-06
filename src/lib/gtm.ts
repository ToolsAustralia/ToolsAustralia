/**
 * Google Tag Manager dataLayer helpers.
 *
 * Use these functions instead of calling window.dataLayer.push directly.
 * Keeps GTM concerns in one module and makes it easy to add consent or feature flags later.
 */

/**
 * Push an event (and optional payload) to the GTM dataLayer.
 * No-op when running on the server or when dataLayer is not yet available.
 */
export function pushToDataLayer(event: string, payload?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !window.dataLayer) return;
  window.dataLayer.push({
    event,
    ...payload,
  });
}

/**
 * Track a purchase (e.g. order completed). Configure the corresponding tag in GTM to listen for this event.
 */
export function trackPurchase(data: {
  transaction_id?: string;
  value?: number;
  currency?: string;
  items?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}): void {
  pushToDataLayer("purchase", data);
}

/**
 * Track a sign-up. Use in GTM for conversion and audience building.
 */
export function trackSignUp(data?: Record<string, unknown>): void {
  pushToDataLayer("sign_up", data ?? {});
}

/**
 * Track a custom event by name. Use for form submissions, clicks, etc.
 */
export function trackEvent(eventName: string, data?: Record<string, unknown>): void {
  pushToDataLayer(eventName, data);
}
