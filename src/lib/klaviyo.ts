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
  const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
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

    if (!isDevelopment && this.mode !== "production") {
      // console.warn(
      //   "⚠️ In production but KLAVIYO_MODE is not 'production'. Consider updating for production deployment."
      // );
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
    if (!this.enabled) {
      if (this.mode === "development") {
        // console.log("⚠️ Klaviyo is disabled (KLAVIYO_ENABLED=false)");
      }
      return false;
    }

    if (!this.apiKey) {
      // console.warn("⚠️ Klaviyo API key is missing. Set KLAVIYO_PRIVATE_API_KEY in .env");
      return false;
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

  private async makeRequest(endpoint: string, method: "GET" | "POST" | "PATCH", body?: unknown): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Klaviyo-API-Key ${this.apiKey}`,
        "Content-Type": "application/json",
        revision: "2024-10-15",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    return response;
  }

  private async retryRequest<T>(fn: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          const waitTime = delay * Math.pow(2, attempt - 1);
          // console.log(`⚠️ Klaviyo request failed (attempt ${attempt}/${maxRetries}). Retrying in ${waitTime}ms...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
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

      // ✅ DEBUG: Log payload to verify properties are being sent
      // Uncomment this to debug missing properties
      // console.log("📊 Klaviyo Profile Payload:", {
      //   email: profile.email,
      //   propertiesCount: Object.keys(cleanedProperties).length,
      //   propertiesKeys: Object.keys(cleanedProperties),
      //   properties: cleanedProperties,
      // });

      // First, try to create the profile
      let response = await this.retryRequest(() => this.makeRequest("/profiles/", "POST", payload));

      // If we get a 409 conflict, it means the profile already exists
      if (response.status === 409) {
        if (this.mode === "development") {
          // console.log("🔄 Profile already exists, attempting to update:", { email: profile.email });
        }

        // Try to get the existing profile ID from the error response
        const errorData = await response.json().catch(() => ({}));
        const duplicateProfileId = errorData.errors?.[0]?.meta?.duplicate_profile_id;

        if (duplicateProfileId) {
          // Update the existing profile using PATCH
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

          response = await this.retryRequest(() =>
            this.makeRequest(`/profiles/${duplicateProfileId}/`, "PATCH", updatePayload)
          );
        } else {
          // Fallback: try to find profile by email and update
          const searchResponse = await this.retryRequest(() =>
            this.makeRequest(`/profiles/?filter=equals(email,"${profile.email}")`, "GET")
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

              response = await this.retryRequest(() =>
                this.makeRequest(`/profiles/${existingProfile.id}/`, "PATCH", updatePayload)
              );
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
      console.error("❌ Failed to upsert Klaviyo profile:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
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

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Klaviyo-API-Key ${this.apiKey}`,
          revision: "2024-10-15",
        },
        body: JSON.stringify(payload),
      });

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

        const listResponse = await fetch(listUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Klaviyo-API-Key ${this.apiKey}`,
            revision: "2024-10-15",
          },
          body: JSON.stringify(listPayload),
        });

        if (!listResponse.ok) {
          const errorData = await listResponse.json().catch(() => ({}));
          const errorMessage =
            errorData.errors?.[0]?.detail || `HTTP ${listResponse.status}: ${listResponse.statusText}`;
          // Log but don't fail - subscriptions are set, list addition is secondary
          console.warn(`⚠️ Failed to add profile to SMS list: ${errorMessage}`);
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
   * This is the correct way to set email consent in Klaviyo per their documentation
   * Uses the subscriptions object structure to properly set consent
   *
   * Note: The newer Klaviyo API requires a profile ID, not email
   * You must upsert the profile first to get the profile ID, then use it here
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

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Klaviyo-API-Key ${this.apiKey}`,
          revision: "2024-10-15",
        },
        body: JSON.stringify(payload),
      });

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

        const listResponse = await fetch(listUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Klaviyo-API-Key ${this.apiKey}`,
            revision: "2024-10-15",
          },
          body: JSON.stringify(listPayload),
        });

        if (!listResponse.ok) {
          const errorData = await listResponse.json().catch(() => ({}));
          const errorMessage =
            errorData.errors?.[0]?.detail || `HTTP ${listResponse.status}: ${listResponse.statusText}`;
          // Log but don't fail - subscriptions are set, list addition is secondary
          console.warn(`⚠️ Failed to add profile to email list: ${errorMessage}`);
        } else {
          if (this.mode === "development") {
            console.log("✅ Profile added to email list:", { profileId, listId: this.emailListId });
          }
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
