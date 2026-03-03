/**
 * Email Service
 * High-level email sending functions with per-email-type sender identities.
 * Each method resolves its own sender (from address, reply-to) via EmailCategory.
 */

import SendGridClient from './sendgrid-client';
import {
  EmailResult,
  EmailVerificationPayload,
  PasswordResetPayload,
  ContactSubmissionPayload,
  PartnerApplicationPayload,
  CustomEmailPayload,
} from './types';
import {
  createVerificationEmailTemplate,
  createPasswordResetEmailTemplate,
  createContactSubmissionEmailTemplate,
  createPartnerApplicationEmailTemplate,
} from './templates';
import { EmailCategory, getSenderIdentity } from './sender-identities';

const CONTACT_RECIPIENT = process.env.CONTACT_EMAIL || 'support@toolsaustralia.com.au';

class EmailService {
  private client: SendGridClient;
  private initialized = false;

  constructor() {
    this.client = SendGridClient.getInstance();
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      this.client.initialize();
      this.initialized = true;
    }
  }

  /**
   * Send email verification code.
   * Sender: verify-email@toolsaustralia.com.au
   */
  public async sendVerificationEmail(
    to: string,
    payload: EmailVerificationPayload
  ): Promise<EmailResult> {
    this.ensureInitialized();

    const sender = getSenderIdentity(EmailCategory.VERIFICATION);
    const htmlContent = createVerificationEmailTemplate(
      payload.userName || 'User',
      payload.verificationCode
    );
    const textContent = `Hello ${payload.userName || 'User'}! Your Tools Australia verification code is: ${payload.verificationCode}. This code expires in ${payload.expiryHours || 24} hours.`;

    return this.client.sendEmail({
      to,
      from: { email: sender.fromEmail, name: sender.fromName },
      subject: 'Verify Your Email - Tools Australia',
      html: htmlContent,
      text: textContent,
      replyTo: sender.replyTo,
    });
  }

  /**
   * Send password reset email.
   * Sender: reset-password@toolsaustralia.com.au
   */
  public async sendPasswordResetEmail(
    to: string,
    payload: PasswordResetPayload
  ): Promise<EmailResult> {
    this.ensureInitialized();

    const sender = getSenderIdentity(EmailCategory.PASSWORD_RESET);
    const expiryMinutes = payload.expiryMinutes ?? 1440;
    const htmlContent = createPasswordResetEmailTemplate(
      payload.userName || 'User',
      payload.resetUrl,
      expiryMinutes
    );
    const textContent = `Hi ${payload.userName || 'User'},\n\nYou requested a password reset for your Tools Australia account.\nUse the following link to choose a new password (it expires in ${expiryMinutes} minutes):\n${payload.resetUrl}\n\nIf you didn't request this, you can ignore this email.`;

    return this.client.sendEmail({
      to,
      from: { email: sender.fromEmail, name: sender.fromName },
      subject: 'Reset your password - Tools Australia',
      html: htmlContent,
      text: textContent,
      replyTo: sender.replyTo,
    });
  }

  /**
   * Send contact form submission notification to the support inbox.
   * Sender: no-reply@toolsaustralia.com.au | replyTo: submitter's email
   */
  public async sendContactSubmissionEmail(
    payload: ContactSubmissionPayload
  ): Promise<EmailResult> {
    this.ensureInitialized();

    const sender = getSenderIdentity(EmailCategory.CONTACT_NOTIFICATION);
    const htmlContent = createContactSubmissionEmailTemplate({
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.phone,
      subject: payload.subject,
      message: payload.message,
      submittedAt: new Date(payload.submittedAt),
    });
    const textContent = `New Contact Form Submission\n\nName: ${payload.firstName} ${payload.lastName}\nEmail: ${payload.email}\nPhone: ${payload.phone}\nSubject: ${payload.subject}\n\nMessage:\n${payload.message}\n\nSubmitted at: ${new Date(payload.submittedAt).toLocaleString('en-AU')}`;

    return this.client.sendEmail({
      to: CONTACT_RECIPIENT,
      from: { email: sender.fromEmail, name: sender.fromName },
      subject: `New Contact Form Submission: ${payload.subject}`,
      html: htmlContent,
      text: textContent,
      replyTo: payload.email,
    });
  }

  /**
   * Send partner application notification to the support inbox.
   * Sender: no-reply@toolsaustralia.com.au | replyTo: submitter's email
   */
  public async sendPartnerApplicationEmail(
    payload: PartnerApplicationPayload
  ): Promise<EmailResult> {
    this.ensureInitialized();

    const sender = getSenderIdentity(EmailCategory.PARTNER_NOTIFICATION);
    const htmlContent = createPartnerApplicationEmailTemplate({
      firstName: payload.firstName,
      lastName: payload.lastName,
      businessName: payload.businessName,
      email: payload.email,
      phone: payload.phone,
      abn: payload.abn,
      acn: payload.acn,
      goals: payload.goals,
      submittedAt: new Date(payload.submittedAt),
    });
    const textContent = `New Partner Application\n\nName: ${payload.firstName} ${payload.lastName}\nBusiness: ${payload.businessName}\nEmail: ${payload.email}\nPhone: ${payload.phone}${payload.abn ? `\nABN: ${payload.abn}` : ''}${payload.acn ? `\nACN: ${payload.acn}` : ''}${payload.goals ? `\n\nGoals:\n${payload.goals}` : ''}\n\nSubmitted at: ${new Date(payload.submittedAt).toLocaleString('en-AU')}`;

    return this.client.sendEmail({
      to: CONTACT_RECIPIENT,
      from: { email: sender.fromEmail, name: sender.fromName },
      subject: `New Partner Application: ${payload.businessName}`,
      html: htmlContent,
      text: textContent,
      replyTo: payload.email,
    });
  }

  /**
   * Send a custom email with optional category-based sender resolution.
   * Falls back to TRANSACTIONAL sender if no category is provided.
   * Supports both HTML/text and SendGrid Dynamic Templates.
   */
  public async sendCustomEmail(payload: CustomEmailPayload): Promise<EmailResult> {
    this.ensureInitialized();

    const sender = getSenderIdentity(payload.category ?? EmailCategory.TRANSACTIONAL);
    const replyTo = payload.replyTo ?? sender.replyTo;

    if (payload.templateId && payload.templateData) {
      return this.client.sendEmail({
        to: payload.to,
        from: { email: sender.fromEmail, name: sender.fromName },
        subject: payload.subject,
        templateId: payload.templateId,
        dynamicTemplateData: payload.templateData,
        replyTo,
      });
    }

    return this.client.sendEmail({
      to: payload.to,
      from: { email: sender.fromEmail, name: sender.fromName },
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo,
    });
  }
}

const emailService = new EmailService();
export default emailService;
