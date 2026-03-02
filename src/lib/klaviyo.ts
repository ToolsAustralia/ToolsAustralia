/**
 * Klaviyo API Client
 *
 * Singleton pattern for Klaviyo API interactions.
 * Handles profile management and event tracking.
 *
 * Features:
 * - Automatic retries on failure
 * - Environment-based configuration
 * - Non-blocking async operations
 * - Comprehensive error handling
 *
 * @module lib/klaviyo
 */

import type {
  KlaviyoProfile,
  KlaviyoEvent,
  KlaviyoProfileResponse,
  KlaviyoEventResponse,
  TrackEventOptions,
} from "@/types/klaviyo";

// ============================================================
// CONFIGURATION
// ============================================================

const getKlaviyoConfig = () => {
  // Trim API key to handle any whitespace issues
  const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY?.trim();
  // Auto-detect mode based on NODE_ENV if KLAVIYO_MODE is not explicitly set
  const nodeEnv = process.env.NODE_ENV || "development";
  const explicitMode = process.env.KLAVIYO_MODE;
  const mode = (explicitMode || (nodeEnv === "production" ? "production" : "development")) as
    | "development"
    | "production";
  const enabled = process.env.KLAVIYO_ENABLED !== "false";
  // SMS list ID for subscribing users to SMS marketing
  const smsListId = process.env.KLAVIYO_SMS_LIST_ID;
  // Email list ID for subscribing users to email marketing
  const emailListId = process.env.KLAVIYO_EMAIL_LIST_ID;

  return { apiKey, mode, enabled, nodeEnv, smsListId, emailListId };
};

// ============================================================
// API CLIENT
// ============================================================

class KlaviyoClient {
  private apiKey: string | undefined;
  private baseUrl = "https://a.klaviyo.com/api";
  private mode: "development" | "production";
  private enabled: boolean;
  private smsListId: string | undefined;
  private emailListId: string | undefined;

  // ✅ Retry and timeout configuration constants
  // Following Klaviyo best practices for API resilience
  private readonly REQUEST_TIMEOUT_MS = 30000; // 30 seconds - Klaviyo recommended timeout
  private readonly MAX_RETRIES = 5; // Increased from 3 for better resilience
  private readonly BASE_RETRY_DELAY_MS = 2000; // 2 seconds base delay
  private readonly GATEWAY_ERROR_DELAY_MULTIPLIER = 2; // Double delay for gateway errors (502/504)

  constructor() {
    const config = getKlaviyoConfig();
    this.apiKey = config.apiKey;
    this.mode = config.mode;
    this.enabled = config.enabled;
    this.smsListId = config.smsListId;
    this.emailListId = config.emailListId;

    // Log configuration based on environment
    const isDevelopment = config.nodeEnv === "development";
    const logLevel = isDevelopment ? "log" : "info";

    console[logLevel]("🎹 Klaviyo Client Initialized:", {
      enabled: this.enabled,
      mode: this.mode,
      nodeEnv: config.nodeEnv,
      hasApiKey: !!this.apiKey,
      envVars: {
        NODE_ENV: process.env.NODE_ENV,
        KLAVIYO_MODE: process.env.KLAVIYO_MODE,
        KLAVIYO_ENABLED: process.env.KLAVIYO_ENABLED,
      },
    });

    // Environment-specific warnings
    if (isDevelopment && this.mode !== "development") {
      // console.warn("⚠️ In development but KLAVIYO_MODE is not 'development'. Events will not have [DEV] prefix.");
    }

    // ✅ FIX: Warn about environment mismatch (NODE_ENV=production but KLAVIYO_MODE=development)
    if (!isDevelopment && this.mode !== "production") {
      console.warn(
        "⚠️ ENVIRONMENT MISMATCH: NODE_ENV=production but KLAVIYO_MODE=development. " +
          "This may cause issues. Set KLAVIYO_MODE=production in production."
      );
    }

    // Production readiness check
    if (!isDevelopment) {
      if (!this.apiKey) {
        console.error("❌ CRITICAL: KLAVIYO_PRIVATE_API_KEY is missing in production!");
      }
      if (!this.enabled) {
        // console.warn("⚠️ Klaviyo is disabled in production (KLAVIYO_ENABLED=false)");
      }
    }
  }

  private isConfigured(): boolean {
    // Re-read enabled status from environment (handles cases where dotenv loads after singleton creation)
    const enabled = process.env.KLAVIYO_ENABLED !== "false";
    if (!enabled) {
      if (this.mode === "development") {
        // console.log("⚠️ Klaviyo is disabled (KLAVIYO_ENABLED=false)");
      }
      return false;
    }

    // Re-read API key from environment at runtime (handles cases where dotenv loads after singleton creation)
    // This ensures the API key is available even if the singleton was created before dotenv loaded
    const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY?.trim();
    if (!apiKey) {
      // console.warn("⚠️ Klaviyo API key is missing. Set KLAVIYO_PRIVATE_API_KEY in .env");
      return false;
    }

    // Update cached API key if it was missing but is now available
    if (!this.apiKey && apiKey) {
      this.apiKey = apiKey;
    }

    return true;
  }

  /**
   * Format event name with [DEV] prefix in development mode
   * Ensures all development events are clearly separated from production events in Klaviyo
   */
  private formatEventName(eventName: string): string {
    // Only add prefix in development mode and if event doesn't already have it
    if (this.mode === "development" && !eventName.startsWith("[DEV]")) {
      const devEventName = `[DEV] ${eventName}`;
      // console.log(`🎹 DEV Event Formatting: "${eventName}" → "${devEventName}"`);
      return devEventName;
    }

    // In development mode, log if event already has prefix (for debugging)
    if (this.mode === "development" && eventName.startsWith("[DEV]")) {
      // console.log(`🎹 Event already has [DEV] prefix: "${eventName}"`);
    }

    return eventName;
  }

  /**
   * Make HTTP request to Klaviyo API with timeout and error detection
   *
   * Per Klaviyo best practices:
   * - 30 second timeout to prevent hanging requests
   * - Throws errors for 502/504/5xx status codes so retry logic can catch them
   * - Handles network errors and timeouts gracefully
   *
   * @param endpoint - API endpoint (e.g., "/profiles/")
   * @param method - HTTP method (GET, POST, PATCH)
   * @param body - Optional request body
   * @returns Response object for successful requests
   * @throws Error for retryable errors (502/504/5xx, timeout, network errors)
   */
  private async makeRequest(endpoint: string, method: "GET" | "POST" | "PATCH", body?: unknown): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Klaviyo-API-Key ${this.apiKey}`,
          "Content-Type": "application/json",
          revision: "2024-10-15",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // ✅ CRITICAL FIX: Throw errors for retryable status codes (429/502/504/5xx)
      // This allows retry logic to catch and retry these errors
      // Per Klaviyo best practices: rate limit errors (429), gateway errors and server errors are retryable
      if (response.status === 429 || response.status >= 500 || response.status === 502 || response.status === 504) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.errors?.[0]?.detail || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(`Klaviyo API error: ${response.status} - ${errorMessage}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle timeout errors specifically
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Klaviyo API timeout after ${this.REQUEST_TIMEOUT_MS}ms`);
      }

      // Handle network errors (ECONNREFUSED, fetch failed, etc.)
      if (
        error instanceof Error &&
        (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED"))
      ) {
        throw new Error(`Klaviyo API network error: ${error.message}`);
      }

      // Re-throw other errors (including our own Error objects)
      throw error;
    }
  }

  /**
   * PATCH profile with retry logic for 409 errors
   * Handles concurrent update conflicts with exponential backoff
   * 
   * @param profileId - Klaviyo profile ID to update
   * @param updatePayload - Update payload
   * @param email - Profile email (for logging)
   * @param maxRetries - Maximum retry attempts (default: 3)
   * @returns Response from Klaviyo API
   */
  private async patchWithRetry(
    profileId: string,
    updatePayload: Record<string, unknown>,
    email: string,
    maxRetries: number = 3
  ): Promise<Response> {
    const baseDelayMs = 500; // Base delay for 409 retries (longer than regular retries)
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // ✅ FIX: Use default retries (5) instead of 1 for better resilience
        // Timeout errors should be retried, not failed immediately
        const response = await this.retryRequest(
          () => this.makeRequest(`/profiles/${profileId}/`, "PATCH", updatePayload),
          this.MAX_RETRIES, // ✅ FIX: Use default retries instead of 1
          this.BASE_RETRY_DELAY_MS
        );

        // ✅ ENHANCED: Handle 409 errors on PATCH with exponential backoff
        if (response.status === 409) {
          if (attempt < maxRetries) {
            // Extract duplicate profile ID from error (might be different if profile was merged)
            const errorData = await response.json().catch(() => ({}));
            const duplicateProfileId = errorData.errors?.[0]?.meta?.duplicate_profile_id;
            
            // Use the duplicate profile ID if provided, otherwise use original
            const _targetProfileId = duplicateProfileId || profileId;
            
            // Calculate exponential backoff delay with jitter
            const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
            const jitter = Math.random() * 200; // Add 0-200ms jitter
            const totalDelay = delayMs + jitter;

            if (this.mode === "development") {
              console.log(
                `🔄 Klaviyo 409 conflict on PATCH (attempt ${attempt}/${maxRetries}) for ${email}, retrying in ${Math.round(totalDelay)}ms...`
              );
            }

            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, totalDelay));

            // Update payload with correct profile ID if it changed
            if (duplicateProfileId && duplicateProfileId !== profileId) {
              (updatePayload.data as { id: string }).id = duplicateProfileId;
            }

            // Continue to next retry attempt
            continue;
          } else {
            // All retries exhausted - return the 409 response
            if (this.mode === "development") {
              console.warn(`⚠️ Klaviyo 409 conflict on PATCH persisted after ${maxRetries} attempts for ${email}`);
            }
            return response;
          }
        }

        // Success or non-409 error - return response
        return response;
      } catch (error) {
        // If this is the last attempt, throw the error
        if (attempt >= maxRetries) {
          throw error;
        }

        // Calculate delay and retry
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 200;
        const totalDelay = delayMs + jitter;

        await new Promise((resolve) => setTimeout(resolve, totalDelay));
      }
    }

    // Should never reach here, but TypeScript requires it
    throw new Error("Patch retry logic exhausted");
  }

  /**
   * Retry request with exponential backoff and jitter
   *
   * Implements Klaviyo best practices for handling temporary failures:
   * - Exponential backoff: delays increase exponentially with each retry
   * - Jitter: random delay added to prevent thundering herd problem
   * - Error classification: only retries retryable errors (502/504/5xx, timeout, network)
   * - Gateway error handling: longer delays for 502/504 errors (indicates server issues)
   *
   * Retry Strategy:
   * - Base delay: 2 seconds
   * - Gateway errors (502/504): 2x multiplier
   * - Exponential: baseDelay * multiplier * 2^(attempt-1)
   * - Jitter: Random 0-1000ms added
   * - Max delay: 30 seconds
   *
   * Error Classification:
   * - Retryable: 502, 504, 500, 503, timeout, network errors
   * - Non-retryable: 400, 401, 403, 404 (throw immediately)
   *
   * @param fn - Function that returns a Promise to retry
   * @param maxRetries - Maximum number of retry attempts (default: 5)
   * @param baseDelay - Base delay in milliseconds (default: 2000ms)
   * @returns Result of the function call
   * @throws Error if all retries fail or error is non-retryable
   */
  private async retryRequest<T>(
    fn: () => Promise<T>,
    maxRetries: number = this.MAX_RETRIES,
    baseDelay: number = this.BASE_RETRY_DELAY_MS
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();

        // If result is a Response, check if it's OK (for non-throwing cases)
        if (result instanceof Response && !result.ok) {
          // Only throw for retryable errors (429/502/504/5xx)
          if (result.status === 429 || result.status >= 500 || result.status === 502 || result.status === 504) {
            const errorData = await result.json().catch(() => ({}));
            const errorMessage = errorData.errors?.[0]?.detail || `HTTP ${result.status}: ${result.statusText}`;
            throw new Error(`Klaviyo API error: ${result.status} - ${errorMessage}`);
          }
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message.toLowerCase();

        // ✅ Error Classification: Check if it's a retryable error
        // Include 429 (rate limit) errors - these should be retried with backoff
        const isRetryable =
          errorMessage.includes("502") ||
          errorMessage.includes("504") ||
          errorMessage.includes("500") ||
          errorMessage.includes("503") ||
          errorMessage.includes("429") ||
          errorMessage.includes("throttled") ||
          errorMessage.includes("rate limit") ||
          errorMessage.includes("timeout") ||
          errorMessage.includes("network") ||
          errorMessage.includes("econnreset") ||
          errorMessage.includes("fetch failed");

        // Don't retry non-retryable errors (400, 401, 403, 404, etc.)
        // These indicate client errors that won't be fixed by retrying
        if (!isRetryable) {
          throw lastError;
        }

        // If we've exhausted retries, throw the error
        if (attempt >= maxRetries) {
          // ✅ ENHANCED: Log detailed error information for debugging
          const errorDetails = {
            attempts: maxRetries,
            errorMessage: lastError.message,
            errorType: lastError.constructor.name,
            isTimeout: lastError.message.toLowerCase().includes("timeout"),
            isNetworkError: lastError.message.toLowerCase().includes("network"),
            isGatewayError: errorMessage.includes("502") || errorMessage.includes("504"),
            isRateLimit: errorMessage.includes("429") || errorMessage.includes("throttled"),
            timestamp: new Date().toISOString(),
          };
          console.error(`❌ Klaviyo request failed after ${maxRetries} attempts:`, lastError.message, errorDetails);
          throw lastError;
        }

        // ✅ Calculate exponential backoff with jitter
        // Longer delays for gateway errors (502/504) - these indicate server issues
        // For 429 rate limit errors, try to extract the "Expected available in X seconds" from the error
        const isGatewayError = errorMessage.includes("502") || errorMessage.includes("504");
        const isRateLimitError = errorMessage.includes("429") || errorMessage.includes("throttled");
        
        let waitTime: number;
        
        if (isRateLimitError) {
          // Try to extract the wait time from Klaviyo's error message
          // Format: "Expected available in X second(s)"
          const waitTimeMatch = errorMessage.match(/Expected available in (\d+) second/i);
          if (waitTimeMatch) {
            const klaviyoWaitSeconds = parseInt(waitTimeMatch[1], 10);
            // Add 1 second buffer and convert to milliseconds
            waitTime = (klaviyoWaitSeconds + 1) * 1000;
          } else {
            // Fallback to exponential backoff for rate limits
            const delayMultiplier = 2; // Use longer delays for rate limits
            const exponentialDelay = baseDelay * delayMultiplier * Math.pow(2, attempt - 1);
            const jitter = Math.random() * 1000;
            waitTime = Math.min(exponentialDelay + jitter, 30000);
          }
        } else {
          const delayMultiplier = isGatewayError ? this.GATEWAY_ERROR_DELAY_MULTIPLIER : 1;
          const exponentialDelay = baseDelay * delayMultiplier * Math.pow(2, attempt - 1);
          const jitter = Math.random() * 1000; // Add up to 1 second of jitter to prevent thundering herd
          waitTime = Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
        }

        console.warn(
          `⚠️ Klaviyo API error (${lastError.message.split(":")[1]?.trim() || "unknown"}) - ` +
            `Retrying in ${Math.round(waitTime)}ms (attempt ${attempt}/${maxRetries})...`
        );

        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    throw lastError || new Error("Request failed after retries");
  }

  /**
   * Clean properties object by removing undefined values
   * JSON.stringify removes undefined values, which can cause Klaviyo to receive incomplete data
   * This ensures all defined properties are sent to Klaviyo
   *
   * @param properties - Properties object that may contain undefined values
   * @returns Cleaned properties object with only defined values
   */
  private cleanProperties(properties: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!properties) {
      return {};
    }

    const cleaned: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(properties)) {
      // Only include defined values (not undefined or null)
      // Note: We keep null values as they might be intentional
      if (value !== undefined) {
        cleaned[key] = value;
      }
    }

    return cleaned;
  }

  /**
   * Create or update a Klaviyo profile
   *
   * This method implements Klaviyo best practices:
   * - Automatic retry on 502/504/5xx errors with exponential backoff
   * - Request timeout of 30 seconds to prevent hanging
   * - Handles profile conflicts (409) by updating existing profile
   * - Cleans undefined values from properties to ensure data integrity
   *
   * Retry Strategy:
   * - Uses retryRequest() wrapper for automatic retries
   * - Exponential backoff with jitter prevents thundering herd
   * - Gateway errors (502/504) get longer delays
   *
   * Error Handling:
   * - Returns success:false for non-retryable errors (400, 401, 403, 404)
   * - Throws errors for retryable errors (502/504/5xx) which are caught by retry logic
   * - Logs errors with context for debugging
   *
   * @param profile - Klaviyo profile object with email, name, phone, and properties
   * @returns Response object with success status and profile_id if successful
   */
  async upsertProfile(profile: KlaviyoProfile): Promise<KlaviyoProfileResponse> {
    if (!this.isConfigured()) {
      return { success: false, error: "Klaviyo not configured" };
    }

    // ✅ CRITICAL FIX: Validate that we have at least one identifier
    if (!profile.email || profile.email.trim() === "") {
      console.error("❌ Klaviyo profile missing required email identifier:", profile);
      return { success: false, error: "Email is required for Klaviyo profile" };
    }

    try {
      // ✅ ENHANCED: Idempotency check - query profile existence before creating to prevent unnecessary 409 errors
      // This reduces race conditions and unnecessary API calls
      // ✅ FIX: Use timeout wrapper to prevent idempotency check from blocking
      let existingProfileId: string | null = null;
      try {
        // ✅ FIX: Add timeout wrapper for idempotency check to prevent it from hanging
        const searchResponse = await Promise.race([
          this.retryRequest(
            () => this.makeRequest(`/profiles/?filter=equals(email,"${profile.email}")`, "GET"),
            2, // Fewer retries for idempotency check (non-critical)
            1000 // Shorter delay for idempotency check
          ),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error("Idempotency check timeout")), 10000) // 10 second timeout for idempotency check
          ),
        ]);
        
        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          const existingProfile = searchData.data?.[0];
          if (existingProfile?.id) {
            existingProfileId = existingProfile.id;
            if (this.mode === "development") {
              // console.log(`🔄 Profile already exists (idempotency check): ${existingProfileId}`);
            }
          }
        }
      } catch (searchError) {
        // ✅ ENHANCED: Log timeout errors but continue (non-critical)
        const errorMessage = searchError instanceof Error ? searchError.message : String(searchError);
        const isTimeout = errorMessage.toLowerCase().includes("timeout");
        
        if (isTimeout) {
          console.warn(`⚠️ Klaviyo idempotency check timeout (non-blocking) for ${profile.email}, continuing with create/update`);
        } else if (this.mode === "development") {
          // console.log("⚠️ Idempotency check failed, continuing with create/update:", searchError);
        }
        // Non-critical - continue with create/update flow if search fails
      }

      // Build attributes object with email consent
      // Note: SMS consent is handled separately via subscribeToSMSList method
      // sms_consent is NOT a valid field in profile attributes
      // ✅ Clean properties to remove undefined values before sending
      // JSON.stringify removes undefined values, which can cause Klaviyo to lose custom properties
      const cleanedProperties = this.cleanProperties(profile.properties);

      const attributes: Record<string, unknown> = {
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone_number: profile.phone_number,
        properties: cleanedProperties,
      };

      // Note: email_consent is NOT a valid field in profile attributes
      // Email consent should be handled by subscribing users to email lists
      // Similar to how SMS consent is handled via subscribeToSMSList

      const payload = {
        data: {
          type: "profile",
          attributes,
        },
      };

      // ✅ DEBUG: Log payload to verify properties are being sent (only in development)
      if (this.mode === "development" && process.env.KLAVIYO_DEBUG_PROFILE === "true") {
        console.log("📊 Klaviyo Profile Payload:", {
          email: profile.email,
          propertiesCount: Object.keys(cleanedProperties).length,
          hasDrawProperties: {
            current_draw_id: !!cleanedProperties.current_draw_id,
            current_draw_start_date: !!cleanedProperties.current_draw_start_date,
            current_draw_subscription_active: cleanedProperties.current_draw_subscription_active !== undefined,
            current_draw_one_time_packages: cleanedProperties.current_draw_one_time_packages !== undefined,
          },
          drawProperties: {
            current_draw_id: cleanedProperties.current_draw_id,
            current_draw_start_date: cleanedProperties.current_draw_start_date,
            current_draw_subscription_active: cleanedProperties.current_draw_subscription_active,
            current_draw_one_time_packages: cleanedProperties.current_draw_one_time_packages,
          },
        });
      }

      let response: Response;
      
      // ✅ ENHANCED: If profile exists (from idempotency check), skip POST and go directly to PATCH
      if (existingProfileId) {
        // Profile exists - update it directly using PATCH
        // ✅ FIX: Use default retries for PATCH operations (timeout errors should be retried)
        const updateAttributes: Record<string, unknown> = {
          first_name: profile.first_name,
          last_name: profile.last_name,
          phone_number: profile.phone_number,
          properties: cleanedProperties,
        };

        const updatePayload = {
          data: {
            type: "profile",
            id: existingProfileId,
            attributes: updateAttributes,
          },
        };

        // Use PATCH with retry logic for 409 errors
        response = await this.patchWithRetry(existingProfileId, updatePayload, profile.email);
      } else {
        // Profile doesn't exist - try to create it
        // ✅ FIX: Use retryRequest wrapper for automatic retry on 502/504/5xx errors
        // This ensures resilience during Klaviyo API outages
        response = await this.retryRequest(
          () => this.makeRequest("/profiles/", "POST", payload),
          this.MAX_RETRIES,
          this.BASE_RETRY_DELAY_MS
        );
      }

      // ✅ ENHANCED: If we get a 409 conflict, it means the profile already exists
      // Use patchWithRetry to handle concurrent update conflicts
      if (response.status === 409) {
        if (this.mode === "development") {
          // console.log("🔄 Profile already exists, attempting to update:", { email: profile.email });
        }

        // Try to get the existing profile ID from the error response
        const errorData = await response.json().catch(() => ({}));
        const duplicateProfileId = errorData.errors?.[0]?.meta?.duplicate_profile_id;

        if (duplicateProfileId) {
          // Update the existing profile using PATCH with retry logic for 409 errors
          // Note: SMS consent is handled separately via subscribeToSMSList method
          // ✅ Clean properties to remove undefined values before sending
          const cleanedProperties = this.cleanProperties(profile.properties);

          const updateAttributes: Record<string, unknown> = {
            first_name: profile.first_name,
            last_name: profile.last_name,
            phone_number: profile.phone_number,
            properties: cleanedProperties,
          };

          // Note: email_consent is NOT a valid field in profile attributes

          const updatePayload = {
            data: {
              type: "profile",
              id: duplicateProfileId,
              attributes: updateAttributes,
            },
          };

          // ✅ ENHANCED: Use patchWithRetry to handle 409 errors on PATCH with exponential backoff
          response = await this.patchWithRetry(duplicateProfileId, updatePayload, profile.email);
        } else {
          // Fallback: try to find profile by email and update
          // ✅ FIX: Use retryRequest with explicit retry configuration for profile search
          const searchResponse = await this.retryRequest(
            () => this.makeRequest(`/profiles/?filter=equals(email,"${profile.email}")`, "GET"),
            this.MAX_RETRIES,
            this.BASE_RETRY_DELAY_MS
          );

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const existingProfile = searchData.data?.[0];

            if (existingProfile) {
              // Build attributes object with email consent
              // Note: SMS consent is handled separately via subscribeToSMSList method
              // ✅ Clean properties to remove undefined values before sending
              const cleanedProperties = this.cleanProperties(profile.properties);

              const updateAttributes: Record<string, unknown> = {
                first_name: profile.first_name,
                last_name: profile.last_name,
                phone_number: profile.phone_number,
                properties: cleanedProperties,
              };

              // Note: email_consent is NOT a valid field in profile attributes

              const updatePayload = {
                data: {
                  type: "profile",
                  id: existingProfile.id,
                  attributes: updateAttributes,
                },
              };

              // ✅ ENHANCED: Use patchWithRetry to handle 409 errors on PATCH with exponential backoff
              response = await this.patchWithRetry(existingProfile.id, updatePayload, profile.email);
            }
          }
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Klaviyo API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const profileId = data.data?.id;

      if (this.mode === "development") {
        // console.log("✅ Klaviyo profile upserted:", { email: profile.email, profileId });
      }

      return {
        success: true,
        profile_id: profileId,
      };
    } catch (error) {
      // Enhanced error logging with context
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ Failed to upsert Klaviyo profile for ${profile.email}:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Subscribe user to SMS list with consent using Subscribe Profiles endpoint
   * This is the correct way to set SMS consent in Klaviyo per their documentation
   * Uses the subscriptions object structure to properly set consent
   *
   * Note: The newer Klaviyo API requires a profile ID, not email/phone
   * You must upsert the profile first to get the profile ID, then use it here
   *
   * @param profileId - Klaviyo profile ID (returned from upsertProfile)
   * @param phoneNumber - Phone number (required when setting SMS subscriptions)
   * @param consentTypes - Array of SMS consent types: ["sms_marketing"] or ["sms_transactional"] or both
   * @returns Success status and any error message
   */
  async subscribeToSMSList(
    profileId: string,
    phoneNumber: string,
    consentTypes: ("sms_marketing" | "sms_transactional")[] = ["sms_marketing"]
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: "Klaviyo not configured" };
    }

    // Validate SMS list ID is configured
    if (!this.smsListId) {
      if (this.mode === "development") {
        // console.warn("⚠️ KLAVIYO_SMS_LIST_ID not configured - skipping SMS subscription");
      }
      return { success: false, error: "SMS list ID not configured" };
    }

    // Validate profile ID
    if (!profileId || profileId.trim() === "") {
      console.error("❌ Invalid profile ID for SMS subscription:", profileId);
      return { success: false, error: "Profile ID is required" };
    }

    // Validate phone number
    if (!phoneNumber || phoneNumber.trim() === "") {
      console.error("❌ Invalid phone number for SMS subscription:", phoneNumber);
      return { success: false, error: "Phone number is required for SMS subscriptions" };
    }

    try {
      // Use Subscribe Profiles endpoint - this properly sets the subscriptions object
      // Per Klaviyo documentation: subscriptions object contains email and sms objects
      const url = `${this.baseUrl}/profile-subscription-bulk-create-jobs/`;

      // Build subscriptions object based on consent types
      // Structure: subscriptions.sms.marketing and/or subscriptions.sms.transactional
      // Note: Only 'consent' field can be set - consent_timestamp, method, and method_detail are read-only
      const subscriptions: Record<string, unknown> = {};

      if (consentTypes.includes("sms_marketing")) {
        subscriptions.sms = {
          marketing: {
            consent: "SUBSCRIBED",
            // Note: consent_timestamp, method, and method_detail are read-only fields set by Klaviyo
            // Only 'consent' can be set via API
          },
        };
      }

      if (consentTypes.includes("sms_transactional")) {
        if (!subscriptions.sms) {
          subscriptions.sms = {};
        }
        (subscriptions.sms as Record<string, unknown>).transactional = {
          consent: "SUBSCRIBED",
          // Note: consent_timestamp, method, and method_detail are read-only fields set by Klaviyo
          // Only 'consent' can be set via API
        };
      }

      // Step 1: Set the subscriptions object on the profile
      // Note: phone_number must be included in attributes when setting SMS subscriptions
      const payload = {
        data: {
          type: "profile-subscription-bulk-create-job",
          attributes: {
            profiles: {
              data: [
                {
                  type: "profile",
                  id: profileId,
                  attributes: {
                    phone_number: phoneNumber,
                    subscriptions: subscriptions,
                  },
                },
              ],
            },
          },
        },
      };

      // ✅ FIX: Use retryRequest wrapper for automatic retry on 502/504/5xx errors
      const response = await this.retryRequest(
        () =>
          fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Klaviyo-API-Key ${this.apiKey}`,
              revision: "2024-10-15",
            },
            body: JSON.stringify(payload),
          }),
        this.MAX_RETRIES,
        this.BASE_RETRY_DELAY_MS
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.errors?.[0]?.detail || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(`Klaviyo SMS subscription error: ${errorMessage}`);
      }

      // Step 2: Add profile to SMS list using relationships endpoint
      if (this.smsListId) {
        const listUrl = `${this.baseUrl}/lists/${this.smsListId}/relationships/profiles/`;
        const listPayload = {
          data: [
            {
              type: "profile",
              id: profileId,
            },
          ],
        };

        // ✅ FIX: Use retryRequest wrapper for list addition (with retry logic)
        try {
          const listResponse = await this.retryRequest(
            () =>
              fetch(listUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Klaviyo-API-Key ${this.apiKey}`,
                  revision: "2024-10-15",
                },
                body: JSON.stringify(listPayload),
              }),
            this.MAX_RETRIES,
            this.BASE_RETRY_DELAY_MS
          );

          if (!listResponse.ok) {
            const errorData = await listResponse.json().catch(() => ({}));
            const errorMessage =
              errorData.errors?.[0]?.detail || `HTTP ${listResponse.status}: ${listResponse.statusText}`;

            // ✅ FIX: Enhanced error handling for deleted lists (404 detection)
            if (listResponse.status === 404) {
              console.error(
                `❌ CRITICAL: Klaviyo SMS list not found (404). ` +
                  `List ID: ${this.smsListId}. ` +
                  `The list may have been deleted. Check your Klaviyo dashboard and update KLAVIYO_SMS_LIST_ID.`
              );
            } else {
              // Log but don't fail - subscriptions are set, list addition is secondary
              console.warn(`⚠️ Failed to add profile to SMS list: ${errorMessage}`);
            }
          } else if (this.mode === "development") {
            // Success - profile added to list
            console.log("✅ Profile added to SMS list:", { profileId, listId: this.smsListId });
          }
        } catch (error) {
          // If retry fails completely, log but don't fail the entire operation
          // Subscription consent is more important than list addition
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.warn(`⚠️ Failed to add profile to SMS list after retries: ${errorMessage}`);
        }
      }

      if (this.mode === "development") {
        // console.log("✅ User subscribed to SMS with consent:", { profileId, consentTypes, listId: this.smsListId });
      }

      return { success: true };
    } catch (error) {
      console.error("❌ Failed to subscribe user to SMS list:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Subscribe user to email marketing list using Subscribe Profiles endpoint
   *
   * This is the correct way to set email consent in Klaviyo per their documentation.
   * Uses the subscriptions object structure to properly set consent.
   *
   * Implements Klaviyo best practices:
   * - Automatic retry on 502/504/5xx errors with exponential backoff
   * - Request timeout of 30 seconds
   * - Enhanced error handling for deleted lists (404 detection)
   * - Non-blocking list addition (subscription consent is more important)
   *
   * Retry Strategy:
   * - Uses retryRequest() wrapper for automatic retries
   * - Exponential backoff with jitter prevents thundering herd
   * - Gateway errors (502/504) get longer delays
   *
   * Error Handling:
   * - 404 errors (deleted lists) are logged as critical with clear instructions
   * - Other errors are logged but don't fail the entire operation
   * - Subscription consent is set even if list addition fails
   *
   * Note: The newer Klaviyo API requires a profile ID, not email.
   * You must upsert the profile first to get the profile ID, then use it here.
   *
   * @param profileId - Klaviyo profile ID (returned from upsertProfile)
   * @param email - Email address (required when setting email subscriptions)
   * @returns Success status and any error message
   */
  async subscribeToEmailList(profileId: string, email: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: "Klaviyo not configured" };
    }

    // Validate email list ID is configured
    if (!this.emailListId) {
      if (this.mode === "development") {
        // console.warn("⚠️ KLAVIYO_EMAIL_LIST_ID not configured - skipping email subscription");
      }
      return { success: false, error: "Email list ID not configured" };
    }

    // Validate profile ID
    if (!profileId || profileId.trim() === "") {
      console.error("❌ Invalid profile ID for email subscription:", profileId);
      return { success: false, error: "Profile ID is required" };
    }

    // Validate email
    if (!email || email.trim() === "") {
      console.error("❌ Invalid email for email subscription:", email);
      return { success: false, error: "Email is required for email subscriptions" };
    }

    try {
      // Use Subscribe Profiles endpoint - this properly sets the subscriptions object
      // Per Klaviyo documentation: subscriptions object contains email and sms objects
      const url = `${this.baseUrl}/profile-subscription-bulk-create-jobs/`;

      // Build subscriptions object for email marketing
      // Structure: subscriptions.email.marketing
      // Note: Only 'consent' field can be set - consent_timestamp, method, and method_detail are read-only
      const subscriptions = {
        email: {
          marketing: {
            consent: "SUBSCRIBED",
            // Note: consent_timestamp, method, and method_detail are read-only fields set by Klaviyo
            // Only 'consent' can be set via API
          },
        },
      };

      // Step 1: Set the subscriptions object on the profile
      // Note: email must be included in attributes when setting email subscriptions
      const payload = {
        data: {
          type: "profile-subscription-bulk-create-job",
          attributes: {
            profiles: {
              data: [
                {
                  type: "profile",
                  id: profileId,
                  attributes: {
                    email: email,
                    subscriptions: subscriptions,
                  },
                },
              ],
            },
          },
        },
      };

      // ✅ FIX: Use retryRequest wrapper for automatic retry on 502/504/5xx errors
      const response = await this.retryRequest(
        () =>
          fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Klaviyo-API-Key ${this.apiKey}`,
              revision: "2024-10-15",
            },
            body: JSON.stringify(payload),
          }),
        this.MAX_RETRIES,
        this.BASE_RETRY_DELAY_MS
      );

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage = responseData.errors?.[0]?.detail || `HTTP ${response.status}: ${response.statusText}`;
        const fullError = responseData.errors || responseData;
        console.error("❌ Klaviyo email subscription error details:", {
          status: response.status,
          statusText: response.statusText,
          errorMessage,
          fullError,
          payload: JSON.stringify(payload, null, 2),
        });
        throw new Error(`Klaviyo email subscription error: ${errorMessage}`);
      }

      // Log successful response for debugging
      if (this.mode === "development") {
        console.log("✅ Email subscription job created:", {
          profileId,
          email,
          responseStatus: response.status,
          responseData,
        });
      }

      // Step 2: Add profile to email list using relationships endpoint
      if (this.emailListId) {
        const listUrl = `${this.baseUrl}/lists/${this.emailListId}/relationships/profiles/`;
        const listPayload = {
          data: [
            {
              type: "profile",
              id: profileId,
            },
          ],
        };

        // ✅ FIX: Use retryRequest wrapper for list addition (with retry logic)
        try {
          const listResponse = await this.retryRequest(
            () =>
              fetch(listUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Klaviyo-API-Key ${this.apiKey}`,
                  revision: "2024-10-15",
                },
                body: JSON.stringify(listPayload),
              }),
            this.MAX_RETRIES,
            this.BASE_RETRY_DELAY_MS
          );

          if (!listResponse.ok) {
            const errorData = await listResponse.json().catch(() => ({}));
            const errorMessage =
              errorData.errors?.[0]?.detail || `HTTP ${listResponse.status}: ${listResponse.statusText}`;

            // ✅ FIX: Enhanced error handling for deleted lists (404 detection)
            if (listResponse.status === 404) {
              console.error(
                `❌ CRITICAL: Klaviyo email list not found (404). ` +
                  `List ID: ${this.emailListId}. ` +
                  `The list may have been deleted. Check your Klaviyo dashboard and update KLAVIYO_EMAIL_LIST_ID.`
              );
            } else {
              // Log but don't fail - subscriptions are set, list addition is secondary
              console.warn(`⚠️ Failed to add profile to email list: ${errorMessage}`);
            }
          } else if (this.mode === "development") {
            // Success - profile added to list
            console.log("✅ Profile added to email list:", { profileId, listId: this.emailListId });
          }
        } catch (error) {
          // If retry fails completely, log but don't fail the entire operation
          // Subscription consent is more important than list addition
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.warn(`⚠️ Failed to add profile to email list after retries: ${errorMessage}`);
        }
      } else {
        console.warn("⚠️ KLAVIYO_EMAIL_LIST_ID not configured - profile subscriptions set but not added to list");
      }

      if (this.mode === "development") {
        console.log("✅ Email subscription completed:", { profileId, email, listId: this.emailListId });
      }

      return { success: true };
    } catch (error) {
      console.error("❌ Failed to subscribe user to email list:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Unsubscribe user from email marketing list
   *
   * Sets email marketing consent to unsubscribed using the profile-subscription-bulk-delete-jobs endpoint.
   * This is the correct way to unsubscribe users per Klaviyo documentation.
   *
   * @param profileId - Klaviyo profile ID
   * @param email - Email address (required)
   * @returns Success status and any error message
   */
  async unsubscribeFromEmailList(profileId: string, email: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: "Klaviyo not configured" };
    }

    // Validate profile ID
    if (!profileId || profileId.trim() === "") {
      console.error("❌ Invalid profile ID for email unsubscribe:", profileId);
      return { success: false, error: "Profile ID is required" };
    }

    // Validate email
    if (!email || email.trim() === "") {
      console.error("❌ Invalid email for email unsubscribe:", email);
      return { success: false, error: "Email is required" };
    }

    try {
      const url = `${this.baseUrl}/profile-subscription-bulk-delete-jobs/`;

      // Build subscriptions object to unsubscribe from email marketing
      const payload = {
        data: {
          type: "profile-subscription-bulk-delete-job",
          attributes: {
            profiles: {
              data: [
                {
                  type: "profile",
                  id: profileId,
                  attributes: {
                    email: email,
                    subscriptions: {
                      email: {
                        marketing: {},
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      };

      const response = await this.retryRequest(
        () =>
          fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Klaviyo-API-Key ${this.apiKey}`,
              revision: "2024-10-15",
            },
            body: JSON.stringify(payload),
          }),
        this.MAX_RETRIES,
        this.BASE_RETRY_DELAY_MS
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.errors?.[0]?.detail || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(`Klaviyo email unsubscribe error: ${errorMessage}`);
      }

      if (this.mode === "development") {
        console.log("✅ Email unsubscribe completed:", { profileId, email });
      }

      return { success: true };
    } catch (error) {
      console.error("❌ Failed to unsubscribe from email list:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Unsubscribe user from SMS marketing list
   *
   * Sets SMS marketing consent to unsubscribed using the profile-subscription-bulk-delete-jobs endpoint.
   * This is the correct way to unsubscribe users per Klaviyo documentation.
   *
   * @param profileId - Klaviyo profile ID
   * @param phoneNumber - Phone number (required)
   * @returns Success status and any error message
   */
  async unsubscribeFromSMSList(profileId: string, phoneNumber: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: "Klaviyo not configured" };
    }

    // Validate profile ID
    if (!profileId || profileId.trim() === "") {
      console.error("❌ Invalid profile ID for SMS unsubscribe:", profileId);
      return { success: false, error: "Profile ID is required" };
    }

    // Validate phone number
    if (!phoneNumber || phoneNumber.trim() === "") {
      console.error("❌ Invalid phone number for SMS unsubscribe:", phoneNumber);
      return { success: false, error: "Phone number is required" };
    }

    try {
      const url = `${this.baseUrl}/profile-subscription-bulk-delete-jobs/`;

      // Build subscriptions object to unsubscribe from SMS marketing
      const payload = {
        data: {
          type: "profile-subscription-bulk-delete-job",
          attributes: {
            profiles: {
              data: [
                {
                  type: "profile",
                  id: profileId,
                  attributes: {
                    phone_number: phoneNumber,
                    subscriptions: {
                      sms: {
                        marketing: {},
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      };

      const response = await this.retryRequest(
        () =>
          fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Klaviyo-API-Key ${this.apiKey}`,
              revision: "2024-10-15",
            },
            body: JSON.stringify(payload),
          }),
        this.MAX_RETRIES,
        this.BASE_RETRY_DELAY_MS
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.errors?.[0]?.detail || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(`Klaviyo SMS unsubscribe error: ${errorMessage}`);
      }

      if (this.mode === "development") {
        console.log("✅ SMS unsubscribe completed:", { profileId, phoneNumber });
      }

      return { success: true };
    } catch (error) {
      console.error("❌ Failed to unsubscribe from SMS list:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Remove profile from email and SMS lists
   *
   * Removes the profile from configured lists using the DELETE relationships endpoint.
   * This does not change consent status, only removes list membership.
   *
   * @param profileId - Klaviyo profile ID
   * @returns Success status and any error message
   */
  async removeFromLists(profileId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: "Klaviyo not configured" };
    }

    // Validate profile ID
    if (!profileId || profileId.trim() === "") {
      console.error("❌ Invalid profile ID for list removal:", profileId);
      return { success: false, error: "Profile ID is required" };
    }

    const results: { email?: boolean; sms?: boolean } = {};
    const errors: string[] = [];

    // Remove from email list if configured
    if (this.emailListId) {
      try {
        const emailListUrl = `${this.baseUrl}/lists/${this.emailListId}/relationships/profiles/`;
        const emailListPayload = {
          data: [
            {
              type: "profile",
              id: profileId,
            },
          ],
        };

        const emailResponse = await this.retryRequest(
          () =>
            fetch(emailListUrl, {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Klaviyo-API-Key ${this.apiKey}`,
                revision: "2024-10-15",
              },
              body: JSON.stringify(emailListPayload),
            }),
          this.MAX_RETRIES,
          this.BASE_RETRY_DELAY_MS
        );

        if (emailResponse.ok) {
          results.email = true;
          if (this.mode === "development") {
            console.log("✅ Profile removed from email list:", { profileId, listId: this.emailListId });
          }
        } else {
          const errorData = await emailResponse.json().catch(() => ({}));
          const errorMessage = errorData.errors?.[0]?.detail || `HTTP ${emailResponse.status}: ${emailResponse.statusText}`;
          errors.push(`Email list: ${errorMessage}`);
          console.warn(`⚠️ Failed to remove profile from email list: ${errorMessage}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        errors.push(`Email list: ${errorMessage}`);
        console.warn(`⚠️ Failed to remove profile from email list after retries: ${errorMessage}`);
      }
    }

    // Remove from SMS list if configured
    if (this.smsListId) {
      try {
        const smsListUrl = `${this.baseUrl}/lists/${this.smsListId}/relationships/profiles/`;
        const smsListPayload = {
          data: [
            {
              type: "profile",
              id: profileId,
            },
          ],
        };

        const smsResponse = await this.retryRequest(
          () =>
            fetch(smsListUrl, {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Klaviyo-API-Key ${this.apiKey}`,
                revision: "2024-10-15",
              },
              body: JSON.stringify(smsListPayload),
            }),
          this.MAX_RETRIES,
          this.BASE_RETRY_DELAY_MS
        );

        if (smsResponse.ok) {
          results.sms = true;
          if (this.mode === "development") {
            console.log("✅ Profile removed from SMS list:", { profileId, listId: this.smsListId });
          }
        } else {
          const errorData = await smsResponse.json().catch(() => ({}));
          const errorMessage = errorData.errors?.[0]?.detail || `HTTP ${smsResponse.status}: ${smsResponse.statusText}`;
          errors.push(`SMS list: ${errorMessage}`);
          console.warn(`⚠️ Failed to remove profile from SMS list: ${errorMessage}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        errors.push(`SMS list: ${errorMessage}`);
        console.warn(`⚠️ Failed to remove profile from SMS list after retries: ${errorMessage}`);
      }
    }

    // Return success if at least one operation succeeded, or if no lists are configured
    const hasResults = results.email || results.sms;
    const hasLists = this.emailListId || this.smsListId;

    if (!hasLists) {
      // No lists configured - not an error
      return { success: true };
    }

    return {
      success: hasResults || errors.length === 0,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    };
  }

  /**
   * Delete profile from Klaviyo (GDPR-compliant)
   *
   * Uses the data-privacy-deletion-jobs endpoint to permanently delete a profile.
   * This is an asynchronous operation - deletion is queued and processed by Klaviyo.
   * The profile will appear on the Deleted Profiles page when complete.
   *
   * @param email - Email address (required identifier)
   * @param phoneNumber - Phone number (optional identifier)
   * @returns Success status, job ID, and any error message
   */
  async deleteProfile(
    email: string,
    phoneNumber?: string
  ): Promise<{ success: boolean; jobId?: string; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: "Klaviyo not configured" };
    }

    // Validate email
    if (!email || email.trim() === "") {
      console.error("❌ Invalid email for profile deletion:", email);
      return { success: false, error: "Email is required" };
    }

    try {
      const url = `${this.baseUrl}/data-privacy-deletion-jobs/`;

      // ⚠️ CRITICAL: Klaviyo API only allows ONE identifier per request (email OR phone_number OR id)
      // Providing multiple identifiers will result in a 400 error
      // We use email as the primary identifier since it's required
      const payload = {
        data: {
          type: "data-privacy-deletion-job",
          attributes: {
            profile: {
              data: {
                type: "profile",
                attributes: {
                  email: email,
                  // Note: Do NOT include phone_number here - Klaviyo only accepts ONE identifier
                  // If email doesn't work, you can try phone_number separately, but not both
                },
              },
            },
          },
        },
      };

      // Log payload for debugging (only in development or if explicitly enabled)
      if (this.mode === "development" || process.env.KLAVIYO_DEBUG_DELETION === "true") {
        console.log("📤 Klaviyo deletion request payload:", JSON.stringify(payload, null, 2));
      }

      const response = await this.retryRequest(
        () =>
          fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Klaviyo-API-Key ${this.apiKey}`,
              revision: "2024-10-15",
            },
            body: JSON.stringify(payload),
          }),
        this.MAX_RETRIES,
        this.BASE_RETRY_DELAY_MS
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.errors?.[0]?.detail || `HTTP ${response.status}: ${response.statusText}`;
        const fullError = errorData.errors || errorData;
        
        console.error("❌ Klaviyo profile deletion API error:", {
          status: response.status,
          statusText: response.statusText,
          errorMessage,
          fullError: JSON.stringify(fullError, null, 2),
          payload: JSON.stringify(payload, null, 2),
        });
        
        throw new Error(`Klaviyo profile deletion error: ${errorMessage}`);
      }

      const responseData = await response.json().catch(() => ({}));
      const jobId = responseData.data?.id;

      // Log the full response for debugging
      console.log("✅ Klaviyo profile deletion job created:", {
        email,
        phoneNumber: phoneNumber || "none",
        jobId: jobId || "unknown",
        status: response.status,
        responseData: JSON.stringify(responseData, null, 2),
      });

      if (!jobId) {
        console.warn("⚠️ Klaviyo deletion job created but no job ID returned. Response:", responseData);
      }

      return {
        success: true,
        jobId: jobId || "job_created",
      };
    } catch (error) {
      console.error("❌ Failed to delete Klaviyo profile:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async trackEvent(event: KlaviyoEvent, options: TrackEventOptions = {}): Promise<KlaviyoEventResponse> {
    const { skipIfDisabled = true, retryOnFailure = true, logToConsole = this.mode === "development" } = options;

    if (!this.isConfigured()) {
      if (skipIfDisabled) {
        return { success: false, error: "Klaviyo not configured" };
      }
    }

    const formattedEvent = {
      ...event,
      event: this.formatEventName(event.event),
    };

    if (logToConsole) {
      // console.log(`📊 Tracking Klaviyo event: ${formattedEvent.event}`, {
      //   email: formattedEvent.customer_properties.email,
      //   properties: formattedEvent.properties,
      // });
    }

    try {
      const payload = {
        data: {
          type: "event",
          attributes: {
            metric: {
              data: {
                type: "metric",
                attributes: {
                  name: formattedEvent.event,
                },
              },
            },
            profile: {
              data: {
                type: "profile",
                attributes: {
                  email: formattedEvent.customer_properties.email,
                  first_name: formattedEvent.customer_properties.first_name,
                  last_name: formattedEvent.customer_properties.last_name,
                  phone_number: formattedEvent.customer_properties.phone_number,
                },
              },
            },
            properties: formattedEvent.properties,
            time: formattedEvent.time ? new Date(formattedEvent.time * 1000).toISOString() : new Date().toISOString(),
          },
        },
      };

      const requestFn = () => this.makeRequest("/events/", "POST", payload);
      const response = retryOnFailure ? await this.retryRequest(requestFn) : await requestFn();

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Klaviyo API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      // Klaviyo sometimes returns 204 No Content or empty response for events
      let eventId = "event_tracked";
      const contentType = response.headers.get("content-type");

      if (contentType && contentType.includes("application/json")) {
        try {
          const data = await response.json();
          eventId = data.data?.id || "event_tracked";
        } catch {
          // Empty response body is OK for events - it means success
          // console.log(`✅ Event accepted by Klaviyo (no response body)`);
        }
      }

      if (logToConsole) {
        // console.log(`✅ Event tracked successfully: ${formattedEvent.event}`, { eventId });
      }

      return {
        success: true,
        event_id: eventId,
      };
    } catch (error) {
      console.error(`❌ Failed to track Klaviyo event: ${formattedEvent.event}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  trackEventBackground(event: KlaviyoEvent, options?: TrackEventOptions): void {
    this.trackEvent(event, options).catch((error) => {
      // Enhanced error logging for production debugging
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const eventName = event.event;
      const userEmail = event.customer_properties?.email || "unknown";
      const isTimeout = errorMessage.toLowerCase().includes("timeout");

      // ✅ ENHANCED: Log timeout errors as warnings (non-critical), other errors as errors
      if (isTimeout) {
        console.warn(`⚠️ Klaviyo Background Event Timeout (non-blocking):`, {
          event: eventName,
          user: userEmail,
          error: errorMessage,
          mode: this.mode,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.error(`📊 Klaviyo Background Event Failed:`, {
          event: eventName,
          user: userEmail,
          error: errorMessage,
          mode: this.mode,
          timestamp: new Date().toISOString(),
        });

        // In production, you might want to send this to a monitoring service
        if (this.mode === "production") {
          // TODO: Consider integrating with error monitoring service (Sentry, etc.)
          console.error("🔴 Production Klaviyo Event Failure - Consider alerting");
        }
      }
    });
  }

  /**
   * Verify Klaviyo connectivity and configuration
   * Useful for health checks and production readiness
   */
  async verifyConnection(): Promise<{ success: boolean; error?: string; details?: Record<string, unknown> }> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: "Klaviyo not configured - missing API key or disabled",
      };
    }

    try {
      // Test with a simpler endpoint that doesn't require specific data
      // Using the profiles endpoint with a limit to avoid validation issues
      const response = await this.makeRequest("/profiles/?page[size]=1", "GET");

      // Also check if we get a proper response structure
      let responseBody = null;
      try {
        responseBody = await response.json();
      } catch {
        // If JSON parsing fails, we still have the HTTP status to work with
      }

      return {
        success: response.ok,
        details: {
          status: response.status,
          mode: this.mode,
          hasApiKey: !!this.apiKey,
          timestamp: new Date().toISOString(),
          responseType: response.headers.get("content-type"),
          hasValidResponse: !!responseBody,
        },
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        details: {
          mode: this.mode,
          hasApiKey: !!this.apiKey,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Find Klaviyo profile ID by email
   *
   * @param email - Email address to search for
   * @returns Profile ID if found, null otherwise
   */
  async findProfileByEmail(email: string): Promise<string | null> {
    if (!this.isConfigured()) {
      return null;
    }

    if (!email || email.trim() === "") {
      return null;
    }

    try {
      const searchResponse = await Promise.race([
        this.retryRequest(
          () => this.makeRequest(`/profiles/?filter=equals(email,"${email}")`, "GET"),
          2, // Fewer retries for lookup (non-critical)
          1000 // Shorter delay
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Profile lookup timeout")), 10000)
        ),
      ]);

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        const existingProfile = searchData.data?.[0];
        if (existingProfile?.id) {
          return existingProfile.id;
        }
      }
    } catch (error) {
      // Non-critical - log but don't fail
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.toLowerCase().includes("timeout");
      if (!isTimeout && this.mode === "development") {
        console.warn(`⚠️ Failed to find Klaviyo profile for ${email}:`, errorMessage);
      }
    }

    return null;
  }

  /**
   * Get current configuration status for debugging
   */
  getConfigStatus(): {
    enabled: boolean;
    mode: "development" | "production";
    hasApiKey: boolean;
    isProduction: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const nodeEnv = process.env.NODE_ENV || "development";
    const isProduction = nodeEnv === "production";

    if (!this.apiKey) {
      warnings.push("Missing KLAVIYO_PRIVATE_API_KEY");
    }

    if (!this.enabled) {
      warnings.push("Klaviyo is disabled (KLAVIYO_ENABLED=false)");
    }

    if (isProduction && this.mode !== "production") {
      warnings.push("Production environment but KLAVIYO_MODE is not 'production'");
    }

    if (!isProduction && this.mode !== "development") {
      warnings.push("Development environment but KLAVIYO_MODE is not 'development'");
    }

    return {
      enabled: this.enabled,
      mode: this.mode,
      hasApiKey: !!this.apiKey,
      isProduction,
      warnings,
    };
  }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

export const klaviyo = new KlaviyoClient();
