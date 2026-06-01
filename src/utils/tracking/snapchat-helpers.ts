// src/utils/tracking/snapchat-helpers.ts
// Snapchat click id arrives as `?ScCid=` (CASE-SENSITIVE) on ad-click landings.
// Captured from URL as ScCid; sent to the Conversions API as `sc_click_id` (future Snap CAPI).
// Persisted to a first-party cookie + companion timestamp for the resolver.
const SC_CLICK_COOKIE = "_sc_click";
const SC_CLICK_TS_COOKIE = "_sc_click_ts";
const SC_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
// Domain+Secure in prod so attribution survives an apex<->www switch (spec §3.7).
const PROD_COOKIE_SUFFIX = process.env.NODE_ENV === "production" ? "; Domain=.toolsaustralia.com.au; Secure" : "";

function readBrowserCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  for (const raw of document.cookie.split(";")) {
    const t = raw.trim();
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    if (t.slice(0, eq) === name) { const v = t.slice(eq + 1); if (v) return v; }
  }
  return undefined;
}

/** Capture `?ScCid=` (case-sensitive) into a first-party cookie. Idempotent. */
export function captureSnapClickId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("ScCid");
    if (fromUrl) {
      document.cookie = `${SC_CLICK_COOKIE}=${encodeURIComponent(fromUrl)}; path=/; max-age=${SC_MAX_AGE_SECONDS}; SameSite=Lax${PROD_COOKIE_SUFFIX}`;
      document.cookie = `${SC_CLICK_TS_COOKIE}=${Date.now()}; path=/; max-age=${SC_MAX_AGE_SECONDS}; SameSite=Lax${PROD_COOKIE_SUFFIX}`;
      return fromUrl;
    }
    return readBrowserCookie(SC_CLICK_COOKIE);
  } catch { return undefined; }
}

/** Server-side: read sc click id + capturedAt from request cookies. */
export function extractSnapContext(request: {
  cookies?: { get: (name: string) => { value: string } | undefined };
}): { scClickId?: string; capturedAt: number | null } {
  const scid = request.cookies?.get(SC_CLICK_COOKIE)?.value;
  const ts = request.cookies?.get(SC_CLICK_TS_COOKIE)?.value;
  return {
    ...(scid && { scClickId: decodeURIComponent(scid) }),
    capturedAt: ts && /^\d+$/.test(ts) ? Number(ts) : null,
  };
}
