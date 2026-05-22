// src/utils/tracking/tiktok-helpers.ts
// TikTok match-signal helpers (client-safe — NO crypto/Node-only imports, so this
// module can be imported by client components). Mirrors facebook-helpers.ts for TikTok:
// - ttclid: TikTok click id, arrives as `?ttclid=` on ad-click landings (7-day life). We
//   persist it to a first-party cookie so it's still attached at conversion AND readable
//   server-side for the Events API.
// - ttp: the TikTok Pixel's own first-party `_ttp` cookie (set by the loaded pixel).
// - normalizePhoneE164: the SINGLE source of truth for phone normalization, shared by the
//   server Events API sender (src/lib/tiktok.ts) and the browser `ttq.identify` call, so
//   the SDK's client-side hash matches the server-side hash (dedup-safe).

const TTCLID_COOKIE = "ttclid";
const TTCLID_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // TikTok ttclid lifetime

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

/**
 * Normalize a phone number to E.164 before hashing (TikTok requirement).
 * AU-aware default: leading `0` => `+61`; bare national digits => `+61`;
 * already `+` => keep. Used identically on server (hash) and browser (ttq.identify).
 */
export function normalizePhoneE164(phone: string, defaultCc = "61"): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `+${defaultCc}${digits.slice(1)}`;
  if (digits.startsWith(defaultCc)) return `+${digits}`;
  return `+${defaultCc}${digits}`;
}

/**
 * Capture `?ttclid=` from the current URL into a first-party cookie (idempotent).
 * Call once on mount. Returns the resolved ttclid (URL value, else existing cookie).
 */
export function captureTikTokClickId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("ttclid");
    if (fromUrl) {
      document.cookie = `${TTCLID_COOKIE}=${encodeURIComponent(fromUrl)}; path=/; max-age=${TTCLID_MAX_AGE_SECONDS}; SameSite=Lax`;
      return fromUrl;
    }
    return readBrowserCookie(TTCLID_COOKIE);
  } catch {
    return undefined;
  }
}

/** Server-side: read ttclid + _ttp from request cookies for the Events API. */
export function extractTikTokContext(request: {
  cookies?: { get: (name: string) => { value: string } | undefined };
}): { ttclid?: string; ttp?: string } {
  const ctx: { ttclid?: string; ttp?: string } = {};
  try {
    const ttclid = request.cookies?.get(TTCLID_COOKIE)?.value;
    if (ttclid) ctx.ttclid = decodeURIComponent(ttclid);
    const ttp = request.cookies?.get("_ttp")?.value;
    if (ttp) ctx.ttp = ttp;
  } catch {
    // best-effort
  }
  return ctx;
}
