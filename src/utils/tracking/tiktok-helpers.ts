// src/utils/tracking/tiktok-helpers.ts
// TikTok match-signal helpers (client-safe — NO crypto/Node-only imports, so this module can
// be imported by client components AND by src/middleware.ts's EDGE runtime; keep it that way).
// Mirrors facebook-helpers.ts for TikTok:
// - ttclid: TikTok click id, arrives as `?ttclid=` on ad-click landings. We persist it to a
//   first-party cookie so it's still attached at conversion AND readable server-side for the
//   Events API. Middleware writes that cookie on the first document request (zero dependence
//   on JS running); `captureTikTokClickId()` below is the client-side writer for the same
//   cookie, and `extractTikTokContext` falls back to the raw URL param when neither ran yet.
// - ttp: the TikTok Pixel's own first-party `_ttp` cookie (set by the loaded pixel).
// - normalizePhoneE164: the SINGLE source of truth for phone normalization, shared by the
//   server Events API sender (src/lib/tiktok.ts) and the browser `ttq.identify` call, so
//   the SDK's client-side hash matches the server-side hash (dedup-safe).

/**
 * OUR ttclid cookies are `ta_`-prefixed, NOT the bare `ttclid`/`ttclid_ts` we used to write.
 * TikTok's own pixel SDK writes a first-party cookie ALSO named `ttclid`, at host scope,
 * while ours is set at `Domain=.toolsaustralia.com.au` — two same-named cookies at different
 * scopes make `cookies.get("ttclid")` non-deterministic (the server sees whichever the
 * browser happens to send first). And ours is `encodeURIComponent`-encoded on write while the
 * SDK's is not, so a blind decode could be applied to a value that was never encoded. The
 * `ta_` prefix matches this repo's existing first-party cookie vocabulary (`ta_anon_id`,
 * `_ta_attr`). Exported so middleware can write the same names without duplicating literals.
 */
export const TTCLID_COOKIE = "ta_ttclid";
export const TTCLID_TS_COOKIE = "ta_ttclid_ts";

/**
 * Pre-`ta_` names, READ-ONLY fallback. Covers both an in-flight cookie written by the old
 * client-only capture (still valid for up to its 7-day max-age after this ships) and the
 * TikTok SDK's own `ttclid` cookie. Never written by us any more.
 */
const LEGACY_TTCLID_COOKIE = "ttclid";
const LEGACY_TTCLID_TS_COOKIE = "ttclid_ts";

/**
 * 90 days (was 7). TikTok documents a recommended click-id storage TTL of 28 days or more and
 * its own cookie lives far longer, so a 7-day cookie was throwing away click ids TikTok would
 * still have matched. 90d matches ANON_ID_MAX_AGE so both first-party ids expire together.
 *
 * This does NOT widen INTERNAL attribution: the resolver independently caps a TikTok click at
 * 7 days via `windowDays` in src/services/attribution/platformPriority.ts (verified), keyed off
 * the `ta_ttclid_ts` capture timestamp — so a day-30 conversion still resolves as utm_only
 * internally. The longer cookie only means we can still SEND the click id to TikTok's Events
 * API, which does its own attribution windowing, instead of dropping it at day 8.
 */
export const TTCLID_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/**
 * Cookie scope, shared by BOTH writers (middleware and `captureTikTokClickId`).
 *
 * The two writers MUST agree: a host-scoped cookie and a `Domain=`-scoped cookie of the same
 * name are two DIFFERENT cookies, both sent on every request, and `cookies.get()` then returns
 * whichever the browser happens to list first (RFC 6265 leaves the order unspecified when path
 * and creation time tie). That is precisely the non-determinism the `ta_` rename above exists
 * to kill — recreating it between our own two writers would put it straight back.
 *
 * Domain-scoped in prod so attribution survives an apex<->www switch (spec §3.7).
 */
export const TTCLID_COOKIE_DOMAIN =
  process.env.NODE_ENV === "production" ? ".toolsaustralia.com.au" : undefined;

/**
 * Reject absurd `?ttclid=` values before they are persisted for 90 days.
 *
 * The URL param is attacker-controllable and flows, unvalidated, into Stripe metadata as
 * `capi_ttclid` on every payment route. Stripe rejects any metadata VALUE over 500 chars and
 * fails the ENTIRE API call — this repo already hit that exact failure mode and guards
 * `event_source_url` for it (see src/utils/tracking/event-source-url.ts). A real ttclid is well
 * under 200 chars; 256 leaves headroom without letting a crafted URL brick a checkout.
 */
export const TTCLID_MAX_LENGTH = 256;

/** True when a `?ttclid=` value is safe to persist and forward. Shared by both writers. */
export function isPlausibleTtclid(value: string): boolean {
  return value.length > 0 && value.length <= TTCLID_MAX_LENGTH;
}

// Domain+Secure in prod so attribution survives an apex<->www switch (spec §3.7).
const PROD_COOKIE_SUFFIX = process.env.NODE_ENV === "production" ? "; Domain=.toolsaustralia.com.au; Secure" : "";

/**
 * Parse one cookie out of `document.cookie`. Browser-only; returns undefined server-side.
 *
 * Values come back RAW (exactly as they sit on the wire) — unlike a server-side
 * `request.cookies.get()`, which Next has already percent-DECODED for you. Callers that read a
 * value we percent-ENCODED on write must therefore `safeDecode` it here, and must NOT on the
 * server. Exported so the TikTok pixel provider reuses this parser instead of carrying a second
 * copy of it (one concept, one implementation).
 */
export function readBrowserCookie(name: string): string | undefined {
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
 * Decode a RAW wire value we percent-encoded on write — i.e. one read from `document.cookie`.
 *
 * Do NOT use this on a server-side `request.cookies.get()` result: Next's `RequestCookies`
 * already percent-decodes on parse (verified against the installed next@15.5.9
 * `@edge-runtime/cookies`), so decoding again corrupts any value containing a literal `%`.
 * Falls back to the raw value on a malformed %-sequence — a slightly-wrong click id still beats
 * no click id, and a throw here must never abort the caller's remaining signal reads.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
 *
 * NOTE: middleware already writes these cookies on the landing document request, so this is
 * now the belt-and-braces path — it still matters for client-side navigations that never hit
 * middleware (e.g. an in-app `router.push` carrying `?ttclid=`).
 */
export function captureTikTokClickId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("ttclid");
    if (fromUrl && isPlausibleTtclid(fromUrl)) {
      // `document.cookie` writes the value RAW, so we percent-encode here. Middleware does NOT
      // — Next's `ResponseCookies.set` encodes for you — and both therefore put the SAME single
      // encoding on the wire. Keep those two in step or the read paths cannot both be right.
      document.cookie = `${TTCLID_COOKIE}=${encodeURIComponent(fromUrl)}; path=/; max-age=${TTCLID_MAX_AGE_SECONDS}; SameSite=Lax${PROD_COOKIE_SUFFIX}`;
      document.cookie = `${TTCLID_TS_COOKIE}=${Date.now()}; path=/; max-age=${TTCLID_MAX_AGE_SECONDS}; SameSite=Lax${PROD_COOKIE_SUFFIX}`;
      return fromUrl;
    }
    // Same precedence as the server resolver below, so client and server never disagree
    // about which stored click id is current.
    const ours = readBrowserCookie(TTCLID_COOKIE);
    if (ours) return safeDecode(ours);
    return readBrowserCookie(LEGACY_TTCLID_COOKIE);
  } catch {
    return undefined;
  }
}

/**
 * Resolve the ttclid for a server-side request. First hit wins:
 *   1. `ta_ttclid` cookie — ours, written by middleware or `captureTikTokClickId`.
 *   2. legacy `ttclid` cookie — an in-flight cookie from the pre-`ta_` client capture, OR the
 *      TikTok SDK's own cookie.
 *   3. `?ttclid=` on the request URL, when a url is available — the landing request itself,
 *      before any cookie exists. Mirrors `extractFBCFromRequest`'s cookie-then-URL fallback
 *      in facebook-helpers.ts; TikTok previously had only the fragile client-cookie source,
 *      which is why the server Events API reported 0% click-id coverage.
 *
 * NO decoding happens here, for any source. Next's `RequestCookies` percent-decodes on parse
 * and `URL.searchParams.get` decodes too, so every branch already hands back a plaintext value;
 * a second decode would corrupt any click id containing a literal `%`. (The browser-side
 * readers DO decode, because `document.cookie` is raw — see `safeDecode`.)
 *
 * Never throws — tracking must not break the request it rides on.
 */
function resolveTtclid(request: {
  url?: string;
  cookies?: { get: (name: string) => { value: string } | undefined };
}): string | undefined {
  try {
    const ours = request.cookies?.get(TTCLID_COOKIE)?.value;
    if (ours) return isPlausibleTtclid(ours) ? ours : undefined;

    const legacy = request.cookies?.get(LEGACY_TTCLID_COOKIE)?.value;
    if (legacy) return isPlausibleTtclid(legacy) ? legacy : undefined;

    if (!request.url) return undefined;
    const fromUrl = new URL(request.url).searchParams.get("ttclid");
    return fromUrl && isPlausibleTtclid(fromUrl) ? fromUrl : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Server-side: read ttclid + _ttp from a NextRequest-like object for the Events API.
 * `url` is optional so every existing call site (all pass a NextRequest, which has one)
 * keeps working unchanged — same widened shape as `extractClickIdsFromRequest`.
 */
export function extractTikTokContext(request: {
  url?: string;
  cookies?: { get: (name: string) => { value: string } | undefined };
}): { ttclid?: string; ttp?: string } {
  const ctx: { ttclid?: string; ttp?: string } = {};
  const ttclid = resolveTtclid(request);
  if (ttclid) ctx.ttclid = ttclid;
  try {
    const ttp = request.cookies?.get("_ttp")?.value;
    if (ttp) ctx.ttp = ttp;
  } catch {
    // best-effort
  }
  return ctx;
}

/**
 * Server-side: read the ttclid capture timestamp (epoch ms) from request cookies; null if
 * absent. Falls back to the legacy `ttclid_ts` name so a visitor who landed before the rename
 * keeps a real click time (and isn't degraded to utm_only by the attribution resolver).
 */
export function extractTikTokCapturedAt(request: {
  cookies?: { get: (name: string) => { value: string } | undefined };
}): number | null {
  const ts =
    request.cookies?.get(TTCLID_TS_COOKIE)?.value ?? request.cookies?.get(LEGACY_TTCLID_TS_COOKIE)?.value;
  return ts && /^\d+$/.test(ts) ? Number(ts) : null;
}
