# TikTok Events API + Match-Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commit policy:** This repo enforces CLAUDE.md §1 *no auto-commit*. The "Commit" steps below are real, but only run them once the user has authorized commits this session (keywords: commit / push / merge / make a PR / ship it). If unauthorized, stop at the commit step and ask.

**Goal:** Replace the TikTok provider's stub `capiSend` with a real TikTok Events API (v1.3) integration and add the browser match-quality signals (`ttq.identify`, `ttclid`/`_ttp`), giving TikTok the same deduped Pixel↔server dual-fire we have for Meta.

**Architecture:** A new `src/lib/tiktok.ts` is the canonical Events API sender (pure payload builders + one `fetch`), mirroring `src/lib/facebook.ts`. The existing `tiktokProvider.capiSend` ([providers/tiktok.ts](../../../src/lib/tracking/providers/tiktok.ts)) calls it. Match-quality signals are captured client-side (`ttclid` cookie + the pixel's `_ttp`) and re-attached server-side in `/api/tracking/conversion`; identity is sent via `ttq.identify` on login. Everything is gated by the existing per-surface `enabled()` + `productionHostnames()` so missing creds are a clean no-op.

**Tech Stack:** Next.js 15 App Router, TypeScript, the existing `src/lib/tracking/` provider registry, Node `crypto` SHA-256, standalone `tsx` test scripts.

**Spec:** [`docs/superpowers/specs/2026-05-22-tiktok-events-api-design.md`](../specs/2026-05-22-tiktok-events-api-design.md)

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/lib/tiktok.ts` | Events API v1.3 sender: hashing, E.164 normalize, pure payload builders, `sendTikTokEvent` (fetch + `code:0`), test-code gating | **Create** |
| `src/lib/tracking/providers/tiktok.ts` | `capiSend` real impl + `pixelTrack` `contents` parity | Modify |
| `src/lib/tracking/types.ts` | add `ttp?` to `userData` | Modify |
| `src/utils/tracking/tiktok-helpers.ts` | client `ttclid` capture + server `extractTikTokContext` | **Create** |
| `src/app/api/tracking/conversion/route.ts` | enrich `userData.ttclid` / `userData.ttp` from request | Modify |
| `src/components/tracking/ConversionPixels.tsx` | capture `?ttclid=` on mount | Modify |
| `src/components/tracking/ConversionPixelsAdvancedMatching.tsx` | also fire `ttq.identify` on login | Modify |
| `src/lib/tracking/__tests__/tiktok-capi.test.ts` | unit test (pure builders + hashing) | **Create** |
| `env.example` | TikTok CAPI + test-code vars | Modify |
| `package.json` | `test:tiktok-capi` script | Modify |
| `docs/tracking/*` + `TIKTOK_EVENTS_API_IMPLEMENTATION.md` | docs | Modify/Create |
| `CLAUDE.md` (both copies) | manifest paths for new files | Modify |
| `README.md` / `BUSINESS.md` | flip TikTok conversion tracking to live (if asserted) | Modify if needed |

---

## PHASE 1 — Events API live

### Task 1: TikTok Events API sender (`src/lib/tiktok.ts`)

**Files:**
- Create: `src/lib/tiktok.ts`
- Create: `src/lib/tracking/__tests__/tiktok-capi.test.ts`
- Modify: `package.json` (add `test:tiktok-capi`)

- [ ] **Step 1: Write the failing test**

Create `src/lib/tracking/__tests__/tiktok-capi.test.ts`:

```ts
// Run: npx tsx src/lib/tracking/__tests__/tiktok-capi.test.ts
import assert from "node:assert";
import crypto from "node:crypto";
import {
  normalizePhoneE164,
  mapCanonicalToTikTokEvent,
  buildTikTokRequestBody,
} from "../../tiktok";
import type { CanonicalEvent } from "../types";

const sha256 = (s: string) => crypto.createHash("sha256").update(s.toLowerCase().trim()).digest("hex");

function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log("tiktok-capi");

test("normalizePhoneE164 handles AU formats", () => {
  assert.equal(normalizePhoneE164("0412 345 678"), "+61412345678");
  assert.equal(normalizePhoneE164("+61412345678"), "+61412345678");
  assert.equal(normalizePhoneE164("61412345678"), "+61412345678");
});

test("mapCanonicalToTikTokEvent hashes PII, leaves ids/ip/ua raw", () => {
  const ev: CanonicalEvent = {
    eventName: "Purchase",
    eventId: "pi_123",
    eventTime: 1747872000,
    value: 49.99,
    currency: "AUD",
    userData: {
      email: "Test@Example.com ",
      phone: "0412 345 678",
      externalId: "abc123",
      ttclid: "ttclid-raw",
      ttp: "ttp-raw",
      clientIpAddress: "1.2.3.4",
      clientUserAgent: "UA/1.0",
    },
    customData: { orderId: "pi_123", contentType: "product", contentIds: ["pkg_x"], numItems: 1 },
    eventSourceUrl: "https://toolsaustralia.com.au/success",
  };
  const tt = mapCanonicalToTikTokEvent(ev, {});
  assert.equal(tt.event, "Purchase");
  assert.equal(tt.event_time, 1747872000);
  assert.equal(tt.event_id, "pi_123");
  assert.equal(tt.user.email, sha256("test@example.com"));
  assert.equal(tt.user.phone_number, sha256("+61412345678"));
  assert.equal(tt.user.external_id, sha256("abc123"));
  assert.equal(tt.user.ttclid, "ttclid-raw");       // raw
  assert.equal(tt.user.ttp, "ttp-raw");             // raw
  assert.equal(tt.user.ip, "1.2.3.4");              // raw
  assert.equal(tt.user.user_agent, "UA/1.0");       // raw
  assert.equal(tt.properties.value, 49.99);
  assert.equal(tt.properties.currency, "AUD");
  assert.deepEqual(tt.properties.contents, [{ content_id: "pkg_x", content_type: "product", quantity: 1 }]);
  assert.equal(tt.page?.url, "https://toolsaustralia.com.au/success");
});

test("mapCanonicalToTikTokEvent omits empty user fields", () => {
  const tt = mapCanonicalToTikTokEvent(
    { eventName: "ViewContent", eventId: "v1", eventTime: 1, userData: {} },
    {},
  );
  assert.equal("email" in tt.user, false);
  assert.equal("ttclid" in tt.user, false);
});

test("buildTikTokRequestBody wraps events with source + pixel id, top-level test code", () => {
  const body = buildTikTokRequestBody(
    [mapCanonicalToTikTokEvent({ eventName: "Purchase", eventId: "x", eventTime: 1, userData: {} }, {})],
    { pixelId: "PIX1", testEventCode: "TEST42" },
  );
  assert.equal(body.event_source, "web");
  assert.equal(body.event_source_id, "PIX1");
  assert.equal(body.test_event_code, "TEST42");
  assert.equal(body.data.length, 1);
});

test("buildTikTokRequestBody omits test_event_code when absent", () => {
  const body = buildTikTokRequestBody([], { pixelId: "PIX1" });
  assert.equal("test_event_code" in body, false);
});

console.log("✓ all tiktok-capi tests passed");
```

- [ ] **Step 2: Add the npm script**

In `package.json`, after the `"test:tracking-dispatch"` line (~line 90):

```json
    "test:tiktok-capi": "tsx src/lib/tracking/__tests__/tiktok-capi.test.ts",
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:tiktok-capi`
Expected: FAIL — cannot find module `../../tiktok` (file not created yet).

- [ ] **Step 4: Create `src/lib/tiktok.ts`**

```ts
// src/lib/tiktok.ts
// Canonical TikTok Events API (v1.3) sender. Parallel to src/lib/facebook.ts.
// Endpoint: POST https://business-api.tiktok.com/open_api/v1.3/event/track/
// Auth: header `Access-Token`. Success: HTTP 200 AND body `code === 0`.
// Verified 2026-05-22 — see docs/superpowers/specs/2026-05-22-tiktok-events-api-design.md §2.

import { hashPII } from "./tracking/canonical-event";
import { getPixelEnv, isProductionPixelEnv } from "./facebook-env";
import type { CanonicalEvent, RequestContext } from "./tracking/types";

const TIKTOK_EVENTS_API_URL =
  "https://business-api.tiktok.com/open_api/v1.3/event/track/";

/** Per-event object in the `data[]` array. */
export interface TikTokEvent {
  event: string;
  event_time: number; // Unix SECONDS
  event_id: string;
  user: {
    email?: string;          // sha256(lowercase+trim)
    phone_number?: string;   // sha256(E.164)
    external_id?: string;    // sha256(lowercase+trim)
    ttclid?: string;         // raw
    ttp?: string;            // raw (_ttp cookie)
    ip?: string;             // raw
    user_agent?: string;     // raw
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

/**
 * Normalize a phone number to E.164 before hashing (TikTok requirement).
 * AU-aware default: leading `0` => `+61`; bare national digits => `+61`;
 * already `+` => keep. The SAME normalized string is passed to `ttq.identify`
 * on the browser so the SDK's hash matches this server hash (dedup-safe).
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

/** Map a provider-agnostic CanonicalEvent to a TikTok per-event object. Pure. */
export function mapCanonicalToTikTokEvent(
  event: CanonicalEvent,
  ctx: RequestContext,
): TikTokEvent {
  const u = event.userData ?? {};
  const cd = event.customData ?? {};

  const user: TikTokEvent["user"] = {
    ...(u.email && { email: hashPII(u.email) }),
    ...(u.phone && normalizePhoneE164(u.phone) && {
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:tiktok-capi`
Expected: PASS — `✓ all tiktok-capi tests passed`.

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 7: Commit** (only if commits authorized — see header)

```bash
git add src/lib/tiktok.ts src/lib/tracking/__tests__/tiktok-capi.test.ts package.json
git commit -m "feat(tracking): TikTok Events API v1.3 sender + payload builders"
```

---

### Task 2: Wire `capiSend` to the sender

**Files:**
- Modify: `src/lib/tracking/providers/tiktok.ts` (replace the `capiSend` stub at lines 90-96)

- [ ] **Step 1: Replace the stub**

In `src/lib/tracking/providers/tiktok.ts`, replace:

```ts
async function capiSend(_event: CanonicalEvent): Promise<boolean> {
  // STUB. Real TikTok Events API integration lands in follow-up spec.
  ...
  return false;
}
```

with:

```ts
async function capiSend(event: CanonicalEvent, ctx: RequestContext): Promise<boolean> {
  if (!envEnabled().capi) return false;
  const ttEvent = mapCanonicalToTikTokEvent(event, ctx);
  return sendTikTokEvent(ttEvent);
}
```

And update the imports at the top of the file:

```ts
import type { CanonicalEvent, ConversionProvider, RequestContext } from "../types";
import { getAllowedHostnames } from "../hostname-gate";
import { shouldTrackRoute } from "@/utils/tracking/should-track-route";
import { mapCanonicalToTikTokEvent, sendTikTokEvent } from "@/lib/tiktok";
```

- [ ] **Step 2: Verify dispatch test still passes**

Run: `npm run test:tracking-dispatch`
Expected: PASS (TikTok provider with no token still returns `false` cleanly — `envEnabled().capi` is false in the test env).

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit** (if authorized)

```bash
git add src/lib/tracking/providers/tiktok.ts
git commit -m "feat(tracking): implement TikTok capiSend via Events API sender"
```

---

### Task 3: Environment variables

**Files:**
- Modify: `env.example` (the `# TikTok Pixel` block at lines 51-52)

- [ ] **Step 1: Expand the TikTok block**

Replace:

```
# TikTok Pixel
NEXT_PUBLIC_TIKTOK_PIXEL_ID=your-tiktok-pixel-id
```

with:

```
# TikTok Pixel & Events API
# NEXT_PUBLIC_TIKTOK_PIXEL_ID: TikTok Pixel ID (browser pixel + Events API event_source_id)
#   Find it in: TikTok Events Manager -> your pixel -> Settings
# TIKTOK_ACCESS_TOKEN: Events API access token (server-side). SECRET — set in Vercel + local .env.local only.
#   Generate it in: TikTok Events Manager -> Events API -> Generate access token (copy immediately; TikTok won't re-show it)
# TIKTOK_TEST_EVENT_CODE: routes events to Events Manager -> Test Events tab (optional, testing only)
# TIKTOK_USE_TEST_EVENTS: set "true" to use the test code on staging/preview (Vercel sets NODE_ENV=production there)
NEXT_PUBLIC_TIKTOK_PIXEL_ID=your-tiktok-pixel-id
TIKTOK_ACCESS_TOKEN=your-tiktok-access-token
TIKTOK_TEST_EVENT_CODE=your-tiktok-test-event-code
# TIKTOK_USE_TEST_EVENTS=true
```

- [ ] **Step 2: Commit** (if authorized)

```bash
git add env.example
git commit -m "chore(tracking): document TikTok Events API env vars"
```

> After this task the user sets the real values: `NEXT_PUBLIC_TIKTOK_PIXEL_ID=D3NFN8RC77U1STIOI7F0` + the access token in **Vercel env** and a gitignored `.env.local`. Never commit the token.

---

## PHASE 2 — Match quality

### Task 4: Add `ttp` to the canonical type

**Files:**
- Modify: `src/lib/tracking/types.ts` (the `userData` block, after the `ttclid` field ~line 39)

- [ ] **Step 1: Add the field**

After:

```ts
    /** TikTok click id. Read by TikTok provider only. */
    ttclid?: string;
```

add:

```ts
    /** TikTok first-party browser id (cookie `_ttp`). Read by TikTok provider only. */
    ttp?: string;
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: clean.

---

### Task 5: TikTok helpers (`src/utils/tracking/tiktok-helpers.ts`)

**Files:**
- Create: `src/utils/tracking/tiktok-helpers.ts`

- [ ] **Step 1: Create the file**

```ts
// src/utils/tracking/tiktok-helpers.ts
// Mirrors facebook-helpers.ts for TikTok's match signals:
// - ttclid: TikTok click id, arrives as `?ttclid=` on ad-click landings (7-day life). We
//   persist it to a first-party cookie so it's still attached at conversion AND readable
//   server-side for the Events API.
// - ttp: the TikTok Pixel's own first-party `_ttp` cookie (set by the loaded pixel).

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
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: clean.

- [ ] **Step 3: Commit** (if authorized)

```bash
git add src/lib/tracking/types.ts src/utils/tracking/tiktok-helpers.ts
git commit -m "feat(tracking): TikTok ttclid/_ttp helpers + ttp canonical field"
```

---

### Task 6: Capture `ttclid` on mount

**Files:**
- Modify: `src/components/tracking/ConversionPixels.tsx` (the first `useEffect`, ~lines 35-42)

- [ ] **Step 1: Import the helper**

After the existing imports add:

```ts
import { captureTikTokClickId } from "@/utils/tracking/tiktok-helpers";
```

- [ ] **Step 2: Call it in the load effect**

Inside the first `useEffect`, before the provider loop:

```ts
  useEffect(() => {
    if (disabled || ranRef.current) return;
    ranRef.current = true;
    // Persist TikTok click id from the landing URL so it survives to conversion
    // and is readable server-side. No-op when there's no ?ttclid=.
    captureTikTokClickId();
    for (const provider of getAllProviders()) {
      if (!provider.enabled().pixel) continue;
      provider.loadPixel({ nonce });
    }
  }, [nonce, disabled]);
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: clean.

---

### Task 7: Enrich the conversion route with ttclid/ttp

**Files:**
- Modify: `src/app/api/tracking/conversion/route.ts`

- [ ] **Step 1: Import the helper**

After the `extractRequestContext` import (~line 10):

```ts
import { extractTikTokContext } from "@/utils/tracking/tiktok-helpers";
```

- [ ] **Step 2: Read TikTok cookies and merge into userData**

After `const reqCtx = extractRequestContext(request);` (~line 131) add:

```ts
  const ttCtx = extractTikTokContext(request);
```

Then in the `userData` object (~lines 133-142), add the two fields before the `...parsed.userData` spread:

```ts
  const userData: CanonicalEvent["userData"] = {
    ...sessionUserData,
    ...(reqCtx.fbc && { fbc: reqCtx.fbc }),
    ...(reqCtx.fbp && { fbp: reqCtx.fbp }),
    ...(ttCtx.ttclid && { ttclid: ttCtx.ttclid }),
    ...(ttCtx.ttp && { ttp: ttCtx.ttp }),
    ...(reqCtx.client_ip_address && { clientIpAddress: reqCtx.client_ip_address }),
    ...(reqCtx.client_user_agent && { clientUserAgent: reqCtx.client_user_agent }),
    ...parsed.userData,
  };
```

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit** (if authorized)

```bash
git add src/components/tracking/ConversionPixels.tsx src/app/api/tracking/conversion/route.ts
git commit -m "feat(tracking): capture ttclid client-side + attach ttclid/ttp server-side"
```

---

### Task 8: `ttq.identify` on login

**Files:**
- Modify: `src/components/tracking/ConversionPixelsAdvancedMatching.tsx`

- [ ] **Step 1: Add a TikTok identify call alongside the FB re-init**

Inside the existing `useEffect` (after the FB `window.fbq("init", ...)` block, before `lastSentForUserIdRef.current = userData._id;`), add:

```ts
    // TikTok identity (advanced matching). The SDK normalizes + SHA-256-hashes the
    // plaintext we pass; we pre-normalize phone to E.164 and lower/trim email so the
    // SDK's hash matches the server-side Events API hash (dedup-safe). Guard on the
    // TikTok pixel being loaded + enabled.
    const tiktokPixelId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
    if (tiktokPixelId && typeof window !== "undefined" && window.ttq) {
      const identify: Record<string, string> = {};
      if (userData.email) identify.email = userData.email.toLowerCase().trim();
      if (userData.mobile) identify.phone_number = normalizePhoneE164(userData.mobile);
      if (userData._id) identify.external_id = userData._id;
      if (Object.keys(identify).length > 0) {
        window.ttq.identify(identify);
      }
    }
```

- [ ] **Step 2: Add the import**

At the top of the file:

```ts
import { normalizePhoneE164 } from "@/lib/tiktok";
```

> Note: `normalizePhoneE164` is a pure string function — importing it into a client component is safe (no server-only deps in `tiktok.ts`'s top-level except `crypto`, which is only used inside `hashPII`/server fns; if the bundler complains about `crypto`, move `normalizePhoneE164` into a shared `src/utils/tracking/tiktok-helpers.ts` export and import from there instead). Verify with `npm run build`.

- [ ] **Step 3: Type-check + build (client bundle safety)**

Run: `npm run type-check && npm run build`
Expected: build succeeds. If it fails on `crypto` in the client bundle, apply the fallback in the note above (re-export `normalizePhoneE164` from `tiktok-helpers.ts`).

- [ ] **Step 4: Commit** (if authorized)

```bash
git add src/components/tracking/ConversionPixelsAdvancedMatching.tsx
git commit -m "feat(tracking): TikTok ttq.identify advanced matching on login"
```

---

## PHASE 3 — Parameter parity + docs

### Task 9: `pixelTrack` contents parity

**Files:**
- Modify: `src/lib/tracking/providers/tiktok.ts` (the `pixelTrack` body, ~lines 71-88)

- [ ] **Step 1: Build a `contents` array on the pixel side**

Replace the `content_id` mapping line:

```ts
  if (event.customData?.contentIds) params.content_id = event.customData.contentIds[0];
```

with:

```ts
  if (event.customData?.contentIds && event.customData.contentIds.length > 0) {
    params.contents = event.customData.contentIds.map((id) => ({
      content_id: id,
      ...(event.customData?.contentType && { content_type: event.customData.contentType }),
      ...(event.customData?.contentName && { content_name: event.customData.contentName }),
      ...(event.customData?.numItems !== undefined && { quantity: event.customData.numItems }),
    }));
  }
```

(Leave the existing `content_type` / `content_name` / `value` / `currency` / `order_id` top-level params — TikTok accepts both, and they aid reporting.)

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit** (if authorized)

```bash
git add src/lib/tracking/providers/tiktok.ts
git commit -m "feat(tracking): align TikTok pixel contents[] with Events API"
```

---

### Task 10: Docs, manifest, and business-status sync

**Files:**
- Create: `docs/tracking/TIKTOK_EVENTS_API_IMPLEMENTATION.md`
- Modify: `docs/tracking/architecture.md`, `backend.md`, `api.md`, `gotchas.md`, `patterns.md`
- Modify: `CLAUDE.md` (repo root) **and** `.worktrees/tiktok-pixel/CLAUDE.md` — `tracking` manifest `paths`
- Modify (if asserted): `README.md`, `BUSINESS.md`

- [ ] **Step 1: Write `docs/tracking/TIKTOK_EVENTS_API_IMPLEMENTATION.md`**

Cover: the verified API facts (copy spec §2), the file map, the dual-fire merge rationale (browser brings ttclid/ttp, server brings hashed PII), the `Purchase` event-name choice, the `code:0` success rule, the staging test-events procedure, and the token-rotation reminder.

- [ ] **Step 2: Update domain docs**

- `architecture.md` — TikTok is now full dual-fire (pixel + Events API), not a stub.
- `backend.md` — add `src/lib/tiktok.ts` as the TikTok Events API entry; `capiSend` delegates to it.
- `api.md` — note `/api/tracking/conversion` now enriches ttclid/ttp.
- `gotchas.md` — TikTok dedup needs identical event name + `event_id`; success is `code:0` not HTTP; `event_time` is seconds; `Purchase` (not CompletePayment) is the web event; `test_event_code` is top-level.
- `patterns.md` — the "add a provider's CAPI" recipe now has a worked second example (TikTok).

- [ ] **Step 3: Add new files to BOTH CLAUDE.md manifests**

In the `tracking` domain `paths` array, add:

```json
        "src/lib/tiktok.ts",
        "src/utils/tracking/tiktok-helpers.ts",
```

(`src/lib/tracking/__tests__/**` and `src/utils/tracking/**` are already covered, but add the explicit `tiktok.ts` lib entry. Apply to both `C:\Codes\ToolsAustralia\CLAUDE.md` and the worktree copy.)

- [ ] **Step 4: Check README.md / BUSINESS.md**

Run: `npm run lint` is unrelated here — instead grep:

Run: `grep -rni "tiktok" README.md BUSINESS.md`
If either asserts TikTok conversion tracking is "coming soon"/"prepared/shell only", move that line to "live" (CLAUDE.md §5). **Do not** flip the *insights/ROAS dashboard sync* line — that's still out of scope.

- [ ] **Step 5: Run the doc-sync + full verification**

Run: `npm run type-check && npm run lint && npm run test:tiktok-capi && npm run test:tracking-dispatch`
Expected: all pass. The Stop doc-sync hook should be satisfied (docs updated for the `tracking` domain).

- [ ] **Step 6: Commit** (if authorized)

```bash
git add docs/tracking/ CLAUDE.md README.md BUSINESS.md
git commit -m "docs(tracking): document TikTok Events API integration + manifest"
```

---

## Verification (after all phases — staging)

1. Set in staging Vercel env: `NEXT_PUBLIC_TIKTOK_PIXEL_ID=D3NFN8RC77U1STIOI7F0`, `TIKTOK_ACCESS_TOKEN=<token>`, `TIKTOK_TEST_EVENT_CODE=<from Test Events tab>`, `TIKTOK_USE_TEST_EVENTS=true`, and add the staging host to `NEXT_PUBLIC_PIXEL_ALLOWED_HOSTNAMES`.
2. Land on staging with `?ttclid=TEST` → complete one Purchase with a Stripe test card.
3. TikTok Events Manager → **Test Events**: confirm browser + Events-API `Purchase` with the **same `event_id`**, deduped to one, server send shows `code:0`, and `ttclid`/`ttp` present.
4. Confirm Event Match Quality climbs toward 7+ over the following days.
5. `npm run type-check && npm run lint && npm run test:tiktok-capi && npm run test:tracking-dispatch` all green.
6. **Rotate the access token** in Events Manager (it was shared in chat).

---

## Self-review notes

- **Spec coverage:** §3.1 sender → Task 1; §3.1 capiSend → Task 2; §3.2 identify → Task 8, ttclid/ttp capture → Tasks 5-7, `ttp` type → Task 4; §3.3 parity → Tasks 2 (CAPI contents) + 9 (pixel contents); §3.4 env → Task 3, test → Task 1, docs/manifest → Task 10. README/BUSINESS → Task 10 Step 4. All covered.
- **Type consistency:** `mapCanonicalToTikTokEvent`, `buildTikTokRequestBody`, `sendTikTokEvent`, `normalizePhoneE164`, `captureTikTokClickId`, `extractTikTokContext` are defined in Task 1/5 and referenced consistently in Tasks 2/6/7/8.
- **Verified in research round 2 (spec §2a):** `phone_number` (not `phone`), `data[].user` (not `context.user`), `test_event_code` top-level, `user.ttclid` (not `callback`), and `ttq.identify` auto-hashing are all confirmed against working code from ≥3 independent sources. The plan code already reflects these.
- **Remaining verify-on-implementation points:** (a) `crypto` in the client bundle for the `normalizePhoneE164` import — Task 8 documents the fallback (re-export the pure helper from `tiktok-helpers.ts` if the bundler complains); (b) confirm `ttclid`/`ttp` actually appear on events in TikTok **Test Events** during staging before relying on them (the only thing not verifiable from rendered primary docs, since TikTok's portal API reference is a JS SPA).
