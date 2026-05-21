/**
 * Mini Draw Notification Configuration
 * Configurable recipients for mini draw full capacity (100%) notification emails.
 * Modify MINI_DRAW_FULL_CAPACITY_RECIPIENTS to add/remove notification recipients.
 */

import { SUPPORT_EMAIL } from "@/lib/email/sender-identities";

/**
 * Recipients for mini draw 100% capacity notification emails.
 * Add or remove email addresses as needed.
 */
export const MINI_DRAW_FULL_CAPACITY_RECIPIENTS: readonly string[] = [
  SUPPORT_EMAIL,
  "dj@toolsaustralia.com.au",
];

/**
 * Get notification recipients, optionally overridden by env var for different environments.
 * Env format: comma-separated list, e.g. MINI_DRAW_NOTIFICATION_RECIPIENTS=support@x.com,dj@x.com
 */
export function getMiniDrawNotificationRecipients(): string[] {
  const envRecipients = process.env.MINI_DRAW_NOTIFICATION_RECIPIENTS?.trim();
  if (envRecipients) {
    return envRecipients.split(",").map((e) => e.trim()).filter(Boolean);
  }
  return [...MINI_DRAW_FULL_CAPACITY_RECIPIENTS];
}
