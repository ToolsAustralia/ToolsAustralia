// src/utils/tracking/attribution-cookie.ts
// Durable first-party attribution cookie (_ta_attr). Survives the auth lifecycle
// (incl. Google OAuth top-level redirect) because cookies are origin-scoped, not
// per-tab like sessionStorage. SameSite=Lax so it is sent on the return-from-Google
// top-level GET. Read both client-side (pixel fires) and server-side (resolve edge).
// FIRST-TOUCH: never overwrite a non-expired existing value.

import type { AttributionParams } from "@/types/tracking";

export const ATTRIBUTION_COOKIE = "_ta_attr";
export const ATTRIBUTION_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90d (matches _fbc)

export interface StoredAttribution extends AttributionParams {
  capturedAt: number;
}

const FIELDS: (keyof AttributionParams)[] = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "campaign_id", "adset_id", "ad_id",
];

/** JSON-encode params + capturedAt. Returns "" when no params present. */
export function serializeAttributionCookie(params: AttributionParams, capturedAt: number): string {
  const obj: Record<string, string | number> = {};
  let hasAny = false;
  for (const f of FIELDS) {
    const v = params[f];
    if (v) { obj[f] = v; hasAny = true; }
  }
  if (!hasAny) return "";
  obj.capturedAt = capturedAt;
  return encodeURIComponent(JSON.stringify(obj));
}

export function deserializeAttributionCookie(raw: string | undefined | null): StoredAttribution | null {
  if (!raw) return null;
  try {
    const decoded = raw.includes("%") ? decodeURIComponent(raw) : raw;
    const parsed = JSON.parse(decoded) as Partial<StoredAttribution>;
    if (!parsed || typeof parsed.capturedAt !== "number") return null;
    return parsed as StoredAttribution;
  } catch {
    return null;
  }
}

/** Cookie attribute string. Domain+Secure only in production (apex<->www sharing). */
function attributeSuffix(): string {
  const isProd = process.env.NODE_ENV === "production";
  const domainSecure = isProd ? "; Domain=.toolsaustralia.com.au; Secure" : "";
  return `; path=/; max-age=${ATTRIBUTION_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${domainSecure}`;
}

/** CLIENT: write first-touch. Won't overwrite an existing non-expired cookie. */
export function writeAttributionCookie(params: AttributionParams): void {
  if (typeof document === "undefined") return;
  if (readAttributionCookieClient()) return; // first-touch: keep the earliest
  const value = serializeAttributionCookie(params, Date.now());
  if (!value) return;
  document.cookie = `${ATTRIBUTION_COOKIE}=${value}${attributeSuffix()}`;
}

/** CLIENT: read + parse. */
export function readAttributionCookieClient(): StoredAttribution | null {
  if (typeof document === "undefined") return null;
  for (const raw of document.cookie.split(";")) {
    const t = raw.trim();
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    if (t.slice(0, eq) === ATTRIBUTION_COOKIE) return deserializeAttributionCookie(t.slice(eq + 1));
  }
  return null;
}

/** SERVER: read from a NextRequest-like cookie store. */
export function readAttributionCookieFromRequest(request: {
  cookies?: { get: (name: string) => { value: string } | undefined };
}): StoredAttribution | null {
  return deserializeAttributionCookie(request.cookies?.get(ATTRIBUTION_COOKIE)?.value);
}
