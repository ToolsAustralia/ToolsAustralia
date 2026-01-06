/**
 * Email Module Public API
 * Exports all email-related functionality
 */

// Main service
export { default as emailService } from './email-service';

// Rate limiting
export {
  emailVerificationRateLimiter,
  passwordResetRateLimiter,
} from './rate-limiter';

// Types
export * from './types';

// Legacy compatibility (during migration)
// Re-export utility functions that are still used
export {
  checkEmailRateLimit,
  generateEmailVerificationCode,
  getEmailVerificationExpiry,
  checkFormSubmissionRateLimit,
} from '../email';





