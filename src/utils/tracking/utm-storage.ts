/**
 * UTM Storage Utilities
 *
 * Persists UTM parameters to sessionStorage for attribution at signup/conversion.
 * Uses sessionStorage so UTM survives navigation within the same tab.
 * Expiry: 30 minutes from capture.
 *
 * @see docs/UTM_ATTRIBUTION.md for full feature documentation
 */

import type { UTMParams } from "@/types/tracking";

const UTM_STORAGE_KEY = "tools-aus:utm-attribution";
const UTM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

interface StoredUTM {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  capturedAt: number;
}

/**
 * Reads stored UTM params from sessionStorage.
 * Returns null if not found or expired.
 */
export function getStoredUTMParams(): UTMParams | null {
  if (typeof window === "undefined") return null;
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

    const params: UTMParams = {};
    if (parsed.utm_source) params.utm_source = parsed.utm_source;
    if (parsed.utm_medium) params.utm_medium = parsed.utm_medium;
    if (parsed.utm_campaign) params.utm_campaign = parsed.utm_campaign;

    return Object.keys(params).length > 0 ? params : null;
  } catch {
    return null;
  }
}

/**
 * Writes UTM params to sessionStorage with a timestamp for expiry.
 */
export function setStoredUTMParams(params: UTMParams): void {
  if (typeof window === "undefined") return;
  const hasAny = params.utm_source || params.utm_medium || params.utm_campaign;
  if (!params || !hasAny) return;
  try {
    const stored: StoredUTM = {
      ...(params.utm_source && { utm_source: params.utm_source }),
      ...(params.utm_medium && { utm_medium: params.utm_medium }),
      ...(params.utm_campaign && { utm_campaign: params.utm_campaign }),
      capturedAt: Date.now(),
    };
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Ignore storage errors
  }
}
