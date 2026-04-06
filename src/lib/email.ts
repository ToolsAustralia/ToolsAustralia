/**
 * @deprecated This file is superseded by the `src/lib/email/` module.
 * All sending functions here are no longer used. Utility functions have been
 * extracted to `src/lib/email/utils.ts`. This file is retained only as a
 * reference and will be removed in a future cleanup pass.
 */

import crypto from "crypto";
import { isDevelopment } from "@/lib/environment";
import {
  createVerificationEmailTemplate as verificationEmailHtml,
  createPasswordResetEmailTemplate as passwordResetEmailHtml,
  createContactSubmissionEmailTemplate as contactSubmissionEmailHtml,
  createPartnerApplicationEmailTemplate as partnerApplicationEmailHtml,
} from "./email/templates";

// Email verification rate limiting store (in production, use Redis or database)
const emailRateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Form submission rate limiting store
const formSubmissionRateLimitStore = new Map<string, { lastSubmissionTime: number }>();

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_ATTEMPTS_PER_HOUR = parseInt(process.env.EMAIL_VERIFICATION_RATE_LIMIT_PER_HOUR || "5");

// Form submission rate limiting: 1 email every 5 minutes
const FORM_SUBMISSION_RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailRateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  resetTime: number;
}

/**
 * Check rate limiting for email verification requests
 * Rate limiting is disabled in development environment for easier testing
 */
export function checkEmailRateLimit(email: string): EmailRateLimitResult {
  // Skip rate limiting in development
  if (isDevelopment()) {
    return {
      allowed: true,
      remainingAttempts: 999, // Unlimited in development
      resetTime: Date.now() + RATE_LIMIT_WINDOW,
    };
  }

  const now = Date.now();
  const key = `email_verification_${email}`;

  const current = emailRateLimitStore.get(key);

  if (!current || now > current.resetTime) {
    // Reset or initialize
    const resetTime = now + RATE_LIMIT_WINDOW;
    emailRateLimitStore.set(key, { count: 1, resetTime });
    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS_PER_HOUR - 1,
      resetTime,
    };
  }

  if (current.count >= MAX_ATTEMPTS_PER_HOUR) {
    return {
      allowed: false,
      remainingAttempts: 0,
      resetTime: current.resetTime,
    };
  }

  // Increment count
  current.count++;
  emailRateLimitStore.set(key, current);

  return {
    allowed: true,
    remainingAttempts: MAX_ATTEMPTS_PER_HOUR - current.count,
    resetTime: current.resetTime,
  };
}

/**
 * Generate a 6-character alphanumeric verification code
 */
export function generateEmailVerificationCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

/**
 * @deprecated SMTP transport has been removed. Use `emailService` from `@/lib/email/` instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createEmailTransporter(): any {
  return null;
}

/** @deprecated Inline HTML removed — delegates to `./email/templates` (cross-client hardened). */
function createVerificationEmailTemplate(userName: string, verificationCode: string): string {
  return verificationEmailHtml(userName, verificationCode);
}

/**
 * @deprecated Use `emailService.sendVerificationEmail()` from `@/lib/email/` instead.
 * This SMTP-based function is kept for backward compatibility during migration.
 */
export async function sendEmailVerificationCode(
  email: string,
  verificationCode: string,
  userName?: string
): Promise<EmailResult> {
  try {
    // console.log(`Email verification attempt for: ${email}`);
    // console.log(
    //   `SMTP Config - Host: ${process.env.SMTP_SERVER_HOST}, User: ${process.env.SMTP_SERVER_USER}, Port: ${process.env.SMTP_SERVER_PORT}`
    // );

    const transporter = createEmailTransporter();

    if (!transporter) {
      console.error("Email transporter not created - SMTP not configured");
      return {
        success: false,
        error: "Email service not configured",
      };
    }

    const htmlContent = createVerificationEmailTemplate(userName || "User", verificationCode);

    const mailOptions = {
      from: {
        name: "Tools Australia",
        address: process.env.SMTP_SERVER_USER!,
      },
      to: email,
      subject: "Verify Your Email - Tools Australia",
      html: htmlContent,
      text: `Hello ${
        userName || "User"
      }! Your Tools Australia verification code is: ${verificationCode}. This code expires in 24 hours.`,
    };

    // console.log(`Sending email with options:`, {
    //   from: mailOptions.from,
    //   to: mailOptions.to,
    //   subject: mailOptions.subject,
    // });

    const info = await transporter.sendMail(mailOptions);

    // console.log(`Email verification sent to ${email}: ${info.messageId}`);
    // console.log(`Email response:`, info);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Failed to send email verification:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}

/**
 * Generate email verification token (for future use with links)
 */
export function generateEmailVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * @deprecated Use `emailService.sendCustomEmail()` from `@/lib/email/` instead.
 * This SMTP-based function is kept for backward compatibility during migration.
 */
export async function sendCustomEmail({
  to,
  subject,
  html,
  text,
  fromName = "Tools Australia",
}: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  fromName?: string;
}): Promise<EmailResult> {
  try {
    const transporter = createEmailTransporter();

    if (!transporter) {
      console.error("Email transporter not created - SMTP not configured");
      return {
        success: false,
        error: "Email service not configured",
      };
    }

    const mailOptions = {
      from: {
        name: fromName,
        address: process.env.SMTP_SERVER_USER!,
      },
      to,
      subject,
      html,
      text: text || html?.replace(/<[^>]+>/g, "") || "",
    };

    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Failed to send custom email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}

/**
 * @deprecated Use `emailService.sendPasswordResetEmail()` from `@/lib/email/` instead.
 * This SMTP-based function is kept for backward compatibility during migration.
 */
export async function sendPasswordResetEmail({
  to,
  userName,
  resetUrl,
  resetCode: _resetCode,
}: {
  to: string;
  userName?: string;
  resetUrl: string;
  resetCode: string;
}): Promise<EmailResult> {
  const safeName = userName || "User";
  const html = passwordResetEmailHtml(safeName, resetUrl, 60);

  return sendCustomEmail({
    to,
    subject: "Reset your password - Tools Australia",
    html,
    text: `Hi ${safeName},\n\nYou requested a password reset for your Tools Australia account.\nUse the following link to choose a new password (it expires in 60 minutes):\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
  });
}

/**
 * Get verification expiry time
 * Defaults to 24 hours if EMAIL_VERIFICATION_EXPIRY_MINUTES is not set
 */
export function getEmailVerificationExpiry(): Date {
  const expiryMinutes = parseInt(process.env.EMAIL_VERIFICATION_EXPIRY_MINUTES || "1440"); // 24 hours = 1440 minutes
  return new Date(Date.now() + expiryMinutes * 60 * 1000);
}

/**
 * Check rate limiting for form submissions (contact form and partner applications)
 * Returns true if submission is allowed, false if rate limited
 * Rate limit: 1 submission per 5 minutes per identifier (email + IP)
 */
export function checkFormSubmissionRateLimit(identifier: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const key = `form_submission_${identifier}`;

  const current = formSubmissionRateLimitStore.get(key);

  if (!current) {
    // First submission - allow it and record the time
    formSubmissionRateLimitStore.set(key, { lastSubmissionTime: now });
    // console.log(`✅ Rate limit check passed for ${identifier} - first submission`);
    return { allowed: true };
  }

  const timeSinceLastSubmission = now - current.lastSubmissionTime;
  const _minutesSinceLastSubmission = Math.floor(timeSinceLastSubmission / (60 * 1000));

  if (timeSinceLastSubmission < FORM_SUBMISSION_RATE_LIMIT_WINDOW) {
    // Rate limited - calculate retry after time in seconds
    const retryAfter = Math.ceil((FORM_SUBMISSION_RATE_LIMIT_WINDOW - timeSinceLastSubmission) / 1000);
    const _retryAfterMinutes = Math.ceil(retryAfter / 60);
    // console.warn(
    //   `🚫 Rate limit BLOCKED for ${identifier} - Last submission was ${minutesSinceLastSubmission} minute(s) ago. Retry after ${retryAfterMinutes} minute(s) (${retryAfter} seconds)`
    // );
    return { allowed: false, retryAfter };
  }

  // Enough time has passed - update last submission time and allow
  formSubmissionRateLimitStore.set(key, { lastSubmissionTime: now });
  // console.log(
  //   `✅ Rate limit check passed for ${identifier} - ${minutesSinceLastSubmission} minute(s) since last submission`
  // );
  return { allowed: true };
}

/** @deprecated Delegates to `./email/templates` (cross-client hardened). */
function createContactSubmissionEmailTemplate(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  submittedAt: Date;
}): string {
  return contactSubmissionEmailHtml(data);
}
/** @deprecated Delegates to `./email/templates` (cross-client hardened). */
function createPartnerApplicationEmailTemplate(data: {
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  phone: string;
  abn?: string;
  acn?: string;
  goals?: string;
  submittedAt: Date;
}): string {
  return partnerApplicationEmailHtml(data);
}
/**
 * @deprecated Use `emailService.sendContactSubmissionEmail()` from `@/lib/email/` instead.
 * This SMTP-based function is kept for backward compatibility during migration.
 */
export async function sendContactSubmissionEmail(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  submittedAt: Date;
}): Promise<EmailResult> {
  try {
    const transporter = createEmailTransporter();

    if (!transporter) {
      console.error("Email transporter not created - SMTP not configured");
      return {
        success: false,
        error: "Email service not configured",
      };
    }

    const htmlContent = createContactSubmissionEmailTemplate(data);
    const recipientEmail = process.env.CONTACT_EMAIL || "support@toolsaustralia.com.au";

    const mailOptions = {
      from: {
        name: "Tools Australia Contact Form",
        address: process.env.SMTP_SERVER_USER!,
      },
      to: recipientEmail,
      replyTo: data.email,
      subject: `New Contact Form Submission: ${data.subject}`,
      html: htmlContent,
      text: `New Contact Form Submission\n\nName: ${data.firstName} ${data.lastName}\nEmail: ${data.email}\nPhone: ${
        data.phone
      }\nSubject: ${data.subject}\n\nMessage:\n${data.message}\n\nSubmitted at: ${new Date(
        data.submittedAt
      ).toLocaleString("en-AU")}`,
    };

    const info = await transporter.sendMail(mailOptions);

    // console.log(`Contact form submission email sent to ${recipientEmail}: ${info.messageId}`);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Failed to send contact submission email:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}

/**
 * @deprecated Use `emailService.sendPartnerApplicationEmail()` from `@/lib/email/` instead.
 * This SMTP-based function is kept for backward compatibility during migration.
 */
export async function sendPartnerApplicationEmail(data: {
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  phone: string;
  abn?: string;
  acn?: string;
  goals?: string;
  submittedAt: Date;
}): Promise<EmailResult> {
  try {
    const transporter = createEmailTransporter();

    if (!transporter) {
      console.error("Email transporter not created - SMTP not configured");
      return {
        success: false,
        error: "Email service not configured",
      };
    }

    const htmlContent = createPartnerApplicationEmailTemplate(data);
    const recipientEmail = process.env.CONTACT_EMAIL || "support@toolsaustralia.com.au";

    const mailOptions = {
      from: {
        name: "Tools Australia Partner Applications",
        address: process.env.SMTP_SERVER_USER!,
      },
      to: recipientEmail,
      replyTo: data.email,
      subject: `New Partner Application: ${data.businessName}`,
      html: htmlContent,
      text: `New Partner Application\n\nName: ${data.firstName} ${data.lastName}\nBusiness: ${
        data.businessName
      }\nEmail: ${data.email}\nPhone: ${data.phone}${data.abn ? `\nABN: ${data.abn}` : ""}${
        data.acn ? `\nACN: ${data.acn}` : ""
      }${data.goals ? `\n\nGoals:\n${data.goals}` : ""}\n\nSubmitted at: ${new Date(data.submittedAt).toLocaleString(
        "en-AU"
      )}`,
    };

    const info = await transporter.sendMail(mailOptions);

    // console.log(`Partner application email sent to ${recipientEmail}: ${info.messageId}`);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error("Failed to send partner application email:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}
