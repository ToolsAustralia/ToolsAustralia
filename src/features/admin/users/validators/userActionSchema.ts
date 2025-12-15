/**
 * Validation schemas for admin user actions
 */

import { z } from "zod";

/**
 * Schema for user action requests
 */
export const userActionSchema = z.object({
  action: z.enum([
    "resend_verification",
    "reset_password",
    "toggle_status",
    "add_note",
    "resend_sms_verification",
    "send_email",
    "admin_set_password",
  ]),
  note: z.string().optional(),
  reason: z.string().optional(),
  subject: z.string().min(1, "Subject is required").optional(),
  message: z.string().min(1, "Message is required").optional(),
  newPassword: z.string().min(6, "New password must be at least 6 characters").optional(),
});

export type UserActionRequest = z.infer<typeof userActionSchema>;
