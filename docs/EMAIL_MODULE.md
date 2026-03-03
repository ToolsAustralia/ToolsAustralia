# Email Module Architecture

This document describes the Tools Australia email module (`src/lib/email/`), which uses SendGrid for transactional emails with per-email-type sender identities.

## Overview

```
src/lib/email/
├── index.ts              # Public API – exports emailService, utilities, types
├── email-service.ts      # High-level send methods (verification, reset, forms, etc.)
├── sendgrid-client.ts    # Singleton SendGrid API client
├── sender-identities.ts  # Per-email-type from addresses and reply-to
├── templates.ts          # HTML email templates
├── types.ts              # TypeScript interfaces and enums
├── utils.ts              # Rate limiting, code generation, expiry helpers
└── rate-limiter.ts       # Generic rate limiter (email verification, password reset)
```

## Sender Identities

Each email type uses a dedicated "from" address for clarity and deliverability:

| EmailCategory | From Address | From Name | Reply-To |
|---------------|--------------|-----------|----------|
| VERIFICATION | verify-email@toolsaustralia.com.au | Tools Australia | — |
| PASSWORD_RESET | reset-password@toolsaustralia.com.au | Tools Australia | — |
| CONTACT_NOTIFICATION | no-reply@toolsaustralia.com.au | Tools Australia | Submitter's email |
| PARTNER_NOTIFICATION | no-reply@toolsaustralia.com.au | Tools Australia | Submitter's email |
| ADMIN_SUPPORT | support@toolsaustralia.com.au | Tools Australia Support | support@toolsaustralia.com.au |
| TRANSACTIONAL | no-reply@toolsaustralia.com.au | Tools Australia | — |

All addresses must be under a domain authenticated in SendGrid (`toolsaustralia.com.au`).

## Public API

### Importing

```typescript
import {
  emailService,
  checkEmailRateLimit,
  generateEmailVerificationCode,
  getEmailVerificationExpiry,
  checkFormSubmissionRateLimit,
  EmailCategory,
  getSenderIdentity,
} from '@/lib/email/';
```

### emailService Methods

| Method | Description | Recipient |
|--------|-------------|-----------|
| `sendVerificationEmail(to, payload)` | Email verification code | `to` |
| `sendPasswordResetEmail(to, payload)` | Password reset link | `to` |
| `sendContactSubmissionEmail(payload)` | Contact form notification | `CONTACT_EMAIL` env var |
| `sendPartnerApplicationEmail(payload)` | Partner application notification | `CONTACT_EMAIL` env var |
| `sendCustomEmail(payload)` | Generic email with optional `category` | `payload.to` |

### Utility Functions

| Function | Description |
|----------|-------------|
| `checkEmailVerificationRateLimit(email)` | Rate limit for verification: 3 per 5 min |
| `checkPasswordResetRateLimit(email)` | Rate limit for password reset: 3 per 5 min |
| `checkFormSubmissionRateLimit(identifier)` | Rate limit for contact/partner forms: 1 per 5 min |
| `generateEmailVerificationCode()` | 6-character alphanumeric code |
| `getEmailVerificationExpiry()` | Expiry date for verification codes (24h default) |
| `getPasswordResetExpiry()` | Expiry date for reset links (24h default) |
| `getPasswordResetExpiryMinutes()` | Reset link expiry in minutes |

## Usage Examples

### Email Verification

```typescript
await emailService.sendVerificationEmail(user.email, {
  userName: user.firstName,
  verificationCode: 'ABC123',
  expiryHours: 24,
});
```

### Password Reset

```typescript
await emailService.sendPasswordResetEmail(user.email, {
  userName: user.firstName,
  resetUrl: 'https://...',
  expiryMinutes: 60,
});
```

### Contact Form (sends to support inbox)

```typescript
await emailService.sendContactSubmissionEmail({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: '0412345678',
  subject: 'Inquiry',
  message: 'Hello...',
  submittedAt: new Date().toISOString(),
});
```

### Custom Email with Admin Support Sender

```typescript
await emailService.sendCustomEmail({
  to: user.email,
  subject: 'Account Update',
  html: '<p>Your account has been updated.</p>',
  text: 'Your account has been updated.',
  category: EmailCategory.ADMIN_SUPPORT,
});
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| SENDGRID_API_KEY | Yes | — | SendGrid API key |
| EMAIL_ENABLED | No | true | Enable/disable email sending |
| EMAIL_RETRY_ATTEMPTS | No | 3 | Retries on transient failure (all email types) |
| EMAIL_RETRY_DELAY_MS | No | 1000 | Base delay between retries |
| CONTACT_EMAIL | No | support@toolsaustralia.com.au | Recipient for contact/partner forms |
| EMAIL_VERIFICATION_EXPIRY_MINUTES | No | 1440 | Verification code expiry (24h) |
| EMAIL_VERIFICATION_RATE_LIMIT_PER_5MIN | No | 3 | Max verification attempts per 5 min |
| PASSWORD_RESET_EXPIRY_MINUTES | No | 1440 | Password reset link expiry (24h) |

**Rate limits:** Email verification 3/5min, password reset 3/5min, contact/partner forms 1/5min. Admin emails have no rate limit.

## API Routes Using Email

| Route | Method | Purpose |
|-------|--------|---------|
| /api/auth/send-email-verification | POST | Send verification code |
| /api/auth/request-password-reset | POST | Send password reset |
| /api/contact-submissions | POST | Contact form submission |
| /api/partner-applications | POST | Partner application |
| /api/user/update-email | POST | Email change verification |
| /api/admin/users/[id]/actions | POST | Resend verification, reset password, send email |
| /api/test/email-verification | POST | Test endpoint |

## Adding a New Email Type

1. Add a new `EmailCategory` in `sender-identities.ts`.
2. Add a `SenderIdentity` for that category.
3. Add a `sendXxxEmail` method to `email-service.ts` (or use `sendCustomEmail` with the new category).
4. Add an HTML template in `templates.ts` if needed.

## Related Documentation

- [SENDGRID_TESTING_GUIDE.md](./SENDGRID_TESTING_GUIDE.md) – How to test SendGrid emails
