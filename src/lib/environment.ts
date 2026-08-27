/**
 * Environment Detection Utility
 *
 * Provides utilities to detect the current environment and determine
 * whether certain features should be enabled/disabled based on the environment.
 *
 * Features:
 * - Production vs Development detection
 * - Environment-specific feature flags
 * - Consistent environment checking across the app
 */

/**
 * Check if the app is running in production environment
 */
export const isProduction = (): boolean => {
  return process.env.NODE_ENV === "production";
};

/**
 * Check if the app is running in development environment
 */
export const isDevelopment = (): boolean => {
  return process.env.NODE_ENV === "development";
};

/**
 * Get the current environment name
 */
export const getEnvironment = (): "production" | "development" | "test" => {
  return (process.env.NODE_ENV as "production" | "development" | "test") || "development";
};

/**
 * Environment-specific feature flags
 */
export const environmentFlags = {
  /**
   * Whether a member must hold at least ONE verified contact channel — email
   * **or** mobile — before profile setup can complete (2026-08-27).
   *
   * This replaces `emailVerificationMandatory`, which was hardcoded `false`: the
   * gate was built and left off, so members finished setup with nothing verified
   * and no way back in if they had mistyped their email. Registration is
   * passwordless and the password is set in that same setup step, so the verified
   * channel is the **recovery credential** for the password they just chose.
   *
   * Either channel satisfies it. Email is free, so the UI defaults to it; SMS is
   * the alternative for someone who cannot reach their inbox.
   */
  verifiedContactRequired: (): boolean => {
    return true;
  },

  /**
   * Whether user setup modal can be closed/cancelled
   * - Production: false (cannot be closed)
   * - Development: true (can be closed for testing)
   */
  userSetupModalClosable: (): boolean => {
    return isDevelopment();
  },

  /**
   * Whether debug features should be enabled
   * - Production: false
   * - Development: true
   */
  debugFeaturesEnabled: (): boolean => {
    return isDevelopment();
  },

  /**
   * Whether test data should be used
   * - Production: false
   * - Development: true
   */
  useTestData: (): boolean => {
    return isDevelopment();
  },
};

/**
 * Log environment information (useful for debugging)
 */
export const logEnvironmentInfo = (): void => {
  if (isDevelopment()) {
    console.log("🔧 Environment Info:", {
      environment: getEnvironment(),
      isProduction: isProduction(),
      isDevelopment: isDevelopment(),
      flags: {
        verifiedContactRequired: environmentFlags.verifiedContactRequired(),
        userSetupModalClosable: environmentFlags.userSetupModalClosable(),
        debugFeaturesEnabled: environmentFlags.debugFeaturesEnabled(),
        useTestData: environmentFlags.useTestData(),
      },
    });
  }
};
