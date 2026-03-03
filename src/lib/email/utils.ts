/**
 * Email Utilities
 * Provider-agnostic helpers: rate limiting, code generation, expiry calculation.
 * These functions have no dependency on any email transport.
 */

import { isDevelopment } from '@/lib/environment';

// ---------------------------------------------------------------------------
// Email verification rate limiting (3 attempts per 5 minutes)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface EmailRateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  resetTime: number;
}

const verificationRateLimitStore = new Map<string, RateLimitEntry>();
const passwordResetRateLimitStore = new Map<string, RateLimitEntry>();

const AUTH_RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const AUTH_MAX_ATTEMPTS = parseInt(
  process.env.EMAIL_VERIFICATION_RATE_LIMIT_PER_5MIN || '3',
  10
);

function checkRateLimit(
  store: Map<string, RateLimitEntry>,
  keyPrefix: string,
  identifier: string
): EmailRateLimitResult {
  if (isDevelopment()) {
    return {
      allowed: true,
      remainingAttempts: 999,
      resetTime: Date.now() + AUTH_RATE_LIMIT_WINDOW,
    };
  }

  const now = Date.now();
  const key = `${keyPrefix}_${identifier}`;
  const current = store.get(key);

  if (!current || now > current.resetTime) {
    const resetTime = now + AUTH_RATE_LIMIT_WINDOW;
    store.set(key, { count: 1, resetTime });
    return { allowed: true, remainingAttempts: AUTH_MAX_ATTEMPTS - 1, resetTime };
  }

  if (current.count >= AUTH_MAX_ATTEMPTS) {
    return { allowed: false, remainingAttempts: 0, resetTime: current.resetTime };
  }

  current.count++;
  store.set(key, current);
  return {
    allowed: true,
    remainingAttempts: AUTH_MAX_ATTEMPTS - current.count,
    resetTime: current.resetTime,
  };
}

export function checkEmailVerificationRateLimit(email: string): EmailRateLimitResult {
  return checkRateLimit(verificationRateLimitStore, 'email_verification', email);
}

export function checkPasswordResetRateLimit(email: string): EmailRateLimitResult {
  return checkRateLimit(passwordResetRateLimitStore, 'password_reset', email);
}

/** @deprecated Use checkEmailVerificationRateLimit or checkPasswordResetRateLimit */
export function checkEmailRateLimit(email: string): EmailRateLimitResult {
  return checkEmailVerificationRateLimit(email);
}

// ---------------------------------------------------------------------------
// Form submission rate limiting (contact / partner forms)
// ---------------------------------------------------------------------------

const formSubmissionRateLimitStore = new Map<string, { lastSubmissionTime: number }>();
const FORM_SUBMISSION_RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes

export function checkFormSubmissionRateLimit(
  identifier: string
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const key = `form_submission_${identifier}`;
  const current = formSubmissionRateLimitStore.get(key);

  if (!current) {
    formSubmissionRateLimitStore.set(key, { lastSubmissionTime: now });
    return { allowed: true };
  }

  const elapsed = now - current.lastSubmissionTime;

  if (elapsed < FORM_SUBMISSION_RATE_LIMIT_WINDOW) {
    const retryAfter = Math.ceil(
      (FORM_SUBMISSION_RATE_LIMIT_WINDOW - elapsed) / 1000
    );
    return { allowed: false, retryAfter };
  }

  formSubmissionRateLimitStore.set(key, { lastSubmissionTime: now });
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Verification code generation
// ---------------------------------------------------------------------------

export function generateEmailVerificationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Verification and reset expiry (both default 24 hours)
// ---------------------------------------------------------------------------

export function getEmailVerificationExpiry(): Date {
  const expiryMinutes = parseInt(
    process.env.EMAIL_VERIFICATION_EXPIRY_MINUTES || '1440',
    10
  );
  return new Date(Date.now() + expiryMinutes * 60 * 1000);
}

const PASSWORD_RESET_EXPIRY_MINUTES = parseInt(
  process.env.PASSWORD_RESET_EXPIRY_MINUTES || '1440',
  10
);

export function getPasswordResetExpiry(): Date {
  return new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);
}

export function getPasswordResetExpiryMinutes(): number {
  return PASSWORD_RESET_EXPIRY_MINUTES;
}
