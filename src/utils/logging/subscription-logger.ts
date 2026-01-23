/**
 * Subscription Logger
 *
 * Environment-aware logging utility for subscription operations.
 * Logs can be disabled via ENABLE_SUBSCRIPTION_LOGS environment variable.
 * Error logs are always enabled for production debugging.
 */

const ENABLE_LOGS = process.env.ENABLE_SUBSCRIPTION_LOGS === "true";

/**
 * Subscription logging utility with environment-based toggling
 */
export const subscriptionLog = {
  /**
   * Log informational messages (disabled by default)
   */
  info: (message: string, data?: unknown): void => {
    if (ENABLE_LOGS) {
      console.log(`[Subscription] ${message}`, data || "");
    }
  },

  /**
   * Log warning messages (disabled by default)
   */
  warn: (message: string, data?: unknown): void => {
    if (ENABLE_LOGS) {
      console.warn(`[Subscription] ${message}`, data || "");
    }
  },

  /**
   * Log error messages (always enabled for production debugging)
   */
  error: (message: string, data?: unknown): void => {
    console.error(`[Subscription] ${message}`, data || "");
  },
};
