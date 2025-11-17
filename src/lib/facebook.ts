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
export async function sendFacebookEvent(event: FacebookEvent): Promise<boolean> {
  try {
    const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    const pixelId = process.env.FACEBOOK_PIXEL_ID;

    if (!accessToken || !pixelId) {
      console.warn("Facebook credentials not configured");
      return false;
    }

    const response = await fetch(`https://graph.facebook.com/v18.0/${pixelId}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: [event],
        access_token: accessToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Facebook API error:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending Facebook event:", error);
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
  currency: string = "USD",
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
  currency: string = "USD",
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
  currency: string = "USD",
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
  currency: string = "USD",
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
