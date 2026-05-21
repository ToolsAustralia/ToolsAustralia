// Facebook Pixel and Conversions API integration
export interface FacebookEvent {
  event_name: string;
  event_time: number;
  event_id?: string; // Event ID for deduplication (required when using both browser pixel and Conversions API)
  user_data: {
    em?: string; // email hash
    ph?: string; // phone hash
    fn?: string; // first name hash
    ln?: string; // last name hash
    ct?: string; // city hash
    st?: string; // state hash
    zp?: string; // zip code hash
    country?: string; // country code
    external_id?: string; // hashed external ID (recommended for matching)
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string; // Facebook click ID
    fbp?: string; // Facebook browser ID
  };
  custom_data?: {
    currency?: string;
    value?: number;
    content_ids?: string[];
    content_type?: string;
    content_name?: string;
    content_category?: string;
    num_items?: number;
    order_id?: string;
    search_string?: string;
  };
  event_source_url?: string; // URL where the event occurred
  action_source: "website" | "app" | "phone_call" | "chat" | "physical_store" | "system_generated" | "other";
}

export interface FacebookPixelEvent {
  event: string;
  user_data?: {
    em?: string;
    ph?: string;
    fn?: string;
    ln?: string;
    ct?: string;
    st?: string;
    zp?: string;
    country?: string;
    client_user_agent?: string;
  };
  custom_data?: {
    currency?: string;
    value?: number;
    content_ids?: string[];
    content_type?: string;
    content_name?: string;
    content_category?: string;
    num_items?: number;
    order_id?: string;
    search_string?: string;
  };
}

import crypto from "crypto";

/**
 * Graph API version used for Conversions API calls.
 * Why: v18.0 expired Jan 26, 2026 — Meta auto-routes expired versions to the
 * next available one, which is unstable. v23.0 is the goldilocks pick: released
 * mid-2025, supported through ~2027, well past its early-bug shakeout window.
 * Bump in one place when Meta's stable recommendation changes.
 */
const FB_GRAPH_API_VERSION = "v23.0";

/**
 * Get Facebook test event code when testing is enabled.
 * Use test events when NODE_ENV is development OR FACEBOOK_USE_TEST_EVENTS is "true".
 * FACEBOOK_USE_TEST_EVENTS allows test events in Vercel staging (where NODE_ENV is production).
 */
export function getFacebookTestEventCode(): string | undefined {
  const useTestEvents =
    process.env.NODE_ENV === "development" ||
    process.env.FACEBOOK_USE_TEST_EVENTS === "true";
  return useTestEvents ? process.env.FACEBOOK_TEST_EVENT_CODE : undefined;
}

/** SHA256 hash for PII - Meta requires lowercase, trimmed input before hashing */
export function hashData(data: string): string {
  return crypto.createHash("sha256").update(data.toLowerCase().trim()).digest("hex");
}

/** Remove undefined, null, and invalid values from object (recursive for nested) */
export function removeUndefinedAndInvalidFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "number" && (Number.isNaN(value) || !Number.isFinite(value))) continue;
    if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      const cleaned = removeUndefinedAndInvalidFields(value as Record<string, unknown>);
      if (Object.keys(cleaned).length > 0) result[key] = cleaned;
    } else {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}

/** Whether current env suggests localhost/dev (no public URL) */
function isLocalhostOrMissingUrl(): boolean {
  const base =
    process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (!base) return true;
  const url = base.startsWith("http") ? base : `https://${base}`;
  return url.includes("localhost") || url.includes("127.0.0.1");
}

/** Fallback event_source_url for localhost - Meta rejects invalid URLs (error 100) */
const DEV_CHECKOUT_FALLBACK_URL = "https://example.com/dev-checkout";

export interface BuildFacebookPurchaseEventParams {
  value: number;
  currency: string;
  eventId: string;
  userData: {
    em?: string;
    ph?: string;
    fn?: string;
    ln?: string;
    st?: string;
    external_id?: string;
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
    country?: string;
  };
  eventSourceUrl?: string;
  /**
   * "website" (default) for browser-initiated checkouts. "system_generated" for
   * server-initiated events with no live browser session (e.g. Stripe webhooks).
   * Per Meta's server-event spec, `event_source_url` is required for "website"
   * but optional for "system_generated".
   */
  actionSource?: "website" | "system_generated";
  customData?: {
    value: number;
    currency: string;
    order_id?: string;
    content_ids?: string[];
    content_type?: string;
    num_items?: number;
  };
}

/**
 * Build a validated Facebook Purchase event for CAPI (dev-friendly).
 * Ensures payload is always valid even on localhost.
 * Returns null if validation fails (value <= 0, invalid currency).
 */
export function buildFacebookPurchaseEventDev(params: BuildFacebookPurchaseEventParams): FacebookEvent | null {
  const { value, currency, eventId, userData, eventSourceUrl, customData } = params;
  const actionSource = params.actionSource ?? "website";

  // Validate value (number, > 0)
  const numValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numValue) || numValue <= 0) {
    return null;
  }

  // Validate currency (non-empty string, 3 chars typical)
  const safeCurrency = typeof currency === "string" && currency.trim().length > 0
    ? currency.trim().toUpperCase()
    : "AUD";
  if (!safeCurrency) return null;

  const eventTime = Math.floor(Date.now() / 1000);

  // event_source_url is required for action_source=website but optional for
  // system_generated. On localhost or when we don't have a real URL, fall back
  // to the dev URL only for website events so Meta accepts them.
  let resolvedEventSourceUrl = eventSourceUrl?.trim();
  if (!resolvedEventSourceUrl || resolvedEventSourceUrl.length === 0) {
    resolvedEventSourceUrl =
      actionSource === "website" && isLocalhostOrMissingUrl()
        ? DEV_CHECKOUT_FALLBACK_URL
        : undefined;
  }
  if (actionSource === "website" && !resolvedEventSourceUrl) return null;

  // user_data: must have at least client_user_agent for website events; ensure not empty
  const u: FacebookEvent["user_data"] = {
    ...(userData.em && { em: userData.em }),
    ...(userData.ph && { ph: userData.ph }),
    ...(userData.fn && { fn: userData.fn }),
    ...(userData.ln && { ln: userData.ln }),
    ...(userData.st && { st: userData.st }),
    ...(userData.country && { country: userData.country }),
    ...(userData.client_ip_address && { client_ip_address: userData.client_ip_address }),
    ...(userData.client_user_agent && { client_user_agent: userData.client_user_agent }),
    ...(userData.fbc && { fbc: userData.fbc }),
    ...(userData.fbp && { fbp: userData.fbp }),
    ...(userData.external_id && { external_id: userData.external_id }),
  };
  if (Object.keys(u).length === 0) {
    u.client_user_agent = userData.client_user_agent || "Mozilla/5.0 (compatible; Server-Side-CAPI/1.0)";
  }

  return {
    event_name: "Purchase",
    event_time: eventTime,
    action_source: actionSource,
    event_id: eventId,
    // event_source_url is only meaningful for website events; omit for system_generated
    // so we don't claim a stale URL is the source of a webhook-initiated event.
    ...(resolvedEventSourceUrl && { event_source_url: resolvedEventSourceUrl }),
    user_data: u,
    custom_data: {
      value: numValue,
      currency: safeCurrency,
      ...(customData?.order_id && { order_id: customData.order_id }),
      ...(customData?.content_ids && customData.content_ids.length > 0 && { content_ids: customData.content_ids }),
      ...(customData?.content_type && { content_type: customData.content_type }),
      ...(customData?.num_items != null && { num_items: customData.num_items }),
    },
  };
}

/**
 * Send Facebook Purchase event with dev-friendly behavior.
 * - Uses test_event_code in development for Events Manager testing
 * - Logs full payload and Meta response in development
 * - Never throws; returns false on error
 */
export async function sendFacebookPurchaseEventDev(event: FacebookEvent): Promise<boolean> {
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;

  if (!accessToken || !pixelId) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Facebook CAPI] Skipped: FACEBOOK_ACCESS_TOKEN or NEXT_PUBLIC_FACEBOOK_PIXEL_ID not set");
    }
    return false;
  }

  const isDev = process.env.NODE_ENV === "development";
  const testEventCode = getFacebookTestEventCode();

  // Remove undefined/invalid fields (Meta rejects with error 100)
  const sanitizedEvent = removeUndefinedAndInvalidFields(event as unknown as Record<string, unknown>) as unknown as FacebookEvent;
  const requestBody: { data: FacebookEvent[]; access_token: string; test_event_code?: string } = {
    data: [sanitizedEvent],
    access_token: accessToken,
  };
  if (testEventCode) requestBody.test_event_code = testEventCode;

  const url = `https://graph.facebook.com/${FB_GRAPH_API_VERSION}/${pixelId}/events`;

  try {
    if (isDev) {
      console.log("[Facebook CAPI Dev] Sending payload:", JSON.stringify(requestBody, null, 2));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();

    if (isDev) {
      console.log("[Facebook CAPI Dev] Response:", response.status, responseText);
    }

    if (!response.ok) {
      let errMsg = "Unknown error";
      try {
        const errJson = JSON.parse(responseText);
        errMsg = errJson.error?.message || responseText;
        console.error("[Facebook CAPI] Error:", errJson.error?.code, errMsg, errJson.error?.error_data);
      } catch {
        errMsg = responseText;
      }
      console.error(`[Facebook CAPI] Request failed (${response.status}):`, errMsg);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Facebook CAPI] Network/parse error:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Fallback client_user_agent - Meta requires it for website events to avoid _missing_event */
const CAPI_USER_AGENT_FALLBACK = "Mozilla/5.0 (compatible; Server-Side-CAPI/1.0)";

/**
 * Ensure website events have required user_data and event_source_url (Meta rejects with _missing_event otherwise)
 */
function ensureWebsiteEventValid(event: FacebookEvent): FacebookEvent {
  if (event.action_source !== "website") return event;

  const userData = { ...event.user_data };

  // Meta requires client_user_agent for website events - empty user_data causes _missing_event
  if (!userData.client_user_agent || userData.client_user_agent.trim() === "") {
    userData.client_user_agent = CAPI_USER_AGENT_FALLBACK;
  }

  // Meta requires event_source_url for website events
  const eventSourceUrl =
    event.event_source_url?.trim() ||
    (isLocalhostOrMissingUrl() ? DEV_CHECKOUT_FALLBACK_URL : "https://example.com/");

  return {
    ...event,
    user_data: userData,
    event_source_url: eventSourceUrl,
  };
}

// Send event to Facebook Conversions API
export async function sendFacebookEvent(event: FacebookEvent, testEventCode?: string): Promise<boolean> {
  try {
    const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    // Use NEXT_PUBLIC_FACEBOOK_PIXEL_ID (same as client-side pixel)
    const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;

    if (!accessToken) {
      // console.warn("⚠️ Facebook Conversions API: FACEBOOK_ACCESS_TOKEN not configured");
      return false;
    }

    if (!pixelId) {
      // console.warn("⚠️ Facebook Conversions API: NEXT_PUBLIC_FACEBOOK_PIXEL_ID not configured");
      return false;
    }

    // Ensure website events have required params to avoid Meta _missing_event error
    const sanitizedEvent = ensureWebsiteEventValid(event);

    // Build request body
    const requestBody: {
      data: FacebookEvent[];
      access_token: string;
      test_event_code?: string;
    } = {
      data: [sanitizedEvent],
      access_token: accessToken,
    };

    // Add test_event_code if provided (for testing without affecting production data)
    if (testEventCode) {
      requestBody.test_event_code = testEventCode;
    }

    const response = await fetch(`https://graph.facebook.com/${FB_GRAPH_API_VERSION}/${pixelId}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = "Unknown error";
      let errorCode: string | undefined;
      let errorSubcode: string | undefined;
      let errorData: unknown;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorText;
        errorCode = errorJson.error?.code?.toString();
        errorSubcode = errorJson.error?.error_subcode?.toString();
        errorData = errorJson.error?.error_data;
      } catch {
        errorMessage = errorText;
      }

      const logPayload: Record<string, unknown> = {
        message: errorMessage,
        event_name: event.event_name,
        event_id: event.event_id,
        pixel_id: pixelId,
      };
      if (errorSubcode) logPayload.error_subcode = errorSubcode;
      if (errorData && typeof errorData === "object") logPayload.error_data = errorData;
      console.error(`❌ Facebook Conversions API error (${errorCode || "unknown"}):`, logPayload);
      return false;
    }

    // Parse response to check for warnings (e.g., Event Match Quality)
    try {
      const responseData = await response.json();
      if (responseData.events_received !== undefined) {
        // console.log(
        //   `✅ Facebook Conversions API: Event received - ${event.event_name} (EventID: ${event.event_id || "none"})`
        // );

        // ✅ ENHANCED: Check for Event Match Quality warnings and scores
        if (responseData.events && responseData.events.length > 0) {
          const eventResponse = responseData.events[0];

          // Log warnings if present
          if (eventResponse.messages && Array.isArray(eventResponse.messages)) {
            eventResponse.messages.forEach((msg: { message?: string; type?: string; description?: string }) => {
              if (msg.type === "warning") {
                // console.warn(
                //   `⚠️ Facebook CAPI Warning for ${event.event_name}: ${msg.message || msg.description || "Unknown warning"}`
                // );
              } else if (msg.type === "error") {
                console.error(
                  `❌ Facebook CAPI Error for ${event.event_name}: ${msg.message || msg.description || "Unknown error"}`
                );
              }
            });
          }

          // Log event match quality details if available
          if (eventResponse.event_name && eventResponse.event_id) {
            const matchQualityInfo: Record<string, unknown> = {
              event_name: eventResponse.event_name,
              event_id: eventResponse.event_id,
            };

            // Extract match quality score if available (Meta may provide this in different formats)
            if (eventResponse.match_quality_score !== undefined) {
              matchQualityInfo.match_quality_score = eventResponse.match_quality_score;
            }

            // Log match quality information
            if (Object.keys(matchQualityInfo).length > 1) {
              // console.log(`📊 Event Match Quality for ${eventResponse.event_name}:`, matchQualityInfo);
            }
          }
        }
      }
    } catch {
      // Response parsing failed, but request was successful
      if (process.env.NODE_ENV === "development") {
        // console.warn("⚠️ Failed to parse Facebook CAPI response:", parseError);
      }
    }

    return true;
  } catch (error) {
    console.error("❌ Error sending Facebook event:", {
      error: error instanceof Error ? error.message : String(error),
      event_name: event.event_name,
      event_id: event.event_id,
    });
    return false;
  }
}

// Track page view
export function trackPageView(url: string, userAgent?: string): FacebookPixelEvent {
  return {
    event: "PageView",
    user_data: userAgent ? { client_user_agent: userAgent } : undefined,
    custom_data: {
      content_type: "page",
    },
  };
}

// Track purchase
export function trackPurchase(
  orderId: string,
  value: number,
  currency: string = "AUD",
  userData?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  }
): FacebookPixelEvent {
  const hashedUserData: Record<string, string> = {};

  if (userData?.email) hashedUserData.em = hashData(userData.email);
  if (userData?.phone) hashedUserData.ph = hashData(userData.phone);
  if (userData?.firstName) hashedUserData.fn = hashData(userData.firstName);
  if (userData?.lastName) hashedUserData.ln = hashData(userData.lastName);
  if (userData?.city) hashedUserData.ct = hashData(userData.city);
  if (userData?.state) hashedUserData.st = hashData(userData.state);
  if (userData?.zipCode) hashedUserData.zp = hashData(userData.zipCode);
  if (userData?.country) hashedUserData.country = userData.country;

  return {
    event: "Purchase",
    user_data: Object.keys(hashedUserData).length > 0 ? hashedUserData : undefined,
    custom_data: {
      currency,
      value,
      order_id: orderId,
      content_type: "product",
    },
  };
}

// Track add to cart
export function trackAddToCart(
  productId: string,
  value: number,
  currency: string = "AUD",
  userData?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  }
): FacebookPixelEvent {
  const hashedUserData: Record<string, string> = {};

  if (userData?.email) hashedUserData.em = hashData(userData.email);
  if (userData?.phone) hashedUserData.ph = hashData(userData.phone);
  if (userData?.firstName) hashedUserData.fn = hashData(userData.firstName);
  if (userData?.lastName) hashedUserData.ln = hashData(userData.lastName);

  return {
    event: "AddToCart",
    user_data: Object.keys(hashedUserData).length > 0 ? hashedUserData : undefined,
    custom_data: {
      currency,
      value,
      content_ids: [productId],
      content_type: "product",
    },
  };
}

// Track initiate checkout
export function trackInitiateCheckout(
  value: number,
  currency: string = "AUD",
  numItems: number,
  userData?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  }
): FacebookPixelEvent {
  const hashedUserData: Record<string, string> = {};

  if (userData?.email) hashedUserData.em = hashData(userData.email);
  if (userData?.phone) hashedUserData.ph = hashData(userData.phone);
  if (userData?.firstName) hashedUserData.fn = hashData(userData.firstName);
  if (userData?.lastName) hashedUserData.ln = hashData(userData.lastName);

  return {
    event: "InitiateCheckout",
    user_data: Object.keys(hashedUserData).length > 0 ? hashedUserData : undefined,
    custom_data: {
      currency,
      value,
      num_items: numItems,
      content_type: "product",
    },
  };
}

// Track search
export function trackSearch(
  searchString: string,
  userData?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  }
): FacebookPixelEvent {
  const hashedUserData: Record<string, string> = {};

  if (userData?.email) hashedUserData.em = hashData(userData.email);
  if (userData?.phone) hashedUserData.ph = hashData(userData.phone);
  if (userData?.firstName) hashedUserData.fn = hashData(userData.firstName);
  if (userData?.lastName) hashedUserData.ln = hashData(userData.lastName);

  return {
    event: "Search",
    user_data: Object.keys(hashedUserData).length > 0 ? hashedUserData : undefined,
    custom_data: {
      search_string: searchString,
      content_type: "product",
    },
  };
}

// Track view content
export function trackViewContent(
  productId: string,
  value: number,
  currency: string = "AUD",
  userData?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  }
): FacebookPixelEvent {
  const hashedUserData: Record<string, string> = {};

  if (userData?.email) hashedUserData.em = hashData(userData.email);
  if (userData?.phone) hashedUserData.ph = hashData(userData.phone);
  if (userData?.firstName) hashedUserData.fn = hashData(userData.firstName);
  if (userData?.lastName) hashedUserData.ln = hashData(userData.lastName);

  return {
    event: "ViewContent",
    user_data: Object.keys(hashedUserData).length > 0 ? hashedUserData : undefined,
    custom_data: {
      currency,
      value,
      content_ids: [productId],
      content_type: "product",
    },
  };
}
