/**
 * Email Service
 * High-level email sending functions
 * Provides clean API for sending transactional emails
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

class EmailService {
  private client: SendGridClient;
  private initialized = false;

  constructor() {
    this.client = SendGridClient.getInstance();
    // Lazy initialization - only initialize when actually sending emails
    // This prevents build-time errors when SENDGRID_API_KEY is not set
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      this.client.initialize();
      this.initialized = true;
    }
  }

  /**
   * Send email verification code
   */
  public async sendVerificationEmail(
    to: string,
    payload: EmailVerificationPayload
  ): Promise<EmailResult> {
    this.ensureInitialized();
    const htmlContent = createVerificationEmailTemplate(
      payload.userName || 'User',
      payload.verificationCode
    );

    const textContent = `Hello ${payload.userName || 'User'}! Your Tools Australia verification code is: ${payload.verificationCode}. This code expires in ${payload.expiryHours || 24} hours.`;

    return this.client.sendEmail({
      to,
      subject: 'Verify Your Email - Tools Australia',
      html: htmlContent,
      text: textContent,
    });
  }

  /**
   * Send password reset email
   */
  public async sendPasswordResetEmail(
    to: string,
    payload: PasswordResetPayload
  ): Promise<EmailResult> {
    this.ensureInitialized();
    const htmlContent = createPasswordResetEmailTemplate(
      payload.userName || 'User',
      payload.resetUrl
    );

    const textContent = `Hi ${payload.userName || 'User'},\n\nYou requested a password reset for your Tools Australia account.\nUse the following link to choose a new password (it expires in ${payload.expiryMinutes || 60} minutes):\n${payload.resetUrl}\n\nIf you didn't request this, you can ignore this email.`;

    return this.client.sendEmail({
      to,
      subject: 'Reset your password - Tools Australia',
      html: htmlContent,
      text: textContent,
    });
  }

  /**
   * Send contact form submission notification
   */
  public async sendContactSubmissionEmail(
    to: string,
    payload: ContactSubmissionPayload
  ): Promise<EmailResult> {
    this.ensureInitialized();
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
      to,
      subject: `New Contact Form Submission: ${payload.subject}`,
      html: htmlContent,
      text: textContent,
      replyTo: payload.email,
    });
  }

  /**
   * Send partner application notification
   */
  public async sendPartnerApplicationEmail(
    to: string,
    payload: PartnerApplicationPayload
  ): Promise<EmailResult> {
    this.ensureInitialized();
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
      to,
      subject: `New Partner Application: ${payload.businessName}`,
      html: htmlContent,
      text: textContent,
      replyTo: payload.email,
    });
  }

  /**
   * Send custom email (for flexibility)
   * Supports both HTML/text and SendGrid Dynamic Templates
   */
  public async sendCustomEmail(payload: CustomEmailPayload): Promise<EmailResult> {
    this.ensureInitialized();
    if (payload.templateId && payload.templateData) {
      return this.client.sendEmail({
        to: payload.to,
        subject: payload.subject,
        templateId: payload.templateId,
        dynamicTemplateData: payload.templateData,
        replyTo: payload.replyTo,
      });
    }

    return this.client.sendEmail({
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: payload.replyTo,
    });
  }
}

const emailService = new EmailService();
export default emailService;

