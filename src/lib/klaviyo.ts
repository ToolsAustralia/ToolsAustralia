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

  return { apiKey, mode, enabled, nodeEnv };
};

// ============================================================
// API CLIENT
// ============================================================

class KlaviyoClient {
  private apiKey: string | undefined;
  private baseUrl = "https://a.klaviyo.com/api";
  private mode: "development" | "production";
  private enabled: boolean;

  constructor() {
    const config = getKlaviyoConfig();
    this.apiKey = config.apiKey;
    this.mode = config.mode;
    this.enabled = config.enabled;

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
      console.warn("⚠️ In development but KLAVIYO_MODE is not 'development'. Events will not have [DEV] prefix.");
    }

    if (!isDevelopment && this.mode !== "production") {
      console.warn(
        "⚠️ In production but KLAVIYO_MODE is not 'production'. Consider updating for production deployment."
      );
    }

    // Production readiness check
    if (!isDevelopment) {
      if (!this.apiKey) {
        console.error("❌ CRITICAL: KLAVIYO_PRIVATE_API_KEY is missing in production!");
      }
      if (!this.enabled) {
        console.warn("⚠️ Klaviyo is disabled in production (KLAVIYO_ENABLED=false)");
      }
    }
  }

  private isConfigured(): boolean {
    if (!this.enabled) {
      if (this.mode === "development") {
        console.log("⚠️ Klaviyo is disabled (KLAVIYO_ENABLED=false)");
      }
      return false;
    }

    if (!this.apiKey) {
      console.warn("⚠️ Klaviyo API key is missing. Set KLAVIYO_PRIVATE_API_KEY in .env");
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
      console.log(`🎹 DEV Event Formatting: "${eventName}" → "${devEventName}"`);
      return devEventName;
    }

    // In development mode, log if event already has prefix (for debugging)
    if (this.mode === "development" && eventName.startsWith("[DEV]")) {
      console.log(`🎹 Event already has [DEV] prefix: "${eventName}"`);
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
          console.log(`⚠️ Klaviyo request failed (attempt ${attempt}/${maxRetries}). Retrying in ${waitTime}ms...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError || new Error("Request failed after retries");
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
      const payload = {
        data: {
          type: "profile",
          attributes: {
            email: profile.email,
            first_name: profile.first_name,
            last_name: profile.last_name,
            phone_number: profile.phone_number,
            properties: profile.properties || {},
          },
        },
      };

      // First, try to create the profile
      let response = await this.retryRequest(() => this.makeRequest("/profiles/", "POST", payload));

      // If we get a 409 conflict, it means the profile already exists
      if (response.status === 409) {
        if (this.mode === "development") {
          console.log("🔄 Profile already exists, attempting to update:", { email: profile.email });
        }

        // Try to get the existing profile ID from the error response
        const errorData = await response.json().catch(() => ({}));
        const duplicateProfileId = errorData.errors?.[0]?.meta?.duplicate_profile_id;

        if (duplicateProfileId) {
          // Update the existing profile using PATCH
          const updatePayload = {
            data: {
              type: "profile",
              id: duplicateProfileId,
              attributes: {
                first_name: profile.first_name,
                last_name: profile.last_name,
                phone_number: profile.phone_number,
                properties: profile.properties || {},
              },
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
              const updatePayload = {
                data: {
                  type: "profile",
                  id: existingProfile.id,
                  attributes: {
                    first_name: profile.first_name,
                    last_name: profile.last_name,
                    phone_number: profile.phone_number,
                    properties: profile.properties || {},
                  },
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
        console.log("✅ Klaviyo profile upserted:", { email: profile.email, profileId });
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
      console.log(`📊 Tracking Klaviyo event: ${formattedEvent.event}`, {
        email: formattedEvent.customer_properties.email,
        properties: formattedEvent.properties,
      });
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
          console.log(`✅ Event accepted by Klaviyo (no response body)`);
        }
      }

      if (logToConsole) {
        console.log(`✅ Event tracked successfully: ${formattedEvent.event}`, { eventId });
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
