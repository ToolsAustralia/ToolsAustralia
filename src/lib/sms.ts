import twilio from "twilio";

// Initialize Twilio client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Rate limiting store (in production, use Redis or database)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 5; // Max 5 OTP requests per 15 minutes

export interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  resetTime: number;
}

/**
 * Check rate limiting for SMS OTP requests
 */
export function checkRateLimit(identifier: string): RateLimitResult {
  const now = Date.now();
  const key = `sms_${identifier}`;
  const current = rateLimitStore.get(key);

  if (!current) {
    // First request
    rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS_PER_WINDOW - 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    };
  }

  // Check if window has expired
  if (now > current.resetTime) {
    // Reset the counter
    rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS_PER_WINDOW - 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    };
  }

  // Check if limit exceeded
  if (current.count >= MAX_ATTEMPTS_PER_WINDOW) {
    return {
      allowed: false,
      remainingAttempts: 0,
      resetTime: current.resetTime,
    };
  }

  // Increment counter
  current.count++;
  rateLimitStore.set(key, current);

  return {
    allowed: true,
    remainingAttempts: MAX_ATTEMPTS_PER_WINDOW - current.count,
    resetTime: current.resetTime,
  };
}

/**
 * Generate a 6-digit OTP code
 */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Format Australian mobile number for Twilio
 */
export function formatMobileNumber(mobile: string): string {
  // Remove all spaces and formatting
  const cleaned = mobile.replace(/\s+/g, "").replace(/[^\d+]/g, "");

  // Handle different Australian mobile formats
  if (cleaned.startsWith("+61")) {
    return cleaned;
  } else if (cleaned.startsWith("61")) {
    return `+${cleaned}`;
  } else if (cleaned.startsWith("0")) {
    return `+61${cleaned.substring(1)}`;
  } else if (cleaned.length === 9 && cleaned.startsWith("4")) {
    return `+61${cleaned}`;
  } else {
    // Assume it's already in the correct format
    return cleaned;
  }
}

/**
 * Send SMS OTP code
 */
export async function sendSMSOTP(mobileNumber: string, otpCode: string, userName?: string): Promise<SMSResult> {
  try {
    // Check if Twilio is configured
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.warn("⚠️ Twilio not configured - SMS OTP disabled");
      return {
        success: false,
        error: "SMS service not configured",
      };
    }

    // Format mobile number
    const formattedNumber = formatMobileNumber(mobileNumber);

    // Create message
    const message = userName
      ? `Hi ${userName}! Your Tools Australia verification code is: ${otpCode}. This code expires in 10 minutes.`
      : `Your Tools Australia verification code is: ${otpCode}. This code expires in 10 minutes.`;

    // Send SMS
    const messageResponse = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedNumber,
    });

    console.log(`✅ SMS OTP sent to ${formattedNumber}: ${messageResponse.sid}`);

    return {
      success: true,
      messageId: messageResponse.sid,
    };
  } catch (error) {
    console.error("❌ Failed to send SMS OTP:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send SMS",
    };
  }
}

/**
 * Validate Australian mobile number format
 */
export function validateMobileNumber(mobile: string): boolean {
  const cleaned = mobile.replace(/\s+/g, "");

  // Australian mobile number patterns
  const patterns = [
    /^\+61[4-5]\d{8}$/, // +61412345678
    /^61[4-5]\d{8}$/, // 61412345678
    /^0[4-5]\d{8}$/, // 0412345678
    /^[4-5]\d{8}$/, // 412345678
  ];

  return patterns.some((pattern) => pattern.test(cleaned));
}

/**
 * Clean up expired rate limit entries (call this periodically)
 */
export function cleanupRateLimit(): void {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Clean up rate limit store every 30 minutes
setInterval(cleanupRateLimit, 30 * 60 * 1000);
