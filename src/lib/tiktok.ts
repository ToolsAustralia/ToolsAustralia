// src/lib/tiktok.ts
// Canonical TikTok Events API (v1.3) sender. Parallel to src/lib/facebook.ts.
// Endpoint: POST https://business-api.tiktok.com/open_api/v1.3/event/track/
// Auth: header `Access-Token`. Success: HTTP 200 AND body `code === 0`.
// Verified 2026-05-22 against working code from Stape/mParticle/Adobe/Benly + TikTok
// help center — see docs/superpowers/specs/2026-05-22-tiktok-events-api-design.md §2/§2a.

import { hashPII } from "./tracking/canonical-event";
import { getPixelEnv, isProductionPixelEnv } from "./facebook-env";
import { normalizePhoneE164 } from "@/utils/tracking/tiktok-helpers";
import type { CanonicalEvent, RequestContext } from "./tracking/types";

// Re-export the shared phone normalizer so existing imports from `@/lib/tiktok`
// (the unit test, the provider) keep working. The canonical definition lives in
// tiktok-helpers.ts because it must be client-bundle-safe (no `crypto`) for the
// browser `ttq.identify` call to use the IDENTICAL normalization (dedup-safe).
export { normalizePhoneE164 };

const TIKTOK_EVENTS_API_URL =
  "https://business-api.tiktok.com/open_api/v1.3/event/track/";

/** Per-event object in the v1.3 `data[]` array. */
export interface TikTokEvent {
  event: string;
  event_time: number; // Unix SECONDS
  event_id: string;
  user: {
    email?: string; // sha256(lowercase+trim)
    phone_number?: string; // sha256(E.164)
    external_id?: string; // sha256(lowercase+trim)
    ttclid?: string; // raw
    ttp?: string; // raw (_ttp cookie)
    ip?: string; // raw
    user_agent?: string; // raw
  };
  properties: {
    value?: number;
    currency?: string;
    content_type?: string;
    order_id?: string;
    contents?: Array<{
      content_id?: string;
      content_type?: string;
      content_name?: string;
      quantity?: number;
      price?: number;
    }>;
    query?: string;
  };
  page?: { url?: string; referrer?: string };
}

export interface TikTokRequestBody {
  event_source: "web";
  event_source_id: string;
  test_event_code?: string;
  data: TikTokEvent[];
}

/** Map a provider-agnostic CanonicalEvent to a TikTok per-event object. Pure. */
export function mapCanonicalToTikTokEvent(
  event: CanonicalEvent,
  ctx: RequestContext,
): TikTokEvent {
  const u = event.userData ?? {};
  const cd = event.customData ?? {};

  const user: TikTokEvent["user"] = {
    ...(u.email && { email: hashPII(u.email) }),
    ...(u.phone &&
      normalizePhoneE164(u.phone) && {
        phone_number: hashPII(normalizePhoneE164(u.phone)),
      }),
    ...(u.externalId && { external_id: hashPII(u.externalId) }),
    ...(u.ttclid && { ttclid: u.ttclid }),
    ...(u.ttp && { ttp: u.ttp }),
    ...((u.clientIpAddress ?? ctx.clientIpAddress) && {
      ip: u.clientIpAddress ?? ctx.clientIpAddress,
    }),
    ...((u.clientUserAgent ?? ctx.clientUserAgent) && {
      user_agent: u.clientUserAgent ?? ctx.clientUserAgent,
    }),
  };

  const contents =
    cd.contentIds && cd.contentIds.length > 0
      ? cd.contentIds.map((id) => ({
          content_id: id,
          ...(cd.contentType && { content_type: cd.contentType }),
          ...(cd.contentName && { content_name: cd.contentName }),
          ...(cd.numItems !== undefined && { quantity: cd.numItems }),
        }))
      : undefined;

  const properties: TikTokEvent["properties"] = {
    ...(event.value !== undefined && { value: event.value }),
    ...(event.currency && { currency: event.currency }),
    ...(cd.contentType && { content_type: cd.contentType }),
    ...(cd.orderId && { order_id: cd.orderId }),
    ...(contents && { contents }),
    ...(cd.searchString && { query: cd.searchString }),
  };

  const pageUrl = event.eventSourceUrl ?? ctx.eventSourceUrl;

  return {
    event: event.eventName,
    event_time: event.eventTime,
    event_id: event.eventId,
    user,
    properties,
    ...(pageUrl && { page: { url: pageUrl } }),
  };
}

/** Wrap events in the v1.3 request body. Pure. */
export function buildTikTokRequestBody(
  data: TikTokEvent[],
  opts: { pixelId: string; testEventCode?: string },
): TikTokRequestBody {
  return {
    event_source: "web",
    event_source_id: opts.pixelId,
    ...(opts.testEventCode && { test_event_code: opts.testEventCode }),
    data,
  };
}

/**
 * Test event code for TikTok Events Manager → Test Events. Non-prod refuses to
 * send without it (same guard as Meta) so we never pollute production reporting.
 */
export function getTikTokTestEventCode(): string | undefined {
  if (isProductionPixelEnv()) {
    if (process.env.TIKTOK_USE_TEST_EVENTS === "true") {
      return process.env.TIKTOK_TEST_EVENT_CODE;
    }
    return undefined;
  }
  return process.env.TIKTOK_TEST_EVENT_CODE || undefined;
}

/**
 * Send one event to the TikTok Events API. Never throws.
 * Returns true ONLY on HTTP 200 with body `code === 0`.
 */
export async function sendTikTokEvent(event: TikTokEvent): Promise<boolean> {
  const pixelId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!pixelId || !accessToken) return false;

  const testEventCode = getTikTokTestEventCode();
  if (!isProductionPixelEnv() && !testEventCode) {
    console.error("REFUSING TikTok CAPI - non-prod without test_event_code", {
      event: event.event,
      env: getPixelEnv(),
    });
    return false;
  }

  const id = typeof event.event_id === "string" ? event.event_id.trim() : "";
  if (!id) {
    console.error("REFUSING TikTok CAPI - missing event_id", { env: getPixelEnv() });
    return false;
  }

  const body = buildTikTokRequestBody([event], { pixelId, testEventCode });

  try {
    const res = await fetch(TIKTOK_EVENTS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": accessToken,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => null)) as
      | { code?: number; message?: string; request_id?: string }
      | null;

    if (!res.ok || !json || json.code !== 0) {
      console.error("[TikTok CAPI] Failed", {
        http: res.status,
        code: json?.code,
        message: json?.message,
        request_id: json?.request_id,
        event: event.event,
        event_id: event.event_id,
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error("[TikTok CAPI] Network error", {
      event: event.event,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
