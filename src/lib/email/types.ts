/**
 * Email Service Type Definitions
 * Centralized types for email functionality
 */

import type { EmailCategory } from './sender-identities';

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: EmailErrorCode;
}

export enum EmailErrorCode {
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SENDGRID_ERROR = 'SENDGRID_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface EmailSender {
  email: string;
  name: string;
}

export interface EmailVerificationPayload {
  userName: string;
  verificationCode: string;
  expiryHours?: number;
}

export interface PasswordResetPayload {
  userName: string;
  resetUrl: string;
  resetCode?: string;
  expiryMinutes?: number;
}

export interface ContactSubmissionPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  submittedAt: string; // ISO date string
  /** Saved submission document id — used for unique subject / Message-ID (avoids Gmail threading) */
  submissionId: string;
}

export interface PartnerApplicationPayload {
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  phone: string;
  abn?: string;
  acn?: string;
  goals?: string;
  submittedAt: string; // ISO date string
}

export interface CustomEmailPayload {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
  replyTo?: string;
  category?: EmailCategory;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  resetTime: number;
}

export interface SendGridConfig {
  apiKey: string;
  enabled: boolean;
  retryAttempts: number;
  retryDelayMs: number;
}
