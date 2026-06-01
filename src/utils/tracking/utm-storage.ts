/**
 * UTM Storage Utilities
 *
 * Persists UTM parameters to sessionStorage for attribution at signup/conversion.
 * Uses sessionStorage so UTM survives navigation within the same tab.
 * Expiry: 30 minutes from capture.
 *
 * @see docs/UTM_ATTRIBUTION.md for full feature documentation
 * @see docs/PAYMENT_ATTRIBUTION.md for extended attribution (campaign_id, adset_id, ad_id)
 */

import type { AttributionParams } from "@/types/tracking";
import { readAttributionCookieClient } from "@/utils/tracking/attribution-cookie";

const UTM_STORAGE_KEY = "tools-aus:utm-attribution";
const UTM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

interface StoredUTM {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  capturedAt: number;
}

/**
 * Reads stored attribution params from sessionStorage.
 * Returns null if not found or expired.
 * Includes UTM and platform-specific IDs (campaign_id, adset_id, ad_id).
 */
export function getStoredUTMParams(): AttributionParams | null {
  if (typeof window === "undefined") return null;
  // Prefer the durable first-party cookie (survives the auth lifecycle incl. OAuth
  // redirect); fall back to the legacy 30-min sessionStorage below.
  const cookie = readAttributionCookieClient();
  if (cookie) {
    const p: AttributionParams = {};
    if (cookie.utm_source) p.utm_source = cookie.utm_source;
    if (cookie.utm_medium) p.utm_medium = cookie.utm_medium;
    if (cookie.utm_campaign) p.utm_campaign = cookie.utm_campaign;
    if (cookie.utm_content) p.utm_content = cookie.utm_content;
    if (cookie.utm_term) p.utm_term = cookie.utm_term;
    if (cookie.campaign_id) p.campaign_id = cookie.campaign_id;
    if (cookie.adset_id) p.adset_id = cookie.adset_id;
    if (cookie.ad_id) p.ad_id = cookie.ad_id;
    if (Object.keys(p).length > 0) return p;
  }
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredUTM;
    if (!parsed?.capturedAt) return null;

    // Check expiry
    if (Date.now() - parsed.capturedAt > UTM_EXPIRY_MS) {
      sessionStorage.removeItem(UTM_STORAGE_KEY);
      return null;
    }

    const params: AttributionParams = {};
    if (parsed.utm_source) params.utm_source = parsed.utm_source;
    if (parsed.utm_medium) params.utm_medium = parsed.utm_medium;
    if (parsed.utm_campaign) params.utm_campaign = parsed.utm_campaign;
    if (parsed.utm_content) params.utm_content = parsed.utm_content;
    if (parsed.utm_term) params.utm_term = parsed.utm_term;
    if (parsed.campaign_id) params.campaign_id = parsed.campaign_id;
    if (parsed.adset_id) params.adset_id = parsed.adset_id;
    if (parsed.ad_id) params.ad_id = parsed.ad_id;

    return Object.keys(params).length > 0 ? params : null;
  } catch {
    return null;
  }
}

/**
 * Writes attribution params to sessionStorage with a timestamp for expiry.
 * Accepts UTM and platform-specific IDs (campaign_id, adset_id, ad_id).
 */
export function setStoredUTMParams(params: AttributionParams): void {
  if (typeof window === "undefined") return;
  const hasAny =
    params.utm_source ||
    params.utm_medium ||
    params.utm_campaign ||
    params.utm_content ||
    params.utm_term ||
    params.campaign_id ||
    params.adset_id ||
    params.ad_id;
  if (!params || !hasAny) return;
  try {
    const stored: StoredUTM = {
      ...(params.utm_source && { utm_source: params.utm_source }),
      ...(params.utm_medium && { utm_medium: params.utm_medium }),
      ...(params.utm_campaign && { utm_campaign: params.utm_campaign }),
      ...(params.utm_content && { utm_content: params.utm_content }),
      ...(params.utm_term && { utm_term: params.utm_term }),
      ...(params.campaign_id && { campaign_id: params.campaign_id }),
      ...(params.adset_id && { adset_id: params.adset_id }),
      ...(params.ad_id && { ad_id: params.ad_id }),
      capturedAt: Date.now(),
    };
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Ignore storage errors
  }
}
