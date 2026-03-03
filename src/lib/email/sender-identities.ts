/**
 * Sender Identities
 * Defines per-email-type sender addresses for SendGrid.
 * All addresses must be under a domain authenticated in SendGrid.
 */

const EMAIL_DOMAIN = 'toolsaustralia.com.au';

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

const SENDER_IDENTITIES: Record<EmailCategory, SenderIdentity> = {
  [EmailCategory.VERIFICATION]: {
    fromEmail: `verify-email@${EMAIL_DOMAIN}`,
    fromName: 'Tools Australia',
  },
  [EmailCategory.PASSWORD_RESET]: {
    fromEmail: `reset-password@${EMAIL_DOMAIN}`,
    fromName: 'Tools Australia',
  },
  [EmailCategory.CONTACT_NOTIFICATION]: {
    fromEmail: `no-reply@${EMAIL_DOMAIN}`,
    fromName: 'Tools Australia',
  },
  [EmailCategory.PARTNER_NOTIFICATION]: {
    fromEmail: `no-reply@${EMAIL_DOMAIN}`,
    fromName: 'Tools Australia',
  },
  [EmailCategory.ADMIN_SUPPORT]: {
    fromEmail: `support@${EMAIL_DOMAIN}`,
    fromName: 'Tools Australia Support',
    replyTo: `support@${EMAIL_DOMAIN}`,
  },
  [EmailCategory.TRANSACTIONAL]: {
    fromEmail: `no-reply@${EMAIL_DOMAIN}`,
    fromName: 'Tools Australia',
  },
};

/**
 * Resolve the sender identity for a given email category.
 * Falls back to TRANSACTIONAL if the category is not found.
 */
export function getSenderIdentity(category: EmailCategory): SenderIdentity {
  return SENDER_IDENTITIES[category] ?? SENDER_IDENTITIES[EmailCategory.TRANSACTIONAL];
}
