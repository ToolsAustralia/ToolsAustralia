/**
 * Email Module Public API
 * Exports all email-related functionality
 */

// Main service
export { default as emailService } from './email-service';

// Sender identities
export { EmailCategory, getSenderIdentity } from './sender-identities';
export type { SenderIdentity } from './sender-identities';

// Rate limiting
export {
  emailVerificationRateLimiter,
  passwordResetRateLimiter,
} from './rate-limiter';

// Types
export * from './types';

// Provider-agnostic utilities (rate limiting, code generation, expiry, HTML escaping)
export {
  checkEmailVerificationRateLimit,
  checkPasswordResetRateLimit,
  checkLoginCodeRateLimit,
  checkEmailRateLimit,
  generateEmailVerificationCode,
  getEmailVerificationExpiry,
  getPasswordResetExpiry,
  getPasswordResetExpiryMinutes,
  getLoginCodeExpiry,
  getLoginCodeExpiryMinutes,
  checkFormSubmissionRateLimit,
  escapeHtml,
  escapeHtmlPreserveNewlines,
} from './utils';
