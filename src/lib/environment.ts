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
   * Whether email verification should be mandatory
   * - Production: true (mandatory)
   * - Development: false (optional for testing)
   */
  emailVerificationMandatory: (): boolean => {
    return isProduction();
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
        emailVerificationMandatory: environmentFlags.emailVerificationMandatory(),
        userSetupModalClosable: environmentFlags.userSetupModalClosable(),
        debugFeaturesEnabled: environmentFlags.debugFeaturesEnabled(),
        useTestData: environmentFlags.useTestData(),
      },
    });
  }
};
