"use client";

import React from "react";

/**
 * Verification Email Preview Component
 *
 * Displays a preview of the email verification template with mock data
 * for development purposes.
 */
const VerificationEmailPreview: React.FC = () => {
  // Mock data for the verification email
  const mockUserName = "John Smith";
  const mockVerificationCode = "ABC123";
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  // Generate the email HTML using the same template from lib/email.ts
  const emailHtml = `
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
                    <h2 class="greeting">Hello ${mockUserName}!</h2>
                    
                    <p class="intro-text">
                        Thank you for joining Tools Australia. To complete your account setup and ensure the security of your account, please verify your email address using the verification code below.
                    </p>
                    
                    <div class="verification-section">
                        <p class="verification-label">Your Verification Code</p>
                        <div class="verification-code">${mockVerificationCode}</div>
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

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-bold text-gray-800">Email Verification Preview</h3>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800">
          Verification Email
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        <iframe
          title="Email Verification Preview"
          srcDoc={emailHtml}
          className="h-[1000px] w-full border-0"
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
};

export default VerificationEmailPreview;
