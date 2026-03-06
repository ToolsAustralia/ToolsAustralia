/**
 * Email Module Public API
 * Exports all email-related functionality
 */

// Main service
export { default as emailService } from './email-service';

// Convenience function for mini draw 100% notification
export async function sendMiniDrawFullCapacityNotification(payload: {
  miniDrawName: string;
  prizeName: string;
  totalEntries: number;
  minimumEntries: number;
}) {
  const { default: emailService } = await import('./email-service');
  return emailService.sendMiniDrawFullCapacityNotification(payload);
}

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
