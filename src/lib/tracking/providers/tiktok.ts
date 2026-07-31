// src/lib/tracking/providers/tiktok.ts
// Isomorphic — see the matching comment in ./facebook.ts. NO "use client".

import type { CanonicalEvent, ConversionProvider, RequestContext } from "../types";
import { getAllowedHostnames } from "../hostname-gate";
import { shouldTrackRoute } from "@/utils/tracking/should-track-route";
// Name-only import from an edge/client-safe module (no next/headers, no node crypto).
import { ANON_ID_PUBLIC_COOKIE_NAME } from "@/lib/ab-testing/anon-id-cookie";
// Client-safe by construction (no crypto, no node: imports) — see its header comment.
import { readBrowserCookie } from "@/utils/tracking/tiktok-helpers";
// NO static import of "@/lib/tiktok" — this provider is isomorphic and its pixel half
// runs in the BROWSER, while `@/lib/tiktok` reaches the server-only outbound transport
// (undici → `node:net`). A static import pulls that into the client bundle and the page
// dies at runtime with "Cannot find module 'node:net'". `capiSend` is server-only, so the
// module is dynamically imported there instead — the same pattern providers/facebook.ts
// uses for `@/lib/facebook`.

// This is the SOLE `Window.ttq` augmentation in the codebase. (The legacy
// `src/components/TikTokPixel.tsx` that used to carry a duplicate declaration — and
// forced both to match exactly to avoid TS2687/TS2717 — has been deleted; there is no
// longer a second shape to keep in step.) `track`'s optional `event_id` 3rd arg is
// TikTok's browser↔CAPI dedup key.
declare global {
  interface Window {
    ttq: {
      load: (pixelId: string, options?: Record<string, unknown>) => void;
      page: () => void;
      track: (eventName: string, parameters?: Record<string, unknown>, options?: { event_id?: string }) => void;
      identify: (user: Record<string, unknown>) => void;
      instances: (pixelId: string) => Record<string, unknown>;
      debug: (enable: boolean) => void;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      off: (event: string, callback: (...args: unknown[]) => void) => void;
      once: (event: string, callback: (...args: unknown[]) => void) => void;
      ready: (callback: () => void) => void;
      alias: (userId: string) => void;
      group: (groupId: string, traits?: Record<string, unknown>) => void;
      enableCookie: () => void;
      disableCookie: () => void;
      holdConsent: () => void;
      revokeConsent: () => void;
      grantConsent: () => void;
    };
    _ttqInit?: boolean;
    /** Set by TikTok's bootstrap so the SDK knows which global holds the queue. */
    TiktokAnalyticsObject?: string;
  }
}

/**
 * TikTok's pre-SDK stub is an ARRAY with method proxies + bookkeeping props
 * attached (faithful TS transcription of the official `!function (w, d, t)`
 * bootstrap). Each proxy pushes `[methodName, ...args]` onto the array; the
 * SDK drains it on load. The string index signature covers the dynamically
 * attached method proxies (`page`, `track`, …).
 */
interface TtqStubArray extends Array<unknown> {
  [key: string]: unknown;
}

/** Method proxies TikTok's bootstrap predefines on the ttq queue array. */
const TTQ_METHODS = [
  "page", "track", "identify", "instances", "debug", "on", "off", "once", "ready",
  "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent",
  "grantConsent",
] as const;

function envEnabled(): { pixel: boolean; capi: boolean } {
  return {
    pixel: !!process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
    capi: !!process.env.TIKTOK_ACCESS_TOKEN,
  };
}

/**
 * Read the browser-readable anonymous-id mirror (`ta_anon_id_pub`) from `document.cookie`.
 * Deliberately total: a malformed cookie header, or a document-less render, returns undefined
 * instead of throwing — this runs inside pixel bootstrap and must never be able to abort it.
 *
 * The parse itself is `readBrowserCookie` from tiktok-helpers (one concept, one implementation).
 * The value needs no decoding: `ta_anon_id_pub` holds an `anon_<uuidv4>`, which is already
 * percent-encoding-clean, and middleware writes it through `ResponseCookies.set`.
 */
function readAnonIdPublicCookie(): string | undefined {
  try {
    return readBrowserCookie(ANON_ID_PUBLIC_COOKIE_NAME);
  } catch {
    // best-effort — an unreadable cookie header is not a reason to skip the pixel.
    return undefined;
  }
}

function loadPixel(): void {
  if (typeof window === "undefined") return;
  if (window._ttqInit) return;
  const pixelId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
  if (!pixelId) return; // No-op when not configured. No script tag, no console noise.
  if (!getAllowedHostnames().includes(window.location.hostname)) return;

  // Decide whether to fire the initial page() based on the current route.
  // Excluded routes (admin / my-account / affiliate / etc.) skip the initial fire.
  const firePagePing = shouldTrackRoute(window.location.pathname);

  // Imperative transcription of TikTok's official bootstrap. Written as real TS
  // so the provider injects ZERO inline script text — inline pixel bootstraps
  // are unhashable (env interpolation) and would require a CSP nonce, which
  // would keep the root layout dynamic. See docs/tracking/gotchas.md.
  // Statement order matches the original minified snippet exactly.
  const w = window as unknown as Record<string, unknown>;
  w.TiktokAnalyticsObject = "ttq";
  const ttq = (w.ttq as TtqStubArray | undefined) || ([] as unknown[] as TtqStubArray);
  w.ttq = ttq;
  ttq.methods = TTQ_METHODS.slice();

  // setAndDefer(target, method): install a queueing proxy that records the call
  // as [method, ...args] on the target array until the SDK replaces it.
  const setAndDefer = (target: TtqStubArray, method: string): void => {
    target[method] = function (this: unknown) {
      // eslint-disable-next-line prefer-rest-params
      target.push([method as unknown].concat(Array.prototype.slice.call(arguments, 0) as unknown[]));
    };
  };
  ttq.setAndDefer = setAndDefer;
  for (let i = 0; i < TTQ_METHODS.length; i++) setAndDefer(ttq, TTQ_METHODS[i]);

  // ttq.instance(pixelId): per-pixel queue with the same deferred proxies.
  ttq.instance = function (instancePixelId: string): TtqStubArray {
    const registry = (ttq._i as Record<string, TtqStubArray> | undefined) || {};
    const inst = registry[instancePixelId] || ([] as unknown[] as TtqStubArray);
    for (let n = 0; n < TTQ_METHODS.length; n++) setAndDefer(inst, TTQ_METHODS[n]);
    return inst;
  };

  // ttq.load(pixelId, options): register bookkeeping (_i/_t/_o) and inject the
  // SDK <script src>. events.js is a src-script on analytics.tiktok.com —
  // host-allowlisted in CSP script-src, so it needs neither nonce nor hash.
  // (The minified original also computed `o = n && n.partner` — dead, dropped.)
  ttq.load = function (loadPixelId: string, options?: Record<string, unknown>): void {
    const sdkSrc = "https://analytics.tiktok.com/i18n/pixel/events.js";
    const registry = (ttq._i as Record<string, TtqStubArray> | undefined) || {};
    ttq._i = registry;
    const instanceQueue = [] as unknown[] as TtqStubArray;
    registry[loadPixelId] = instanceQueue;
    instanceQueue._u = sdkSrc;
    const loadTimes = (ttq._t as Record<string, number> | undefined) || {};
    ttq._t = loadTimes;
    loadTimes[loadPixelId] = Date.now();
    const loadOptions = (ttq._o as Record<string, Record<string, unknown>> | undefined) || {};
    ttq._o = loadOptions;
    loadOptions[loadPixelId] = options || {};
    const sdk = document.createElement("script");
    sdk.type = "text/javascript";
    sdk.async = true;
    sdk.src = `${sdkSrc}?sdkid=${loadPixelId}&lib=ttq`;
    const firstScript = document.getElementsByTagName("script")[0];
    // Original inserts before the first <script>; fall back to <head> append in
    // the (theoretical) scriptless-document case instead of throwing.
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(sdk, firstScript);
    } else {
      document.head.appendChild(sdk);
    }
  };

  (ttq.load as (id: string, options?: Record<string, unknown>) => void)(pixelId);

  // Anonymous `external_id` on the pixel, BEFORE the first page().
  //
  // Why here and not in ConversionPixelsAdvancedMatching: that component's `ttq.identify` runs
  // for AUTHENTICATED users only (it early-returns otherwise) and, even for members, runs long
  // after this bootstrap already fired page(). So browser Pageview reached TikTok with ~3%
  // External ID coverage. The deferred proxies installed above are FIFO — every call is pushed
  // onto one array and the SDK drains it in order on load — so an identify queued *here* is
  // applied before the page() below, and the page view carries the id.
  //
  // The value is passed RAW (plaintext), never pre-hashed: the SDK normalizes and SHA-256s
  // identity in the browser, and the server hashes the SAME raw string via `hashPII`
  // (mapCanonicalToTikTokEvent → user.external_id; /api/tracking/conversion already falls back
  // to this anonymous id as `externalId` for guests). Both sides therefore land on the identical
  // hash — that match is the entire point. Pre-hashing would double-hash and match nothing.
  //
  // `ta_anon_id_pub` is NOT httpOnly by design; `ta_anon_id` — the authoritative A/B assignment
  // identity — stays httpOnly and is never read here. Same value, one visitor; see
  // src/lib/ab-testing/anon-id-cookie.ts.
  //
  // Members are NOT fully unaffected, and the trade is deliberate. ConversionPixelsAdvancedMatching
  // early-returns until `isAuthenticated && userData._id` resolves, which is strictly after this
  // runs — so a member's FIRST browser page view now carries `external_id = anon_<uuid>` where it
  // previously carried none, and only later events get the real User._id. That is the better of
  // the two: an anonymous-but-stable id is a real match key (it is the same id the server sends
  // for that visitor's guest events), whereas the status quo was no external_id at all. The
  // /api/ab-testing/merge-user bridge links the two ids, so the identities do not fragment.
  const anonymousId = readAnonIdPublicCookie();
  if (anonymousId) {
    (ttq.identify as (user: Record<string, unknown>) => void)({ external_id: anonymousId });
  }

  if (firePagePing) (ttq.page as () => void)();
  window._ttqInit = true;
}

function pixelTrack(event: CanonicalEvent): void {
  if (typeof window === "undefined" || !window.ttq) return;
  if (!getAllowedHostnames().includes(window.location.hostname)) return;
  if (!process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID) return;

  const params: Record<string, unknown> = {};
  if (event.value !== undefined) params.value = event.value;
  if (event.currency) params.currency = event.currency;
  const contentIds = event.customData?.contentIds;
  if (contentIds && contentIds.length > 0) {
    // Match the Events API `properties.contents` shape so pixel ↔ server parameters align.
    // quantity is per-row; only attach the order-wide numItems when there's a single id
    // (avoids duplicating the total across rows on multi-line carts).
    params.contents = contentIds.map((id) => ({
      content_id: id,
      ...(event.customData?.contentType && { content_type: event.customData.contentType }),
      ...(event.customData?.contentName && { content_name: event.customData.contentName }),
      ...(event.customData?.numItems !== undefined && contentIds.length === 1 && { quantity: event.customData.numItems }),
    }));
  }
  if (event.customData?.contentType) params.content_type = event.customData.contentType;
  if (event.customData?.contentName) params.content_name = event.customData.contentName;
  if (event.customData?.numItems !== undefined) params.quantity = event.customData.numItems;
  if (event.customData?.orderId) params.order_id = event.customData.orderId;
  if (event.providerData?.tiktok) Object.assign(params, event.providerData.tiktok);

  // TikTok's page view is `ttq.page()`, NOT a tracked event — routing it through
  // `ttq.track("PageView", …)` would register a CUSTOM event of that name instead of
  // the standard Pageview, so SPA navigations never counted as page views (only the
  // initial load did, via the loadPixel bootstrap). ConversionPixels dispatches
  // PageView to every provider on route change; translate it here so the provider
  // owns its own vocabulary and nothing double-fires (panel F-022).
  if (event.eventName === "PageView") {
    window.ttq.page();
    return;
  }

  // TikTok dedup: 3rd arg `{ event_id }` matches Events API event_id (spec §3 invariant #1).
  window.ttq.track(event.eventName, params, { event_id: event.eventId });
}

async function capiSend(event: CanonicalEvent, ctx: RequestContext): Promise<boolean> {
  if (!envEnabled().capi) return false;
  // Dynamic import keeps the server-only transport out of the client bundle (see the
  // note at the top of this file). This function only ever runs server-side.
  const { mapCanonicalToTikTokEvent, sendTikTokEvent } = await import("@/lib/tiktok");
  const ttEvent = mapCanonicalToTikTokEvent(event, ctx);
  return sendTikTokEvent(ttEvent);
}

export const tiktokProvider: ConversionProvider = {
  id: "tiktok",
  enabled: envEnabled,
  productionHostnames: getAllowedHostnames,
  loadPixel,
  pixelTrack,
  capiSend,
};
