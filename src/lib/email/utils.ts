/**
 * Email Utilities
 * Provider-agnostic helpers: rate limiting, code generation, expiry calculation, HTML escaping.
 * These functions have no dependency on any email transport.
 */

import { isDevelopment } from '@/lib/environment';

// ---------------------------------------------------------------------------
// HTML escaping (XSS prevention in email templates)
// ---------------------------------------------------------------------------

/**
 * Escape HTML special characters to prevent XSS when interpolating user-provided content into email templates.
 */
export function escapeHtml(str: string | undefined | null): string {
  if (str == null || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escape HTML and preserve newlines as <br> for multiline user content (e.g. message, goals).
 */
export function escapeHtmlPreserveNewlines(str: string | undefined | null): string {
  return escapeHtml(str).replace(/\n/g, '<br>');
}

/**
 * Strip HTML tags to produce plain text (e.g. for text/plain email fallback).
 */
export function stripHtml(html: string | undefined | null): string {
  if (html == null || typeof html !== 'string') return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

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
const loginCodeRateLimitStore = new Map<string, RateLimitEntry>();

const AUTH_RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const AUTH_MAX_ATTEMPTS = parseInt(
  process.env.EMAIL_VERIFICATION_RATE_LIMIT_PER_5MIN || '3',
  10
);

/** Password reset: 1 attempt every 5 minutes to conserve email credits */
const PASSWORD_RESET_RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const PASSWORD_RESET_MAX_ATTEMPTS = 1;

function checkRateLimit(
  store: Map<string, RateLimitEntry>,
  keyPrefix: string,
  identifier: string,
  windowMs: number = AUTH_RATE_LIMIT_WINDOW,
  maxAttempts: number = AUTH_MAX_ATTEMPTS
): EmailRateLimitResult {
  if (isDevelopment()) {
    return {
      allowed: true,
      remainingAttempts: 999,
      resetTime: Date.now() + windowMs,
    };
  }

  const now = Date.now();
  const key = `${keyPrefix}_${identifier}`;
  const current = store.get(key);

  if (!current || now > current.resetTime) {
    const resetTime = now + windowMs;
    store.set(key, { count: 1, resetTime });
    return { allowed: true, remainingAttempts: maxAttempts - 1, resetTime };
  }

  if (current.count >= maxAttempts) {
    return { allowed: false, remainingAttempts: 0, resetTime: current.resetTime };
  }

  current.count++;
  store.set(key, current);
  return {
    allowed: true,
    remainingAttempts: maxAttempts - current.count,
    resetTime: current.resetTime,
  };
}

export function checkEmailVerificationRateLimit(email: string): EmailRateLimitResult {
  return checkRateLimit(verificationRateLimitStore, 'email_verification', email);
}

export function checkPasswordResetRateLimit(email: string): EmailRateLimitResult {
  return checkRateLimit(
    passwordResetRateLimitStore,
    'password_reset',
    email,
    PASSWORD_RESET_RATE_LIMIT_WINDOW,
    PASSWORD_RESET_MAX_ATTEMPTS
  );
}

/** Login code: 1 attempt every 5 minutes to conserve email credits */
const LOGIN_CODE_RATE_LIMIT_WINDOW = 5 * 60 * 1000;
const LOGIN_CODE_MAX_ATTEMPTS = 1;

export function checkLoginCodeRateLimit(email: string): EmailRateLimitResult {
  return checkRateLimit(
    loginCodeRateLimitStore,
    'login_code',
    email,
    LOGIN_CODE_RATE_LIMIT_WINDOW,
    LOGIN_CODE_MAX_ATTEMPTS
  );
}

/** @deprecated Use checkEmailVerificationRateLimit or checkPasswordResetRateLimit */
export function checkEmailRateLimit(email: string): EmailRateLimitResult {
  return checkEmailVerificationRateLimit(email);
}

// ---------------------------------------------------------------------------
// Form submission rate limiting (contact / partner forms)
// ---------------------------------------------------------------------------

const formSubmissionRateLimitStore = new Map<string, number[]>();
const FORM_SUBMISSION_RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const FORM_SUBMISSION_RATE_LIMIT_MAX = 3; // max submissions per window per identifier

/**
 * Allow up to FORM_SUBMISSION_RATE_LIMIT_MAX submissions per identifier within a
 * rolling FORM_SUBMISSION_RATE_LIMIT_WINDOW (currently 3 per 5 minutes) so a single
 * user can't flood the support inbox. Identifier is typically `email_IP`.
 */
export function checkFormSubmissionRateLimit(
  identifier: string
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const key = `form_submission_${identifier}`;
  // Keep only timestamps still inside the window.
  const timestamps = (formSubmissionRateLimitStore.get(key) || []).filter(
    (t) => now - t < FORM_SUBMISSION_RATE_LIMIT_WINDOW
  );

  if (timestamps.length >= FORM_SUBMISSION_RATE_LIMIT_MAX) {
    const oldest = timestamps[0];
    const retryAfter = Math.ceil((FORM_SUBMISSION_RATE_LIMIT_WINDOW - (now - oldest)) / 1000);
    formSubmissionRateLimitStore.set(key, timestamps);
    return { allowed: false, retryAfter };
  }

  timestamps.push(now);
  formSubmissionRateLimitStore.set(key, timestamps);
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

// ---------------------------------------------------------------------------
// Login code expiry (default 15 minutes)
// ---------------------------------------------------------------------------

const LOGIN_CODE_EXPIRY_MINUTES = parseInt(
  process.env.LOGIN_CODE_EXPIRY_MINUTES || '15',
  10
);

export function getLoginCodeExpiry(): Date {
  return new Date(Date.now() + LOGIN_CODE_EXPIRY_MINUTES * 60 * 1000);
}

export function getLoginCodeExpiryMinutes(): number {
  return LOGIN_CODE_EXPIRY_MINUTES;
}
