/**
 * SendGrid Client
 * Singleton client for SendGrid API interactions
 * Handles connection, retries, and error handling
 */

import sgMail from '@sendgrid/mail';
import { EmailResult, EmailErrorCode, EmailSender, SendGridConfig } from './types';
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
   * Initialize SendGrid client.
   * Must be called before sending emails.
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
   * Send email using SendGrid.
   * The caller must provide a `from` sender for every email.
   */
  public async sendEmail(params: {
    to: string;
    from: EmailSender;
    subject: string;
    templateId?: string;
    dynamicTemplateData?: Record<string, unknown>;
    html?: string;
    text?: string;
    replyTo?: string;
  }): Promise<EmailResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        error: 'Email service is disabled',
        errorCode: EmailErrorCode.CONFIGURATION_ERROR,
      };
    }

    if (!this.initialized) {
      this.initialize();
    }

    if (!params.to || !params.subject) {
      return {
        success: false,
        error: 'Missing required email fields (to, subject)',
        errorCode: EmailErrorCode.VALIDATION_ERROR,
      };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(params.to)) {
      return {
        success: false,
        error: 'Invalid email address format',
        errorCode: EmailErrorCode.VALIDATION_ERROR,
      };
    }

    let msg: Parameters<typeof sgMail.send>[0];

    if (params.templateId) {
      msg = {
        to: params.to,
        from: { email: params.from.email, name: params.from.name },
        subject: params.subject,
        templateId: params.templateId,
        dynamicTemplateData: params.dynamicTemplateData,
        replyTo: params.replyTo,
      } as Parameters<typeof sgMail.send>[0];
    } else {
      const content: Array<{ type: string; value: string }> = [];
      if (params.html) {
        content.push({ type: 'text/html', value: params.html });
      }
      if (params.text) {
        content.push({ type: 'text/plain', value: params.text });
      }

      if (content.length === 0) {
        return {
          success: false,
          error: 'Either templateId or html/text content must be provided',
          errorCode: EmailErrorCode.VALIDATION_ERROR,
        };
      }

      msg = {
        to: params.to,
        from: { email: params.from.email, name: params.from.name },
        subject: params.subject,
        content,
        replyTo: params.replyTo,
      } as unknown as Parameters<typeof sgMail.send>[0];
    }

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

        if (this.isValidationError(error)) {
          return {
            success: false,
            error: lastError.message,
            errorCode: EmailErrorCode.VALIDATION_ERROR,
          };
        }

        if (attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          console.warn(
            `⚠️ SendGrid send attempt ${attempt} failed. Retrying in ${delay}ms...`,
            lastError.message
          );
          await this.sleep(delay);
        }
      }
    }

    console.error('❌ SendGrid email send failed after all retries:', lastError);
    return {
      success: false,
      error: lastError?.message || 'Failed to send email after retries',
      errorCode: EmailErrorCode.SENDGRID_ERROR,
    };
  }

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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private loadConfig(): SendGridConfig {
    return {
      apiKey: process.env.SENDGRID_API_KEY || '',
      enabled: process.env.EMAIL_ENABLED !== 'false',
      retryAttempts: parseInt(process.env.EMAIL_RETRY_ATTEMPTS || '3', 10),
      retryDelayMs: parseInt(process.env.EMAIL_RETRY_DELAY_MS || '1000', 10),
    };
  }

  public getConfig(): Readonly<SendGridConfig> {
    return { ...this.config };
  }
}

export default SendGridClient;
