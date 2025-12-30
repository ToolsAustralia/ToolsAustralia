/**
 * SendGrid Client
 * Singleton client for SendGrid API interactions
 * Handles connection, retries, and error handling
 */

import sgMail from '@sendgrid/mail';
import { EmailResult, EmailErrorCode, SendGridConfig } from './types';
import { isDevelopment } from '@/lib/environment';

class SendGridClient {
  private static instance: SendGridClient;
  private initialized = false;
  private config: SendGridConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): SendGridClient {
    if (!SendGridClient.instance) {
      SendGridClient.instance = new SendGridClient();
    }
    return SendGridClient.instance;
  }

  /**
   * Initialize SendGrid client
   * Must be called before sending emails
   */
  public initialize(): void {
    if (this.initialized) {
      return;
    }

    if (!this.config.enabled) {
      if (isDevelopment()) {
        console.warn('⚠️ SendGrid is disabled. Emails will not be sent.');
      }
      return;
    }

    if (!this.config.apiKey) {
      // Don't throw during build - just log a warning
      if (process.env.NODE_ENV === 'production' && !process.env.SENDGRID_API_KEY) {
        console.warn('⚠️ SENDGRID_API_KEY is not configured. Email sending will be disabled.');
      }
      return;
    }

    sgMail.setApiKey(this.config.apiKey);
    this.initialized = true;

    if (isDevelopment()) {
      console.log('✅ SendGrid client initialized');
    }
  }

  /**
   * Send email using SendGrid
   * Includes retry logic and comprehensive error handling
   */
  public async sendEmail(params: {
    to: string;
    subject: string;
    templateId?: string;
    dynamicTemplateData?: Record<string, unknown>;
    html?: string;
    text?: string;
    replyTo?: string;
  }): Promise<EmailResult> {
    // Check if email is enabled
    if (!this.config.enabled) {
      return {
        success: false,
        error: 'Email service is disabled',
        errorCode: EmailErrorCode.CONFIGURATION_ERROR,
      };
    }

    // Ensure client is initialized
    if (!this.initialized) {
      this.initialize();
    }

    // Validate required fields
    if (!params.to || !params.subject) {
      return {
        success: false,
        error: 'Missing required email fields (to, subject)',
        errorCode: EmailErrorCode.VALIDATION_ERROR,
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(params.to)) {
      return {
        success: false,
        error: 'Invalid email address format',
        errorCode: EmailErrorCode.VALIDATION_ERROR,
      };
    }

    // Prepare message - SendGrid requires either templateId OR content (not both)
    let msg: Parameters<typeof sgMail.send>[0];

    if (params.templateId) {
      // Use dynamic template
      msg = {
        to: params.to,
        from: {
          email: this.config.fromEmail,
          name: this.config.fromName,
        },
        subject: params.subject,
        templateId: params.templateId,
        dynamicTemplateData: params.dynamicTemplateData,
        replyTo: params.replyTo,
      } as Parameters<typeof sgMail.send>[0];
    } else {
      // Use HTML/text content - must have at least one content item
      const content: Array<{ type: string; value: string }> = [];
      if (params.html) {
        content.push({
          type: 'text/html',
          value: params.html,
        });
      }
      if (params.text) {
        content.push({
          type: 'text/plain',
          value: params.text,
        });
      }

      // Ensure we have at least one content item
      if (content.length === 0) {
        return {
          success: false,
          error: 'Either templateId or html/text content must be provided',
          errorCode: EmailErrorCode.VALIDATION_ERROR,
        };
      }

      msg = {
        to: params.to,
        from: {
          email: this.config.fromEmail,
          name: this.config.fromName,
        },
        subject: params.subject,
        content: content,
        replyTo: params.replyTo,
      } as unknown as Parameters<typeof sgMail.send>[0];
    }

    // Retry logic
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const [response] = await sgMail.send(msg);

        if (response.statusCode >= 200 && response.statusCode < 300) {
          return {
            success: true,
            messageId: response.headers['x-message-id'] as string | undefined,
          };
        } else {
          throw new Error(`SendGrid returned status ${response.statusCode}`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on validation errors
        if (this.isValidationError(error)) {
          return {
            success: false,
            error: lastError.message,
            errorCode: EmailErrorCode.VALIDATION_ERROR,
          };
        }

        // Log retry attempt
        if (attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
          console.warn(
            `⚠️ SendGrid send attempt ${attempt} failed. Retrying in ${delay}ms...`,
            lastError.message
          );
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    console.error('❌ SendGrid email send failed after all retries:', lastError);
    return {
      success: false,
      error: lastError?.message || 'Failed to send email after retries',
      errorCode: EmailErrorCode.SENDGRID_ERROR,
    };
  }

  /**
   * Check if error is a validation error (should not retry)
   */
  private isValidationError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as { response: { body?: { errors?: unknown[] } } }).response;
      if (response?.body?.errors) {
        const errors = response.body.errors as Array<{ message?: string }>;
        return errors.some((e) => e.message?.includes('invalid') || e.message?.includes('required'));
      }
    }
    return false;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfig(): SendGridConfig {
    return {
      apiKey: process.env.SENDGRID_API_KEY || '',
      fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@toolsaustralia.com.au',
      fromName: process.env.SENDGRID_FROM_NAME || 'Tools Australia',
      enabled: process.env.EMAIL_ENABLED !== 'false', // Default to true
      retryAttempts: parseInt(process.env.EMAIL_RETRY_ATTEMPTS || '3', 10),
      retryDelayMs: parseInt(process.env.EMAIL_RETRY_DELAY_MS || '1000', 10),
    };
  }

  /**
   * Get current configuration (for debugging)
   */
  public getConfig(): Readonly<SendGridConfig> {
    return { ...this.config };
  }
}

export default SendGridClient;

