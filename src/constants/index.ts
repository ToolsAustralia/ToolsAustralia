/**
 * Application Constants
 *
 * Centralized constants for maintainability and type safety.
 * All magic numbers and strings should be defined here.
 *
 * @module constants
 */

// ============================================================
// PAYMENT CONSTANTS
// ============================================================

export const PAYMENT = {
  CURRENCY: "AUD",
  MIN_PASSWORD_LENGTH: 6,
  MIN_AMOUNT_CENTS: 50, // Minimum $0.50
  MAX_AMOUNT_CENTS: 10000000, // Maximum $100,000
} as const;

// ============================================================
// AUTHENTICATION CONSTANTS
// ============================================================

export const AUTH = {
  OTP_LENGTH: 6,
  OTP_EXPIRY_MINUTES: 10,
  MAX_OTP_ATTEMPTS: 5,
  JWT_EXPIRY_DAYS: 30,
  EMAIL_VERIFICATION_EXPIRY_MINUTES: 10,
} as const;

// ============================================================
// RATE LIMITING CONSTANTS
// ============================================================

export const RATE_LIMITS = {
  EMAIL_VERIFICATION: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_ATTEMPTS: 5,
  },
  SMS_OTP: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_ATTEMPTS: 5,
  },
  FORM_SUBMISSION: {
    WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  },
  LOGIN: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_ATTEMPTS: 5,
  },
} as const;

// ============================================================
// MODAL CONSTANTS
// ============================================================

export const MEMBERSHIP_MODAL_STEPS = {
  PERSONAL_DETAILS: 1,
  PAYMENT: 2,
  PROCESSING: 3,
} as const;

// ============================================================
// PACKAGE TYPE CONSTANTS
// ============================================================

export const PACKAGE_TYPES = {
  SUBSCRIPTION: "subscription",
  ONE_TIME: "one-time",
  UPSELL: "upsell",
  MINI_DRAW: "mini-draw",
} as const;

export type PackageType = (typeof PACKAGE_TYPES)[keyof typeof PACKAGE_TYPES];

// ============================================================
// PAYMENT STATUS CONSTANTS
// ============================================================

export const PAYMENT_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELED: "canceled",
  REQUIRES_ACTION: "requires_action",
} as const;

// ============================================================
// SUBSCRIPTION STATUS CONSTANTS
// ============================================================

export const SUBSCRIPTION_STATUS = {
  ACTIVE: "active",
  CANCELED: "canceled",
  INCOMPLETE: "incomplete",
  INCOMPLETE_EXPIRED: "incomplete_expired",
  PAST_DUE: "past_due",
  TRIALING: "trialing",
  UNPAID: "unpaid",
} as const;

// ============================================================
// API CONSTANTS
// ============================================================

export const API = {
  DEFAULT_TIMEOUT_MS: 30000, // 30 seconds
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000,
} as const;

// ============================================================
// DATABASE CONSTANTS
// ============================================================

export const DATABASE = {
  DEFAULT_MAX_POOL_SIZE: 10,
  SERVER_SELECTION_TIMEOUT_MS: 5000,
  SOCKET_TIMEOUT_MS: 45000,
} as const;

// ============================================================
// AFFILIATE CONSTANTS
// ============================================================

export const AFFILIATE = {
  DEFAULT_COMMISSION_RATE: 0.3, // 30%
  MIN_COMMISSION_RATE: 0,
  MAX_COMMISSION_RATE: 1,
} as const;

// ============================================================
// REWARDS CONSTANTS
// ============================================================

export const REWARDS = {
  POINTS_MULTIPLIER: 5, // 5x multiplier for package redemption
  MIN_POINTS_TO_REDEEM: 100,
} as const;

// ============================================================
// VALIDATION CONSTANTS
// ============================================================

export const VALIDATION = {
  EMAIL_MAX_LENGTH: 255,
  NAME_MAX_LENGTH: 100,
  PHONE_MAX_LENGTH: 20,
  PASSWORD_MIN_LENGTH: 6,
  PASSWORD_MAX_LENGTH: 128,
} as const;

// ============================================================
// TIME CONSTANTS
// ============================================================

export const TIME = {
  SECOND_MS: 1000,
  MINUTE_MS: 60 * 1000,
  HOUR_MS: 60 * 60 * 1000,
  DAY_MS: 24 * 60 * 60 * 1000,
  WEEK_MS: 7 * 24 * 60 * 60 * 1000,
  MONTH_MS: 30 * 24 * 60 * 60 * 1000,
  YEAR_MS: 365 * 24 * 60 * 60 * 1000,
} as const;

// ============================================================
// PARTNER DISCOUNT CONSTANTS
// ============================================================

export const PARTNER_DISCOUNT = {
  EXPIRY_MONTHS: 12, // Must be used within 12 months
  QUEUE_STATUS: {
    ACTIVE: "active",
    QUEUED: "queued",
    EXPIRED: "expired",
    CANCELLED: "cancelled",
  },
} as const;

// ============================================================
// EXPORT ALL CONSTANTS
// ============================================================

export const CONSTANTS = {
  PAYMENT,
  AUTH,
  RATE_LIMITS,
  MEMBERSHIP_MODAL_STEPS,
  PACKAGE_TYPES,
  PAYMENT_STATUS,
  SUBSCRIPTION_STATUS,
  API,
  DATABASE,
  AFFILIATE,
  REWARDS,
  VALIDATION,
  TIME,
  PARTNER_DISCOUNT,
} as const;
