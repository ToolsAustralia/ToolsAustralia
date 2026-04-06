/**
 * Email Templates
 * Local HTML templates for email sending
 * These templates can be migrated to SendGrid Dynamic Templates later if desired
 */

import { escapeHtml, escapeHtmlPreserveNewlines } from './utils';
import {
  PRIMARY_BUTTON_STYLE,
  MAILTO_LINK_STYLE,
  CODE_BOX_OUTER_STYLE,
  CODE_LABEL_STYLE,
  CODE_TEXT_STYLE,
  CALLOUT_AMBER_BOX_STYLE,
  CALLOUT_AMBER_TITLE_STYLE,
  CALLOUT_AMBER_UL_STYLE,
  CALLOUT_AMBER_LI_STYLE,
  CALLOUT_AMBER_PASSWORD_RESET_STYLE,
  HEADER_TITLE_INLINE_STYLE,
  LOGO_IMG_TAG_SUFFIX,
  REPLY_BODY_WRAPPER_STYLE,
  NOTIFICATION_FIELD_ROW_TD_STYLE,
  NOTIFICATION_FIELD_LABEL_STYLE,
  NOTIFICATION_FIELD_VALUE_STYLE,
  NOTIFICATION_MESSAGE_BOX_STYLE,
  NOTIFICATION_MESSAGE_LABEL_STYLE,
  NOTIFICATION_MESSAGE_CONTENT_STYLE,
  NOTIFICATION_TIMESTAMP_STYLE,
} from './template-styles';

/**
 * Get the base URL for the application
 */
function getBaseUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return appUrl.replace(/\/$/, ''); // Remove trailing slash
}

/** Support email for customer replies - used in template footers */
const SUPPORT_EMAIL = 'support@toolsaustralia.com.au';

/**
 * Create HTML email template for verification code
 */
export function createVerificationEmailTemplate(userName: string, verificationCode: string): string {
  const baseUrl = getBaseUrl();
  const safeUserName = escapeHtml(userName);
  const safeCode = escapeHtml(verificationCode);
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification - ${safeCode}</title>
        <style>
            body {
                font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #1f2937;
                margin: 0;
                padding: 0;
                background-color: #f8fafc;
            }
            .email-wrapper {
                width: 100%;
                background-color: #f8fafc;
                padding: 20px 0;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 16px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                overflow: hidden;
                border: 1px solid #e5e7eb;
            }
            .header {
                background: linear-gradient(135deg, #0f172a 0%, #111827 30%, #1f2937 60%, #0b1220 100%);
                padding: 40px 30px;
                text-align: center;
                position: relative;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(0, 0, 0, 0.5);
            }
            .logo-container {
                position: relative;
                z-index: 1;
            }
            .logo {
                max-width: 200px;
                height: auto;
                margin-bottom: 16px;
            }
            .header-title {
                color: white;
                font-size: 18px;
                font-weight: 600;
                margin: 0;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .content {
                padding: 40px 30px;
            }
            .greeting {
                font-size: 24px;
                font-weight: 700;
                color: #1f2937;
                margin: 0 0 20px 0;
            }
            .intro-text {
                font-size: 16px;
                color: #4b5563;
                margin: 0 0 30px 0;
                line-height: 1.7;
            }
            .verification-section {
                background: linear-gradient(135deg, #fef2f2 0%, #fef7f7 100%);
                border: 2px solid #fecaca;
                border-radius: 12px;
                padding: 30px;
                text-align: center;
                margin: 30px 0;
                position: relative;
            }
            .verification-label {
                font-size: 14px;
                font-weight: 600;
                color: #dc2626;
                text-transform: uppercase;
                letter-spacing: 1px;
                margin: 0 0 15px 0;
            }
            .verification-code {
                font-size: 36px;
                font-weight: 800;
                color: #dc2626;
                letter-spacing: 8px;
                font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
                margin: 0;
                text-shadow: 0 2px 4px rgba(220, 38, 38, 0.1);
            }
            .instructions {
                font-size: 16px;
                color: #4b5563;
                margin: 30px 0;
                line-height: 1.6;
            }
            .security-notice {
                background-color: #fffbeb;
                border-left: 4px solid #f59e0b;
                border-radius: 8px;
                padding: 20px;
                margin: 30px 0;
            }
            .security-notice h3 {
                color: #92400e;
                font-size: 16px;
                font-weight: 700;
                margin: 0 0 12px 0;
            }
            .security-notice ul {
                margin: 0;
                padding-left: 20px;
                color: #92400e;
            }
            .security-notice li {
                margin: 8px 0;
                font-size: 14px;
            }
            .support-text {
                font-size: 15px;
                color: #6b7280;
                margin: 30px 0 20px 0;
                line-height: 1.6;
            }
            .signature {
                margin: 30px 0 0 0;
            }
            .signature-text {
                font-size: 15px;
                color: #4b5563;
                margin: 0;
            }
            .team-name {
                font-weight: 700;
                color: #dc2626;
            }
            .footer {
                background-color: #f9fafb;
                padding: 30px;
                text-align: center;
                border-top: 1px solid #e5e7eb;
            }
            .footer-text {
                color: #6b7280;
                font-size: 13px;
                margin: 0 0 8px 0;
                line-height: 1.5;
            }
            .footer-logo {
                max-width: 120px;
                height: auto;
                margin: 20px 0;
                opacity: 0.7;
            }
            @media (max-width: 600px) {
                .container {
                    margin: 10px;
                    border-radius: 12px;
                }
                .header, .content, .footer {
                    padding: 30px 20px;
                }
                .verification-code {
                    font-size: 28px;
                    letter-spacing: 6px;
                }
                .greeting {
                    font-size: 20px;
                }
            }
        </style>
    </head>
    <body>
        <div class="email-wrapper">
            <div class="container">
                <div class="header">
                    <div class="logo-container">
                        <img src="${baseUrl}/images/Tools%20Australia%20Logo/White-Text%20Logo.png" alt="Tools Australia" class="logo"${LOGO_IMG_TAG_SUFFIX} />
                        <h1 class="header-title" style="${HEADER_TITLE_INLINE_STYLE}">Email Verification: ${safeCode}</h1>
                    </div>
                </div>
                
                <div class="content">
                    <h2 class="greeting">Hello ${safeUserName}!</h2>
                    
                    <p class="intro-text">
                        Thank you for joining Tools Australia. To complete your account setup and ensure the security of your account, please verify your email address using the verification code below.
                    </p>
                    
                    <div class="verification-section" style="${CODE_BOX_OUTER_STYLE}">
                        <p class="verification-label" style="${CODE_LABEL_STYLE}">Your Verification Code</p>
                        <div class="verification-code" style="${CODE_TEXT_STYLE}">${safeCode}</div>
                    </div>
                    
                    <p class="instructions">
                        Enter this code in the verification form to activate your account and start enjoying all the benefits of your Tools Australia membership.
                    </p>
                    
                    <div class="security-notice" style="${CALLOUT_AMBER_BOX_STYLE}">
                        <h3 style="${CALLOUT_AMBER_TITLE_STYLE}">Security Information</h3>
                        <ul style="${CALLOUT_AMBER_UL_STYLE}">
                            <li style="${CALLOUT_AMBER_LI_STYLE}">This verification code expires in 24 hours</li>
                            <li style="${CALLOUT_AMBER_LI_STYLE}">Never share this code with anyone</li>
                            <li style="${CALLOUT_AMBER_LI_STYLE}">If you didn't request this verification, please ignore this email</li>
                            <li style="${CALLOUT_AMBER_LI_STYLE}">For security reasons, this code can only be used once</li>
                        </ul>
                    </div>
                    
                    <p class="support-text">
                        If you have any questions or need assistance, our support team is here to help. You can reach us through your account dashboard or by contacting <a href="mailto:${SUPPORT_EMAIL}" style="${MAILTO_LINK_STYLE}">${SUPPORT_EMAIL}</a>.
                    </p>
                    
                    <div class="signature">
                        <p class="signature-text">
                            Best regards,<br>
                            <span class="team-name">The Tools Australia Team</span>
                        </p>
                    </div>
                </div>
                
                <div class="footer">
                    <p class="footer-text">© 2025 Tools Australia. All rights reserved.</p>
                    <p class="footer-text">Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="${MAILTO_LINK_STYLE}">${SUPPORT_EMAIL}</a></p>
                    <p class="footer-text">Tools Australia - Your trusted partner for quality tools and equipment.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
}

/**
 * Create HTML email template for password reset
 */
export function createPasswordResetEmailTemplate(
  userName: string,
  resetUrl: string,
  expiryMinutes: number = 1440
): string {
  const baseUrl = getBaseUrl();
  const safeName = escapeHtml(userName || 'User');
  const expiryText = expiryMinutes >= 60 ? `${expiryMinutes / 60} hour${expiryMinutes > 60 ? 's' : ''}` : `${expiryMinutes} minutes`;
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset</title>
        <style>
            body {
                font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #1f2937;
                margin: 0;
                padding: 0;
                background-color: #f8fafc;
            }
            .email-wrapper {
                width: 100%;
                background-color: #f8fafc;
                padding: 20px 0;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 16px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                overflow: hidden;
                border: 1px solid #e5e7eb;
            }
            .header {
                background: linear-gradient(135deg, #0f172a 0%, #111827 30%, #1f2937 60%, #0b1220 100%);
                padding: 40px 30px;
                text-align: center;
                position: relative;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(0, 0, 0, 0.5);
            }
            .logo-container {
                position: relative;
                z-index: 1;
            }
            .logo {
                max-width: 200px;
                height: auto;
                margin-bottom: 16px;
            }
            .header-title {
                color: white;
                font-size: 18px;
                font-weight: 600;
                margin: 0;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .content {
                padding: 40px 30px;
            }
            .greeting {
                font-size: 24px;
                font-weight: 700;
                color: #1f2937;
                margin: 0 0 20px 0;
            }
            .intro-text {
                font-size: 16px;
                color: #4b5563;
                margin: 0 0 20px 0;
                line-height: 1.7;
            }
            .reset-button-wrapper {
                text-align: center;
                margin: 20px 0 18px;
            }
            .reset-button {
                display: inline-block;
                background: linear-gradient(135deg, #ee0000, #ff4444);
                color: #fff;
                text-decoration: none;
                padding: 12px 24px;
                border-radius: 10px;
                font-weight: 600;
                font-size: 14px;
                box-shadow: 0 10px 20px rgba(248, 113, 113, 0.3);
            }
            .security-notice {
                background-color: #fffbeb;
                border-left: 4px solid #f59e0b;
                border-radius: 8px;
                padding: 18px 18px 16px;
                margin: 20px 0 0 0;
            }
            .security-notice h3 {
                color: #92400e;
                font-size: 16px;
                font-weight: 700;
                margin: 0 0 10px 0;
            }
            .security-notice ul {
                margin: 0;
                padding-left: 20px;
                color: #92400e;
            }
            .security-notice li {
                margin: 6px 0;
                font-size: 14px;
            }
            .support-text {
                font-size: 15px;
                color: #6b7280;
                margin: 26px 0 18px 0;
                line-height: 1.6;
            }
            .signature {
                margin: 20px 0 0 0;
            }
            .signature-text {
                font-size: 15px;
                color: #4b5563;
                margin: 0;
            }
            .team-name {
                font-weight: 700;
                color: #dc2626;
            }
            .footer {
                background-color: #f9fafb;
                padding: 30px;
                text-align: center;
                border-top: 1px solid #e5e7eb;
            }
            .footer-text {
                color: #6b7280;
                font-size: 13px;
                margin: 0 0 8px 0;
                line-height: 1.5;
            }
            .footer-logo {
                max-width: 120px;
                height: auto;
                margin: 20px 0;
                opacity: 0.7;
            }
            @media (max-width: 600px) {
                .container {
                    margin: 10px;
                    border-radius: 12px;
                }
                .header, .content, .footer {
                    padding: 30px 20px;
                }
                .reset-code {
                    font-size: 26px;
                    letter-spacing: 5px;
                }
                .greeting {
                    font-size: 20px;
                }
            }
        </style>
    </head>
    <body>
        <div class="email-wrapper">
            <div class="container">
                <div class="header">
                    <div class="logo-container">
                        <img src="${baseUrl}/images/Tools%20Australia%20Logo/White-Text%20Logo.png" alt="Tools Australia" class="logo"${LOGO_IMG_TAG_SUFFIX} />
                        <h1 class="header-title" style="${HEADER_TITLE_INLINE_STYLE}">Password Reset</h1>
                    </div>
                </div>
                
                <div class="content">
                    <h2 class="greeting">Hi ${safeName},</h2>
                    
                    <p class="intro-text">
                        We received a request to reset the password for your Tools Australia account.
                        Click the button below to securely choose a new password. This link expires in ${expiryText}.
                    </p>

                    <div class="reset-button-wrapper">
                      <a
                        href="${resetUrl}"
                        class="reset-button"
                        style="${PRIMARY_BUTTON_STYLE}"
                      >
                        Reset Password
                      </a>
                    </div>

                    <div class="security-notice" style="${CALLOUT_AMBER_PASSWORD_RESET_STYLE}">
                        <h3 style="${CALLOUT_AMBER_TITLE_STYLE}">Security Information</h3>
                        <ul style="${CALLOUT_AMBER_UL_STYLE}">
                            <li style="margin:6px 0;font-size:14px;color:#92400e;">This reset link expires in ${expiryText}.</li>
                            <li style="margin:6px 0;font-size:14px;color:#92400e;">Never share this link with anyone.</li>
                            <li style="margin:6px 0;font-size:14px;color:#92400e;">If you didn't request a password reset, you can safely ignore this email.</li>
                        </ul>
                    </div>

                    <p class="support-text">
                        If you have any questions or need help, our support team is here for you. 
                        You can reach us through your account dashboard or by replying to this email.
                    </p>

                    <div class="signature">
                        <p class="signature-text">
                            Best regards,<br>
                            <span class="team-name">The Tools Australia Team</span>
                        </p>
                    </div>
                </div>
                
                <div class="footer">
                    <p class="footer-text">© 2025 Tools Australia. All rights reserved.</p>
                    <p class="footer-text">Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="${MAILTO_LINK_STYLE}">${SUPPORT_EMAIL}</a></p>
                    <p class="footer-text">Tools Australia - Your trusted partner for quality tools and equipment.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
}

/**
 * Create HTML email template for contact form submission
 */
export function createContactSubmissionEmailTemplate(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  submittedAt: Date;
}): string {
  const submittedDate = new Date(data.submittedAt).toLocaleString('en-AU', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone: 'Australia/Sydney',
  });
  const safeFirstName = escapeHtml(data.firstName);
  const safeLastName = escapeHtml(data.lastName);
  const safeEmail = escapeHtml(data.email);
  const safePhone = escapeHtml(data.phone);
  const safeSubject = escapeHtml(data.subject);
  const safeMessage = escapeHtmlPreserveNewlines(data.message);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Contact Form Submission</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #1f2937;
                margin: 0;
                padding: 0;
                background-color: #f8fafc;
            }
            .email-wrapper { width: 100%; background-color: #f8fafc; padding: 20px 0; }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 16px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                overflow: hidden;
                border: 1px solid #e5e7eb;
            }
            .header {
                background: linear-gradient(135deg, #0f172a 0%, #111827 30%, #1f2937 60%, #0b1220 100%);
                padding: 40px 30px;
                text-align: center;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(0, 0, 0, 0.5);
            }
            .logo { max-width: 200px; height: auto; margin-bottom: 16px; }
            .header-title { color: white; font-size: 18px; font-weight: 600; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
            .content { padding: 40px 30px; }
            .intro { font-size: 16px; color: #4b5563; margin-bottom: 30px; line-height: 1.7; }
            .message-section { background-color: #f9fafb; border-left: 4px solid #dc2626; padding: 20px; border-radius: 8px; margin: 30px 0; }
            .message-label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
            .message-content { font-size: 15px; color: #1f2937; line-height: 1.8; white-space: pre-wrap; }
            .timestamp { font-size: 13px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
            .footer { background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb; }
            .footer-text { color: #6b7280; font-size: 13px; margin: 0 0 8px 0; line-height: 1.5; }
            @media (max-width: 600px) { .container { margin: 10px; border-radius: 12px; } .header, .content, .footer { padding: 30px 20px; } .header-title { font-size: 16px; } }
        </style>
    </head>
    <body>
        <div class="email-wrapper">
            <div class="container">
                <div class="header">
                    <img src="${getBaseUrl()}/images/Tools%20Australia%20Logo/White-Text%20Logo.png" alt="Tools Australia" class="logo"${LOGO_IMG_TAG_SUFFIX} />
                    <h1 class="header-title" style="${HEADER_TITLE_INLINE_STYLE}">New Contact Form Submission</h1>
                </div>
            
            <div class="content">
                <p class="intro">You have received a new contact form submission from the Tools Australia website.</p>
                
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:30px;">
                    <tr><td style="${NOTIFICATION_FIELD_ROW_TD_STYLE}">
                        <div style="${NOTIFICATION_FIELD_LABEL_STYLE}">Full Name</div>
                        <div style="${NOTIFICATION_FIELD_VALUE_STYLE}">${safeFirstName} ${safeLastName}</div>
                    </td></tr>
                    <tr><td style="${NOTIFICATION_FIELD_ROW_TD_STYLE}">
                        <div style="${NOTIFICATION_FIELD_LABEL_STYLE}">Email Address</div>
                        <div style="${NOTIFICATION_FIELD_VALUE_STYLE}"><a href="mailto:${safeEmail}" style="${MAILTO_LINK_STYLE}">${safeEmail}</a></div>
                    </td></tr>
                    <tr><td style="${NOTIFICATION_FIELD_ROW_TD_STYLE}">
                        <div style="${NOTIFICATION_FIELD_LABEL_STYLE}">Phone Number</div>
                        <div style="${NOTIFICATION_FIELD_VALUE_STYLE}"><a href="tel:${safePhone}" style="${MAILTO_LINK_STYLE}">${safePhone}</a></div>
                    </td></tr>
                    <tr><td style="padding:0;">
                        <div style="${NOTIFICATION_FIELD_LABEL_STYLE}">Subject</div>
                        <div style="${NOTIFICATION_FIELD_VALUE_STYLE}">${safeSubject}</div>
                    </td></tr>
                </table>
                
                <div class="message-section" style="${NOTIFICATION_MESSAGE_BOX_STYLE}">
                    <div class="message-label" style="${NOTIFICATION_MESSAGE_LABEL_STYLE}">Message</div>
                    <div class="message-content" style="${NOTIFICATION_MESSAGE_CONTENT_STYLE}">${safeMessage}</div>
                </div>
                
                <div class="timestamp" style="${NOTIFICATION_TIMESTAMP_STYLE}">
                    <strong>Submitted:</strong> ${submittedDate}
                </div>
            </div>
            
            <div class="footer">
                <p class="footer-text">This is an automated notification from Tools Australia.</p>
                <p class="footer-text">Please reply directly to this email to respond to the customer.</p>
                <p class="footer-text">Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="${MAILTO_LINK_STYLE}">${SUPPORT_EMAIL}</a></p>
            </div>
        </div>
    </div>
    </body>
    </html>
  `;
}

/**
 * Create HTML email template for partner application
 */
export function createPartnerApplicationEmailTemplate(data: {
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
  const submittedDate = new Date(data.submittedAt).toLocaleString('en-AU', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone: 'Australia/Sydney',
  });
  const safeFirstName = escapeHtml(data.firstName);
  const safeLastName = escapeHtml(data.lastName);
  const safeBusinessName = escapeHtml(data.businessName);
  const safeEmail = escapeHtml(data.email);
  const safePhone = escapeHtml(data.phone);
  const safeAbn = escapeHtml(data.abn ?? '');
  const safeAcn = escapeHtml(data.acn ?? '');
  const safeGoals = escapeHtmlPreserveNewlines(data.goals ?? '');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Partner Application</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #1f2937;
                margin: 0;
                padding: 0;
                background-color: #f8fafc;
            }
            .email-wrapper { width: 100%; background-color: #f8fafc; padding: 20px 0; }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 16px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                overflow: hidden;
                border: 1px solid #e5e7eb;
            }
            .header {
                background: linear-gradient(135deg, #0f172a 0%, #111827 30%, #1f2937 60%, #0b1220 100%);
                padding: 40px 30px;
                text-align: center;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(0, 0, 0, 0.5);
            }
            .logo { max-width: 200px; height: auto; margin-bottom: 16px; }
            .header-title { color: white; font-size: 18px; font-weight: 600; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
            .content { padding: 40px 30px; }
            .intro { font-size: 16px; color: #4b5563; margin-bottom: 30px; line-height: 1.7; }
            .goals-section { background-color: #f9fafb; border-left: 4px solid #dc2626; padding: 20px; border-radius: 8px; margin: 30px 0; }
            .goals-label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
            .goals-content { font-size: 15px; color: #1f2937; line-height: 1.8; white-space: pre-wrap; }
            .timestamp { font-size: 13px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
            .footer { background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb; }
            .footer-text { color: #6b7280; font-size: 13px; margin: 0 0 8px 0; line-height: 1.5; }
            @media (max-width: 600px) { .container { margin: 10px; border-radius: 12px; } .header, .content, .footer { padding: 30px 20px; } .header-title { font-size: 16px; } }
        </style>
    </head>
    <body>
        <div class="email-wrapper">
            <div class="container">
                <div class="header">
                    <img src="${getBaseUrl()}/images/Tools%20Australia%20Logo/White-Text%20Logo.png" alt="Tools Australia" class="logo"${LOGO_IMG_TAG_SUFFIX} />
                    <h1 class="header-title" style="${HEADER_TITLE_INLINE_STYLE}">New Partner Application</h1>
                </div>
            
            <div class="content">
                <p class="intro">You have received a new partner application from the Tools Australia website.</p>
                
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:30px;">
                    <tr><td style="${NOTIFICATION_FIELD_ROW_TD_STYLE}">
                        <div style="${NOTIFICATION_FIELD_LABEL_STYLE}">Contact Name</div>
                        <div style="${NOTIFICATION_FIELD_VALUE_STYLE}">${safeFirstName} ${safeLastName}</div>
                    </td></tr>
                    <tr><td style="${NOTIFICATION_FIELD_ROW_TD_STYLE}">
                        <div style="${NOTIFICATION_FIELD_LABEL_STYLE}">Email Address</div>
                        <div style="${NOTIFICATION_FIELD_VALUE_STYLE}"><a href="mailto:${safeEmail}" style="${MAILTO_LINK_STYLE}">${safeEmail}</a></div>
                    </td></tr>
                    <tr><td style="${NOTIFICATION_FIELD_ROW_TD_STYLE}">
                        <div style="${NOTIFICATION_FIELD_LABEL_STYLE}">Phone Number</div>
                        <div style="${NOTIFICATION_FIELD_VALUE_STYLE}"><a href="tel:${safePhone}" style="${MAILTO_LINK_STYLE}">${safePhone}</a></div>
                    </td></tr>
                    <tr><td style="${data.abn || data.acn ? NOTIFICATION_FIELD_ROW_TD_STYLE : 'padding:0;'}">
                        <div style="${NOTIFICATION_FIELD_LABEL_STYLE}">Business Name</div>
                        <div style="${NOTIFICATION_FIELD_VALUE_STYLE}">${safeBusinessName}</div>
                    </td></tr>
                    ${data.abn ? `
                    <tr><td style="${data.acn ? NOTIFICATION_FIELD_ROW_TD_STYLE : 'padding:0;'}">
                        <div style="${NOTIFICATION_FIELD_LABEL_STYLE}">ABN</div>
                        <div style="${NOTIFICATION_FIELD_VALUE_STYLE}">${safeAbn}</div>
                    </td></tr>
                    ` : ''}
                    ${data.acn ? `
                    <tr><td style="padding:0;">
                        <div style="${NOTIFICATION_FIELD_LABEL_STYLE}">ACN</div>
                        <div style="${NOTIFICATION_FIELD_VALUE_STYLE}">${safeAcn}</div>
                    </td></tr>
                    ` : ''}
                </table>
                
                ${data.goals ? `
                <div class="goals-section" style="${NOTIFICATION_MESSAGE_BOX_STYLE}">
                    <div class="goals-label" style="${NOTIFICATION_MESSAGE_LABEL_STYLE}">Partnership Goals</div>
                    <div class="goals-content" style="${NOTIFICATION_MESSAGE_CONTENT_STYLE}">${safeGoals}</div>
                </div>
                ` : ''}
                
                <div class="timestamp" style="${NOTIFICATION_TIMESTAMP_STYLE}">
                    <strong>Submitted:</strong> ${submittedDate}
                </div>
            </div>
            
            <div class="footer">
                <p class="footer-text">This is an automated notification from Tools Australia.</p>
                <p class="footer-text">Please reply directly to this email to respond to the applicant.</p>
                <p class="footer-text">Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="${MAILTO_LINK_STYLE}">${SUPPORT_EMAIL}</a></p>
            </div>
        </div>
    </div>
    </body>
    </html>
  `;
}

/**
 * Create HTML email template for login code (passwordless sign-in)
 */
export function createLoginCodeEmailTemplate(userName: string, loginCode: string, expiryMinutes: number = 15): string {
  const baseUrl = getBaseUrl();
  const safeUserName = escapeHtml(userName);
  const safeCode = escapeHtml(loginCode);
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login Code: ${safeCode}</title>
        <style>
            body {
                font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #1f2937;
                margin: 0;
                padding: 0;
                background-color: #f8fafc;
            }
            .email-wrapper {
                width: 100%;
                background-color: #f8fafc;
                padding: 20px 0;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 16px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                overflow: hidden;
                border: 1px solid #e5e7eb;
            }
            .header {
                background: linear-gradient(135deg, #0f172a 0%, #111827 30%, #1f2937 60%, #0b1220 100%);
                padding: 40px 30px;
                text-align: center;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(0, 0, 0, 0.5);
            }
            .logo { max-width: 200px; height: auto; margin-bottom: 16px; }
            .header-title { color: white; font-size: 18px; font-weight: 600; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
            .content { padding: 40px 30px; }
            .greeting { font-size: 24px; font-weight: 700; color: #1f2937; margin: 0 0 20px 0; }
            .intro-text { font-size: 16px; color: #4b5563; margin: 0 0 30px 0; line-height: 1.7; }
            .code-section {
                background: linear-gradient(135deg, #fef2f2 0%, #fef7f7 100%);
                border: 2px solid #fecaca;
                border-radius: 12px;
                padding: 30px;
                text-align: center;
                margin: 30px 0;
                position: relative;
            }
            .code-label { font-size: 14px; font-weight: 600; color: #dc2626; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 15px 0; }
            .login-code { font-size: 36px; font-weight: 800; color: #dc2626; letter-spacing: 8px; font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace; margin: 0; }
            .security-notice {
                background-color: #fffbeb;
                border-left: 4px solid #f59e0b;
                border-radius: 8px;
                padding: 20px;
                margin: 30px 0;
            }
            .security-notice h3 { color: #92400e; font-size: 16px; font-weight: 700; margin: 0 0 12px 0; }
            .security-notice ul { margin: 0; padding-left: 20px; color: #92400e; }
            .security-notice li { margin: 8px 0; font-size: 14px; }
            .signature { margin: 30px 0 0 0; }
            .signature-text { font-size: 15px; color: #4b5563; margin: 0; }
            .team-name { font-weight: 700; color: #dc2626; }
            .footer { background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb; }
            .footer-text { color: #6b7280; font-size: 13px; margin: 0 0 8px 0; line-height: 1.5; }
            @media (max-width: 600px) {
                .container { margin: 10px; border-radius: 12px; }
                .header, .content, .footer { padding: 30px 20px; }
                .login-code { font-size: 28px; letter-spacing: 6px; }
                .greeting { font-size: 20px; }
            }
        </style>
    </head>
    <body>
        <div class="email-wrapper">
            <div class="container">
                <div class="header">
                    <div>
                        <img src="${baseUrl}/images/Tools%20Australia%20Logo/White-Text%20Logo.png" alt="Tools Australia" class="logo"${LOGO_IMG_TAG_SUFFIX} />
                        <h1 class="header-title" style="${HEADER_TITLE_INLINE_STYLE}">Login Code: ${safeCode}</h1>
                    </div>
                </div>
                <div class="content">
                    <h2 class="greeting">Hi ${safeUserName},</h2>
                    <p class="intro-text">
                        You requested a one-time code to sign in to your Tools Australia account. Enter the code below to continue.
                    </p>
                    <div class="code-section" style="${CODE_BOX_OUTER_STYLE}">
                        <p class="code-label" style="${CODE_LABEL_STYLE}">Your Sign-In Code</p>
                        <div class="login-code" style="${CODE_TEXT_STYLE}">${safeCode}</div>
                    </div>
                    <div class="security-notice" style="${CALLOUT_AMBER_BOX_STYLE}">
                        <h3 style="${CALLOUT_AMBER_TITLE_STYLE}">Security Information</h3>
                        <ul style="${CALLOUT_AMBER_UL_STYLE}">
                            <li style="${CALLOUT_AMBER_LI_STYLE}">This code expires in ${expiryMinutes} minutes</li>
                            <li style="${CALLOUT_AMBER_LI_STYLE}">Never share this code with anyone</li>
                            <li style="${CALLOUT_AMBER_LI_STYLE}">If you didn't request this code, you can safely ignore this email</li>
                            <li style="${CALLOUT_AMBER_LI_STYLE}">This code can only be used once</li>
                        </ul>
                    </div>
                    <div class="signature">
                        <p class="signature-text">
                            Best regards,<br>
                            <span class="team-name">The Tools Australia Team</span>
                        </p>
                    </div>
                </div>
                <div class="footer">
                    <p class="footer-text">&copy; 2025 Tools Australia. All rights reserved.</p>
                    <p class="footer-text">Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="${MAILTO_LINK_STYLE}">${SUPPORT_EMAIL}</a></p>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
}

/**
 * Create HTML email template for admin replies to contact/partner submissions
 */
export function createAdminReplyEmailTemplate(
  submitterName: string,
  adminMessage: string,
  submissionType: 'contact' | 'partner' = 'contact'
): string {
  const baseUrl = getBaseUrl();
  const safeName = escapeHtml(submitterName);
  // adminMessage may be HTML from RichTextEditor; use as-is (Tiptap output is safe)
  const messageHtml =
    typeof adminMessage === 'string' && adminMessage.includes('<') && adminMessage.includes('>')
      ? adminMessage
      : escapeHtmlPreserveNewlines(adminMessage);
  const typeLabel = submissionType === 'partner' ? 'Partner Application' : 'Contact Inquiry';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tools Australia</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #1f2937;
                margin: 0;
                padding: 0;
                background-color: #f8fafc;
            }
            .email-wrapper { width: 100%; background-color: #f8fafc; padding: 20px 0; }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 16px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                overflow: hidden;
                border: 1px solid #e5e7eb;
            }
            .header {
                background: linear-gradient(135deg, #0f172a 0%, #111827 30%, #1f2937 60%, #0b1220 100%);
                padding: 40px 30px;
                text-align: center;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1px 0 rgba(0, 0, 0, 0.5);
            }
            .logo { max-width: 200px; height: auto; margin-bottom: 16px; }
            .header-title { color: white; font-size: 18px; font-weight: 600; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
            .content { padding: 40px 30px; }
            .greeting { font-size: 22px; font-weight: 700; color: #1f2937; margin: 0 0 24px 0; }
            .reply-body { font-size: 16px; color: #1f2937; line-height: 1.8; margin: 0 0 30px 0; }
            .reply-body p { margin: 0 0 0.5em 0; }
            .reply-body p:last-child { margin-bottom: 0; }
            .signature { margin: 30px 0 0 0; }
            .signature-text { font-size: 15px; color: #4b5563; margin: 0; }
            .team-name { font-weight: 700; color: #dc2626; }
            .footer { background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb; }
            .footer-text { color: #6b7280; font-size: 13px; margin: 0 0 8px 0; line-height: 1.5; }
            @media (max-width: 600px) { .container { margin: 10px; border-radius: 12px; } .header, .content, .footer { padding: 30px 20px; } }
        </style>
    </head>
    <body>
        <div class="email-wrapper">
            <div class="container">
                <div class="header">
                    <img src="${baseUrl}/images/Tools%20Australia%20Logo/White-Text%20Logo.png" alt="Tools Australia" class="logo"${LOGO_IMG_TAG_SUFFIX} />
                    <h1 class="header-title" style="${HEADER_TITLE_INLINE_STYLE}">Reply to Your ${typeLabel}</h1>
                </div>
                <div class="content">
                    <h2 class="greeting">Hi ${safeName},</h2>
                    <div class="reply-body" style="${REPLY_BODY_WRAPPER_STYLE}">${messageHtml}</div>
                    <div class="signature">
                        <p class="signature-text">
                            Best regards,<br>
                            <span class="team-name">The Tools Australia Team</span>
                        </p>
                    </div>
                </div>
                <div class="footer">
                    <p class="footer-text">&copy; 2025 Tools Australia. All rights reserved.</p>
                    <p class="footer-text">Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="${MAILTO_LINK_STYLE}">${SUPPORT_EMAIL}</a></p>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
}

/**
 * Create HTML email template for mini draw 100% capacity notification
 */
export function createMiniDrawFullCapacityTemplate(data: {
  miniDrawName: string;
  prizeName: string;
  totalEntries: number;
  minimumEntries: number;
  adminUrl: string;
  notifiedAt: Date;
}): string {
  const safeName = escapeHtml(data.miniDrawName);
  const safePrize = escapeHtml(data.prizeName);
  const notifiedDate = new Date(data.notifiedAt).toLocaleString('en-AU', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone: 'Australia/Sydney',
  });
  const adminLink = `${data.adminUrl}/admin/mini-draws`;

  const baseUrl = getBaseUrl();
  const logoUrl = `${baseUrl}/images/Tools%20Australia%20Logo/White-Text%20Logo.png`;

  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mini Draw 100% Full</title>
    <!--[if mso]>
    <style type="text/css">
        body, table, td { font-family: Arial, sans-serif !important; }
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #1f2937; background-color: #f8fafc;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc;">
        <tr>
            <td align="center" style="padding: 20px 16px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td align="center" style="background-color: #0f172a; padding: 40px 30px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td align="center">
                                        <img src="${logoUrl}" alt="Tools Australia" width="180" style="max-width: 200px; height: auto; display: block; margin-bottom: 16px; border: 0;" />
                                        <h1 style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Mini Draw At 100%</h1>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="margin: 0 0 24px 0; font-size: 18px; color: #1f2937; font-weight: 600;">The mini draw <strong>${safeName}</strong> has reached 100% capacity and is ready for winner selection.</p>
                            <!-- Info rows -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="padding: 14px 18px; background-color: #f3f4f6; border-radius: 10px; border: 1px solid #e5e7eb;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Prize</td>
                                                <td align="right" style="font-size: 15px; font-weight: 600; color: #111827;">${safePrize}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr><td height="12" style="font-size: 0; line-height: 0;">&nbsp;</td></tr>
                                <tr>
                                    <td style="padding: 14px 18px; background-color: #f3f4f6; border-radius: 10px; border: 1px solid #e5e7eb;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Entries</td>
                                                <td align="right" style="font-size: 15px; font-weight: 600; color: #111827;">${data.totalEntries.toLocaleString()} / ${data.minimumEntries.toLocaleString()}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr><td height="28" style="font-size: 0; line-height: 0;">&nbsp;</td></tr>
                            </table>
                            <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 15px;">Please select a winner in the admin panel to complete this draw and reopen for the next cycle.</p>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td align="center" style="padding: 8px 0;">
                                        <a href="${adminLink}" style="${PRIMARY_BUTTON_STYLE}">Go to Mini Draws Admin</a>
                                    </td>
                                </tr>
                            </table>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="font-size: 13px; color: #6b7280; padding-top: 20px; margin-top: 30px; border-top: 1px solid #e5e7eb;"><strong>Notified:</strong> ${notifiedDate}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #6b7280; font-size: 13px;">This is an automated notification from Tools Australia Admin.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `;
}
