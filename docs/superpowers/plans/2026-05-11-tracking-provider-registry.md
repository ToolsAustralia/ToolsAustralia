# Tracking Provider Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace today's per-platform sprawl of Facebook + TikTok pixel/CAPI code with a provider-pluggable registry that uniformly enforces dual-fire (browser pixel + server CAPI), eventID-based dedup, production-hostname gating, and missing-credentials safety across Facebook, TikTok, and Snapchat. Also fixes a production bug where browser-side Purchase events stop firing on non-3DS purchase paths.

**Architecture:** A canonical `CanonicalEvent` shape flows through two thin dispatchers (`sendConversion` server-side, `trackConversion` client-side) that fan out to provider modules (`facebook.ts`, `tiktok.ts`, `snapchat.ts`) implementing a single interface. Facebook's existing rich logic is wrapped, not rewritten. TikTok and Snapchat ship as stubs (pixel fires, CAPI returns false) so the registry's structure is proven before the real Marketing-API integrations land in follow-up specs. All existing call sites (`trackPurchaseWithEventId`, `sendFacebookEvent`, etc.) continue working via facade shims.

**Tech Stack:** Next.js 15 App Router · TypeScript · Mongoose · Zod · TanStack Query · Node test runner via `tsx` (no jest/vitest) · React 19 client components.

**Spec:** [`docs/superpowers/specs/2026-05-11-tracking-provider-registry-design.md`](../specs/2026-05-11-tracking-provider-registry-design.md)

---

## Important repo conventions

- **No auto-commit.** This repo's `CLAUDE.md` has a hard rule: never run `git commit`/`git add`/`git push`/`gh pr` unless the user explicitly authorizes with `commit`, `push`, `merge`, `ship it`, etc. in their most recent message. Every task in this plan lists the suggested commit command but you must ask the user before running it. If they say "commit", run it; otherwise stop after the test step.
- **Tests are tsx scripts.** Pattern: `import assert from "node:assert/strict"`; mock `global.fetch`; snapshot/restore `process.env`. See [`src/lib/__tests__/facebook.test.ts`](../../../src/lib/__tests__/facebook.test.ts) for the canonical example.
- **Every new test needs a `test:<scope>` script in [`package.json`](../../../package.json).** `npm test` only runs anchor-billing — discoverability of new test files happens via the named script entries.
- **Strict layering** (`.cursor/rules/.cursorrules`): no DB access from components, no business logic in `app/api/**` handlers. Handlers parse → validate → authorize → delegate to `services/` or `lib/`.
- **Path alias:** `@/` maps to `src/`.
- **The Domain Manifest** in [`CLAUDE.md`](../../../CLAUDE.md) maps file globs → docs folders. New paths under `src/lib/tracking/**` and `src/components/tracking/**` must be registered in the `tracking` domain — Task 20 does this.

---

## File structure

**Created (15 files):**

| Path | Responsibility |
|---|---|
| `src/lib/tracking/types.ts` | `CanonicalEvent`, `ConversionProvider`, `RequestContext`, `ProviderId` types only |
| `src/lib/tracking/canonical-event.ts` | `buildPurchaseEvent(...)`, `assertValidEvent(...)`, `eventTimeNow()`, raw→hashed user data |
| `src/lib/tracking/registry.ts` | `getAllProviders()` — single source of truth for provider list |
| `src/lib/tracking/dispatch.ts` | Server-side `sendConversion(event, ctx)` — fan-out via `capiSend` |
| `src/lib/tracking/dispatch-client.ts` | Browser-side `trackConversion(event)` — fan-out via `pixelTrack` |
| `src/lib/tracking/providers/facebook.ts` | Wraps existing `sendFacebookEvent` + `fbq` calls |
| `src/lib/tracking/providers/tiktok.ts` | STUB. `loadPixel`/`pixelTrack` real; `capiSend` returns `false` |
| `src/lib/tracking/providers/snapchat.ts` | STUB. Same shape as TikTok stub |
| `src/lib/tracking/__tests__/dispatch.test.ts` | Registry + dispatcher unit tests |
| `src/components/tracking/ConversionPixels.tsx` | Mounts every enabled provider's pixel via `loadPixel()` |
| `src/app/api/tracking/conversion/route.ts` | Provider-agnostic POST endpoint → `sendConversion` |
| `src/models/TikTokAdInsightsDaily.ts` | Mongoose schema parallel to `MetaAdInsightsDaily` |
| `src/models/SnapchatAdInsightsDaily.ts` | Same shape |
| `src/components/admin/TikTokAdsManagement.tsx` | Empty-state shell admin tab |
| `src/components/admin/SnapchatAdsManagement.tsx` | Empty-state shell admin tab |

**Modified (17 files):**

| Path | Change |
|---|---|
| `src/lib/facebook.ts` | `sendFacebookEvent`/`sendFacebookPurchaseEventDev`/`buildFacebookPurchaseEventDev` become thin shims |
| `src/components/FacebookPixel.tsx` | `trackPurchaseWithEventId`/`trackFacebookEvent`/etc. delegate to provider |
| `src/components/TikTokPixel.tsx` | `trackTikTokEvent`/etc. delegate to provider |
| `src/components/PixelTracker.tsx` | Re-exports `<ConversionPixels />` |
| `src/app/layout.tsx` | Swap `<PixelTracker>` for `<ConversionPixels>` |
| `src/app/api/facebook/track/route.ts` | Body → `CanonicalEvent` → `sendConversion`; JSDoc deprecation note |
| `src/utils/tracking/pixel-purchase-tracking.ts` | Build `CanonicalEvent` once, call `sendConversion`; remove inline TikTok branch; fix stale comment |
| `src/components/payment/PaymentSuccessHandler.tsx` | Remove the redundant `trackPurchaseWithEventId` call |
| `src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx` | Fire `Purchase` on mount via `trackConversion` |
| `src/app/(site)/upsell-success/components/UpsellSuccessClient.tsx` | Same |
| `src/app/(site)/mini-draw-success/components/MiniDrawSuccessClient.tsx` | Same |
| `src/app/(site)/checkout/success/components/CheckoutSuccessClient.tsx` | Same (uses `useOrder` data already) |
| `src/app/admin/component/AdminSidebar.tsx` | Add `tiktok-ads` + `snapchat-ads` sidebar entries |
| `src/app/admin/component/AdminPage.tsx` | Add `case "tiktok-ads"` and `case "snapchat-ads"` |
| `package.json` | Add `test:tracking-dispatch` script |
| `CLAUDE.md` | Add new paths to `tracking` domain manifest |
| `docs/tracking/*.md` | Update `architecture.md`, `backend.md`, `frontend.md`, `api.md`, `models.md`, `patterns.md`, `gotchas.md` |

---

## Task index

1. Provider types
2. Canonical event builders & validators
3. Provider registry skeleton
4. Server dispatcher (`sendConversion`) — with tests
5. Client dispatcher (`trackConversion`) — with tests
6. Facebook provider (wraps existing CAPI + pixel)
7. TikTok provider stub
8. Snapchat provider stub
9. `<ConversionPixels />` component
10. Swap `PixelTracker` → `ConversionPixels` in layout
11. `/api/tracking/conversion` POST route
12. `/api/facebook/track` becomes a forwarding shim
13. Facebook library facade swap
14. FacebookPixel.tsx & TikTokPixel.tsx facade swap
15. `pixel-purchase-tracking.ts` simplification + stale-comment fix
16. Fix broken browser Purchase dual-fire on 4 success pages
17. TikTok + Snapchat insights Mongoose models
18. TikTok + Snapchat admin shell components
19. Admin sidebar + tab routing
20. Docs + Domain Manifest update

---

## Task 1: Provider types

**Files:**
- Create: `src/lib/tracking/types.ts`

- [ ] **Step 1: Create the types file**

```ts
// src/lib/tracking/types.ts

export type ProviderId = "facebook" | "tiktok" | "snapchat";

/**
 * Canonical event shape passed to every provider. Provider-specific quirks
 * (FB's fbc/fbp, TikTok's ttclid, Snap's scid) live on userData but are
 * only read by the matching provider.
 */
export interface CanonicalEvent {
  /** e.g. 'Purchase' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'CompleteRegistration' | 'Subscribe' */
  eventName: string;
  /** Used for browser↔CAPI dedup. REQUIRED — `assertValidEvent` throws on empty. */
  eventId: string;
  /** Unix seconds. */
  eventTime: number;
  value?: number;
  /** ISO 4217, uppercase. */
  currency?: string;
  userData?: {
    /** Raw email — providers hash with their own rules. */
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
    clientIpAddress?: string;
    clientUserAgent?: string;
    /** Facebook click id (cookie `_fbc`). Read by FB provider only. */
    fbc?: string;
    /** Facebook browser id (cookie `_fbp`). Read by FB provider only. */
    fbp?: string;
    /** TikTok click id. Read by TikTok provider only. */
    ttclid?: string;
    /** Snapchat click id. Read by Snapchat provider only. */
    scid?: string;
  };
  customData?: {
    contentIds?: string[];
    contentType?: string;
    contentName?: string;
    contentCategory?: string;
    numItems?: number;
    orderId?: string;
    packageType?: string;
    searchString?: string;
  };
  eventSourceUrl?: string;
  /** Escape hatch for provider-specific custom fields. Use sparingly. */
  providerData?: {
    facebook?: Record<string, unknown>;
    tiktok?: Record<string, unknown>;
    snapchat?: Record<string, unknown>;
  };
}

export interface RequestContext {
  clientIpAddress?: string;
  clientUserAgent?: string;
  eventSourceUrl?: string;
}

export interface ConversionProvider {
  id: ProviderId;
  /**
   * Per-surface enablement. Pixel id and access token are independent —
   * a provider can have the pixel live while CAPI is still onboarding.
   * Env reads are lazy on every call so flipping env vars takes effect on next request.
   */
  enabled(): { pixel: boolean; capi: boolean };
  /** Hostnames that may run the browser pixel. Pixel refuses on any other host. */
  productionHostnames(): string[];
  /** Inject the provider's pixel script. Idempotent. No-op if `enabled().pixel` is false. */
  loadPixel(opts: { nonce?: string }): void;
  /** Fire the event in the browser. No-op if `enabled().pixel` is false or hostname is non-prod. */
  pixelTrack(event: CanonicalEvent): void;
  /** Send the event server-to-server. MUST return false (no network call) if `enabled().capi` is false. MUST return false on validation failure (never throw). */
  capiSend(event: CanonicalEvent, ctx: RequestContext): Promise<boolean>;
}
```

- [ ] **Step 2: Run type check**

Run: `npm run type-check`
Expected: PASS (no errors in `src/lib/tracking/types.ts`)

- [ ] **Step 3: Suggested commit** (ask the user first)

```bash
git add src/lib/tracking/types.ts
git commit -m "feat(tracking): add provider registry types"
```

---

## Task 2: Canonical event builders & validators

**Files:**
- Create: `src/lib/tracking/canonical-event.ts`

- [ ] **Step 1: Write the file**

```ts
// src/lib/tracking/canonical-event.ts
import crypto from "crypto";
import type { CanonicalEvent } from "./types";

/** Unix seconds. */
export function eventTimeNow(): number {
  return Math.floor(Date.now() / 1000);
}

/** SHA256 hash for PII — Meta/TikTok/Snap all require lowercase, trimmed, hex SHA256. */
export function hashPII(value: string): string {
  return crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

/**
 * Validate that a CanonicalEvent has the fields required for dual-fire dedup.
 * Throws in development (programmer error). Returns false in production (never break checkout).
 */
export function assertValidEvent(event: CanonicalEvent): boolean {
  const missing: string[] = [];
  if (!event.eventName || typeof event.eventName !== "string") missing.push("eventName");
  if (!event.eventId || typeof event.eventId !== "string" || event.eventId.trim() === "") {
    missing.push("eventId");
  }
  if (typeof event.eventTime !== "number" || !Number.isFinite(event.eventTime)) {
    missing.push("eventTime");
  }
  if (missing.length === 0) return true;

  const msg = `CanonicalEvent missing required fields: ${missing.join(", ")}`;
  if (process.env.NODE_ENV === "development") {
    throw new Error(msg);
  }
  console.error("[tracking]", msg, { event_name: event.eventName });
  return false;
}

export interface BuildPurchaseEventInput {
  /** Decimal dollars (NOT cents). */
  value: number;
  /** ISO 4217 currency code. */
  currency: string;
  /**
   * The id that will dedupe browser pixel ↔ CAPI. Use paymentIntentId or orderId.
   * MUST be the same value passed to both `trackConversion` (browser) and `sendConversion` (server).
   */
  eventId: string;
  userData?: CanonicalEvent["userData"];
  customData?: CanonicalEvent["customData"];
  eventSourceUrl?: string;
}

/**
 * Build a Purchase CanonicalEvent. Pure — no side effects, no env reads.
 * Callers can build once and pass to both browser and server dispatchers.
 */
export function buildPurchaseEvent(input: BuildPurchaseEventInput): CanonicalEvent {
  return {
    eventName: "Purchase",
    eventId: input.eventId,
    eventTime: eventTimeNow(),
    value: input.value,
    currency: input.currency.toUpperCase(),
    userData: input.userData,
    customData: input.customData,
    eventSourceUrl: input.eventSourceUrl,
  };
}
```

- [ ] **Step 2: Run type check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 3: Suggested commit**

```bash
git add src/lib/tracking/canonical-event.ts
git commit -m "feat(tracking): add canonical event builder + PII hash + validator"
```

---

## Task 3: Provider registry skeleton

**Files:**
- Create: `src/lib/tracking/registry.ts`

This file declares the registry shape but imports providers that don't exist yet — we'll add them as no-op placeholders, then flesh out in Tasks 6–8. This keeps the dispatchers (Task 4–5) compilable.

- [ ] **Step 1: Write a placeholder providers index**

Create: `src/lib/tracking/providers/index.ts`

```ts
// src/lib/tracking/providers/index.ts
// Re-export every provider so registry.ts has a single import surface.
// Real implementations land in tasks 6, 7, 8.

import type { ConversionProvider } from "../types";

const placeholder = (id: ConversionProvider["id"]): ConversionProvider => ({
  id,
  enabled: () => ({ pixel: false, capi: false }),
  productionHostnames: () => [],
  loadPixel: () => {},
  pixelTrack: () => {},
  capiSend: async () => false,
});

export const facebookProvider: ConversionProvider = placeholder("facebook");
export const tiktokProvider: ConversionProvider = placeholder("tiktok");
export const snapchatProvider: ConversionProvider = placeholder("snapchat");
```

These placeholders get **replaced** in Tasks 6, 7, 8 — they exist only so Tasks 4–5 can compile and have something to fan out to.

- [ ] **Step 2: Write the registry**

Create: `src/lib/tracking/registry.ts`

```ts
// src/lib/tracking/registry.ts
import type { ConversionProvider, ProviderId } from "./types";
import { facebookProvider, tiktokProvider, snapchatProvider } from "./providers";

/**
 * The full provider list. Order is stable; dispatchers iterate this array.
 * Per-surface enablement is decided by each provider's `enabled()` call,
 * which reads env lazily so flipping a Vercel env var takes effect on
 * the next request without a redeploy.
 */
const ALL_PROVIDERS: readonly ConversionProvider[] = [
  facebookProvider,
  tiktokProvider,
  snapchatProvider,
];

export function getAllProviders(): readonly ConversionProvider[] {
  return ALL_PROVIDERS;
}

export function getProvider(id: ProviderId): ConversionProvider | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}
```

- [ ] **Step 3: Run type check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 4: Suggested commit**

```bash
git add src/lib/tracking/providers/index.ts src/lib/tracking/registry.ts
git commit -m "feat(tracking): add registry + placeholder providers"
```

---

## Task 4: Server dispatcher with tests

**Files:**
- Create: `src/lib/tracking/dispatch.ts`
- Create: `src/lib/tracking/__tests__/dispatch.test.ts`
- Modify: `package.json` (add `test:tracking-dispatch` script)

- [ ] **Step 1: Write the failing test first**

Create: `src/lib/tracking/__tests__/dispatch.test.ts`

```ts
import assert from "node:assert/strict";
import type { CanonicalEvent, ConversionProvider, RequestContext } from "../types";

/** Build a controllable fake provider for testing dispatch behavior. */
function makeFakeProvider(
  id: ConversionProvider["id"],
  opts: {
    pixelEnabled?: boolean;
    capiEnabled?: boolean;
    capiResult?: boolean;
  } = {}
) {
  const calls = {
    pixelTrack: 0 as number,
    capiSend: 0 as number,
    lastEvent: null as CanonicalEvent | null,
  };
  const provider: ConversionProvider = {
    id,
    enabled: () => ({
      pixel: opts.pixelEnabled ?? true,
      capi: opts.capiEnabled ?? true,
    }),
    productionHostnames: () => ["example.test"],
    loadPixel: () => {},
    pixelTrack: (event) => {
      calls.pixelTrack++;
      calls.lastEvent = event;
    },
    capiSend: async (event) => {
      calls.capiSend++;
      calls.lastEvent = event;
      return opts.capiResult ?? true;
    },
  };
  return { provider, calls };
}

function purchase(eventId = "evt_123"): CanonicalEvent {
  return {
    eventName: "Purchase",
    eventId,
    eventTime: Math.floor(Date.now() / 1000),
    value: 29.99,
    currency: "AUD",
  };
}

async function testFanOutCallsEveryCapiEnabledProvider() {
  const fb = makeFakeProvider("facebook", { capiEnabled: true });
  const tt = makeFakeProvider("tiktok", { capiEnabled: false });
  const sc = makeFakeProvider("snapchat", { capiEnabled: true, capiResult: false });

  const { sendConversionWithProviders } = await import("../dispatch");
  const ctx: RequestContext = { clientIpAddress: "1.1.1.1" };
  const results = await sendConversionWithProviders(purchase(), ctx, [fb.provider, tt.provider, sc.provider]);

  assert.equal(fb.calls.capiSend, 1, "facebook capiSend should run once");
  assert.equal(tt.calls.capiSend, 0, "tiktok capiSend should be skipped (capi disabled)");
  assert.equal(sc.calls.capiSend, 1, "snapchat capiSend should run once even though it returns false");
  assert.deepEqual(results, { facebook: true, tiktok: false, snapchat: false });
}

async function testMissingEventIdRefusesAllProviders() {
  const fb = makeFakeProvider("facebook");
  const { sendConversionWithProviders } = await import("../dispatch");
  const bad: CanonicalEvent = { ...purchase(), eventId: "" };

  // assertValidEvent throws in dev; this test asserts the dispatcher catches that path.
  // Force prod NODE_ENV for this test so we observe the "skip + log" branch.
  const savedNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const results = await sendConversionWithProviders(bad, {}, [fb.provider]);

  process.env.NODE_ENV = savedNodeEnv;
  assert.equal(fb.calls.capiSend, 0, "no provider should be invoked when eventId is missing");
  assert.equal(results.facebook, false);
}

async function testDisabledProviderSkipsNetworkCall() {
  /** Critical: this is the missing-credentials contract from spec §3 invariant #4. */
  const tt = makeFakeProvider("tiktok", { capiEnabled: false });
  const { sendConversionWithProviders } = await import("../dispatch");
  const results = await sendConversionWithProviders(purchase(), {}, [tt.provider]);
  assert.equal(tt.calls.capiSend, 0, "disabled CAPI provider MUST not run");
  assert.equal(results.tiktok, false);
}

async function run() {
  await testFanOutCallsEveryCapiEnabledProvider();
  await testMissingEventIdRefusesAllProviders();
  await testDisabledProviderSkipsNetworkCall();
  console.log("tracking dispatch tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add the `test:tracking-dispatch` script to package.json**

Find the existing `test:facebook-capi` line in [`package.json`](../../../package.json) (around line 67) and add a new line directly below it:

```json
"test:tracking-dispatch": "tsx src/lib/tracking/__tests__/dispatch.test.ts",
```

- [ ] **Step 3: Run the test — expect failure**

Run: `npm run test:tracking-dispatch`
Expected: FAIL with "Cannot find module '../dispatch'" or similar — the dispatcher doesn't exist yet.

- [ ] **Step 4: Implement the dispatcher**

Create: `src/lib/tracking/dispatch.ts`

```ts
// src/lib/tracking/dispatch.ts
import type { CanonicalEvent, ConversionProvider, ProviderId, RequestContext } from "./types";
import { getAllProviders } from "./registry";
import { assertValidEvent } from "./canonical-event";

export type DispatchResults = Record<ProviderId, boolean>;

/**
 * Fan out a CanonicalEvent to every provider's CAPI side that is enabled.
 * Never throws. Returns a per-provider success map.
 *
 * Hard contract (spec §3):
 * - eventId must be non-empty (validated here, not in providers)
 * - disabled providers skip the network call entirely (no fetch, no warn-spam)
 * - one provider failing does NOT stop others
 */
export async function sendConversion(
  event: CanonicalEvent,
  ctx: RequestContext,
): Promise<DispatchResults> {
  return sendConversionWithProviders(event, ctx, getAllProviders());
}

/** Internal — exported for tests so we can inject fakes without touching the registry. */
export async function sendConversionWithProviders(
  event: CanonicalEvent,
  ctx: RequestContext,
  providers: readonly ConversionProvider[],
): Promise<DispatchResults> {
  const results: DispatchResults = { facebook: false, tiktok: false, snapchat: false };

  if (!assertValidEvent(event)) {
    return results;
  }

  await Promise.all(
    providers.map(async (provider) => {
      const en = provider.enabled();
      if (!en.capi) {
        results[provider.id] = false;
        return;
      }
      try {
        results[provider.id] = await provider.capiSend(event, ctx);
      } catch (err) {
        console.error("[tracking] capiSend threw — provider must not throw", {
          provider: provider.id,
          event_name: event.eventName,
          event_id: event.eventId,
          err: err instanceof Error ? err.message : String(err),
        });
        results[provider.id] = false;
      }
    }),
  );

  return results;
}
```

- [ ] **Step 5: Re-run the test**

Run: `npm run test:tracking-dispatch`
Expected: PASS with output `tracking dispatch tests passed`.

- [ ] **Step 6: Run type check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 7: Suggested commit**

```bash
git add src/lib/tracking/dispatch.ts src/lib/tracking/__tests__/dispatch.test.ts package.json
git commit -m "feat(tracking): server dispatcher + test scaffolding"
```

---

## Task 5: Client dispatcher

**Files:**
- Create: `src/lib/tracking/dispatch-client.ts`

The client dispatcher is simpler — synchronous, fire-and-forget, with the production-hostname gate enforced before any provider's `pixelTrack` runs.

- [ ] **Step 1: Write the file**

```ts
// src/lib/tracking/dispatch-client.ts
import type { CanonicalEvent, ConversionProvider } from "./types";
import { getAllProviders } from "./registry";
import { assertValidEvent } from "./canonical-event";

/**
 * Fire a CanonicalEvent into every provider's browser pixel.
 * Synchronous fire-and-forget. Per-provider production-hostname gate is enforced inside
 * each provider's pixelTrack, but we also short-circuit here for non-browser execution.
 */
export function trackConversion(event: CanonicalEvent): void {
  trackConversionWithProviders(event, getAllProviders());
}

/** Internal — exported for tests. */
export function trackConversionWithProviders(
  event: CanonicalEvent,
  providers: readonly ConversionProvider[],
): void {
  if (typeof window === "undefined") return;
  if (!assertValidEvent(event)) return;

  for (const provider of providers) {
    const en = provider.enabled();
    if (!en.pixel) continue;
    const allowed = provider.productionHostnames();
    if (allowed.length > 0 && !allowed.includes(window.location.hostname)) {
      // Production-hostname gate — refuse on non-prod hosts (spec §3 invariant #2).
      continue;
    }
    try {
      provider.pixelTrack(event);
    } catch (err) {
      console.error("[tracking] pixelTrack threw — provider must not throw", {
        provider: provider.id,
        event_name: event.eventName,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
```

- [ ] **Step 2: Add a client-side test case to the dispatch test file**

Append to `src/lib/tracking/__tests__/dispatch.test.ts` BEFORE the `run()` function:

```ts
function withFakeWindow(hostname: string, fn: () => void) {
  const prevWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { location: { hostname } };
  try {
    fn();
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  }
}

async function testClientDispatchHostnameGate() {
  const fb = makeFakeProvider("facebook");
  const { trackConversionWithProviders } = await import("../dispatch-client");

  withFakeWindow("staging.example.com", () => {
    trackConversionWithProviders(purchase(), [fb.provider]);
  });
  assert.equal(fb.calls.pixelTrack, 0, "non-prod hostname must skip pixel");

  withFakeWindow("example.test", () => {
    trackConversionWithProviders(purchase(), [fb.provider]);
  });
  assert.equal(fb.calls.pixelTrack, 1, "prod hostname must fire pixel");
}

async function testClientDispatchSkipsDisabledPixel() {
  const tt = makeFakeProvider("tiktok", { pixelEnabled: false });
  const { trackConversionWithProviders } = await import("../dispatch-client");
  withFakeWindow("example.test", () => {
    trackConversionWithProviders(purchase(), [tt.provider]);
  });
  assert.equal(tt.calls.pixelTrack, 0, "pixel-disabled provider MUST not fire");
}
```

Then update the `run()` block to include the new tests:

```ts
async function run() {
  await testFanOutCallsEveryCapiEnabledProvider();
  await testMissingEventIdRefusesAllProviders();
  await testDisabledProviderSkipsNetworkCall();
  await testClientDispatchHostnameGate();
  await testClientDispatchSkipsDisabledPixel();
  console.log("tracking dispatch tests passed");
}
```

- [ ] **Step 3: Run the tests**

Run: `npm run test:tracking-dispatch`
Expected: PASS

- [ ] **Step 4: Suggested commit**

```bash
git add src/lib/tracking/dispatch-client.ts src/lib/tracking/__tests__/dispatch.test.ts
git commit -m "feat(tracking): client dispatcher with prod-hostname gate"
```

---

## Task 6: Facebook provider

**Files:**
- Modify: `src/lib/tracking/providers/index.ts` (replace placeholder)
- Create: `src/lib/tracking/providers/facebook.ts`

This wraps the existing [`src/lib/facebook.ts`](../../../src/lib/facebook.ts) and the inline `fbq` calls from [`src/components/FacebookPixel.tsx`](../../../src/components/FacebookPixel.tsx). Behavior is unchanged from today — we're only re-fronting it.

- [ ] **Step 1: Create the Facebook provider**

Create: `src/lib/tracking/providers/facebook.ts`

```ts
// src/lib/tracking/providers/facebook.ts
"use client";
// ^ "use client" is OK here — the module is consumed by both server and browser code;
// loadPixel/pixelTrack are no-ops on the server because they check `typeof window`.

import type { CanonicalEvent, ConversionProvider, RequestContext } from "../types";
import { hashPII } from "../canonical-event";
import {
  sendFacebookEvent,
  type FacebookEvent,
} from "@/lib/facebook";

const PRODUCTION_HOSTNAMES = ["toolsaustralia.com.au", "www.toolsaustralia.com.au"];

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbPixelInit?: boolean;
  }
}

function envEnabled(): { pixel: boolean; capi: boolean } {
  const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  return {
    pixel: !!pixelId,
    capi: !!pixelId && !!accessToken,
  };
}

function loadPixel(opts: { nonce?: string }): void {
  if (typeof window === "undefined") return;
  if (window._fbPixelInit) return;
  const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
  if (!pixelId) return;
  if (!PRODUCTION_HOSTNAMES.includes(window.location.hostname)) return;

  const script = document.createElement("script");
  script.id = "facebook-pixel-script";
  script.async = true;
  if (opts.nonce) script.setAttribute("nonce", opts.nonce);
  // Same inline init as the legacy FacebookPixel.tsx component. Kept verbatim
  // so behavior is unchanged after the facade swap.
  script.innerHTML = `
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', '${pixelId}');
    window.fbq('track', 'PageView');
    window._fbPixelInit = true;
  `;
  document.head.appendChild(script);
}

function pixelTrack(event: CanonicalEvent): void {
  if (typeof window === "undefined" || !window.fbq) return;
  if (!PRODUCTION_HOSTNAMES.includes(window.location.hostname)) return;

  const customData: Record<string, unknown> = {};
  if (event.value !== undefined) customData.value = event.value;
  if (event.currency) customData.currency = event.currency;
  if (event.customData?.orderId) customData.order_id = event.customData.orderId;
  if (event.customData?.contentIds) customData.content_ids = event.customData.contentIds;
  if (event.customData?.contentType) customData.content_type = event.customData.contentType;
  if (event.customData?.contentName) customData.content_name = event.customData.contentName;
  if (event.customData?.contentCategory) customData.content_category = event.customData.contentCategory;
  if (event.customData?.numItems !== undefined) customData.num_items = event.customData.numItems;
  if (event.customData?.searchString) customData.search_string = event.customData.searchString;
  if (event.providerData?.facebook) Object.assign(customData, event.providerData.facebook);

  // Meta 4-arg form: { eventID } in last param enables Pixel↔CAPI dedup.
  window.fbq("track", event.eventName, customData, { eventID: event.eventId });
}

async function capiSend(event: CanonicalEvent, ctx: RequestContext): Promise<boolean> {
  if (!envEnabled().capi) return false;

  const u = event.userData ?? {};
  const userData: FacebookEvent["user_data"] = {
    ...(u.email && { em: hashPII(u.email) }),
    ...(u.phone && { ph: hashPII(u.phone.replace(/\D/g, "")) }),
    ...(u.firstName && { fn: hashPII(u.firstName) }),
    ...(u.lastName && { ln: hashPII(u.lastName) }),
    ...(u.city && { ct: hashPII(u.city) }),
    ...(u.state && { st: hashPII(u.state) }),
    ...(u.zipCode && { zp: hashPII(u.zipCode) }),
    ...(u.country && { country: hashPII(u.country.toUpperCase().slice(0, 2).toLowerCase()) }),
    ...(u.externalId && { external_id: hashPII(u.externalId) }),
    ...(u.fbc && { fbc: u.fbc }),
    ...(u.fbp && { fbp: u.fbp }),
    ...((u.clientIpAddress ?? ctx.clientIpAddress) && {
      client_ip_address: u.clientIpAddress ?? ctx.clientIpAddress,
    }),
    ...((u.clientUserAgent ?? ctx.clientUserAgent) && {
      client_user_agent: u.clientUserAgent ?? ctx.clientUserAgent,
    }),
  };

  const fbEvent: FacebookEvent = {
    event_name: event.eventName,
    event_time: event.eventTime,
    event_id: event.eventId,
    action_source: "website",
    user_data: userData,
    custom_data: {
      ...(event.value !== undefined && { value: event.value }),
      ...(event.currency && { currency: event.currency }),
      ...(event.customData?.orderId && { order_id: event.customData.orderId }),
      ...(event.customData?.contentIds && { content_ids: event.customData.contentIds }),
      ...(event.customData?.contentType && { content_type: event.customData.contentType }),
      ...(event.customData?.contentName && { content_name: event.customData.contentName }),
      ...(event.customData?.contentCategory && { content_category: event.customData.contentCategory }),
      ...(event.customData?.numItems !== undefined && { num_items: event.customData.numItems }),
      ...(event.customData?.packageType && { package_type: event.customData.packageType }),
      ...(event.customData?.searchString && { search_string: event.customData.searchString }),
      ...(event.providerData?.facebook ?? {}),
    },
    event_source_url: event.eventSourceUrl ?? ctx.eventSourceUrl,
  };

  return sendFacebookEvent(fbEvent);
}

export const facebookProvider: ConversionProvider = {
  id: "facebook",
  enabled: envEnabled,
  productionHostnames: () => PRODUCTION_HOSTNAMES,
  loadPixel,
  pixelTrack,
  capiSend,
};
```

- [ ] **Step 2: Update the providers index to export the real Facebook provider**

Modify: `src/lib/tracking/providers/index.ts`

Replace its contents with:

```ts
// src/lib/tracking/providers/index.ts
import type { ConversionProvider } from "../types";

const placeholder = (id: ConversionProvider["id"]): ConversionProvider => ({
  id,
  enabled: () => ({ pixel: false, capi: false }),
  productionHostnames: () => [],
  loadPixel: () => {},
  pixelTrack: () => {},
  capiSend: async () => false,
});

export { facebookProvider } from "./facebook";
export const tiktokProvider: ConversionProvider = placeholder("tiktok");
export const snapchatProvider: ConversionProvider = placeholder("snapchat");
```

- [ ] **Step 3: Add a Facebook-provider regression test**

Spec §10 requires a translation test proving `facebookProvider.capiSend(canonicalEvent, ctx)` produces the same Meta-bound payload as calling `sendFacebookEvent` directly. Append to `src/lib/__tests__/facebook.test.ts`, just before the `async function run()` block:

```ts
async function testFacebookProviderCanonicalTranslation() {
  const saved = snapshotEnv();
  process.env.VERCEL_ENV = "production";
  process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = "123456789";
  delete process.env.FACEBOOK_USE_TEST_EVENTS;
  delete process.env.FACEBOOK_TEST_EVENT_CODE;

  let capturedBody: { data: unknown[]; access_token: string } | null = null;
  const prevFetch = global.fetch;
  global.fetch = async function _captureFetch(_url, init) {
    capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  } as typeof fetch;

  const { facebookProvider } = await import("../tracking/providers/facebook");
  const ok = await facebookProvider.capiSend(
    {
      eventName: "Purchase",
      eventId: "evt-translate-1",
      eventTime: 1700000000,
      value: 49.99,
      currency: "AUD",
      userData: { email: "buyer@example.com", country: "AU" },
      customData: { orderId: "order-123", contentType: "product" },
      eventSourceUrl: "https://toolsaustralia.com.au/purchase-success",
    },
    {},
  );

  assert.equal(ok, true, "capiSend should succeed when env is production-configured");
  assert.ok(capturedBody, "fetch must have been called once with a JSON body");
  const event = (capturedBody!.data[0] ?? {}) as {
    event_name?: string;
    event_id?: string;
    custom_data?: { value?: number; currency?: string; order_id?: string };
    user_data?: { em?: string; country?: string };
  };
  assert.equal(event.event_name, "Purchase");
  assert.equal(event.event_id, "evt-translate-1");
  assert.equal(event.custom_data?.value, 49.99);
  assert.equal(event.custom_data?.currency, "AUD");
  assert.equal(event.custom_data?.order_id, "order-123");
  assert.ok(event.user_data?.em && event.user_data.em.length === 64, "email should be sha256-hashed (64 hex chars)");
  assert.ok(event.user_data?.country && event.user_data.country.length === 64, "country should be sha256-hashed");

  global.fetch = prevFetch;
  restoreEnv(saved);
}
```

Then add `await testFacebookProviderCanonicalTranslation();` to the `run()` function:

```ts
async function run() {
  await testRefusesPurchaseWithoutEventId();
  await testRefusesNonProdWithoutTestEventCode();
  await testFacebookProviderCanonicalTranslation();
  console.log("facebook CAPI guard tests passed");
}
```

- [ ] **Step 4: Run all tests**

Run: `npm run type-check && npm run test:tracking-dispatch && npm run test:facebook-capi`
Expected: All PASS. `test:facebook-capi` now includes the new translation test.

- [ ] **Step 5: Suggested commit**

```bash
git add src/lib/tracking/providers/facebook.ts src/lib/tracking/providers/index.ts src/lib/__tests__/facebook.test.ts
git commit -m "feat(tracking): facebook provider + canonical-event translation test"
```

---

## Task 7: TikTok provider stub

**Files:**
- Create: `src/lib/tracking/providers/tiktok.ts`
- Modify: `src/lib/tracking/providers/index.ts`

Stub semantics: pixel loads + fires if env is set; CAPI always returns `false` (real implementation is a follow-up spec). Crucially, **if `NEXT_PUBLIC_TIKTOK_PIXEL_ID` is missing**, `loadPixel` is a no-op and `pixelTrack` is a no-op — no script tag injection, no `window.ttq` reference. This is the spec §8a runtime-safety contract.

- [ ] **Step 1: Create the TikTok provider**

Create: `src/lib/tracking/providers/tiktok.ts`

```ts
// src/lib/tracking/providers/tiktok.ts
"use client";

import type { CanonicalEvent, ConversionProvider } from "../types";

const PRODUCTION_HOSTNAMES = ["toolsaustralia.com.au", "www.toolsaustralia.com.au"];

interface TikTokGlobal {
  load: (pixelId: string) => void;
  page: () => void;
  track: (eventName: string, parameters?: Record<string, unknown>, options?: { event_id?: string }) => void;
  grantConsent: () => void;
}

declare global {
  interface Window {
    ttq?: TikTokGlobal;
    _ttqInit?: boolean;
  }
}

function envEnabled(): { pixel: boolean; capi: boolean } {
  return {
    pixel: !!process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
    capi: !!process.env.TIKTOK_ACCESS_TOKEN,
  };
}

function loadPixel(_opts: { nonce?: string }): void {
  if (typeof window === "undefined") return;
  if (window._ttqInit) return;
  const pixelId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
  if (!pixelId) return; // No-op when not configured. No script tag, no console noise.
  if (!PRODUCTION_HOSTNAMES.includes(window.location.hostname)) return;

  // Inline init copied verbatim from legacy TikTokPixel.tsx so behavior is unchanged.
  const script = document.createElement("script");
  script.innerHTML = `
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(
      var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script")
      ;n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
      ttq.load('${pixelId}');
      ttq.page();
    }(window, document, 'ttq');
  `;
  document.head.appendChild(script);
  window._ttqInit = true;
}

function pixelTrack(event: CanonicalEvent): void {
  if (typeof window === "undefined" || !window.ttq) return;
  if (!PRODUCTION_HOSTNAMES.includes(window.location.hostname)) return;
  if (!process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID) return;

  const params: Record<string, unknown> = {};
  if (event.value !== undefined) params.value = event.value;
  if (event.currency) params.currency = event.currency;
  if (event.customData?.contentIds) params.content_id = event.customData.contentIds[0];
  if (event.customData?.contentType) params.content_type = event.customData.contentType;
  if (event.customData?.contentName) params.content_name = event.customData.contentName;
  if (event.customData?.numItems !== undefined) params.quantity = event.customData.numItems;
  if (event.customData?.orderId) params.order_id = event.customData.orderId;
  if (event.providerData?.tiktok) Object.assign(params, event.providerData.tiktok);

  // TikTok dedup: 3rd arg `{ event_id }` matches Events API event_id (spec §3 invariant #1).
  window.ttq.track(event.eventName, params, { event_id: event.eventId });
}

async function capiSend(_event: CanonicalEvent): Promise<boolean> {
  // STUB. Real TikTok Events API integration lands in follow-up spec.
  // Returning false here is the documented behavior — callers expect a boolean result map,
  // and false on a stub is indistinguishable from "credentials missing", which is the right
  // semantics for code consumers downstream.
  return false;
}

export const tiktokProvider: ConversionProvider = {
  id: "tiktok",
  enabled: envEnabled,
  productionHostnames: () => PRODUCTION_HOSTNAMES,
  loadPixel,
  pixelTrack,
  capiSend,
};
```

- [ ] **Step 2: Update the providers index**

Modify: `src/lib/tracking/providers/index.ts`

```ts
// src/lib/tracking/providers/index.ts
import type { ConversionProvider } from "../types";

const placeholder = (id: ConversionProvider["id"]): ConversionProvider => ({
  id,
  enabled: () => ({ pixel: false, capi: false }),
  productionHostnames: () => [],
  loadPixel: () => {},
  pixelTrack: () => {},
  capiSend: async () => false,
});

export { facebookProvider } from "./facebook";
export { tiktokProvider } from "./tiktok";
export const snapchatProvider: ConversionProvider = placeholder("snapchat");
```

- [ ] **Step 3: Run type check + tests**

Run: `npm run type-check && npm run test:tracking-dispatch`
Expected: PASS

- [ ] **Step 4: Suggested commit**

```bash
git add src/lib/tracking/providers/tiktok.ts src/lib/tracking/providers/index.ts
git commit -m "feat(tracking): tiktok provider stub (pixel works; CAPI returns false)"
```

---

## Task 8: Snapchat provider stub

**Files:**
- Create: `src/lib/tracking/providers/snapchat.ts`
- Modify: `src/lib/tracking/providers/index.ts`

Same pattern as TikTok: pixel works on prod hostnames if env is set; CAPI returns `false`; missing env is a clean no-op.

- [ ] **Step 1: Create the Snapchat provider**

Create: `src/lib/tracking/providers/snapchat.ts`

```ts
// src/lib/tracking/providers/snapchat.ts
"use client";

import type { CanonicalEvent, ConversionProvider } from "../types";
import { hashPII } from "../canonical-event";

const PRODUCTION_HOSTNAMES = ["toolsaustralia.com.au", "www.toolsaustralia.com.au"];

interface SnapchatGlobal {
  (command: string, eventNameOrParams?: string | Record<string, unknown>, params?: Record<string, unknown>): void;
  queue?: unknown[];
}

declare global {
  interface Window {
    snaptr?: SnapchatGlobal;
    _snaptrInit?: boolean;
  }
}

function envEnabled(): { pixel: boolean; capi: boolean } {
  return {
    pixel: !!process.env.NEXT_PUBLIC_SNAPCHAT_PIXEL_ID,
    capi: !!process.env.SNAPCHAT_ACCESS_TOKEN,
  };
}

function loadPixel(_opts: { nonce?: string }): void {
  if (typeof window === "undefined") return;
  if (window._snaptrInit) return;
  const pixelId = process.env.NEXT_PUBLIC_SNAPCHAT_PIXEL_ID;
  if (!pixelId) return;
  if (!PRODUCTION_HOSTNAMES.includes(window.location.hostname)) return;

  // Snapchat's standard inline pixel init (see snap.com/business/snap-pixel docs).
  const script = document.createElement("script");
  script.innerHTML = `
    (function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?
    a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';
    r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];
    u.parentNode.insertBefore(r,u);})(window,document,'https://sc-static.net/scevent.min.js');
    window.snaptr('init', '${pixelId}');
    window.snaptr('track', 'PAGE_VIEW');
  `;
  document.head.appendChild(script);
  window._snaptrInit = true;
}

function pixelTrack(event: CanonicalEvent): void {
  if (typeof window === "undefined" || !window.snaptr) return;
  if (!PRODUCTION_HOSTNAMES.includes(window.location.hostname)) return;
  if (!process.env.NEXT_PUBLIC_SNAPCHAT_PIXEL_ID) return;

  const params: Record<string, unknown> = {};
  if (event.value !== undefined) params.price = event.value;
  if (event.currency) params.currency = event.currency;
  if (event.customData?.contentIds) params.item_ids = event.customData.contentIds;
  if (event.customData?.contentCategory) params.item_category = event.customData.contentCategory;
  if (event.customData?.numItems !== undefined) params.number_items = event.customData.numItems;
  if (event.customData?.orderId) params.transaction_id = event.customData.orderId;
  if (event.userData?.email) params.user_email = hashPII(event.userData.email);
  if (event.providerData?.snapchat) Object.assign(params, event.providerData.snapchat);
  // Snapchat dedup: client_dedup_id matches CAPI's client_dedup_id (spec §3 invariant #1).
  params.client_dedup_id = event.eventId;

  // Snap event names use SCREAMING_SNAKE_CASE: "Purchase" → "PURCHASE", etc.
  const snapEventName = event.eventName.toUpperCase().replace(/([A-Z])/g, (_m, c, i) =>
    i === 0 ? c : `_${c}`,
  ).replace(/^_/, "");
  window.snaptr("track", snapEventName, params);
}

async function capiSend(_event: CanonicalEvent): Promise<boolean> {
  // STUB. Real Snapchat Conversions API integration lands in follow-up spec.
  return false;
}

export const snapchatProvider: ConversionProvider = {
  id: "snapchat",
  enabled: envEnabled,
  productionHostnames: () => PRODUCTION_HOSTNAMES,
  loadPixel,
  pixelTrack,
  capiSend,
};
```

- [ ] **Step 2: Update the providers index**

Modify: `src/lib/tracking/providers/index.ts`

Replace contents with:

```ts
// src/lib/tracking/providers/index.ts
export { facebookProvider } from "./facebook";
export { tiktokProvider } from "./tiktok";
export { snapchatProvider } from "./snapchat";
```

- [ ] **Step 3: Run type check + tests**

Run: `npm run type-check && npm run test:tracking-dispatch && npm run test:facebook-capi`
Expected: PASS

- [ ] **Step 4: Suggested commit**

```bash
git add src/lib/tracking/providers/snapchat.ts src/lib/tracking/providers/index.ts
git commit -m "feat(tracking): snapchat provider stub"
```

---

## Task 9: `<ConversionPixels />` component

**Files:**
- Create: `src/components/tracking/ConversionPixels.tsx`

A client component that calls `loadPixel({ nonce })` on every enabled provider, exactly once.

- [ ] **Step 1: Write the component**

```tsx
// src/components/tracking/ConversionPixels.tsx
"use client";

import { useEffect, useRef } from "react";
import { getAllProviders } from "@/lib/tracking/registry";

interface ConversionPixelsProps {
  /** CSP nonce from middleware (production). Passed to inline pixel scripts. */
  nonce?: string;
  /** Set true in dev/preview to force-disable every pixel even if env is set. */
  disabled?: boolean;
}

/**
 * Mounts every enabled provider's browser pixel. Replaces the legacy <PixelTracker />.
 *
 * Each provider's `loadPixel` is responsible for:
 * - Idempotency (won't re-inject if already loaded)
 * - Production-hostname gating (won't load on staging/dev)
 * - Missing-credentials safety (no-op if `enabled().pixel` is false)
 *
 * So this component is intentionally dumb: just call loadPixel on every provider, once.
 */
export default function ConversionPixels({ nonce, disabled = false }: ConversionPixelsProps) {
  const ranRef = useRef(false);

  useEffect(() => {
    if (disabled || ranRef.current) return;
    ranRef.current = true;
    for (const provider of getAllProviders()) {
      if (!provider.enabled().pixel) continue;
      provider.loadPixel({ nonce });
    }
  }, [nonce, disabled]);

  return null;
}
```

- [ ] **Step 2: Run type check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 3: Suggested commit**

```bash
git add src/components/tracking/ConversionPixels.tsx
git commit -m "feat(tracking): <ConversionPixels /> entry point"
```

---

## Task 10: Swap `PixelTracker` → `ConversionPixels` in layout

**Files:**
- Modify: `src/app/layout.tsx:6` (import line)
- Modify: `src/app/layout.tsx:137-142` (usage)
- Modify: `src/components/PixelTracker.tsx` (re-export shim — keeps deep imports working)

- [ ] **Step 1: Update the layout import**

In `src/app/layout.tsx`, change line 6 from:

```ts
import PixelTracker from "@/components/PixelTracker";
```

to:

```ts
import ConversionPixels from "@/components/tracking/ConversionPixels";
```

- [ ] **Step 2: Update the layout usage**

In `src/app/layout.tsx`, change lines 137–142 from:

```tsx
<PixelTracker
  facebookPixelId={process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID}
  tiktokPixelId={process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID}
  disabled={process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_ENABLE_PIXEL_TESTING}
  nonce={nonce}
/>
```

to:

```tsx
<ConversionPixels
  disabled={process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_ENABLE_PIXEL_TESTING}
  nonce={nonce}
/>
```

The env-var reads moved inside each provider's `enabled()`, so the parent no longer needs to know any pixel ids.

- [ ] **Step 3: Make PixelTracker.tsx a backwards-compat re-export**

Replace the entire contents of `src/components/PixelTracker.tsx` with:

```tsx
"use client";

/**
 * @deprecated Use `<ConversionPixels />` from `@/components/tracking/ConversionPixels`.
 * This file re-exports the new component to keep any deep imports working.
 */
import ConversionPixels from "./tracking/ConversionPixels";
export default ConversionPixels;

// Legacy consent helpers — auto-accept mode is unchanged; just no-op wrappers.
export const grantPixelConsent = () => {};
export const revokePixelConsent = () => {};
export const hasPixelConsent = (): boolean => true;
```

- [ ] **Step 4: Run build + type-check to confirm no broken imports**

Run: `npm run type-check`
Expected: PASS

Run: `npm run lint`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 5: Manually verify in dev**

Run: `npm run dev`

Visit `http://localhost:3000` in a browser. Open DevTools → Network. Confirm:
- If `NODE_ENV=development` without `NEXT_PUBLIC_ENABLE_PIXEL_TESTING`: **no** requests to `connect.facebook.net`, `analytics.tiktok.com`, or `sc-static.net`. Page loads normally.
- DevTools console: no errors mentioning pixels.

If you have a staging/preview deploy with the prod hostname mocked, also verify:
- With `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` set + on `toolsaustralia.com.au`: `fbevents.js` request appears.
- With `NEXT_PUBLIC_TIKTOK_PIXEL_ID` UNSET: no request to `analytics.tiktok.com`. No `window.ttq` reference in console.

- [ ] **Step 6: Suggested commit**

```bash
git add src/app/layout.tsx src/components/PixelTracker.tsx
git commit -m "feat(tracking): swap layout PixelTracker for ConversionPixels"
```

---

## Task 11: `/api/tracking/conversion` POST route

**Files:**
- Create: `src/app/api/tracking/conversion/route.ts`

Provider-agnostic endpoint accepting a `CanonicalEvent` body and returning the per-provider results map.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/tracking/conversion/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendConversion } from "@/lib/tracking/dispatch";
import type { CanonicalEvent, RequestContext } from "@/lib/tracking/types";
import { eventTimeNow } from "@/lib/tracking/canonical-event";

const userDataSchema = z
  .object({
    email: z.string().optional(),
    phone: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().optional(),
    externalId: z.string().optional(),
    birthdate: z.union([z.string(), z.date()]).optional(),
    clientIpAddress: z.string().optional(),
    clientUserAgent: z.string().optional(),
    fbc: z.string().optional(),
    fbp: z.string().optional(),
    ttclid: z.string().optional(),
    scid: z.string().optional(),
  })
  .optional();

const customDataSchema = z
  .object({
    contentIds: z.array(z.string()).optional(),
    contentType: z.string().optional(),
    contentName: z.string().optional(),
    contentCategory: z.string().optional(),
    numItems: z.number().optional(),
    orderId: z.string().optional(),
    packageType: z.string().optional(),
    searchString: z.string().optional(),
  })
  .optional();

const conversionBodySchema = z.object({
  eventName: z.string().min(1),
  eventId: z.string().min(1),
  eventTime: z.number().optional(),
  value: z.number().optional(),
  currency: z.string().optional(),
  userData: userDataSchema,
  customData: customDataSchema,
  eventSourceUrl: z.string().optional(),
  providerData: z
    .object({
      facebook: z.record(z.string(), z.unknown()).optional(),
      tiktok: z.record(z.string(), z.unknown()).optional(),
      snapchat: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

function ipFromHeaders(req: NextRequest): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

export async function POST(request: NextRequest) {
  let parsed: z.infer<typeof conversionBodySchema>;
  try {
    parsed = conversionBodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid event body", issues: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const event: CanonicalEvent = {
    eventName: parsed.eventName,
    eventId: parsed.eventId,
    eventTime: parsed.eventTime ?? eventTimeNow(),
    value: parsed.value,
    currency: parsed.currency,
    userData: parsed.userData,
    customData: parsed.customData,
    eventSourceUrl: parsed.eventSourceUrl,
    providerData: parsed.providerData,
  };

  const ctx: RequestContext = {
    clientIpAddress: parsed.userData?.clientIpAddress ?? ipFromHeaders(request),
    clientUserAgent: parsed.userData?.clientUserAgent ?? request.headers.get("user-agent") ?? undefined,
    eventSourceUrl: parsed.eventSourceUrl ?? request.headers.get("referer") ?? undefined,
  };

  const results = await sendConversion(event, ctx);
  const ok = Object.values(results).some(Boolean);
  return NextResponse.json({ ok, results }, { status: 200 });
}
```

- [ ] **Step 2: Run type check + build**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 3: Manual smoke (dev server)**

Run `npm run dev` and in another terminal:

```bash
curl -i -X POST http://localhost:3000/api/tracking/conversion \
  -H "Content-Type: application/json" \
  -d '{"eventName":"Purchase","eventId":"test-evt-1","value":1.00,"currency":"AUD"}'
```

Expected: HTTP 200, body `{"ok":true|false,"results":{"facebook":...,"tiktok":false,"snapchat":false}}`. The Facebook bool depends on whether your local has `FACEBOOK_ACCESS_TOKEN` set; both TikTok and Snapchat must be `false`.

- [ ] **Step 4: Suggested commit**

```bash
git add src/app/api/tracking/conversion/route.ts
git commit -m "feat(tracking): POST /api/tracking/conversion"
```

---

## Task 12: `/api/facebook/track` becomes a forwarding shim

**Files:**
- Modify: `src/app/api/facebook/track/route.ts`

Replace the existing handler with a translator that converts the legacy FB-shaped body to a `CanonicalEvent` and forwards to `sendConversion`. Existing callers keep working unchanged. Mark deprecated in JSDoc.

- [ ] **Step 1: Rewrite the route**

Replace the entire contents of `src/app/api/facebook/track/route.ts`:

```ts
// src/app/api/facebook/track/route.ts
/**
 * @deprecated Use `POST /api/tracking/conversion` (provider-agnostic).
 * This handler remains as a forwarding shim so existing client calls (e.g. legacy
 * `useFacebookTracking` hooks or direct fetches to /api/facebook/track) keep working.
 * Translates the legacy FB-shaped body into a CanonicalEvent and delegates to sendConversion.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendConversion } from "@/lib/tracking/dispatch";
import type { CanonicalEvent } from "@/lib/tracking/types";
import { eventTimeNow } from "@/lib/tracking/canonical-event";
import { generateEventID } from "@/utils/tracking/facebook-helpers";

const legacyBodySchema = z.object({
  event_name: z.enum([
    "PageView",
    "ViewContent",
    "AddToCart",
    "InitiateCheckout",
    "Purchase",
    "Search",
    "CompleteRegistration",
    "Lead",
    "Subscribe",
  ]),
  event_id: z.string().optional(),
  user_data: z
    .object({
      em: z.string().optional(),
      ph: z.string().optional(),
      fn: z.string().optional(),
      ln: z.string().optional(),
      ct: z.string().optional(),
      st: z.string().optional(),
      zp: z.string().optional(),
      country: z.string().optional(),
      client_ip_address: z.string().optional(),
      client_user_agent: z.string().optional(),
      fbc: z.string().optional(),
      fbp: z.string().optional(),
    })
    .optional(),
  custom_data: z
    .object({
      currency: z.string().optional(),
      value: z.number().optional(),
      content_ids: z.array(z.string()).optional(),
      content_type: z.string().optional(),
      content_name: z.string().optional(),
      content_category: z.string().optional(),
      num_items: z.number().optional(),
      order_id: z.string().optional(),
      search_string: z.string().optional(),
    })
    .optional(),
  event_source_url: z.string().optional(),
  action_source: z
    .enum(["website", "app", "phone_call", "chat", "physical_store", "system_generated", "other"])
    .default("website"),
});

function ipFromHeaders(req: NextRequest): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") ?? undefined;
}

export async function POST(request: NextRequest) {
  let parsed: z.infer<typeof legacyBodySchema>;
  try {
    parsed = legacyBodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: "Invalid request data", errors: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 });
  }

  // Note: legacy body contains pre-hashed user_data (em, ph, etc.). The new provider re-hashes from raw,
  // so we pass these as providerData.facebook to bypass re-hashing.
  const eventId =
    parsed.event_id ?? generateEventID(parsed.event_name.toLowerCase(), parsed.custom_data?.order_id ?? Date.now().toString());

  const event: CanonicalEvent = {
    eventName: parsed.event_name,
    eventId,
    eventTime: eventTimeNow(),
    value: parsed.custom_data?.value,
    currency: parsed.custom_data?.currency,
    eventSourceUrl: parsed.event_source_url ?? request.headers.get("referer") ?? undefined,
    customData: {
      orderId: parsed.custom_data?.order_id,
      contentIds: parsed.custom_data?.content_ids,
      contentType: parsed.custom_data?.content_type,
      contentName: parsed.custom_data?.content_name,
      contentCategory: parsed.custom_data?.content_category,
      numItems: parsed.custom_data?.num_items,
      searchString: parsed.custom_data?.search_string,
    },
    providerData: {
      facebook: {
        // Pre-hashed user_data passthrough — facebookProvider.capiSend merges this into custom_data.
        // It's a workaround until callers migrate to the canonical /api/tracking/conversion endpoint
        // (which expects raw PII for hashing).
        _legacyUserData: parsed.user_data ?? {},
      },
    },
  };

  const ctx = {
    clientIpAddress: parsed.user_data?.client_ip_address ?? ipFromHeaders(request),
    clientUserAgent: parsed.user_data?.client_user_agent ?? request.headers.get("user-agent") ?? undefined,
    eventSourceUrl: event.eventSourceUrl,
  };

  const results = await sendConversion(event, ctx);
  const success = results.facebook;
  return NextResponse.json(
    success
      ? { success: true, message: "Event tracked successfully", event_id: eventId }
      : { success: false, message: "Failed to track event" },
    { status: success ? 200 : 500 },
  );
}

export async function GET() {
  return NextResponse.json({
    message: "Facebook tracking endpoint (deprecated — use /api/tracking/conversion)",
    supported_events: [
      "PageView",
      "ViewContent",
      "AddToCart",
      "InitiateCheckout",
      "Purchase",
      "Search",
      "CompleteRegistration",
      "Lead",
      "Subscribe",
    ],
  });
}
```

- [ ] **Step 2: Run type check + the FB tests**

Run: `npm run type-check && npm run test:facebook-capi`
Expected: PASS

- [ ] **Step 3: Suggested commit**

```bash
git add src/app/api/facebook/track/route.ts
git commit -m "refactor(tracking): /api/facebook/track now forwards to dispatcher"
```

---

## Task 13: Facebook library facade

**Files:**
- Modify: `src/lib/facebook.ts`

This is the wrap-and-migrate step (spec §5). The exported `sendFacebookEvent`, `sendFacebookPurchaseEventDev`, and `buildFacebookPurchaseEventDev` keep their signatures so the dozens of existing call sites (in `pixel-purchase-tracking.ts`, webhook handlers, etc.) keep working. Internally they delegate to `facebookProvider.capiSend` where applicable.

**However** — the simplest and safest version of this task is to leave `src/lib/facebook.ts` exactly as-is for now. The Facebook provider already wraps `sendFacebookEvent`, so going through the provider for legacy callers would just round-trip back to the same function. The spec's wrap-and-migrate guarantee is satisfied by Task 14's pixel-side facade and by leaving the library function as the canonical implementation of "send a CAPI event to Meta."

- [ ] **Step 1: Add a deprecation JSDoc to the top of `src/lib/facebook.ts`**

Find the existing top-of-file comment block (around lines 1–4) and replace it with:

```ts
import crypto from "crypto";
import { getPixelEnv, isProductionPixelEnv } from "./facebook-env";

/**
 * Facebook Pixel + Conversions API integration.
 *
 * NOTE: This file is the canonical implementation of Meta CAPI sending — the new
 * provider registry at `src/lib/tracking/providers/facebook.ts` wraps `sendFacebookEvent`
 * rather than reimplementing it. Direct callers of `sendFacebookEvent` continue to work,
 * but new code SHOULD build a `CanonicalEvent` and call `sendConversion(...)` instead.
 */
```

(Keep the rest of the file unchanged. Do **not** delete `buildFacebookPurchaseEventDev` or `sendFacebookPurchaseEventDev` — they are used by `trackPixelPurchase`.)

- [ ] **Step 2: Run the FB tests**

Run: `npm run test:facebook-capi`
Expected: PASS

- [ ] **Step 3: Suggested commit**

```bash
git add src/lib/facebook.ts
git commit -m "docs(tracking): mark src/lib/facebook.ts as wrapped by provider registry"
```

---

## Task 14: FacebookPixel.tsx & TikTokPixel.tsx facade swap

**Files:**
- Modify: `src/components/FacebookPixel.tsx`
- Modify: `src/components/TikTokPixel.tsx`

`<FacebookPixel>` and `<TikTokPixel>` components are no longer rendered (the swap in Task 10 took care of that). But their **exported helper functions** (`trackPurchaseWithEventId`, `trackFacebookEvent`, `trackTikTokEvent`, etc.) are still imported from many call sites. We re-front those helpers to go through `trackConversion`.

- [ ] **Step 1: Rewrite `trackPurchaseWithEventId` in `src/components/FacebookPixel.tsx`**

Add this import near the top of the file (after the existing imports):

```ts
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";
```

Find the `trackPurchaseWithEventId` function (around line 474) and replace it with:

```ts
/**
 * Track Purchase event with eventID for browser↔CAPI deduplication.
 *
 * After the provider-registry refactor, this fans out to every enabled pixel
 * (FB + TikTok + Snap) via the dispatcher. Each provider maps eventId to its
 * own dedup field name (FB: eventID, TikTok: event_id, Snap: client_dedup_id).
 *
 * @param value - Purchase value in dollars (not cents)
 * @param currency - Currency code (e.g. "AUD")
 * @param eventId - Unique event ID; MUST match server-side CAPI event_id for dedup
 * @param orderId - Optional order_id for custom_data
 */
export const trackPurchaseWithEventId = (
  value: number,
  currency: string,
  eventId: string,
  orderId?: string,
) => {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(value) || value <= 0) return;
  if (!eventId || !eventId.trim()) return;

  trackConversion(
    buildPurchaseEvent({
      value,
      currency: currency || "AUD",
      eventId,
      customData: { orderId, contentType: "product" },
      eventSourceUrl: window.location.href,
    }),
  );
};
```

Leave the other helpers (`trackPurchase`, `trackAddToCart`, `trackViewContent`, etc.) untouched — they're FB-pixel-only and the legacy `fbq` path they use still works through `window.fbq`, which the new Facebook provider's `loadPixel` still injects.

- [ ] **Step 2: Rewrite `trackTikTokEvent` in `src/components/TikTokPixel.tsx`**

Add these imports near the top of the file:

```ts
import { tiktokProvider } from "@/lib/tracking/providers/tiktok";
import { eventTimeNow } from "@/lib/tracking/canonical-event";
```

Find the `trackTikTokEvent` function (around line 68) and replace it with:

```ts
/**
 * Track a TikTok-only event by name + params.
 *
 * Legacy callers (subscription helpers in pixel-purchase-tracking.ts, etc.) don't
 * have a canonical eventId, so we synthesize one. This means dedup with TikTok
 * Events API won't be effective — but legacy callers also didn't have CAPI fan-out,
 * so this matches today's behavior. NEW code should use `trackConversion(...)`
 * with a real eventId for proper Pixel↔CAPI dedup across all providers.
 *
 * Goes through `tiktokProvider.pixelTrack` so the production-hostname gate
 * AND missing-credentials check (spec §3 invariants #2 and #4) are enforced.
 */
export const trackTikTokEvent = (eventName: string, parameters?: Record<string, unknown>) => {
  if (typeof window === "undefined") return;
  const en = tiktokProvider.enabled();
  if (!en.pixel) return;
  const allowed = tiktokProvider.productionHostnames();
  if (!allowed.includes(window.location.hostname)) return;
  try {
    tiktokProvider.pixelTrack({
      eventName,
      eventId: `legacy-${eventName}-${Date.now()}`,
      eventTime: eventTimeNow(),
      providerData: { tiktok: parameters },
    });
  } catch {
    // Silently fail — TikTok is not critical-path.
  }
};
```

- [ ] **Step 3: Run type check + tests**

Run: `npm run type-check && npm run test:tracking-dispatch && npm run test:facebook-capi`
Expected: PASS

- [ ] **Step 4: Suggested commit**

```bash
git add src/components/FacebookPixel.tsx src/components/TikTokPixel.tsx
git commit -m "refactor(tracking): pixel helpers delegate to trackConversion"
```

---

## Task 15: `pixel-purchase-tracking.ts` simplification + stale-comment fix

**Files:**
- Modify: `src/utils/tracking/pixel-purchase-tracking.ts`

`trackPixelPurchase` currently builds a Facebook-shaped event manually, calls `sendFacebookEvent` directly, and has an inline TikTok block. We simplify: build a `CanonicalEvent`, call `sendConversion`. The Klaviyo block stays untouched (Klaviyo is marketing automation, not a CAPI provider).

- [ ] **Step 1: Replace the file header comment**

Find lines 1–9 of `src/utils/tracking/pixel-purchase-tracking.ts` (the stale "Browser pixel removed" block) and replace with:

```ts
/**
 * Pixel Purchase Tracking Utilities
 *
 * Provider-agnostic Purchase / Subscribe / Unsubscribe / Renewal tracking.
 *
 * Each function builds a CanonicalEvent once and dispatches via:
 * - `sendConversion(...)`     — server side (CAPI fan-out to FB + TikTok + Snap)
 * - browser-side Purchase pixel fires from the success-page clients themselves
 *   (see PurchaseSuccessClient etc.) — this file is server-side only for purchases.
 *
 * Klaviyo events stay as a direct call (Klaviyo is marketing automation, not a CAPI provider).
 */
```

- [ ] **Step 2: Rewrite `trackPixelPurchase` to use the dispatcher**

Find the existing `trackPixelPurchase` function (lines 92–449) and replace it with:

```ts
import { sendConversion } from "@/lib/tracking/dispatch";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";

// ... (keep existing imports above this — but REMOVE these now-unused imports:
//   - `trackTikTokEvent` from "@/components/TikTokPixel"
//   - `buildFacebookPurchaseEventDev` and `sendFacebookPurchaseEventDev` from "@/lib/facebook"
//   keep `getFacebookTestEventCode`, `prepareUserData`, etc. — they're still used elsewhere)

/**
 * Track purchase via the provider dispatcher. Fans out to every enabled CAPI
 * (Facebook today; TikTok and Snapchat once their tokens land).
 *
 * Browser-side Purchase pixel fire happens from the success-page client component
 * itself — not from here — so the eventId can match exactly.
 *
 * @returns true if any provider's CAPI accepted the event
 */
export async function trackPixelPurchase(params: PixelPurchaseParams): Promise<boolean> {
  try {
    const {
      value,
      currency,
      orderId,
      packageType,
      packageId,
      packageName,
      userId,
      userEmail,
      userPhone,
      userFirstName,
      userLastName,
      userState,
      userCountry,
      userBirthdate,
      content_type,
      content_ids,
      num_items,
      eventSourceUrl,
      fbc: providedFbc,
      fbp: providedFbp,
      requestContext,
      clientIpAddress,
      clientUserAgent,
      experimentId,
      variantId,
      anonymousId,
      isResubscribe,
      paymentIntentId,
      subscriptionId,
      entriesAdded,
      pointsEarned,
    } = params;

    if (!orderId?.trim()) {
      console.error("Conversion Purchase skipped: missing orderId (eventId)");
      return false;
    }

    const eventId = orderId.trim();

    const event = buildPurchaseEvent({
      value,
      currency,
      eventId,
      userData: {
        email: userEmail,
        phone: userPhone,
        firstName: userFirstName,
        lastName: userLastName,
        state: userState,
        country: userCountry ?? "AU",
        externalId: userId,
        birthdate: userBirthdate,
        clientIpAddress: requestContext?.client_ip_address ?? clientIpAddress,
        clientUserAgent: requestContext?.client_user_agent ?? clientUserAgent,
        fbc: requestContext?.fbc ?? providedFbc,
        fbp: requestContext?.fbp ?? providedFbp,
      },
      customData: {
        orderId,
        contentType: content_type ?? "product",
        contentIds: content_ids ?? (packageId ? [packageId] : undefined),
        ...(isResubscribe && { contentCategory: "resubscribe" }),
        numItems: num_items ?? 1,
        packageType,
      },
      eventSourceUrl:
        requestContext?.event_source_url ??
        eventSourceUrl ??
        getServerEventSourceUrlFallback(),
    });

    const results = await sendConversion(event, {
      clientIpAddress: event.userData?.clientIpAddress,
      clientUserAgent: event.userData?.clientUserAgent,
      eventSourceUrl: event.eventSourceUrl,
    });

    // A/B experiment tracking (preserved verbatim from the legacy implementation).
    if (experimentId && variantId) {
      try {
        const { default: ExperimentEventRepository } = await import("@/repositories/ab-testing/ExperimentEventRepository");
        const { default: connectDB } = await import("@/lib/mongodb");
        await connectDB();
        await ExperimentEventRepository.createEvent({
          experimentId,
          variantId,
          eventType: "purchase",
          userId: userId || undefined,
          anonymousId: anonymousId || undefined,
          metadata: { orderId, value, currency, packageType, packageId, packageName },
        });
        await ExperimentEventRepository.createEvent({
          experimentId,
          variantId,
          eventType: "conversion",
          userId: userId || undefined,
          anonymousId: anonymousId || undefined,
          metadata: { orderId, value, currency, packageType, source: "purchase" },
        });
      } catch (err) {
        console.error("A/B experiment tracking failed (non-fatal):", err);
      }
    }

    // Klaviyo (marketing automation, NOT a CAPI provider — stays as a direct call).
    if (typeof window !== "undefined") {
      try {
        const { trackKlaviyoEvent } = await import("@/utils/tracking/klaviyo-helpers");
        trackKlaviyoEvent("Placed Order", {
          value,
          currency,
          order_id: orderId,
          item_count: num_items ?? 1,
          items: packageId
            ? [{ product_id: packageId, product_name: packageName, value, quantity: num_items ?? 1 }]
            : [],
          package_type: packageType,
          package_id: packageId,
          package_name: packageName,
          user_id: userId,
          user_email: userEmail,
        });
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("Klaviyo tracking error (non-fatal):", err);
        }
      }
    }

    // Reference unused params to satisfy noUnusedLocals (renewal-specific fields kept on PixelPurchaseParams type).
    void paymentIntentId;
    void subscriptionId;
    void entriesAdded;
    void pointsEarned;

    return Object.values(results).some(Boolean);
  } catch (error) {
    console.error("Error tracking pixel purchase:", error);
    return false;
  }
}
```

- [ ] **Step 3: Remove the now-dead helper imports**

At the top of the file, remove these imports (they're no longer used in `trackPixelPurchase`):
- `import { trackTikTokEvent } from "@/components/TikTokPixel";` — keep the import only if other functions in the same file still use it. If `trackPixelSubscription`, `trackPixelCancellation`, etc. still call `trackTikTokEvent`, leave the import alone.
- `buildFacebookPurchaseEventDev`, `sendFacebookPurchaseEventDev` — leave alone if other functions still use them.

(Use grep within the file to confirm before deleting: if zero remaining usages, remove the import.)

- [ ] **Step 4: Run type-check + the existing tests**

Run: `npm run type-check && npm run test:facebook-capi && npm run test:tracking-dispatch`
Expected: PASS

- [ ] **Step 5: Suggested commit**

```bash
git add src/utils/tracking/pixel-purchase-tracking.ts
git commit -m "refactor(tracking): trackPixelPurchase uses provider dispatcher"
```

---

## Task 16: Fix broken browser Purchase dual-fire on success pages

**Files:**
- Modify: `src/components/payment/PaymentSuccessHandler.tsx`
- Modify: `src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx`
- Modify: `src/app/(site)/upsell-success/components/UpsellSuccessClient.tsx`
- Modify: `src/app/(site)/mini-draw-success/components/MiniDrawSuccessClient.tsx`
- Modify: `src/app/(site)/checkout/success/components/CheckoutSuccessClient.tsx`

This is the production bug fix. Each success-page client fires Purchase on mount with `eventId === paymentIntentId` (or `orderId`) so dedup with CAPI works.

- [ ] **Step 1: Remove the redundant fire from `PaymentSuccessHandler.tsx`**

Open `src/components/payment/PaymentSuccessHandler.tsx`. Find lines 58–86 (the `pixelPurchaseFiredRef` + `useEffect` block that calls `trackPurchaseWithEventId`). Delete:
- Line 13: the `trackPurchaseWithEventId` import
- Lines 58–86: the `pixelPurchaseFiredRef` declaration and the entire `useEffect` block that fires Purchase

The component should keep its other useEffect (`onStatusChange`) and rendering logic. The success page is now the canonical fire surface, not this handler.

- [ ] **Step 2: Fire Purchase from `PurchaseSuccessClient.tsx`**

Replace `src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx`:

```tsx
"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { PaymentSuccessHandler } from "@/components/payment/PaymentSuccessHandler";
import { CheckCircle } from "lucide-react";
import { SectionContainer } from "@/components/ui";
import { usePaymentStatus } from "@/hooks/queries";
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";

interface PurchaseSuccessClientProps {
  searchParams: {
    payment_intent_client_secret?: string;
    payment_intent?: string;
  };
}

export default function PurchaseSuccessClient({ searchParams }: PurchaseSuccessClientProps) {
  const paymentIntentId = searchParams.payment_intent;
  const { data: status } = usePaymentStatus(paymentIntentId, { enabled: !!paymentIntentId });
  const firedRef = useRef(false);

  // Fire Purchase pixel once on mount when the server confirms benefits were granted.
  // eventId === paymentIntentId so it dedups with server-side CAPI which uses the same id.
  // The /api/payment-status/[id] route only includes price/currency when processed === true
  // (see PaymentStatusResponse in src/hooks/queries/usePaymentQueries.ts:70-89), so we gate on that.
  useEffect(() => {
    if (firedRef.current) return;
    if (!paymentIntentId) return;
    if (status?.processed !== true) return;
    const value = status.data.price;
    const currency = status.data.currency;
    if (typeof value !== "number" || value <= 0) return;
    firedRef.current = true;
    trackConversion(
      buildPurchaseEvent({
        value,
        currency: (currency ?? "AUD").toUpperCase(),
        eventId: paymentIntentId,
        customData: {
          orderId: paymentIntentId,
          contentType: "product",
          packageType: status.data.packageType,
        },
        eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    );
  }, [paymentIntentId, status]);

  return (
    <div className="bg-gray-50 pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] min-h-screen-svh">
      <SectionContainer variant="narrow" className="py-8">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2 font-['Poppins']">
            Purchase Successful!
          </h1>
          <p className="text-gray-600 dark:text-neutral-400 text-lg">
            Thank you for your purchase. Your order has been confirmed and is being processed.
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
          <PaymentSuccessHandler paymentType="one-time" successMessage="Your purchase was successful!">
            <div className="mt-4 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm font-medium">
                  Your payment has been processed successfully. You will receive a confirmation email shortly.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/my-account" className="inline-flex items-center justify-center px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors">
                  View My Account
                </Link>
                <Link href="/" className="inline-flex items-center justify-center px-6 py-3 bg-gray-200 text-gray-900 font-medium rounded-lg hover:bg-gray-300 transition-colors">
                  Continue Shopping
                </Link>
              </div>
            </div>
          </PaymentSuccessHandler>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">What&apos;s Next?</h2>
          <ul className="space-y-3 text-gray-600 dark:text-neutral-400">
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span>You will receive a confirmation email with your order details</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span>Your entries have been added to your account</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span>You can view your account details in the My Account section</span>
            </li>
          </ul>
        </div>
      </SectionContainer>
    </div>
  );
}
```

> **About the response shape:** `PaymentStatusResponse` is defined inline in [`src/hooks/queries/usePaymentQueries.ts:70-89`](../../../src/hooks/queries/usePaymentQueries.ts#L70-L89). When the server has recorded a `BenefitsGranted` PaymentEvent for this paymentIntent, the response has `processed: true` and `data.price` (dollars) + `data.currency` ("AUD"). Until then `processed` is false and price/currency are absent. Gate the fire on `status?.processed === true` — the `usePaymentStatus` hook polls with exponential backoff, so the success page will get the data within ~2-10 seconds even on slow webhook processing.

- [ ] **Step 3: Apply the same pattern to `UpsellSuccessClient.tsx`**

Replace `src/app/(site)/upsell-success/components/UpsellSuccessClient.tsx`:

```tsx
"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { PaymentSuccessHandler } from "@/components/payment/PaymentSuccessHandler";
import { CheckCircle } from "lucide-react";
import { SectionContainer } from "@/components/ui";
import { usePaymentStatus } from "@/hooks/queries";
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";

interface UpsellSuccessClientProps {
  searchParams: {
    payment_intent_client_secret?: string;
    payment_intent?: string;
  };
}

export default function UpsellSuccessClient({ searchParams }: UpsellSuccessClientProps) {
  const paymentIntentId = searchParams.payment_intent;
  const { data: status } = usePaymentStatus(paymentIntentId, { enabled: !!paymentIntentId });
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!paymentIntentId) return;
    if (status?.processed !== true) return;
    const value = status.data.price;
    const currency = status.data.currency;
    if (typeof value !== "number" || value <= 0) return;
    firedRef.current = true;
    trackConversion(
      buildPurchaseEvent({
        value,
        currency: (currency ?? "AUD").toUpperCase(),
        eventId: paymentIntentId,
        customData: {
          orderId: paymentIntentId,
          contentType: "product",
          packageType: status.data.packageType ?? "upsell",
        },
        eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    );
  }, [paymentIntentId, status]);

  return (
    <div className="bg-gray-50 pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] min-h-screen-svh">
      <SectionContainer variant="narrow" className="py-8">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2 font-['Poppins']">
            Upsell Purchase Successful!
          </h1>
          <p className="text-gray-600 dark:text-neutral-400 text-lg">
            Thank you for your purchase. Your additional entries have been added to your account.
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
          <PaymentSuccessHandler paymentType="upsell" successMessage="Your upsell purchase was successful!">
            <div className="mt-4 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm font-medium">
                  Your additional entries have been processed successfully. You can now use them in upcoming draws!
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/my-account" className="inline-flex items-center justify-center px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors">View My Account</Link>
                <Link href="/" className="inline-flex items-center justify-center px-6 py-3 bg-gray-200 text-gray-900 font-medium rounded-lg hover:bg-gray-300 transition-colors">Continue Shopping</Link>
              </div>
            </div>
          </PaymentSuccessHandler>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">What&apos;s Next?</h2>
          <ul className="space-y-3 text-gray-600 dark:text-neutral-400">
            <li className="flex items-start gap-3"><CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" /><span>Your additional entries have been added to your account</span></li>
            <li className="flex items-start gap-3"><CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" /><span>You will receive a confirmation email with your purchase details</span></li>
            <li className="flex items-start gap-3"><CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" /><span>You can view your entry balance in the My Account section</span></li>
          </ul>
        </div>
      </SectionContainer>
    </div>
  );
}
```

- [ ] **Step 4: Apply the same pattern to `MiniDrawSuccessClient.tsx`**

Replace `src/app/(site)/mini-draw-success/components/MiniDrawSuccessClient.tsx`:

```tsx
"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { PaymentSuccessHandler } from "@/components/payment/PaymentSuccessHandler";
import { CheckCircle } from "lucide-react";
import { usePaymentStatus } from "@/hooks/queries";
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";

interface MiniDrawSuccessClientProps {
  searchParams: {
    payment_intent_client_secret?: string;
    payment_intent?: string;
  };
}

export default function MiniDrawSuccessClient({ searchParams }: MiniDrawSuccessClientProps) {
  const paymentIntentId = searchParams.payment_intent;
  const { data: status } = usePaymentStatus(paymentIntentId, { enabled: !!paymentIntentId });
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!paymentIntentId) return;
    if (status?.processed !== true) return;
    const value = status.data.price;
    const currency = status.data.currency;
    if (typeof value !== "number" || value <= 0) return;
    firedRef.current = true;
    trackConversion(
      buildPurchaseEvent({
        value,
        currency: (currency ?? "AUD").toUpperCase(),
        eventId: paymentIntentId,
        customData: {
          orderId: paymentIntentId,
          contentType: "product",
          packageType: status.data.packageType ?? "mini-draw",
        },
        eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    );
  }, [paymentIntentId, status]);

  return (
    <div className="bg-gray-50 dark:bg-neutral-950 pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] min-h-screen-svh">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-950/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2 font-['Poppins']">
            Mini Draw Entry Successful!
          </h1>
          <p className="text-gray-600 dark:text-neutral-400 text-lg">
            Thank you for your purchase. Your entry has been added to the mini draw.
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
          <PaymentSuccessHandler paymentType="mini-draw" successMessage="Your mini-draw entry was added successfully!">
            <div className="mt-4 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm font-medium">
                  Your entry has been processed successfully. Good luck in the draw!
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/my-account" className="inline-flex items-center justify-center px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors">View My Account</Link>
                <Link href="/" className="inline-flex items-center justify-center px-6 py-3 bg-gray-200 dark:bg-neutral-800 text-gray-900 dark:text-white font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-neutral-700 transition-colors">Continue Shopping</Link>
              </div>
            </div>
          </PaymentSuccessHandler>
        </div>
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-gray-200 dark:border-neutral-800 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">What&apos;s Next?</h2>
          <ul className="space-y-3 text-gray-600 dark:text-neutral-400">
            <li className="flex items-start gap-3"><CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" /><span>Your entry has been added to the mini draw</span></li>
            <li className="flex items-start gap-3"><CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" /><span>You will receive a confirmation email with your entry details</span></li>
            <li className="flex items-start gap-3"><CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" /><span>You can view your draw entries in the My Account section</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Apply the same pattern to `CheckoutSuccessClient.tsx`**

`CheckoutSuccessClient` already fetches an order via `useOrder(orderId)`. We use the order data directly — no need to also fetch payment status.

Open `src/app/(site)/checkout/success/components/CheckoutSuccessClient.tsx`. Add these two new imports near the top (after existing imports):

```ts
import { useEffect, useRef } from "react";
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";
```

(Replace the existing `import React from "react";` with `import React, { useEffect, useRef } from "react";`.)

Then, immediately after the `const { data: order, isLoading, isError, error } = useOrder(orderId);` line (around line 30), add:

```tsx
const firedRef = useRef(false);

useEffect(() => {
  if (firedRef.current) return;
  if (!order) return;
  if (order.paymentStatus !== "paid" && order.paymentStatus !== "succeeded") return;
  if (!order.totalAmount || order.totalAmount <= 0) return;
  firedRef.current = true;
  trackConversion(
    buildPurchaseEvent({
      value: order.totalAmount,
      currency: "AUD",
      eventId: order.orderNumber ?? orderId,
      customData: {
        orderId: order.orderNumber ?? orderId,
        contentType: "product",
        numItems: order.items?.length,
      },
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
    }),
  );
}, [order, orderId]);
```

> Note on `eventId`: for the shop checkout flow, the server-side CAPI uses `orderId` (e.g. `order.orderNumber`) as the dedup id. If you discover the server-side actually uses `paymentIntentId` for this flow, update the `eventId` here to match. Grep `trackPixelPurchase` callers in `src/app/api/orders/` and `src/app/api/cart/` to confirm before commit.

- [ ] **Step 6: Run type check + lint**

Run: `npm run type-check && npm run lint`
Expected: PASS

- [ ] **Step 7: Manual smoke (production-like environment recommended)**

Trigger a purchase via the test environment. After landing on `/purchase-success?payment_intent=pi_...`:
- Open DevTools → Network → filter by `connect.facebook.net`. Expect one `tr/?id=...&ev=Purchase&...&eid=pi_xxx` request.
- Meta Events Manager (test-event mode) should show Purchase under both Browser and Server. The eventID column should match between rows.

If you cannot run a real purchase, manually set `paymentIntentId` in the URL and use Stripe test cards to trigger a `succeeded` status.

- [ ] **Step 8: Suggested commit**

```bash
git add src/components/payment/PaymentSuccessHandler.tsx \
        src/app/\(site\)/purchase-success/components/PurchaseSuccessClient.tsx \
        src/app/\(site\)/upsell-success/components/UpsellSuccessClient.tsx \
        src/app/\(site\)/mini-draw-success/components/MiniDrawSuccessClient.tsx \
        src/app/\(site\)/checkout/success/components/CheckoutSuccessClient.tsx
git commit -m "fix(tracking): fire Purchase pixel on every success page (not 3DS-only)"
```

---

## Task 17: TikTok + Snapchat insights Mongoose models

**Files:**
- Create: `src/models/TikTokAdInsightsDaily.ts`
- Create: `src/models/SnapchatAdInsightsDaily.ts`

Same shape as `MetaAdInsightsDaily` so future TikTok/Snap Marketing API sync services can plug in without inventing a new schema. No queries against these yet — the admin shells render an empty state in Task 18.

- [ ] **Step 1: Create the TikTok model**

```ts
// src/models/TikTokAdInsightsDaily.ts
import mongoose, { Document, Schema } from "mongoose";

/**
 * Daily ad-level insights synced from TikTok Marketing API.
 * Schema mirrors MetaAdInsightsDaily so analytics UIs can share primitives.
 * Idempotent key: adAccountId + date (YYYY-MM-DD) + adId.
 *
 * NOTE: No sync service writes to this collection yet — the TikTok Marketing API
 * integration lands in a follow-up spec. This model is created so the admin
 * shell tab has somewhere to query when that spec runs.
 */
export interface ITikTokAdInsightsDaily extends Document {
  adAccountId: string;
  date: string;
  adId: string;
  adsetId?: string;
  campaignId?: string;
  campaignName?: string;
  adsetName?: string;
  adName?: string;
  /** Spend in cents (AUD). */
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
  raw?: Record<string, unknown>;
  syncedAt: Date;
}

const TikTokAdInsightsDailySchema = new Schema<ITikTokAdInsightsDaily>(
  {
    adAccountId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    adId: { type: String, required: true },
    adsetId: { type: String },
    campaignId: { type: String },
    campaignName: { type: String },
    adsetName: { type: String },
    adName: { type: String },
    spendCents: { type: Number, required: true, default: 0 },
    impressions: { type: Number, required: true, default: 0 },
    clicks: { type: Number, required: true, default: 0 },
    conversions: { type: Number, default: 0 },
    revenueCents: { type: Number, default: 0 },
    raw: { type: Schema.Types.Mixed },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

TikTokAdInsightsDailySchema.index({ adAccountId: 1, date: 1, adId: 1 }, { unique: true });
TikTokAdInsightsDailySchema.index({ adAccountId: 1, date: 1 });

export default mongoose.models.TikTokAdInsightsDaily ||
  mongoose.model<ITikTokAdInsightsDaily>("TikTokAdInsightsDaily", TikTokAdInsightsDailySchema);
```

- [ ] **Step 2: Create the Snapchat model**

```ts
// src/models/SnapchatAdInsightsDaily.ts
import mongoose, { Document, Schema } from "mongoose";

/**
 * Daily ad-level insights synced from Snapchat Marketing API.
 * Schema mirrors MetaAdInsightsDaily so analytics UIs can share primitives.
 * Idempotent key: adAccountId + date (YYYY-MM-DD) + adId.
 *
 * NOTE: No sync service writes to this collection yet — see TikTok model note.
 */
export interface ISnapchatAdInsightsDaily extends Document {
  adAccountId: string;
  date: string;
  adId: string;
  adsetId?: string;
  campaignId?: string;
  campaignName?: string;
  adsetName?: string;
  adName?: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
  raw?: Record<string, unknown>;
  syncedAt: Date;
}

const SnapchatAdInsightsDailySchema = new Schema<ISnapchatAdInsightsDaily>(
  {
    adAccountId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    adId: { type: String, required: true },
    adsetId: { type: String },
    campaignId: { type: String },
    campaignName: { type: String },
    adsetName: { type: String },
    adName: { type: String },
    spendCents: { type: Number, required: true, default: 0 },
    impressions: { type: Number, required: true, default: 0 },
    clicks: { type: Number, required: true, default: 0 },
    conversions: { type: Number, default: 0 },
    revenueCents: { type: Number, default: 0 },
    raw: { type: Schema.Types.Mixed },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

SnapchatAdInsightsDailySchema.index({ adAccountId: 1, date: 1, adId: 1 }, { unique: true });
SnapchatAdInsightsDailySchema.index({ adAccountId: 1, date: 1 });

export default mongoose.models.SnapchatAdInsightsDaily ||
  mongoose.model<ISnapchatAdInsightsDaily>("SnapchatAdInsightsDaily", SnapchatAdInsightsDailySchema);
```

- [ ] **Step 3: Run type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 4: Suggested commit**

```bash
git add src/models/TikTokAdInsightsDaily.ts src/models/SnapchatAdInsightsDaily.ts
git commit -m "feat(tracking): add TikTok + Snapchat daily insights models"
```

---

## Task 18: TikTok + Snapchat admin shell components

**Files:**
- Create: `src/components/admin/TikTokAdsManagement.tsx`
- Create: `src/components/admin/SnapchatAdsManagement.tsx`

Pure UI shells — no data fetching, no models referenced. They show the page layout you'll see once Marketing-API sync lands.

- [ ] **Step 1: Create the TikTok shell**

```tsx
// src/components/admin/TikTokAdsManagement.tsx
"use client";

import React from "react";
import { TrendingUp, DollarSign, BarChart3, Target } from "lucide-react";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";

/**
 * Empty-state shell for TikTok Ads analytics. The TikTok Marketing API insights
 * sync lives in a follow-up spec; until then the metrics show em-dashes and the
 * "Insights sync not yet configured." inline note.
 */
export default function TikTokAdsManagement() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 text-center">
        <p className="text-sm text-gray-500 dark:text-neutral-400">Insights sync not yet configured.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Ad Spend" value="—" icon={DollarSign} />
        <MetricCard label="Revenue" value="—" icon={TrendingUp} />
        <MetricCard label="Conversions" value="—" icon={Target} />
        <MetricCard label="ROAS" value="—" icon={BarChart3} />
      </div>
    </div>
  );
}
```

> **MetricCard signature check:** verify the actual prop shape of `MetricCard` from `src/components/admin/metrics/shared/MetricCard.tsx`. If its props differ from `{ label, value, icon }`, adapt the call sites — but don't change `MetricCard` itself in this task.

- [ ] **Step 2: Create the Snapchat shell**

```tsx
// src/components/admin/SnapchatAdsManagement.tsx
"use client";

import React from "react";
import { TrendingUp, DollarSign, BarChart3, Target } from "lucide-react";
import { MetricCard } from "@/components/admin/metrics/shared/MetricCard";

/**
 * Empty-state shell for Snapchat Ads analytics.
 * See TikTokAdsManagement comment — same story until Snapchat Marketing API sync ships.
 */
export default function SnapchatAdsManagement() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 text-center">
        <p className="text-sm text-gray-500 dark:text-neutral-400">Insights sync not yet configured.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Ad Spend" value="—" icon={DollarSign} />
        <MetricCard label="Revenue" value="—" icon={TrendingUp} />
        <MetricCard label="Conversions" value="—" icon={Target} />
        <MetricCard label="ROAS" value="—" icon={BarChart3} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS. If it fails on `MetricCard` props, open `src/components/admin/metrics/shared/MetricCard.tsx` and adjust the call.

- [ ] **Step 4: Suggested commit**

```bash
git add src/components/admin/TikTokAdsManagement.tsx src/components/admin/SnapchatAdsManagement.tsx
git commit -m "feat(admin): TikTok + Snapchat analytics shell tabs"
```

---

## Task 19: Admin sidebar + tab routing

**Files:**
- Modify: `src/app/admin/component/AdminSidebar.tsx`
- Modify: `src/app/admin/component/AdminPage.tsx`

Add the two new tabs into the "Analytics" group and wire them into the dispatcher.

- [ ] **Step 1: Add sidebar entries**

In `src/app/admin/component/AdminSidebar.tsx`, find the `analytics` group block (around line 73–82):

```ts
{
  id: "analytics",
  label: "Analytics",
  groupIcon: LineChart,
  tabs: [
    { id: "facebook-ads", label: "Facebook Ads", icon: TrendingUp },
    { id: "promo-analytics", label: "Page Analytics", icon: BarChart3 },
    { id: "ab-testing", label: "A/B Testing", icon: FlaskConical },
  ],
},
```

Replace with:

```ts
{
  id: "analytics",
  label: "Analytics",
  groupIcon: LineChart,
  tabs: [
    { id: "facebook-ads", label: "Facebook Ads", icon: TrendingUp },
    { id: "tiktok-ads", label: "TikTok Ads", icon: TrendingUp },
    { id: "snapchat-ads", label: "Snapchat Ads", icon: TrendingUp },
    { id: "promo-analytics", label: "Page Analytics", icon: BarChart3 },
    { id: "ab-testing", label: "A/B Testing", icon: FlaskConical },
  ],
},
```

(Brand-specific icons can come later; reusing `TrendingUp` matches what `facebook-ads` already does.)

- [ ] **Step 2: Add routing in AdminPage**

In `src/app/admin/component/AdminPage.tsx`:

(a) Add two imports near the existing `import FacebookAdsManagement from "@/components/admin/FacebookAdsManagement";` (line 20):

```tsx
import TikTokAdsManagement from "@/components/admin/TikTokAdsManagement";
import SnapchatAdsManagement from "@/components/admin/SnapchatAdsManagement";
```

(b) Find the existing `selectedTab === "facebook-ads"` block (around line 241):

```tsx
{/* FACEBOOK ADS TAB */}
{selectedTab === "facebook-ads" && <FacebookAdsManagement />}
```

Add directly after it:

```tsx
{/* TIKTOK ADS TAB */}
{selectedTab === "tiktok-ads" && <TikTokAdsManagement />}

{/* SNAPCHAT ADS TAB */}
{selectedTab === "snapchat-ads" && <SnapchatAdsManagement />}
```

(c) Optionally, in the header description block (around lines 168–185), add two lines for nicer breadcrumb text:

```tsx
{selectedTab === "tiktok-ads" && "TikTok Ads insights (sync coming soon)"}
{selectedTab === "snapchat-ads" && "Snapchat Ads insights (sync coming soon)"}
```

- [ ] **Step 3: Run type-check + lint + manual check**

Run: `npm run type-check && npm run lint`
Expected: PASS

Run: `npm run dev`. Visit `http://localhost:3000/admin/tiktok-ads` and `/admin/snapchat-ads` (assuming you're logged in as admin). Expect to see the empty-state shells with four em-dashes.

- [ ] **Step 4: Suggested commit**

```bash
git add src/app/admin/component/AdminSidebar.tsx src/app/admin/component/AdminPage.tsx
git commit -m "feat(admin): wire TikTok + Snapchat ads tabs into sidebar and dispatcher"
```

---

## Task 20: Docs + Domain Manifest update

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/tracking/architecture.md`
- Modify: `docs/tracking/backend.md`
- Modify: `docs/tracking/frontend.md`
- Modify: `docs/tracking/api.md`
- Modify: `docs/tracking/models.md`
- Modify: `docs/tracking/patterns.md`
- Modify: `docs/tracking/gotchas.md`

- [ ] **Step 1: Update the Domain Manifest in CLAUDE.md**

In `CLAUDE.md`, find the `tracking` domain block (search for `"tracking": {` near the bottom). Add these path entries to the `paths` array (before the closing `]`):

```
"src/lib/tracking/**",
"src/components/tracking/**",
"src/app/api/tracking/**",
"src/components/admin/TikTokAdsManagement.tsx",
"src/components/admin/SnapchatAdsManagement.tsx",
"src/models/TikTokAdInsightsDaily.ts",
"src/models/SnapchatAdInsightsDaily.ts"
```

Then update the `lastVerified` date for the `tracking` domain to today (2026-05-11), and bump the `lastModified` field at the top of the manifest block.

- [ ] **Step 2: Update `docs/tracking/architecture.md`**

Replace the "Provider stack" table (lines 5–12 or thereabouts) with:

```markdown
## Provider registry

All conversion-tracking flows through a single provider registry at [`src/lib/tracking/`](../../src/lib/tracking/). Each platform implements one `ConversionProvider` module under `src/lib/tracking/providers/<platform>.ts`:

| Provider | Pixel id env | Access token env | CAPI status |
|---|---|---|---|
| **Facebook** | `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` | `FACEBOOK_ACCESS_TOKEN` | Live |
| **TikTok** | `NEXT_PUBLIC_TIKTOK_PIXEL_ID` | `TIKTOK_ACCESS_TOKEN` | Pixel only — Events API stub returns `false` |
| **Snapchat** | `NEXT_PUBLIC_SNAPCHAT_PIXEL_ID` | `SNAPCHAT_ACCESS_TOKEN` | Pixel only — CAPI stub returns `false` |

## Dispatchers

Two entry points fan out to every enabled provider:

- **Server**: `sendConversion(event, ctx)` in [`src/lib/tracking/dispatch.ts`](../../src/lib/tracking/dispatch.ts) — calls every provider's `capiSend` where `enabled().capi` is true.
- **Browser**: `trackConversion(event)` in [`src/lib/tracking/dispatch-client.ts`](../../src/lib/tracking/dispatch-client.ts) — calls every provider's `pixelTrack` where `enabled().pixel` is true AND `window.location.hostname` matches the provider's `productionHostnames()`.

## Dual-fire + dedup contract

Every conversion event MUST be dual-fired (browser pixel + server CAPI) with a shared `eventId`. Each provider maps it:
- Facebook: `event_id` on CAPI; 4th arg `{ eventID }` on `fbq('track', ...)`.
- TikTok: `event_id` on Events API; 3rd-arg `{ event_id }` on `ttq.track(...)`.
- Snapchat: `client_dedup_id` on both sides.

The Provider interface does not allow opting out — if `enabled()` reports a surface live, both sides fire.

## Missing-credentials safety

When pixel id or access token is absent, the matching surface is a silent no-op: no script tag injection, no `fetch` call, no console-spam, no thrown errors. See [`docs/superpowers/specs/2026-05-11-tracking-provider-registry-design.md`](../superpowers/specs/2026-05-11-tracking-provider-registry-design.md) §8a for the full behavior matrix.
```

- [ ] **Step 3: Update `docs/tracking/backend.md`**

Replace the "Lib" table with:

```markdown
## Lib

| File | Role |
|---|---|
| [src/lib/tracking/dispatch.ts](../../src/lib/tracking/dispatch.ts) | `sendConversion(event, ctx)` — server fan-out (CANONICAL) |
| [src/lib/tracking/dispatch-client.ts](../../src/lib/tracking/dispatch-client.ts) | `trackConversion(event)` — browser fan-out |
| [src/lib/tracking/canonical-event.ts](../../src/lib/tracking/canonical-event.ts) | `buildPurchaseEvent`, `hashPII`, `assertValidEvent` |
| [src/lib/tracking/registry.ts](../../src/lib/tracking/registry.ts) | `getAllProviders()` |
| [src/lib/tracking/providers/facebook.ts](../../src/lib/tracking/providers/facebook.ts) | Facebook provider — wraps `sendFacebookEvent` and `fbq` |
| [src/lib/tracking/providers/tiktok.ts](../../src/lib/tracking/providers/tiktok.ts) | TikTok provider — pixel works; CAPI stub |
| [src/lib/tracking/providers/snapchat.ts](../../src/lib/tracking/providers/snapchat.ts) | Snapchat provider — pixel works; CAPI stub |
| [src/lib/facebook.ts](../../src/lib/facebook.ts) | Underlying Meta CAPI implementation (wrapped by facebookProvider) |
| [src/lib/facebook-env.ts](../../src/lib/facebook-env.ts) | Env / config |
| [src/lib/klaviyo.ts](../../src/lib/klaviyo.ts) | Klaviyo server client (NOT a CAPI provider) |
```

- [ ] **Step 4: Update `docs/tracking/frontend.md`**

Add to the top after the existing intro:

```markdown
## Conversion pixels

[`<ConversionPixels />`](../../src/components/tracking/ConversionPixels.tsx) is the canonical browser-side pixel loader, mounted once in [`src/app/layout.tsx`](../../src/app/layout.tsx). It iterates the provider registry and calls each provider's `loadPixel({ nonce })` for those whose `enabled().pixel` is true.

`<FacebookPixel />` and `<TikTokPixel />` remain in the codebase as backwards-compat re-exports of their helper functions, but should not be mounted directly.

To fire a conversion from a client component, use `trackConversion(buildPurchaseEvent(...))` from [`src/lib/tracking/dispatch-client.ts`](../../src/lib/tracking/dispatch-client.ts).
```

- [ ] **Step 5: Update `docs/tracking/api.md`**

Add at the top:

```markdown
## Endpoints

- **`POST /api/tracking/conversion`** — provider-agnostic conversion event. Body is a `CanonicalEvent`. Response: `{ ok, results: { facebook, tiktok, snapchat } }`. See [`src/app/api/tracking/conversion/route.ts`](../../src/app/api/tracking/conversion/route.ts).
- **`POST /api/facebook/track`** — deprecated; thin shim that translates the legacy FB-shaped body and forwards to the canonical endpoint. See [`src/app/api/facebook/track/route.ts`](../../src/app/api/facebook/track/route.ts).
- `POST /api/tracking/promo-page-visit` — unchanged.
```

- [ ] **Step 6: Update `docs/tracking/models.md`**

Append:

```markdown
## TikTokAdInsightsDaily

[`src/models/TikTokAdInsightsDaily.ts`](../../src/models/TikTokAdInsightsDaily.ts). Daily ad-level insights from TikTok Marketing API. Same shape as `MetaAdInsightsDaily`. Unique key: `(adAccountId, date, adId)`. No sync service writes to this yet — sync ships in a follow-up spec.

## SnapchatAdInsightsDaily

[`src/models/SnapchatAdInsightsDaily.ts`](../../src/models/SnapchatAdInsightsDaily.ts). Same shape and same status as TikTok.
```

- [ ] **Step 7: Update `docs/tracking/patterns.md`**

Append:

```markdown
## Adding a new conversion provider

Three steps:

1. Implement `ConversionProvider` in `src/lib/tracking/providers/<platform>.ts`. The required surface:
   - `enabled()`: read env, return `{ pixel: !!process.env.NEXT_PUBLIC_<X>_PIXEL_ID, capi: !!process.env.<X>_ACCESS_TOKEN }`
   - `productionHostnames()`: return `["toolsaustralia.com.au", "www.toolsaustralia.com.au"]` unless you have a reason to differ.
   - `loadPixel({ nonce })`: inject the platform's inline init script with the nonce. Idempotent.
   - `pixelTrack(event)`: call the platform's `track` SDK with `event.eventId` mapped to the provider's dedup field.
   - `capiSend(event, ctx)`: POST to the platform's Conversions API. Return `false` on any failure — never throw.
2. Export it from [`src/lib/tracking/providers/index.ts`](../../src/lib/tracking/providers/index.ts).
3. Add it to the `ALL_PROVIDERS` array in [`src/lib/tracking/registry.ts`](../../src/lib/tracking/registry.ts), and extend the `ProviderId` union in [`src/lib/tracking/types.ts`](../../src/lib/tracking/types.ts).

Tests in [`src/lib/tracking/__tests__/dispatch.test.ts`](../../src/lib/tracking/__tests__/dispatch.test.ts) use fakes — no provider-specific changes needed.
```

- [ ] **Step 8: Update `docs/tracking/gotchas.md`**

Append:

```markdown
## Production-hostname gate

Every browser pixel refuses to fire on any hostname not listed in `productionHostnames()`. For all three current providers that means **only** `toolsaustralia.com.au` and `www.toolsaustralia.com.au`. To test pixels in dev/preview, set `NEXT_PUBLIC_ENABLE_PIXEL_TESTING=true` (which `<ConversionPixels disabled />` reads) **and** mock the hostname in your test — there is no global "ignore hostname" override; this is intentional.

## Dedup id mapping

Each provider's dedup field has a different name. The canonical `eventId` maps to:
- Facebook: `event_id` (CAPI) / `eventID` (Pixel SDK 4th arg)
- TikTok: `event_id` (Events API) / `event_id` (Pixel SDK 3rd arg)
- Snapchat: `client_dedup_id` (both)

If you grep for `eventID` and find no hits in a provider's code, you're looking at the wrong field name.

## Stale comment surveyed in 2026-05

The comment at [`src/utils/tracking/pixel-purchase-tracking.ts`](../../src/utils/tracking/pixel-purchase-tracking.ts) used to claim "Browser pixel removed — using CAPI-only approach". That was never true; the browser pixel was just moved to `PaymentProcessingScreen.tsx` and `PaymentSuccessHandler.tsx`. After the registry refactor the browser-side Purchase pixel fires from the four success-page clients (`PurchaseSuccessClient`, `UpsellSuccessClient`, `MiniDrawSuccessClient`, `CheckoutSuccessClient`) so dual-fire works on all purchase paths, not just 3DS redirects.
```

- [ ] **Step 9: Run the doc-sync check**

Run: `npm run lint`
Expected: PASS. The doc-sync `Stop` hook only runs on `Stop` events; doing `npm run lint` is a sanity check that no obvious errors remain. If you have a manual doc-sync command (check `package.json` for `doc-sync`), run that too.

- [ ] **Step 10: Final full-suite check**

Run all the tracking-related tests:

```bash
npm run test:tracking-dispatch
npm run test:facebook-capi
npm run type-check
npm run lint
```

Expected: all PASS.

- [ ] **Step 11: Suggested commit**

```bash
git add CLAUDE.md docs/tracking/*.md
git commit -m "docs(tracking): document provider registry; update manifest"
```

---

## Definition of done

After all 20 tasks:

- [ ] `npm run type-check` clean
- [ ] `npm run lint` clean
- [ ] `npm run test:tracking-dispatch` passes (new)
- [ ] `npm run test:facebook-capi` still passes (regression check)
- [ ] `npm run build` succeeds
- [ ] Dev server boots without console errors
- [ ] In production-like env with `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` set and `NEXT_PUBLIC_TIKTOK_PIXEL_ID` / `NEXT_PUBLIC_SNAPCHAT_PIXEL_ID` **unset**, the site behaves identically to today — no extra network calls to TikTok or Snapchat domains
- [ ] Test purchase results in **both** browser Purchase pixel AND server CAPI events with matching `eventID`, visible in Meta Events Manager test-events panel
- [ ] `/admin/tiktok-ads` and `/admin/snapchat-ads` render the empty-state shells without errors
- [ ] `docs/tracking/` rewritten to describe the new layer; `CLAUDE.md` manifest includes the new paths

Once those check out, **ask the user** if they want to commit + push + open a PR — do not do it automatically (CLAUDE.md hard rule).
