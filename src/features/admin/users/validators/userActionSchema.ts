/**
 * Validation schemas for admin user actions
 */

import { z } from "zod";

/**
 * Schema for user action requests
 */
export const userActionSchema = z.object({
  action: z.enum(["resend_verification", "reset_password", "toggle_status", "add_note", "resend_sms_verification"]),
  note: z.string().optional(),
  reason: z.string().optional(),
});

export type UserActionRequest = z.infer<typeof userActionSchema>;
