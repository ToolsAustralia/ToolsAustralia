import nodemailer from "nodemailer";
import crypto from "crypto";

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
 */
export function checkEmailRateLimit(email: string): EmailRateLimitResult {
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
 * Create email transporter
 */
function createEmailTransporter() {
  // Check if SMTP is configured
  if (!process.env.SMTP_SERVER_HOST || !process.env.SMTP_SERVER_USER || !process.env.SMTP_SERVER_PASSWORD) {
    // console.warn("⚠️ SMTP not configured - Email verification disabled");
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_SERVER_HOST,
    port: parseInt(process.env.SMTP_SERVER_PORT || "587"),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_SERVER_USER,
      pass: process.env.SMTP_SERVER_PASSWORD,
    },
  });
}

/**
 * Get the base URL for the application
 */
function getBaseUrl(): string {
  // Use NEXT_PUBLIC_APP_URL if available, otherwise fallback to NEXTAUTH_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  return appUrl.replace(/\/$/, ""); // Remove trailing slash
}

/**
 * Create HTML email template for verification code
 */
function createVerificationEmailTemplate(userName: string, verificationCode: string): string {
  const baseUrl = getBaseUrl();
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification - Tools Australia</title>
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
            .verification-section::before {
                content: '';
                position: absolute;
                top: -2px;
                left: -2px;
                right: -2px;
                bottom: -2px;
                background: linear-gradient(135deg, #dc2626, #b91c1c);
                border-radius: 12px;
                z-index: -1;
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
                        <img src="${baseUrl}/images/Tools%20Australia%20Logo/White-Text%20Logo.png" alt="Tools Australia" class="logo" />
                        <h1 class="header-title">Email Verification</h1>
                    </div>
                </div>
                
                <div class="content">
                    <h2 class="greeting">Hello ${userName}!</h2>
                    
                    <p class="intro-text">
                        Thank you for joining Tools Australia. To complete your account setup and ensure the security of your account, please verify your email address using the verification code below.
                    </p>
                    
                    <div class="verification-section">
                        <p class="verification-label">Your Verification Code</p>
                        <div class="verification-code">${verificationCode}</div>
                    </div>
                    
                    <p class="instructions">
                        Enter this code in the verification form to activate your account and start enjoying all the benefits of your Tools Australia membership.
                    </p>
                    
                    <div class="security-notice">
                        <h3>Security Information</h3>
                        <ul>
                            <li>This verification code expires in 10 minutes</li>
                            <li>Never share this code with anyone</li>
                            <li>If you didn't request this verification, please ignore this email</li>
                            <li>For security reasons, this code can only be used once</li>
                        </ul>
                    </div>
                    
                    <p class="support-text">
                        If you have any questions or need assistance, our support team is here to help. You can reach us through your account dashboard or by replying to this email.
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
                    <p class="footer-text">This is an automated message. Please do not reply to this email.</p>
                    <p class="footer-text">Tools Australia - Your trusted partner for quality tools and equipment.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
}

/**
 * Send email verification code
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
      }! Your Tools Australia verification code is: ${verificationCode}. This code expires in 10 minutes.`,
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
 * Get verification expiry time
 */
export function getEmailVerificationExpiry(): Date {
  const expiryMinutes = parseInt(process.env.EMAIL_VERIFICATION_EXPIRY_MINUTES || "10");
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
  const minutesSinceLastSubmission = Math.floor(timeSinceLastSubmission / (60 * 1000));

  if (timeSinceLastSubmission < FORM_SUBMISSION_RATE_LIMIT_WINDOW) {
    // Rate limited - calculate retry after time in seconds
    const retryAfter = Math.ceil((FORM_SUBMISSION_RATE_LIMIT_WINDOW - timeSinceLastSubmission) / 1000);
    const retryAfterMinutes = Math.ceil(retryAfter / 60);
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

/**
 * Create HTML email template for contact form submission
 */
function createContactSubmissionEmailTemplate(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  submittedAt: Date;
}): string {
  const submittedDate = new Date(data.submittedAt).toLocaleString("en-AU", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: "Australia/Sydney",
  });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Contact Form Submission - Tools Australia</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #1f2937;
                background-color: #f3f4f6;
                padding: 20px;
            }
            .email-container {
                max-width: 650px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
                background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
                padding: 30px;
                text-align: center;
            }
            .header-title {
                color: #ffffff;
                font-size: 24px;
                font-weight: 600;
                margin: 0;
                letter-spacing: 0.5px;
            }
            .content {
                padding: 40px;
            }
            .intro {
                font-size: 16px;
                color: #4b5563;
                margin-bottom: 30px;
                line-height: 1.7;
            }
            .info-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 20px;
                margin-bottom: 30px;
            }
            .info-item {
                border-bottom: 1px solid #e5e7eb;
                padding-bottom: 15px;
            }
            .info-item:last-child {
                border-bottom: none;
            }
            .info-label {
                font-size: 12px;
                font-weight: 600;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 6px;
            }
            .info-value {
                font-size: 16px;
                color: #111827;
                font-weight: 500;
            }
            .message-section {
                background-color: #f9fafb;
                border-left: 4px solid #dc2626;
                padding: 20px;
                border-radius: 4px;
                margin: 30px 0;
            }
            .message-label {
                font-size: 12px;
                font-weight: 600;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 10px;
            }
            .message-content {
                font-size: 15px;
                color: #1f2937;
                line-height: 1.8;
                white-space: pre-wrap;
            }
            .timestamp {
                font-size: 13px;
                color: #6b7280;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
            }
            .footer {
                background-color: #f9fafb;
                padding: 25px 40px;
                text-align: center;
                border-top: 1px solid #e5e7eb;
            }
            .footer-text {
                font-size: 12px;
                color: #6b7280;
                margin: 0;
            }
            .footer-logo {
                margin-top: 15px;
                opacity: 0.6;
            }
            @media (max-width: 600px) {
                .content {
                    padding: 25px;
                }
                .header {
                    padding: 25px 20px;
                }
                .header-title {
                    font-size: 20px;
                }
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="header">
                <h1 class="header-title">New Contact Form Submission</h1>
            </div>
            
            <div class="content">
                <p class="intro">You have received a new contact form submission from the Tools Australia website.</p>
                
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Full Name</div>
                        <div class="info-value">${data.firstName} ${data.lastName}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Email Address</div>
                        <div class="info-value"><a href="mailto:${
                          data.email
                        }" style="color: #dc2626; text-decoration: none;">${data.email}</a></div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Phone Number</div>
                        <div class="info-value"><a href="tel:${
                          data.phone
                        }" style="color: #dc2626; text-decoration: none;">${data.phone}</a></div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Subject</div>
                        <div class="info-value">${data.subject}</div>
                    </div>
                </div>
                
                <div class="message-section">
                    <div class="message-label">Message</div>
                    <div class="message-content">${data.message.replace(/\n/g, "<br>")}</div>
                </div>
                
                <div class="timestamp">
                    <strong>Submitted:</strong> ${submittedDate}
                </div>
            </div>
            
            <div class="footer">
                <p class="footer-text">This is an automated notification from Tools Australia.</p>
                <p class="footer-text">Please reply directly to this email to respond to the customer.</p>
            </div>
        </div>
    </body>
    </html>
  `;
}

/**
 * Create HTML email template for partner application
 */
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
  const submittedDate = new Date(data.submittedAt).toLocaleString("en-AU", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: "Australia/Sydney",
  });

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Partner Application - Tools Australia</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #1f2937;
                background-color: #f3f4f6;
                padding: 20px;
            }
            .email-container {
                max-width: 650px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
                background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
                padding: 30px;
                text-align: center;
            }
            .header-title {
                color: #ffffff;
                font-size: 24px;
                font-weight: 600;
                margin: 0;
                letter-spacing: 0.5px;
            }
            .content {
                padding: 40px;
            }
            .intro {
                font-size: 16px;
                color: #4b5563;
                margin-bottom: 30px;
                line-height: 1.7;
            }
            .info-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 20px;
                margin-bottom: 30px;
            }
            .info-item {
                border-bottom: 1px solid #e5e7eb;
                padding-bottom: 15px;
            }
            .info-item:last-child {
                border-bottom: none;
            }
            .info-label {
                font-size: 12px;
                font-weight: 600;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 6px;
            }
            .info-value {
                font-size: 16px;
                color: #111827;
                font-weight: 500;
            }
            .goals-section {
                background-color: #f9fafb;
                border-left: 4px solid #dc2626;
                padding: 20px;
                border-radius: 4px;
                margin: 30px 0;
            }
            .goals-label {
                font-size: 12px;
                font-weight: 600;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 10px;
            }
            .goals-content {
                font-size: 15px;
                color: #1f2937;
                line-height: 1.8;
                white-space: pre-wrap;
            }
            .timestamp {
                font-size: 13px;
                color: #6b7280;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
            }
            .footer {
                background-color: #f9fafb;
                padding: 25px 40px;
                text-align: center;
                border-top: 1px solid #e5e7eb;
            }
            .footer-text {
                font-size: 12px;
                color: #6b7280;
                margin: 0;
            }
            .footer-logo {
                margin-top: 15px;
                opacity: 0.6;
            }
            @media (max-width: 600px) {
                .content {
                    padding: 25px;
                }
                .header {
                    padding: 25px 20px;
                }
                .header-title {
                    font-size: 20px;
                }
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="header">
                <h1 class="header-title">New Partner Application</h1>
            </div>
            
            <div class="content">
                <p class="intro">You have received a new partner application from the Tools Australia website.</p>
                
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Contact Name</div>
                        <div class="info-value">${data.firstName} ${data.lastName}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Email Address</div>
                        <div class="info-value"><a href="mailto:${
                          data.email
                        }" style="color: #dc2626; text-decoration: none;">${data.email}</a></div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Phone Number</div>
                        <div class="info-value"><a href="tel:${
                          data.phone
                        }" style="color: #dc2626; text-decoration: none;">${data.phone}</a></div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Business Name</div>
                        <div class="info-value">${data.businessName}</div>
                    </div>
                    ${
                      data.abn
                        ? `
                    <div class="info-item">
                        <div class="info-label">ABN</div>
                        <div class="info-value">${data.abn}</div>
                    </div>
                    `
                        : ""
                    }
                    ${
                      data.acn
                        ? `
                    <div class="info-item">
                        <div class="info-label">ACN</div>
                        <div class="info-value">${data.acn}</div>
                    </div>
                    `
                        : ""
                    }
                </div>
                
                ${
                  data.goals
                    ? `
                <div class="goals-section">
                    <div class="goals-label">Partnership Goals</div>
                    <div class="goals-content">${data.goals.replace(/\n/g, "<br>")}</div>
                </div>
                `
                    : ""
                }
                
                <div class="timestamp">
                    <strong>Submitted:</strong> ${submittedDate}
                </div>
            </div>
            
            <div class="footer">
                <p class="footer-text">This is an automated notification from Tools Australia.</p>
                <p class="footer-text">Please reply directly to this email to respond to the applicant.</p>
            </div>
        </div>
    </body>
    </html>
  `;
}

/**
 * Send contact form submission notification email
 * Note: Rate limiting is now checked BEFORE calling this function in the API endpoint
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
    const recipientEmail = process.env.CONTACT_EMAIL || "hello@toolsaustralia.com.au";

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
 * Send partner application notification email
 * Note: Rate limiting is now checked BEFORE calling this function in the API endpoint
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
    const recipientEmail = process.env.CONTACT_EMAIL || "hello@toolsaustralia.com.au";

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
