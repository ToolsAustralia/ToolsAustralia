/**
 * Facebook Pixel Helper Utilities
 *
 * Provides utility functions for Facebook Pixel tracking including:
 * - Facebook Click ID (fbc) extraction from URL
 * - Facebook Browser ID (fbp) extraction from cookies
 * - Event ID generation for deduplication
 * - User data preparation for Conversions API
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import { hashData } from "@/lib/facebook";

/**
 * Cookie storing the click-capture timestamp for the current fbclid.
 * Per Meta's spec (https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc),
 * the fbc timestamp MUST be when the click was first observed, not when the event is sent.
 * We persist it so subsequent events within the attribution window get a consistent fbc value.
 */
const FBC_CAPTURE_TS_COOKIE = "_fbc_ts";
const FBC_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 days — Meta's default attribution window

function readBrowserCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  for (const raw of document.cookie.split(";")) {
    const trimmed = raw.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) {
      const value = trimmed.slice(eq + 1);
      if (value) return value;
    }
  }
  return undefined;
}

function writeBrowserCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

/**
 * Build a Meta-format fbc value (`fb.1.<captureTimestamp>.<fbclid>`).
 * Reuses a previously-captured timestamp from `_fbc_ts` cookie when available,
 * otherwise stamps "now" and persists it for future calls within the attribution window.
 * The "now" fallback is the closest approximation to click time when the user lands
 * directly with an fbclid in URL and no prior cookie exists.
 */
function buildFbcFromFbclid(fbclid: string, persist: boolean): string {
  const existingTs = readBrowserCookie(FBC_CAPTURE_TS_COOKIE);
  if (existingTs && /^\d+$/.test(existingTs)) {
    return `fb.1.${existingTs}.${fbclid}`;
  }
  const captureTs = String(Date.now());
  if (persist) {
    writeBrowserCookie(FBC_CAPTURE_TS_COOKIE, captureTs, FBC_COOKIE_MAX_AGE_SECONDS);
  }
  return `fb.1.${captureTs}.${fbclid}`;
}

/**
 * Extract Facebook Click ID (fbc) from URL parameters or browser cookies.
 *
 * Resolution order:
 *   1. Meta's own `_fbc` cookie (set by the loaded Pixel — has the correct format & capture time)
 *   2. `?fbc=` URL param (already-formatted, used in some integrations)
 *   3. `?fbclid=` URL param → constructed with persisted capture timestamp (or stamped now + persisted)
 *
 * @returns Facebook Click ID if found, undefined otherwise
 */
export function getFBCFromURL(): string | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    // 1. Prefer Meta's own _fbc cookie — has correct click-capture timestamp baked in.
    // SDK does not URL-encode the value; decode defensively only when there is a percent sign.
    const metaFbc = readBrowserCookie("_fbc");
    if (metaFbc) {
      return metaFbc.includes("%") ? decodeURIComponent(metaFbc) : metaFbc;
    }

    const urlParams = new URLSearchParams(window.location.search);

    // 2. Pre-formatted fbc parameter wins over fbclid construction
    const fbc = urlParams.get("fbc");
    if (fbc) return fbc;

    // 3. fbclid → construct with persisted timestamp (or stamp now + persist)
    const fbclid = urlParams.get("fbclid");
    if (fbclid) {
      return buildFbcFromFbclid(fbclid, /* persist */ true);
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract Facebook Browser ID (fbp) from cookies
 * Facebook Pixel automatically sets _fbp cookie
 * @returns Facebook Browser ID if found, undefined otherwise
 */
export function getFBPFromCookie(): string | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    // Get _fbp cookie value
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "_fbp" && value) {
        return value;
      }
    }

    return undefined;
  } catch {
    // console.warn("Error extracting fbp from cookie:", error);
    return undefined;
  }
}

/**
 * Generate a unique event ID for Facebook Pixel deduplication
 * Format: {eventType}_{identifier}_{timestamp}
 *
 * @param eventType - Type of event (e.g., "purchase", "renewal", "payment_failed")
 * @param identifier - Unique identifier (e.g., orderId, subscriptionId, paymentIntentId)
 * @param timestamp - Optional timestamp (defaults to current time)
 * @returns Formatted event ID
 */
export function generateEventID(eventType: string, identifier: string, timestamp?: number): string {
  const ts = timestamp || Date.now();
  return `${eventType}_${identifier}_${ts}`;
}

/**
 * Normalize birthdate to YYYYMMDD for Meta CAPI (db parameter).
 * Meta requires date of birth hashed as YYYYMMDD (e.g. 19900615).
 */
export function toYYYYMMDD(birthdate: string | Date): string | null {
  let d: Date;
  if (birthdate instanceof Date) {
    if (Number.isNaN(birthdate.getTime())) return null;
    d = birthdate;
  } else {
    const trimmed = String(birthdate).trim();
    if (!trimmed) return null;
    // Already YYYYMMDD (8 digits)
    if (/^\d{8}$/.test(trimmed)) return trimmed;
    d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return null;
  }
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return null;
  const yy = String(y);
  const mm = String(m).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/**
 * Prepare user data for Facebook Conversions API
 * Hashes PII data according to Facebook requirements
 *
 * @param userData - User data object with optional PII fields
 * @returns Hashed user data object ready for Conversions API
 */
export function prepareUserData(userData?: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  externalId?: string;
  birthdate?: string | Date;
}): Record<string, string> {
  const hashedData: Record<string, string> = {};

  if (!userData) return hashedData;

  // Hash external ID (recommended by Meta for matching; same normalization as other hashed fields)
  if (userData.externalId) {
    hashedData.external_id = hashData(String(userData.externalId).toLowerCase().trim());
  }

  // Hash email (required format: lowercase, trimmed, SHA-256)
  if (userData.email) {
    hashedData.em = hashData(userData.email);
  }

  // Hash phone (required format: digits only, no spaces/special chars, SHA-256)
  if (userData.phone) {
    // Remove all non-digit characters before hashing
    const phoneDigits = userData.phone.replace(/\D/g, "");
    if (phoneDigits) {
      hashedData.ph = hashData(phoneDigits);
    }
  }

  // Hash first name
  if (userData.firstName) {
    hashedData.fn = hashData(userData.firstName);
  }

  // Hash last name
  if (userData.lastName) {
    hashedData.ln = hashData(userData.lastName);
  }

  // Hash city
  if (userData.city) {
    hashedData.ct = hashData(userData.city);
  }

  // Hash state
  if (userData.state) {
    hashedData.st = hashData(userData.state);
  }

  // Hash zip code
  if (userData.zipCode) {
    hashedData.zp = hashData(userData.zipCode);
  }

  // Country (hashed per Meta - all user params except client_user_agent, fbc, fbp must be SHA256)
  if (userData.country) {
    const countryCode = userData.country.toUpperCase().replace(/^([A-Z]{2}).*/, "$1");
    if (countryCode) hashedData.country = hashData(countryCode.toLowerCase());
  }

  // Date of birth (Meta db parameter - YYYYMMDD, hashed for Event Match Quality)
  if (userData.birthdate) {
    const yyyymmdd = toYYYYMMDD(userData.birthdate);
    if (yyyymmdd) {
      hashedData.db = hashData(yyyymmdd);
    }
  }

  return hashedData;
}

/**
 * Get current page URL for event_source_url
 * @returns Current page URL or undefined if not available
 */
export function getEventSourceURL(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.href;
}

/**
 * Extract Facebook Click ID (fbc) from a NextRequest.
 *
 * Resolution order (mirrors the client-side `getFBCFromURL`):
 *   1. `_fbc` cookie (set by Meta's Pixel — has correct format and capture time;
 *      stable across server retries — safe for Stripe-idempotent request bodies).
 *   2. `?fbc=` URL param (pre-formatted)
 *   3. `?fbclid=` URL param → constructed using `_fbc_ts` cookie's capture timestamp
 *      if present, otherwise "now" (less accurate but better than no fbc at all).
 *
 * @param request - NextRequest-like object with `url`, `headers`, and `cookies`
 * @returns Facebook Click ID if found, undefined otherwise
 */
export function extractFBCFromRequest(request: {
  url?: string;
  headers?: Headers;
  cookies?: { get: (name: string) => { value: string } | undefined };
}): string | undefined {
  try {
    // Prefer Meta's own _fbc cookie when present (stable across retries).
    const metaFbc = request.cookies?.get("_fbc")?.value;
    if (metaFbc) return metaFbc;

    if (!request.url) return undefined;
    const url = new URL(request.url);

    // Pre-formatted fbc param wins over fbclid construction
    const fbc = url.searchParams.get("fbc");
    if (fbc) return fbc;

    const fbclid = url.searchParams.get("fbclid");
    if (!fbclid) return undefined;

    // Use persisted capture timestamp if the client wrote one earlier, else stamp now.
    // The server can't persist a cookie via this helper — it just reads what's there.
    const capturedTs = request.cookies?.get(FBC_CAPTURE_TS_COOKIE)?.value;
    const ts = capturedTs && /^\d+$/.test(capturedTs) ? capturedTs : String(Date.now());
    return `fb.1.${ts}.${fbclid}`;
  } catch {
    return undefined;
  }
}

/**
 * Extract Facebook Browser ID (fbp) from NextRequest cookies
 * Server-side helper to extract fbp from request cookies
 * @param request - NextRequest object with cookies
 * @returns Facebook Browser ID if found, undefined otherwise
 */
export function extractFBPFromRequest(request: {
  cookies?: { get: (name: string) => { value: string } | undefined };
}): string | undefined {
  try {
    if (!request.cookies) return undefined;

    const fbpCookie = request.cookies.get("_fbp");
    if (fbpCookie?.value) {
      return fbpCookie.value;
    }

    return undefined;
  } catch {
    // console.warn("Error extracting fbp from request:", error);
    return undefined;
  }
}

/**
 * Extract request context (IP, user agent, fbc, fbp) from NextRequest
 * Comprehensive server-side helper for Conversions API
 * @param request - NextRequest object
 * @returns Object with IP, user agent, fbc, and fbp
 */
export function extractRequestContext(request: {
  url?: string;
  headers?: Headers;
  cookies?: { get: (name: string) => { value: string } | undefined };
}): {
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string;
  fbp?: string;
} {
  const context: {
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
  } = {};

  // Extract IP address (handle comma-separated IPs - take first)
  if (request.headers) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      // x-forwarded-for can contain multiple IPs, take the first one
      context.client_ip_address = forwardedFor.split(",")[0].trim();
    } else {
      const realIp = request.headers.get("x-real-ip");
      if (realIp) {
        context.client_ip_address = realIp;
      }
    }

    // Extract user agent
    const userAgent = request.headers.get("user-agent");
    if (userAgent) {
      context.client_user_agent = userAgent;
    }
  }

  // Extract fbc and fbp
  context.fbc = extractFBCFromRequest(request);
  context.fbp = extractFBPFromRequest(request);

  return context;
}
