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

// Hash function for PII data (required by Facebook)
export function hashData(data: string): string {
  return crypto.createHash("sha256").update(data.toLowerCase().trim()).digest("hex");
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

    // Build request body
    const requestBody: {
      data: FacebookEvent[];
      access_token: string;
      test_event_code?: string;
    } = {
      data: [event],
      access_token: accessToken,
    };

    // Add test_event_code if provided (for testing without affecting production data)
    if (testEventCode) {
      requestBody.test_event_code = testEventCode;
    }

    const response = await fetch(`https://graph.facebook.com/v18.0/${pixelId}/events`, {
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

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorText;
        errorCode = errorJson.error?.code?.toString();
      } catch {
        errorMessage = errorText;
      }

      console.error(`❌ Facebook Conversions API error (${errorCode || "unknown"}):`, {
        message: errorMessage,
        event_name: event.event_name,
        event_id: event.event_id,
        pixel_id: pixelId,
      });
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
    } catch (parseError) {
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
