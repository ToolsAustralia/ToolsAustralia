/**
 * Type-Safe Environment Configuration
 *
 * Centralized environment variable access with validation and type safety.
 * This ensures all environment variables are validated at startup.
 *
 * @module config/env
 */

import { z } from "zod";

// ============================================================
// ENVIRONMENT SCHEMA
// ============================================================

const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Database
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_MAX_POOL: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),

  // NextAuth
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required"),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Stripe Product/Price IDs
  STRIPE_PRODUCT_ID_TRADIE: z.string().optional(),
  STRIPE_PRODUCT_ID_FOREMAN: z.string().optional(),
  STRIPE_PRODUCT_ID_BOSS: z.string().optional(),
  STRIPE_PRICE_ID_TRADIE: z.string().optional(),
  STRIPE_PRICE_ID_FOREMAN: z.string().optional(),
  STRIPE_PRICE_ID_BOSS: z.string().optional(),

  // Facebook
  NEXT_PUBLIC_FACEBOOK_PIXEL_ID: z.string().optional(),
  FACEBOOK_ACCESS_TOKEN: z.string().optional(),
  FACEBOOK_TEST_EVENT_CODE: z.string().optional(),
  FACEBOOK_MARKETING_ACCESS_TOKEN: z.string().optional(),
  FACEBOOK_AD_ACCOUNT_ID: z.string().optional(),

  // TikTok
  NEXT_PUBLIC_TIKTOK_PIXEL_ID: z.string().optional(),
  NEXT_PUBLIC_ENABLE_PIXEL_TESTING: z
    .string()
    .optional()
    .transform((val) => val === "true"),

  // Email
  SMTP_SERVER_HOST: z.string().optional(),
  SMTP_SERVER_PORT: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),
  SMTP_SERVER_USER: z.string().optional(),
  SMTP_SERVER_PASSWORD: z.string().optional(),
  EMAIL_VERIFICATION_EXPIRY_MINUTES: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
  EMAIL_VERIFICATION_RATE_LIMIT_PER_HOUR: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 5)),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // App Configuration
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_NAME: z.string().default("Tools Australia"),

  // Feature Flags
  REWARDS_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === "true"),
  NEXT_PUBLIC_REWARDS_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === "true"),
  REWARDS_DISABLED_MESSAGE: z.string().optional(),
  NEXT_PUBLIC_REWARDS_DISABLED_MESSAGE: z.string().optional(),

  // Admin
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),

  // Klaviyo
  KLAVIYO_PRIVATE_API_KEY: z.string().optional(),
  KLAVIYO_ENABLED: z
    .string()
    .optional()
    .transform((val) => val !== "false"),
  KLAVIYO_MODE: z.enum(["development", "production"]).optional(),

  // Webhook Logging
  WEBHOOK_VERBOSE_LOGGING: z
    .string()
    .optional()
    .transform((val) => val === "true"),

  // Logging
  SILENCE_LOGS: z
    .string()
    .optional()
    .transform((val) => val === "true"),
} as const);

// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================

function validateEnv(): z.infer<typeof envSchema> {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues
        .filter((issue) => issue.code === "too_small" || issue.code === "invalid_type")
        .map((issue) => issue.path.join("."));

      console.error("❌ Environment variable validation failed:");
      console.error("Missing or invalid variables:", missingVars);
      console.error("Full error:", error.format());

      // In production, throw error to prevent app from starting
      if (process.env.NODE_ENV === "production") {
        throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`);
      }
    }
    throw error;
  }
}

// ============================================================
// VALIDATED ENVIRONMENT
// ============================================================

const validatedEnv = validateEnv();

// ============================================================
// TYPE-SAFE ENVIRONMENT ACCESS
// ============================================================

/**
 * Type-safe environment configuration
 * All environment variables are validated and typed
 */
export const env = {
  // Node Environment
  nodeEnv: validatedEnv.NODE_ENV,
  isProduction: validatedEnv.NODE_ENV === "production",
  isDevelopment: validatedEnv.NODE_ENV === "development",
  isTest: validatedEnv.NODE_ENV === "test",

  // Database
  mongodb: {
    uri: validatedEnv.MONGODB_URI,
    maxPool: validatedEnv.MONGODB_MAX_POOL,
  },

  // NextAuth
  nextAuth: {
    url: validatedEnv.NEXTAUTH_URL,
    secret: validatedEnv.NEXTAUTH_SECRET,
  },

  // Google OAuth
  google: {
    clientId: validatedEnv.GOOGLE_CLIENT_ID,
    clientSecret: validatedEnv.GOOGLE_CLIENT_SECRET,
    isEnabled: !!(validatedEnv.GOOGLE_CLIENT_ID && validatedEnv.GOOGLE_CLIENT_SECRET),
  },

  // Stripe
  stripe: {
    secretKey: validatedEnv.STRIPE_SECRET_KEY,
    publishableKey: validatedEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    webhookSecret: validatedEnv.STRIPE_WEBHOOK_SECRET,
    products: {
      tradie: validatedEnv.STRIPE_PRODUCT_ID_TRADIE,
      foreman: validatedEnv.STRIPE_PRODUCT_ID_FOREMAN,
      boss: validatedEnv.STRIPE_PRODUCT_ID_BOSS,
    },
    prices: {
      tradie: validatedEnv.STRIPE_PRICE_ID_TRADIE,
      foreman: validatedEnv.STRIPE_PRICE_ID_FOREMAN,
      boss: validatedEnv.STRIPE_PRICE_ID_BOSS,
    },
  },

  // Facebook
  facebook: {
    pixelId: validatedEnv.NEXT_PUBLIC_FACEBOOK_PIXEL_ID,
    accessToken: validatedEnv.FACEBOOK_ACCESS_TOKEN,
    testEventCode: validatedEnv.FACEBOOK_TEST_EVENT_CODE,
    marketing: {
      accessToken: validatedEnv.FACEBOOK_MARKETING_ACCESS_TOKEN,
      adAccountId: validatedEnv.FACEBOOK_AD_ACCOUNT_ID,
    },
    isEnabled: !!(validatedEnv.NEXT_PUBLIC_FACEBOOK_PIXEL_ID && validatedEnv.FACEBOOK_ACCESS_TOKEN),
  },

  // TikTok
  tiktok: {
    pixelId: validatedEnv.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
    isEnabled: !!validatedEnv.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
    testingEnabled: validatedEnv.NEXT_PUBLIC_ENABLE_PIXEL_TESTING ?? false,
  },

  // Email
  email: {
    smtp: {
      host: validatedEnv.SMTP_SERVER_HOST,
      port: validatedEnv.SMTP_SERVER_PORT ?? 587,
      user: validatedEnv.SMTP_SERVER_USER,
      password: validatedEnv.SMTP_SERVER_PASSWORD,
    },
    verification: {
      expiryMinutes: validatedEnv.EMAIL_VERIFICATION_EXPIRY_MINUTES ?? 10,
      rateLimitPerHour: validatedEnv.EMAIL_VERIFICATION_RATE_LIMIT_PER_HOUR ?? 5,
    },
    isEnabled: !!(validatedEnv.SMTP_SERVER_HOST && validatedEnv.SMTP_SERVER_USER && validatedEnv.SMTP_SERVER_PASSWORD),
  },

  // Twilio
  twilio: {
    accountSid: validatedEnv.TWILIO_ACCOUNT_SID,
    authToken: validatedEnv.TWILIO_AUTH_TOKEN,
    phoneNumber: validatedEnv.TWILIO_PHONE_NUMBER,
    isEnabled: !!(
      validatedEnv.TWILIO_ACCOUNT_SID &&
      validatedEnv.TWILIO_AUTH_TOKEN &&
      validatedEnv.TWILIO_PHONE_NUMBER
    ),
  },

  // App Configuration
  app: {
    url: validatedEnv.NEXT_PUBLIC_APP_URL,
    apiUrl: validatedEnv.NEXT_PUBLIC_API_URL,
    name: validatedEnv.NEXT_PUBLIC_APP_NAME,
  },

  // Feature Flags
  features: {
    rewards: {
      enabled: validatedEnv.REWARDS_ENABLED ?? validatedEnv.NEXT_PUBLIC_REWARDS_ENABLED ?? false,
      disabledMessage: validatedEnv.REWARDS_DISABLED_MESSAGE ?? validatedEnv.NEXT_PUBLIC_REWARDS_DISABLED_MESSAGE,
    },
  },

  // Admin
  admin: {
    email: validatedEnv.ADMIN_EMAIL,
    password: validatedEnv.ADMIN_PASSWORD,
  },

  // Klaviyo
  klaviyo: {
    apiKey: validatedEnv.KLAVIYO_PRIVATE_API_KEY,
    enabled: validatedEnv.KLAVIYO_ENABLED ?? true,
    mode: validatedEnv.KLAVIYO_MODE,
    isEnabled: !!(validatedEnv.KLAVIYO_PRIVATE_API_KEY && validatedEnv.KLAVIYO_ENABLED !== false),
  },

  // Logging
  logging: {
    webhookVerbose: validatedEnv.WEBHOOK_VERBOSE_LOGGING ?? false,
    silenceLogs: validatedEnv.SILENCE_LOGS ?? false,
  },
} as const;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get base URL for API requests
 * Prioritizes NEXT_PUBLIC_APP_URL, falls back to NEXTAUTH_URL
 */
export function getBaseUrl(): string {
  if (env.app.url) {
    return env.app.url.replace(/\/$/, "");
  }

  if (env.nextAuth.url) {
    return env.nextAuth.url.replace(/\/$/, "");
  }

  if (env.isProduction) {
    throw new Error("NEXT_PUBLIC_APP_URL must be set in production");
  }

  return "http://localhost:3000";
}

/**
 * Get API base URL
 */
export function getApiUrl(): string {
  return env.app.apiUrl || getBaseUrl();
}

// ============================================================
// TYPE EXPORTS
// ============================================================

export type Env = typeof env;
