/**
 * Sender Identities
 * Defines per-email-type sender addresses for SendGrid.
 * All addresses must be under a domain authenticated in SendGrid.
 *
 * If SendGrid returns 400 for sender identity, try setting SENDGRID_FROM_DOMAIN
 * to the authenticated subdomain (e.g. em7481.toolsaustralia.com.au) in .env.local
 */

const DEFAULT_EMAIL_DOMAIN = 'toolsaustralia.com.au';
const EMAIL_DOMAIN =
  process.env.SENDGRID_FROM_DOMAIN?.trim() || DEFAULT_EMAIL_DOMAIN;

export enum EmailCategory {
  VERIFICATION = 'VERIFICATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
  CONTACT_NOTIFICATION = 'CONTACT_NOTIFICATION',
  PARTNER_NOTIFICATION = 'PARTNER_NOTIFICATION',
  ADMIN_SUPPORT = 'ADMIN_SUPPORT',
  TRANSACTIONAL = 'TRANSACTIONAL',
}

export interface SenderIdentity {
  fromEmail: string;
  fromName: string;
  replyTo?: string;
}

/** Support email for replies - always use root domain for customer-facing support. Source of truth for SendGrid. */
export const SUPPORT_EMAIL = 'support@toolsaustralia.com.au';

/** Resolve contact/support email - CONTACT_EMAIL env overrides, else SUPPORT_EMAIL */
export function getContactEmail(): string {
  return process.env.CONTACT_EMAIL?.trim() || SUPPORT_EMAIL;
}

const SENDER_IDENTITIES: Record<EmailCategory, SenderIdentity> = (() => {
  const domain = EMAIL_DOMAIN;
  return {
  [EmailCategory.VERIFICATION]: {
    fromEmail: `verify-email@${domain}`,
    fromName: 'Tools Australia',
    replyTo: SUPPORT_EMAIL,
  },
  [EmailCategory.PASSWORD_RESET]: {
    fromEmail: `reset-password@${domain}`,
    fromName: 'Tools Australia',
    replyTo: SUPPORT_EMAIL,
  },
  [EmailCategory.CONTACT_NOTIFICATION]: {
    fromEmail: `no-reply@${domain}`,
    fromName: 'Tools Australia',
  },
  [EmailCategory.PARTNER_NOTIFICATION]: {
    fromEmail: `no-reply@${domain}`,
    fromName: 'Tools Australia',
  },
  [EmailCategory.ADMIN_SUPPORT]: {
    fromEmail: `support@${domain}`,
    fromName: 'Tools Australia Support',
    replyTo: SUPPORT_EMAIL,
  },
  [EmailCategory.TRANSACTIONAL]: {
    fromEmail: `no-reply@${domain}`,
    fromName: 'Tools Australia',
    replyTo: SUPPORT_EMAIL,
  },
};
})();

/**
 * Resolve the sender identity for a given email category.
 * Falls back to TRANSACTIONAL if the category is not found.
 */
export function getSenderIdentity(category: EmailCategory): SenderIdentity {
  return SENDER_IDENTITIES[category] ?? SENDER_IDENTITIES[EmailCategory.TRANSACTIONAL];
}
