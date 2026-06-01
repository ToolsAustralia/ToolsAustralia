# Platform Payment Attribution — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commits:** This repo enforces **no-auto-commit** (CLAUDE.md hard-rule #1). The commit steps below are real steps, but only run them once the user has authorized commits this session (`commit`/`push`/`ship it`). If unauthorized, complete the task and pause for authorization.
>
> **Tests:** This repo has **no jest/vitest** — tests are standalone `tsx` scripts under `src/**/__tests__/*.test.ts`, each wired to a `test:<scope>` entry in `package.json`. Follow the **writing-tsx-test** skill for the exact harness style. Run a test with `npm run test:<scope>`.
>
> **Docs:** Editing `src/**` triggers the doc-sync Stop hook. Task 14 updates the `tracking` + `payment` domain docs in the same plan; don't skip it.

**Goal:** Stamp every payment (going forward) with exactly one normalized `convertingPlatform`, resolved by a config-driven priority+window ladder from durably-captured click IDs and UTM, persisted on the `PaymentEvent` ledger — while keeping the existing multi-platform CAPI fan-out untouched (Send ≠ Count).

**Architecture:** Capture click IDs + UTM into durable first-party cookies that survive the auth lifecycle (incl. Google OAuth). At each Stripe `create-*` route (cookie-bearing edge), read those cookies server-side, run a pure resolver, and stamp the decision into Stripe metadata. The webhook reads the decision (or runs a fallback resolver) and writes `convertingPlatform`/`attributionConfidence`/`isRenewal` + raw evidence onto the `BenefitsGranted` PaymentEvent. Subscriptions stamp into subscription metadata → renewals inherit the platform (sticky).

**Tech Stack:** Next.js 15 App Router, Mongoose, Stripe, TypeScript. Tests: `tsx`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-01-platform-payment-attribution-design.md` (v2).

---

## Shared contracts (referenced by every task — keep names identical)

```ts
// src/types/attribution.ts  (created in Task 5)
export type ConvertingPlatform =
  | "meta" | "tiktok" | "snapchat"
  | "klaviyo_email" | "klaviyo_sms"
  | "google" | "direct" | "other";

export type AttributionConfidence = "click" | "utm_only" | "inferred_backfill";

/** A paid-click signal observed at capture time. capturedAt = epoch ms, or null if unknown. */
export interface PaidClickSignal {
  platform: "meta" | "tiktok" | "snapchat" | "google";
  clickId: string;
  capturedAt: number | null;
}

export interface ResolveInput {
  clicks: PaidClickSignal[];
  utm?: { utm_source?: string; utm_medium?: string };
  utmCapturedAt?: number | null;
  now: number; // epoch ms
}

export interface ResolveResult {
  platform: ConvertingPlatform;
  confidence: Exclude<AttributionConfidence, "inferred_backfill">; // live resolve is never backfill
  attributedClickId: string | null;
  attributedClickTimestamp: number | null;
  windowDays: number | null;
  observedTouches: Array<{
    platform: string;
    clickIdPresent: boolean;
    capturedAt: number | null;
    inWindow: boolean;
  }>;
}
```

**Cookie names (canonical):**
- `_ta_attr` — durable UTM cookie (NEW): JSON `{ utm_source, utm_medium, utm_campaign, utm_content, utm_term, campaign_id, adset_id, ad_id, capturedAt }`. 90d, `SameSite=Lax`, `Secure`+`Domain=.toolsaustralia.com.au` in prod, NOT HttpOnly, **first-touch**.
- `_fbc` / `_fbc_ts` — existing (Meta). Unchanged; we additionally synthesize `_fbc` at landing (Task 10).
- `ttclid` (existing) + `ttclid_ts` (NEW companion timestamp).
- `_sc_click` + `_sc_click_ts` (NEW, Snapchat — captured from URL param **`ScCid`**, case-sensitive).
- Klaviyo: **no click cookie** — rides `_ta_attr` (`utm_source=Klaviyo` + `utm_medium=email|sms`).

**Stripe metadata decision keys (NEW):** `attr_platform`, `attr_confidence`, `attr_click_id`, `attr_click_ts`.

---

## File Structure

**Create:**
- `src/types/attribution.ts` — shared types (above).
- `src/services/attribution/platformPriority.ts` — priority+window config table.
- `src/services/attribution/normalizePlatform.ts` — `utm_source`+`utm_medium` → `ConvertingPlatform`.
- `src/services/attribution/resolveConvertingPlatform.ts` — the pure resolver.
- `src/services/attribution/classifyIsRenewal.ts` — renewal classifier.
- `src/services/attribution/__tests__/resolveConvertingPlatform.test.ts` — resolver tests.
- `src/services/attribution/__tests__/normalizePlatform.test.ts` — normalization tests.
- `src/services/attribution/__tests__/classifyIsRenewal.test.ts` — classifier tests.
- `src/utils/tracking/attribution-cookie.ts` — `_ta_attr` read/write (client + server) + serialize/deserialize.
- `src/utils/tracking/attribution-cookie.test` lives under `src/utils/tracking/__tests__/attribution-cookie.test.ts`.
- `src/utils/tracking/snapchat-helpers.ts` — `captureSnapClickId` + `extractSnapContext` (mirrors tiktok-helpers).
- `src/utils/tracking/click-capture.ts` — `captureClickIds()` (client) + `extractClickIdsFromRequest()` (server).
- `src/utils/tracking/resolved-attribution-metadata.ts` — `buildResolvedAttributionMetadata` + `extractResolvedPlatformFromMetadata`.

**Modify:**
- `src/models/PaymentEvent.ts` — new fields + index.
- `src/utils/tracking/tiktok-helpers.ts` — add `ttclid_ts` companion + read it back.
- `src/utils/tracking/facebook-helpers.ts` — synthesize `_fbc` at landing; export `parseFbcCapturedAt`.
- `src/utils/tracking/utm-storage.ts` — write/read `_ta_attr` first (cookie), sessionStorage fallback.
- `src/hooks/useUTMPersistence.ts` — also write the durable cookie.
- `src/components/tracking/ConversionPixels.tsx` — call `captureClickIds()` instead of just `captureTikTokClickId()`.
- `src/hooks/useErrorHandling.ts:227-236` — remove `sessionStorage.clear()`.
- `src/app/api/auth/register/route.ts:201-217` — decouple `signupAttribution` from promo-slug gate.
- `src/utils/payment/payment-processing.ts:168-..,360-449` — accept resolved decision, fallback resolve, persist fields.
- The five `create-*` Stripe routes — edge resolution + metadata stamping (enumerated in Task 12).
- `package.json` — three `test:*` entries.

---

## Phase 1a — Persistence hardening (independently shippable)

### Task 1: Remove the `sessionStorage.clear()` attribution-wipe on 401

**Files:**
- Modify: `src/hooks/useErrorHandling.ts:227-236`

- [ ] **Step 1: Replace the blanket clear with targeted auth-key removal**

In `handleUnauthorized`, replace:

```ts
const handleUnauthorized = () => {
  // Clear any stored authentication data
  localStorage.removeItem("auth-token");
  sessionStorage.clear();

  // Redirect to login page
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
};
```

with:

```ts
const handleUnauthorized = () => {
  // Clear ONLY stored authentication data. Do NOT call sessionStorage.clear() —
  // it nukes attribution (tools-aus:utm-attribution), A/B assignment, promo-link,
  // referral, affiliate, and upsell keys, silently destroying ad attribution for
  // an unauthenticated ad-clicker who hits a single 401 before purchasing.
  // NextAuth's session cookie is the real auth state, not sessionStorage.
  localStorage.removeItem("auth-token");

  // Redirect to login page
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
};
```

- [ ] **Step 2: Verify no other `.clear()` remains and types pass**

Run: `npx tsc --noEmit` (or `npm run type-check`)
Expected: PASS, no new errors.
Run a grep to confirm this was the only one: search `sessionStorage.clear(` across `src/` — expect zero matches after the edit.

- [ ] **Step 3: Commit** (only if commits authorized)

```bash
git add src/hooks/useErrorHandling.ts
git commit -m "fix(tracking): stop wiping UTM/attribution sessionStorage on 401"
```

---

### Task 2: Durable attribution cookie codec (`_ta_attr`)

**Files:**
- Create: `src/utils/tracking/attribution-cookie.ts`
- Create: `src/utils/tracking/__tests__/attribution-cookie.test.ts`
- Modify: `package.json` (add `test:attribution-cookie`)

- [ ] **Step 1: Write the failing test**

`src/utils/tracking/__tests__/attribution-cookie.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  serializeAttributionCookie,
  deserializeAttributionCookie,
} from "@/utils/tracking/attribution-cookie";

// round-trips utm fields + capturedAt
{
  const value = serializeAttributionCookie(
    { utm_source: "Klaviyo", utm_medium: "email", campaign_id: "123" },
    1_700_000_000_000
  );
  const back = deserializeAttributionCookie(value);
  assert.equal(back?.utm_source, "Klaviyo");
  assert.equal(back?.utm_medium, "email");
  assert.equal(back?.campaign_id, "123");
  assert.equal(back?.capturedAt, 1_700_000_000_000);
}

// tolerates garbage
{
  assert.equal(deserializeAttributionCookie("not-json"), null);
  assert.equal(deserializeAttributionCookie(""), null);
}

// drops empty params
{
  assert.equal(serializeAttributionCookie({}, 1), "");
}

console.log("attribution-cookie: all assertions passed");
```

- [ ] **Step 2: Add the npm script and run to confirm it fails**

Add to `package.json` scripts: `"test:attribution-cookie": "tsx src/utils/tracking/__tests__/attribution-cookie.test.ts"`.
Run: `npm run test:attribution-cookie`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Implement `attribution-cookie.ts`**

```ts
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

/** Cookie attribute string. Domain+Secure only in production (apex↔www sharing). */
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
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test:attribution-cookie`
Expected: PASS — "attribution-cookie: all assertions passed".

- [ ] **Step 5: Commit** (if authorized)

```bash
git add src/utils/tracking/attribution-cookie.ts src/utils/tracking/__tests__/attribution-cookie.test.ts package.json
git commit -m "feat(tracking): add durable first-party attribution cookie codec"
```

---

### Task 3: Capture into the durable cookie + read it first at conversion

**Files:**
- Modify: `src/hooks/useUTMPersistence.ts`
- Modify: `src/utils/tracking/utm-storage.ts:34-62` (`getStoredUTMParams`)

- [ ] **Step 1: Write the durable cookie on every UTM-bearing landing**

In `useUTMPersistence.ts`, import and call the cookie writer alongside the existing sessionStorage write:

```ts
import { writeAttributionCookie } from "@/utils/tracking/attribution-cookie";
// ...inside the useEffect, replace the `if (hasAny) { setStoredUTMParams(params); }` block:
    if (hasAny) {
      setStoredUTMParams(params);      // legacy session store (transitional)
      writeAttributionCookie(params);  // durable, login/OAuth-immune, first-touch
    }
```

- [ ] **Step 2: Read the durable cookie first at conversion**

In `utm-storage.ts`, make `getStoredUTMParams` prefer the durable cookie, falling back to sessionStorage:

```ts
import { readAttributionCookieClient } from "@/utils/tracking/attribution-cookie";
// at the top of getStoredUTMParams(), before reading sessionStorage:
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
  // ...existing sessionStorage read continues as fallback
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit** (if authorized)

```bash
git add src/hooks/useUTMPersistence.ts src/utils/tracking/utm-storage.ts
git commit -m "feat(tracking): persist UTM to durable cookie, read it first at conversion"
```

---

### Task 4: Decouple `signupAttribution` from the promo-slug gate

**Files:**
- Modify: `src/app/api/auth/register/route.ts:201-217`

- [ ] **Step 1: Persist attribution even without a promo slug**

Replace `buildSignupAttribution` so the snapshot is written whenever attribution params exist, with `promotionSlug`/`promotionPageType` optional:

```ts
function buildSignupAttribution(
  promotionSlug?: string,
  attribution?: AttributionParams
): {
  promotionPageType?: "evergreen" | "toolset";
  promotionSlug?: string;
  visitedAt: Date;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
} | undefined {
  const hasPromo = !!promotionSlug && isValidPromoSlug(promotionSlug);
  const hasAttribution = !!(
    attribution &&
    (attribution.utm_source || attribution.utm_medium || attribution.utm_campaign ||
     attribution.campaign_id || attribution.adset_id || attribution.ad_id)
  );
  // Write the snapshot if we have EITHER a valid promo slug OR any attribution.
  if (!hasPromo && !hasAttribution) return undefined;
  return {
    ...(hasPromo && {
      promotionPageType: getPageTypeFromSlug(promotionSlug!),
      promotionSlug: promotionSlug!.toLowerCase().trim(),
    }),
    visitedAt: new Date(),
    ...(attribution?.utm_source && { utmSource: attribution.utm_source }),
    ...(attribution?.utm_medium && { utmMedium: attribution.utm_medium }),
    ...(attribution?.utm_campaign && { utmCampaign: attribution.utm_campaign }),
    ...(attribution?.utm_content && { utmContent: attribution.utm_content }),
    ...(attribution?.utm_term && { utmTerm: attribution.utm_term }),
    ...(attribution?.campaign_id && { campaignId: attribution.campaign_id }),
    ...(attribution?.adset_id && { adsetId: attribution.adset_id }),
    ...(attribution?.ad_id && { adId: attribution.ad_id }),
  };
}
```

- [ ] **Step 2: Confirm `User.signupAttribution` schema allows optional promo fields**

Read `src/models/User.ts` around the `signupAttribution` sub-schema (≈974-998). If `promotionSlug`/`promotionPageType` are `required: true`, change them to `required: false`. If already optional, no change.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS. (All four `buildSignupAttribution` call-sites already handle `undefined`.)

- [ ] **Step 4: Commit** (if authorized)

```bash
git add src/app/api/auth/register/route.ts src/models/User.ts
git commit -m "fix(auth): persist signupAttribution from any ad landing, not just promo pages"
```

---

## Phase 1b — Attribution core

### Task 5: PaymentEvent model fields + shared types

**Files:**
- Create: `src/types/attribution.ts` (the Shared contracts block above)
- Modify: `src/models/PaymentEvent.ts`

- [ ] **Step 1: Create `src/types/attribution.ts`**

Paste the entire "Shared contracts" `src/types/attribution.ts` block from the top of this plan.

- [ ] **Step 2: Add fields to `IPaymentEvent` interface**

In `PaymentEvent.ts`, after `attributionCampaignId: string | null;` (line 33), add:

```ts
  // Single-platform attribution (set going forward by the resolver; null for pre-feature rows)
  convertingPlatform: import("@/types/attribution").ConvertingPlatform | null;
  attributionConfidence: import("@/types/attribution").AttributionConfidence | null;
  isRenewal: boolean;
```

- [ ] **Step 3: Add schema fields**

After the `attributionCampaignId` schema field (line 117-121), add:

```ts
    convertingPlatform: {
      type: String,
      enum: ["meta", "tiktok", "snapchat", "klaviyo_email", "klaviyo_sms", "google", "direct", "other"],
      default: null,
    },
    attributionConfidence: {
      type: String,
      enum: ["click", "utm_only", "inferred_backfill"],
      default: null,
    },
    isRenewal: {
      type: Boolean,
      default: false,
    },
```

- [ ] **Step 4: Add the platform aggregation index**

After line 135 (`PaymentEventSchema.index({ packageType: 1, timestamp: -1 });`), add:

```ts
// Revenue-by-platform aggregation (dashboard). attributionConfidence is filtered
// in-memory, NOT part of the index key (low cardinality, poor selectivity).
PaymentEventSchema.index({ convertingPlatform: 1, timestamp: -1 });
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: PASS. (The cached-model delete at lines 139-145 ensures the enum applies on reload.)

- [ ] **Step 6: Commit** (if authorized)

```bash
git add src/types/attribution.ts src/models/PaymentEvent.ts
git commit -m "feat(payment): add convertingPlatform/confidence/isRenewal to PaymentEvent"
```

---

### Task 6: Platform normalization (`utm_source` + `utm_medium` → enum)

**Files:**
- Create: `src/services/attribution/normalizePlatform.ts`
- Create: `src/services/attribution/__tests__/normalizePlatform.test.ts`
- Modify: `package.json` (`test:normalize-platform`)

- [ ] **Step 1: Write the failing test**

`src/services/attribution/__tests__/normalizePlatform.test.ts`:

```ts
import assert from "node:assert/strict";
import { normalizeUtmToPlatform } from "@/services/attribution/normalizePlatform";

assert.equal(normalizeUtmToPlatform("Facebook"), "meta");
assert.equal(normalizeUtmToPlatform("fb"), "meta");
assert.equal(normalizeUtmToPlatform("instagram"), "meta");
assert.equal(normalizeUtmToPlatform("ig"), "meta");
assert.equal(normalizeUtmToPlatform("meta"), "meta");
assert.equal(normalizeUtmToPlatform("TikTok"), "tiktok");
assert.equal(normalizeUtmToPlatform("snap"), "snapchat");
assert.equal(normalizeUtmToPlatform("google"), "google");
assert.equal(normalizeUtmToPlatform("adwords"), "google");
// Klaviyo splits by medium
assert.equal(normalizeUtmToPlatform("Klaviyo", "email"), "klaviyo_email");
assert.equal(normalizeUtmToPlatform("klaviyo", "sms"), "klaviyo_sms");
assert.equal(normalizeUtmToPlatform("klaviyo", "whatsapp"), "other"); // unsupported channel
assert.equal(normalizeUtmToPlatform("klaviyo"), "other");             // no medium → can't split
// unknown / empty
assert.equal(normalizeUtmToPlatform("newsletter"), "other");
assert.equal(normalizeUtmToPlatform(undefined), null);
assert.equal(normalizeUtmToPlatform(""), null);

console.log("normalizePlatform: all assertions passed");
```

- [ ] **Step 2: Add script + run to confirm fail**

Add `"test:normalize-platform": "tsx src/services/attribution/__tests__/normalizePlatform.test.ts"`.
Run: `npm run test:normalize-platform`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/services/attribution/normalizePlatform.ts
// Maps a (dirty) utm_source [+ utm_medium] to a canonical ConvertingPlatform.
// Dirty-UTM casing/aliasing is the #1 DIY-attribution failure mode — normalize here.
import type { ConvertingPlatform } from "@/types/attribution";

const SOURCE_ALIASES: Record<string, ConvertingPlatform> = {
  facebook: "meta", fb: "meta", instagram: "meta", ig: "meta", meta: "meta", fbig: "meta",
  tiktok: "tiktok", tt: "tiktok",
  snapchat: "snapchat", snap: "snapchat",
  google: "google", adwords: "google", googleads: "google",
};

/** Returns null when no source is present; "other" when present but unrecognized. */
export function normalizeUtmToPlatform(
  utmSource?: string | null,
  utmMedium?: string | null
): ConvertingPlatform | null {
  if (!utmSource) return null;
  const src = utmSource.toLowerCase().trim();
  if (!src) return null;

  if (src === "klaviyo") {
    const med = (utmMedium ?? "").toLowerCase().trim();
    if (med === "email") return "klaviyo_email";
    if (med === "sms") return "klaviyo_sms";
    return "other"; // whatsapp/push/unknown channel — not modeled
  }
  return SOURCE_ALIASES[src] ?? "other";
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npm run test:normalize-platform`
Expected: PASS.

- [ ] **Step 5: Commit** (if authorized)

```bash
git add src/services/attribution/normalizePlatform.ts src/services/attribution/__tests__/normalizePlatform.test.ts package.json
git commit -m "feat(attribution): add utm_source/medium platform normalization"
```

---

### Task 7: Priority + window config table

**Files:**
- Create: `src/services/attribution/platformPriority.ts`

- [ ] **Step 1: Implement the config table**

```ts
// src/services/attribution/platformPriority.ts
// The single ordered priority+window table that drives resolution. Adding a platform
// = add one row. Tier 1 (paid clicks) outrank Tier 2 (owned channels). Within a tier,
// most-recent capturedAt wins. Windows are OUR internal click-validity windows,
// independent of each vendor's self-reported dashboard windows (spec D3).
import type { ConvertingPlatform } from "@/types/attribution";

export type AttributionTier = 1 | 2; // 1 = paid clicks, 2 = owned channels

export interface PlatformRule {
  platform: ConvertingPlatform;
  tier: AttributionTier;
  windowDays: number;
}

export const PLATFORM_PRIORITY: PlatformRule[] = [
  { platform: "meta", tier: 1, windowDays: 7 },
  { platform: "tiktok", tier: 1, windowDays: 7 },
  { platform: "snapchat", tier: 1, windowDays: 7 },
  { platform: "google", tier: 1, windowDays: 7 }, // reserved (gclid capture deferred)
  { platform: "klaviyo_email", tier: 2, windowDays: 5 },
  { platform: "klaviyo_sms", tier: 2, windowDays: 5 }, // 5d = Klaviyo SMS *click* default
];

export function windowDaysFor(platform: ConvertingPlatform): number | null {
  return PLATFORM_PRIORITY.find((r) => r.platform === platform)?.windowDays ?? null;
}
```

- [ ] **Step 2: Type-check & commit** (if authorized)

Run: `npm run type-check` → PASS.

```bash
git add src/services/attribution/platformPriority.ts
git commit -m "feat(attribution): add platform priority + window config table"
```

---

### Task 8: The resolver (`resolveConvertingPlatform`)

**Files:**
- Create: `src/services/attribution/resolveConvertingPlatform.ts`
- Create: `src/services/attribution/__tests__/resolveConvertingPlatform.test.ts`
- Modify: `package.json` (`test:converting-platform`)

- [ ] **Step 1: Write the failing test**

`src/services/attribution/__tests__/resolveConvertingPlatform.test.ts`:

```ts
import assert from "node:assert/strict";
import { resolveConvertingPlatform } from "@/services/attribution/resolveConvertingPlatform";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

// 1. Paid beats owned: Meta click + Klaviyo email UTM → meta
{
  const r = resolveConvertingPlatform({
    clicks: [{ platform: "meta", clickId: "fb.1.x", capturedAt: NOW - DAY }],
    utm: { utm_source: "klaviyo", utm_medium: "email" },
    utmCapturedAt: NOW - 2 * DAY,
    now: NOW,
  });
  assert.equal(r.platform, "meta");
  assert.equal(r.confidence, "click");
}

// 2. Recency tiebreak within paid tier: TikTok newer than Meta → tiktok
{
  const r = resolveConvertingPlatform({
    clicks: [
      { platform: "meta", clickId: "m", capturedAt: NOW - 3 * DAY },
      { platform: "tiktok", clickId: "t", capturedAt: NOW - 1 * DAY },
    ],
    now: NOW,
  });
  assert.equal(r.platform, "tiktok");
  assert.equal(r.attributedClickId, "t");
}

// 3. Window expiry: Meta click 8d old (window 7d) → falls through to direct
{
  const r = resolveConvertingPlatform({
    clicks: [{ platform: "meta", clickId: "m", capturedAt: NOW - 8 * DAY }],
    now: NOW,
  });
  assert.equal(r.platform, "direct");
}

// 4. Window boundary: exactly 7d still in-window
{
  const r = resolveConvertingPlatform({
    clicks: [{ platform: "meta", clickId: "m", capturedAt: NOW - 7 * DAY }],
    now: NOW,
  });
  assert.equal(r.platform, "meta");
}

// 5. fbc with null capturedAt (Date.now() guard) cannot win as a click → utm fallback
{
  const r = resolveConvertingPlatform({
    clicks: [{ platform: "meta", clickId: "m", capturedAt: null }],
    utm: { utm_source: "tiktok" },
    utmCapturedAt: NOW - DAY,
    now: NOW,
  });
  assert.equal(r.platform, "tiktok");
  assert.equal(r.confidence, "utm_only");
}

// 6. Klaviyo SMS via UTM, no paid click → klaviyo_sms, utm_only
{
  const r = resolveConvertingPlatform({
    clicks: [],
    utm: { utm_source: "Klaviyo", utm_medium: "sms" },
    utmCapturedAt: NOW - 2 * DAY,
    now: NOW,
  });
  assert.equal(r.platform, "klaviyo_sms");
  assert.equal(r.confidence, "utm_only");
}

// 7. Klaviyo UTM beyond its 5d window → direct
{
  const r = resolveConvertingPlatform({
    clicks: [],
    utm: { utm_source: "klaviyo", utm_medium: "email" },
    utmCapturedAt: NOW - 6 * DAY,
    now: NOW,
  });
  assert.equal(r.platform, "direct");
}

// 8. Nothing at all → direct, utm_only
{
  const r = resolveConvertingPlatform({ clicks: [], now: NOW });
  assert.equal(r.platform, "direct");
}

// 9. observedTouches records everything seen
{
  const r = resolveConvertingPlatform({
    clicks: [{ platform: "meta", clickId: "m", capturedAt: NOW - 1 * DAY }],
    now: NOW,
  });
  assert.equal(r.observedTouches.length, 1);
  assert.equal(r.observedTouches[0].inWindow, true);
}

console.log("resolveConvertingPlatform: all assertions passed");
```

- [ ] **Step 2: Add script + run to confirm fail**

Add `"test:converting-platform": "tsx src/services/attribution/__tests__/resolveConvertingPlatform.test.ts"`.
Run: `npm run test:converting-platform`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the resolver**

```ts
// src/services/attribution/resolveConvertingPlatform.ts
// Pure, total, never-throws resolver. Priority ladder + recency tiebreak (spec D1/D3).
// A click with capturedAt === null cannot win as a "click" (we can't trust its recency;
// guards the fbc Date.now() fallback in facebook-helpers.ts) — it degrades to utm fallback.
import type { ConvertingPlatform, ResolveInput, ResolveResult } from "@/types/attribution";
import { PLATFORM_PRIORITY, windowDaysFor } from "@/services/attribution/platformPriority";
import { normalizeUtmToPlatform } from "@/services/attribution/normalizePlatform";

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveConvertingPlatform(input: ResolveInput): ResolveResult {
  const { clicks, utm, utmCapturedAt, now } = input;

  const observedTouches: ResolveResult["observedTouches"] = [];

  // Tier-1 paid clicks with a TRUSTWORTHY (non-null) capturedAt inside their window.
  const eligible: Array<{ platform: ConvertingPlatform; clickId: string; capturedAt: number; windowDays: number }> = [];
  for (const c of clicks) {
    const windowDays = windowDaysFor(c.platform) ?? 7;
    const inWindow = c.capturedAt != null && now - c.capturedAt <= windowDays * DAY_MS && now - c.capturedAt >= 0;
    observedTouches.push({
      platform: c.platform,
      clickIdPresent: !!c.clickId,
      capturedAt: c.capturedAt,
      inWindow,
    });
    if (c.capturedAt != null && inWindow) {
      eligible.push({ platform: c.platform, clickId: c.clickId, capturedAt: c.capturedAt, windowDays });
    }
  }

  if (eligible.length > 0) {
    // Most-recent capturedAt wins within the paid tier.
    eligible.sort((a, b) => b.capturedAt - a.capturedAt);
    const win = eligible[0];
    return {
      platform: win.platform,
      confidence: "click",
      attributedClickId: win.clickId,
      attributedClickTimestamp: win.capturedAt,
      windowDays: win.windowDays,
      observedTouches,
    };
  }

  // Fallback: normalized utm_source (+ medium). Tier-2 owned channels also resolve here,
  // honoring their window against utmCapturedAt.
  const utmPlatform = normalizeUtmToPlatform(utm?.utm_source, utm?.utm_medium);
  if (utmPlatform && utmPlatform !== "other") {
    const windowDays = windowDaysFor(utmPlatform);
    const withinUtmWindow =
      windowDays == null || // platforms not in the table (none today) → accept
      utmCapturedAt == null || // no timestamp → accept as utm_only (best effort)
      (now - utmCapturedAt <= windowDays * DAY_MS && now - utmCapturedAt >= 0);
    if (withinUtmWindow) {
      return {
        platform: utmPlatform,
        confidence: "utm_only",
        attributedClickId: null,
        attributedClickTimestamp: utmCapturedAt ?? null,
        windowDays: windowDays ?? null,
        observedTouches,
      };
    }
  }

  // present-but-unrecognized source → "other"; recognized-but-expired or absent → "direct".
  const finalPlatform: ConvertingPlatform = utmPlatform === "other" ? "other" : "direct";
  return {
    platform: finalPlatform,
    confidence: "utm_only",
    attributedClickId: null,
    attributedClickTimestamp: null,
    windowDays: null,
    observedTouches,
  };
}
```

> Note on test #8: input has no `utm_source`, so it returns `direct`. Test #6/#7 cover the owned-channel window. Verify the `eligible.length === 0 && utmPlatform === "other"` path returns `other` only when `utm_source` is present — matches test expectations.

- [ ] **Step 4: Run to confirm pass**

Run: `npm run test:converting-platform`
Expected: PASS — all 9 assertions.

- [ ] **Step 5: Commit** (if authorized)

```bash
git add src/services/attribution/resolveConvertingPlatform.ts src/services/attribution/__tests__/resolveConvertingPlatform.test.ts package.json
git commit -m "feat(attribution): add config-driven single-platform resolver"
```

---

### Task 9: Renewal classifier

**Files:**
- Create: `src/services/attribution/classifyIsRenewal.ts`
- Create: `src/services/attribution/__tests__/classifyIsRenewal.test.ts`
- Modify: `package.json` (`test:classify-renewal`)

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { classifyIsRenewal } from "@/services/attribution/classifyIsRenewal";

// First subscription payment is NOT a renewal
assert.equal(classifyIsRenewal({ billingReason: "subscription_create" }), false);
// Recurring cycle IS a renewal
assert.equal(classifyIsRenewal({ billingReason: "subscription_cycle" }), true);
// Mid-cycle upgrade is NOT a renewal (would otherwise inflate "new revenue")
assert.equal(classifyIsRenewal({ billingReason: "subscription_update", isUpgrade: true }), false);
// Resubscribe is NOT a renewal
assert.equal(classifyIsRenewal({ billingReason: "subscription_cycle", isResubscribe: true }), false);
// One-time payments (no billing reason) are NOT renewals
assert.equal(classifyIsRenewal({ billingReason: undefined }), false);

console.log("classifyIsRenewal: all assertions passed");
```

- [ ] **Step 2: Add script + run to confirm fail**

Add `"test:classify-renewal": "tsx src/services/attribution/__tests__/classifyIsRenewal.test.ts"`.
Run: `npm run test:classify-renewal` → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/services/attribution/classifyIsRenewal.ts
// A "renewal" = a recurring billing cycle that is NOT a first charge, upgrade, or resubscribe.
// Excluding subscription_update prevents mid-cycle upgrades being miscounted as new revenue.
export function classifyIsRenewal(input: {
  billingReason?: string;
  isUpgrade?: boolean;
  isResubscribe?: boolean;
}): boolean {
  const { billingReason, isUpgrade, isResubscribe } = input;
  if (!billingReason) return false;
  if (billingReason === "subscription_create") return false;
  if (isUpgrade || isResubscribe) return false;
  return billingReason === "subscription_cycle";
}
```

- [ ] **Step 4: Run to confirm pass** → `npm run test:classify-renewal` → PASS.

- [ ] **Step 5: Commit** (if authorized)

```bash
git add src/services/attribution/classifyIsRenewal.ts src/services/attribution/__tests__/classifyIsRenewal.test.ts package.json
git commit -m "feat(attribution): add isRenewal classifier excluding upgrades/resubscribes"
```

---

### Task 10: Capture all click IDs (TikTok ts, Snapchat ScCid, synthesized _fbc, registry)

**Files:**
- Modify: `src/utils/tracking/tiktok-helpers.ts`
- Modify: `src/utils/tracking/facebook-helpers.ts`
- Create: `src/utils/tracking/snapchat-helpers.ts`
- Create: `src/utils/tracking/click-capture.ts`
- Modify: `src/components/tracking/ConversionPixels.tsx:41`

- [ ] **Step 1: TikTok — persist a companion `ttclid_ts` and expose it**

In `tiktok-helpers.ts`, add a timestamp cookie write in `captureTikTokClickId` and a reader:

```ts
const TTCLID_TS_COOKIE = "ttclid_ts";
// inside captureTikTokClickId, when writing the ttclid cookie from the URL:
    if (fromUrl) {
      document.cookie = `${TTCLID_COOKIE}=${encodeURIComponent(fromUrl)}; path=/; max-age=${TTCLID_MAX_AGE_SECONDS}; SameSite=Lax`;
      document.cookie = `${TTCLID_TS_COOKIE}=${Date.now()}; path=/; max-age=${TTCLID_MAX_AGE_SECONDS}; SameSite=Lax`;
      return fromUrl;
    }
// add to extractTikTokContext return: read TTCLID_TS_COOKIE and include capturedAt
export function extractTikTokCapturedAt(request: {
  cookies?: { get: (name: string) => { value: string } | undefined };
}): number | null {
  const ts = request.cookies?.get(TTCLID_TS_COOKIE)?.value;
  return ts && /^\d+$/.test(ts) ? Number(ts) : null;
}
```

- [ ] **Step 2: Facebook — synthesize `_fbc` at landing + parse capturedAt from fbc**

In `facebook-helpers.ts`, export a helper to write the full `_fbc` (not just `_fbc_ts`) when a fbclid lands, and a parser:

```ts
const FBC_COOKIE = "_fbc";
/** At landing: persist the full synthesized fb.1.<ts>.<fbclid> so ITP/ad-block users
 *  (no Meta SDK) and post-OAuth visits (URL no longer carries fbclid) still resolve. */
export function persistSyntheticFbcFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    if (readBrowserCookie(FBC_COOKIE)) return; // don't clobber Meta SDK's own cookie
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (!fbclid) return;
    const fbc = buildFbcFromFbclid(fbclid, /* persist */ true); // also writes _fbc_ts
    writeBrowserCookie(FBC_COOKIE, fbc, FBC_COOKIE_MAX_AGE_SECONDS);
  } catch { /* best-effort */ }
}
/** Parse the capture timestamp out of an fbc string (fb.1.<ts>.<fbclid>). null if absent. */
export function parseFbcCapturedAt(fbc?: string | null): number | null {
  if (!fbc) return null;
  const parts = fbc.split(".");
  if (parts.length < 4) return null;
  const ts = parts[2];
  return /^\d+$/.test(ts) ? Number(ts) : null;
}
```

- [ ] **Step 3: Snapchat — new capture (ScCid, case-sensitive) + server extract**

Create `src/utils/tracking/snapchat-helpers.ts`:

```ts
// src/utils/tracking/snapchat-helpers.ts
// Snapchat click id arrives as `?ScCid=` (CASE-SENSITIVE) on ad-click landings.
// Captured from URL as ScCid; sent to the Conversions API as `sc_click_id` (Task: future
// Snap CAPI). Persisted to a first-party cookie + companion timestamp for the resolver.
const SC_CLICK_COOKIE = "_sc_click";
const SC_CLICK_TS_COOKIE = "_sc_click_ts";
const SC_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

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
    // URLSearchParams.get is case-sensitive — must request "ScCid" exactly.
    const fromUrl = new URLSearchParams(window.location.search).get("ScCid");
    if (fromUrl) {
      document.cookie = `${SC_CLICK_COOKIE}=${encodeURIComponent(fromUrl)}; path=/; max-age=${SC_MAX_AGE_SECONDS}; SameSite=Lax`;
      document.cookie = `${SC_CLICK_TS_COOKIE}=${Date.now()}; path=/; max-age=${SC_MAX_AGE_SECONDS}; SameSite=Lax`;
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
```

- [ ] **Step 4: Registry-driven client capture + server extract**

Create `src/utils/tracking/click-capture.ts`:

```ts
// src/utils/tracking/click-capture.ts
// One entry point for capturing all click IDs on mount, and one for reading them
// server-side into the resolver's PaidClickSignal[] shape.
import type { PaidClickSignal } from "@/types/attribution";
import { captureTikTokClickId, extractTikTokContext, extractTikTokCapturedAt } from "@/utils/tracking/tiktok-helpers";
import { captureSnapClickId, extractSnapContext } from "@/utils/tracking/snapchat-helpers";
import { persistSyntheticFbcFromUrl, getFBCFromURL, parseFbcCapturedAt, extractFBCFromRequest } from "@/utils/tracking/facebook-helpers";

/** CLIENT: capture every platform's click id on mount. No-op when no param present. */
export function captureClickIds(): void {
  persistSyntheticFbcFromUrl(); // Meta: synthesize _fbc so it survives without the SDK
  captureTikTokClickId();       // TikTok: ttclid + ttclid_ts
  captureSnapClickId();         // Snapchat: ScCid → _sc_click + _sc_click_ts
  // Meta's _fbc/_fbp may also be set by the SDK; getFBCFromURL handles both at read time.
}

/** SERVER: read all paid click signals from a NextRequest-like object. */
export function extractClickIdsFromRequest(request: {
  url?: string;
  headers?: Headers;
  cookies?: { get: (name: string) => { value: string } | undefined };
}): PaidClickSignal[] {
  const signals: PaidClickSignal[] = [];

  const fbc = extractFBCFromRequest(request);
  if (fbc) signals.push({ platform: "meta", clickId: fbc, capturedAt: parseFbcCapturedAt(fbc) });

  const tt = extractTikTokContext(request);
  if (tt.ttclid) signals.push({ platform: "tiktok", clickId: tt.ttclid, capturedAt: extractTikTokCapturedAt(request) });

  const sc = extractSnapContext(request);
  if (sc.scClickId) signals.push({ platform: "snapchat", clickId: sc.scClickId, capturedAt: sc.capturedAt });

  return signals;
}
```

> `getFBCFromURL` import is intentional for parity even if unused here; remove if the linter (no-unused-vars) flags it.

- [ ] **Step 5: Wire `captureClickIds()` into ConversionPixels**

In `ConversionPixels.tsx`, replace the import and the call:

```ts
import { captureClickIds } from "@/utils/tracking/click-capture";
// ...inside the mount effect, replace `captureTikTokClickId();` with:
    captureClickIds();
```

- [ ] **Step 6: Type-check & lint**

Run: `npm run type-check && npm run lint`
Expected: PASS (resolve any no-unused-vars by deleting unused imports).

- [ ] **Step 7: Commit** (if authorized)

```bash
git add src/utils/tracking/tiktok-helpers.ts src/utils/tracking/facebook-helpers.ts src/utils/tracking/snapchat-helpers.ts src/utils/tracking/click-capture.ts src/components/tracking/ConversionPixels.tsx
git commit -m "feat(tracking): capture all click IDs (ttclid ts, ScCid, synthetic _fbc) via registry"
```

---

### Task 11: Resolved-attribution Stripe-metadata codec

**Files:**
- Create: `src/utils/tracking/resolved-attribution-metadata.ts`

- [ ] **Step 1: Implement build + extract**

```ts
// src/utils/tracking/resolved-attribution-metadata.ts
// Stamps the RESOLVED decision into Stripe metadata at the edge, and reads it back in
// the webhook. Keys: attr_platform, attr_confidence, attr_click_id, attr_click_ts.
import type { ConvertingPlatform, AttributionConfidence, ResolveResult } from "@/types/attribution";

export function buildResolvedAttributionMetadata(r: ResolveResult): Record<string, string> {
  const meta: Record<string, string> = {
    attr_platform: r.platform,
    attr_confidence: r.confidence,
  };
  if (r.attributedClickId) meta.attr_click_id = r.attributedClickId.slice(0, 500);
  if (r.attributedClickTimestamp != null) meta.attr_click_ts = String(r.attributedClickTimestamp);
  return meta;
}

export function extractResolvedPlatformFromMetadata(metadata: Record<string, string> | null | undefined): {
  platform: ConvertingPlatform;
  confidence: AttributionConfidence;
  attributedClickId: string | null;
  attributedClickTimestamp: number | null;
} | null {
  if (!metadata?.attr_platform) return null;
  const ts = metadata.attr_click_ts;
  return {
    platform: metadata.attr_platform as ConvertingPlatform,
    confidence: (metadata.attr_confidence as AttributionConfidence) ?? "utm_only",
    attributedClickId: metadata.attr_click_id ?? null,
    attributedClickTimestamp: ts && /^\d+$/.test(ts) ? Number(ts) : null,
  };
}
```

- [ ] **Step 2: Type-check & commit** (if authorized)

Run: `npm run type-check` → PASS.

```bash
git add src/utils/tracking/resolved-attribution-metadata.ts
git commit -m "feat(tracking): add resolved-attribution Stripe metadata codec"
```

---

### Task 12: Edge resolution + metadata stamping in the 5 create-routes

**Files (enumerate — confirm each before editing):**
- Modify: `src/app/api/stripe/create-subscription/route.ts`
- Modify: `src/app/api/stripe/create-subscription-existing-user/route.ts`
- Modify: `src/app/api/stripe/create-one-time-purchase/route.ts`
- Modify: `src/app/api/stripe/create-one-time-purchase-existing-user/route.ts`
- Modify: `src/app/api/payment-intent/route.ts`

> First action: `grep -rn "buildAttributionMetadata" src/app/api` to confirm the exact file list and the variable name each route uses for the attribution object. Edit the confirmed set; do not assume.

- [ ] **Step 1: Add a shared edge-resolution helper**

Create `src/services/attribution/resolveAtEdge.ts`:

```ts
// src/services/attribution/resolveAtEdge.ts
// Server-side glue: read cookies off the request, resolve, return the decision + the
// metadata to stamp. Used by every create-* route so resolution lives in ONE place.
import type { NextRequest } from "next/server";
import { extractClickIdsFromRequest } from "@/utils/tracking/click-capture";
import { readAttributionCookieFromRequest } from "@/utils/tracking/attribution-cookie";
import { resolveConvertingPlatform } from "@/services/attribution/resolveConvertingPlatform";
import { buildResolvedAttributionMetadata } from "@/utils/tracking/resolved-attribution-metadata";
import type { ResolveResult } from "@/types/attribution";

export function resolveAttributionAtEdge(request: NextRequest): {
  decision: ResolveResult;
  metadata: Record<string, string>;
} {
  try {
    const clicks = extractClickIdsFromRequest(request);
    const attr = readAttributionCookieFromRequest(request);
    const decision = resolveConvertingPlatform({
      clicks,
      utm: attr ? { utm_source: attr.utm_source, utm_medium: attr.utm_medium } : undefined,
      utmCapturedAt: attr?.capturedAt ?? null,
      now: Date.now(),
    });
    return { decision, metadata: buildResolvedAttributionMetadata(decision) };
  } catch {
    // Never block a payment on attribution. Default to direct.
    const decision: ResolveResult = {
      platform: "direct", confidence: "utm_only",
      attributedClickId: null, attributedClickTimestamp: null, windowDays: null, observedTouches: [],
    };
    return { decision, metadata: { attr_platform: "direct", attr_confidence: "utm_only" } };
  }
}
```

- [ ] **Step 2: Stamp the decision into metadata in each create-route**

In each route, where `buildAttributionMetadata(...)` is spread into the Stripe `metadata` object (PaymentIntent for one-time; Subscription for subs), add the resolved decision. Example for `create-subscription/route.ts` (subscription metadata = sticky for renewals):

```ts
import { resolveAttributionAtEdge } from "@/services/attribution/resolveAtEdge";
// ...near where the request `req`/`request` is available and metadata is built:
const { metadata: resolvedAttr } = resolveAttributionAtEdge(request);
// then in the subscription create params metadata:
metadata: {
  ...existingMetadata,
  ...buildAttributionMetadata(attribution),
  ...resolvedAttr, // attr_platform / attr_confidence / attr_click_id / attr_click_ts
},
```

For `create-one-time-purchase*` and `payment-intent`, spread `resolvedAttr` into the **PaymentIntent** `metadata` instead. **`payment-intent/route.ts` currently reads no cookies** — `resolveAttributionAtEdge(request)` fixes that by reading them server-side.

- [ ] **Step 3: Type-check, lint, build**

Run: `npm run type-check && npm run lint`
Expected: PASS. Spot-check each route diff: `resolvedAttr` is spread into the correct metadata object (subscription vs PI).

- [ ] **Step 4: Commit** (if authorized)

```bash
git add src/services/attribution/resolveAtEdge.ts src/app/api/stripe/create-subscription/route.ts src/app/api/stripe/create-subscription-existing-user/route.ts src/app/api/stripe/create-one-time-purchase/route.ts src/app/api/stripe/create-one-time-purchase-existing-user/route.ts src/app/api/payment-intent/route.ts
git commit -m "feat(attribution): resolve converting platform at the create-* edge and stamp Stripe metadata"
```

---

### Task 13: Webhook — persist decision + fallback resolve + isRenewal

**Files:**
- Modify: `src/services/stripe-webhook-handlers/index.ts` (extract decision near each `extractAttributionFromMetadata` call)
- Modify: `src/utils/payment/payment-processing.ts:168-256` (signature) and `:360-449` (persist)

- [ ] **Step 1: Extend `processPaymentBenefits` to accept the resolved decision**

Add an optional param to both `processPaymentBenefits` and `processPaymentBenefitsInternal` (after `sessionAttribution`):

```ts
  resolvedAttribution?: {
    platform: import("@/types/attribution").ConvertingPlatform;
    confidence: import("@/types/attribution").AttributionConfidence;
    attributedClickId: string | null;
    attributedClickTimestamp: number | null;
  } | null,
```

Thread it through the internal delegation call (the existing `processWithRetry(...)` / `processPaymentBenefitsInternal(...)` argument list).

- [ ] **Step 2: Compute the fields at the PaymentEvent.create site**

In `payment-processing.ts`, just before `await PaymentEvent.create({...})` (≈line 435), add:

```ts
import { classifyIsRenewal } from "@/services/attribution/classifyIsRenewal";
import { resolveConvertingPlatform } from "@/services/attribution/resolveConvertingPlatform";
import { normalizeUtmToPlatform } from "@/services/attribution/normalizePlatform";

// Single-platform attribution. Prefer the edge decision; fall back to a session/signup
// UTM resolve when none was stamped (e.g. payment-intent route, force-charge, legacy).
const isRenewal = classifyIsRenewal({
  billingReason,
  isResubscribe,
  // isUpgrade is derived upstream in the webhook; pass false here if not provided.
});

let convertingPlatform = resolvedAttribution?.platform ?? null;
let attributionConfidence = resolvedAttribution?.confidence ?? null;
let attributedClickId = resolvedAttribution?.attributedClickId ?? null;
let attributedClickTimestamp = resolvedAttribution?.attributedClickTimestamp ?? null;

if (!convertingPlatform) {
  // Fallback: resolve from session/signup UTM already merged into attributionData.
  const fallbackPlatform = normalizeUtmToPlatform(
    (attributionData.utmSource as string) ?? undefined,
    (attributionData.utmMedium as string) ?? undefined
  );
  if (fallbackPlatform) {
    convertingPlatform = fallbackPlatform === "other" ? "other" : fallbackPlatform;
    attributionConfidence = "utm_only";
  } else {
    convertingPlatform = "direct";
    attributionConfidence = "utm_only";
  }
}
```

- [ ] **Step 3: Write the fields onto the PaymentEvent + evidence into `data`**

In the `PaymentEvent.create({...})` object, add after `...buildAttributionFields(sessionAttribution),`:

```ts
          convertingPlatform,
          attributionConfidence,
          isRenewal,
```

And add the audit evidence into `paymentEventData` (the `data` object built above) before create:

```ts
          // (where paymentEventData is assembled)
          if (attributedClickId) paymentEventData.attributedClickId = attributedClickId;
          if (attributedClickTimestamp != null) paymentEventData.attributedClickTimestamp = attributedClickTimestamp;
```

- [ ] **Step 4: Wire the decision in the webhook handlers**

In `stripe-webhook-handlers/index.ts`, next to each `const sessionAttribution = extractAttributionFromMetadata(...)` (lines ≈984, 1154, 1304, 3828), also extract the decision and pass it through:

```ts
import { extractResolvedPlatformFromMetadata } from "@/utils/tracking/resolved-attribution-metadata";
// one-time/upsell/mini-draw (PaymentIntent metadata):
const resolvedAttribution = extractResolvedPlatformFromMetadata(paymentIntent.metadata);
// subscription/renewal (subscription metadata first, then invoice) — mirrors sessionAttribution:
const resolvedAttribution =
  extractResolvedPlatformFromMetadata(subscription?.metadata) ??
  extractResolvedPlatformFromMetadata(expandedInvoice.metadata);
// pass as the new trailing arg to processPaymentBenefits(...):
  sessionAttribution,
  resolvedAttribution,
```

For the renewal path, also compute `isUpgrade` from the flags already present at `index.ts:3509-3533` and pass it into `classifyIsRenewal` via `processPaymentBenefits` (add an `isUpgrade` field to the `resolvedAttribution` plumbing or a separate param — keep it explicit).

- [ ] **Step 5: Type-check, lint, build**

Run: `npm run type-check && npm run lint && npm run build`
Expected: PASS. Build must succeed (Turbopack).

- [ ] **Step 6: Manual end-to-end smoke (staging)**

Per spec §10: add the staging host to `NEXT_PUBLIC_PIXEL_ALLOWED_HOSTNAMES` and set `NEXT_PUBLIC_ENABLE_PIXEL_TESTING`, then:
1. Land on a staging URL with `?fbclid=test123&utm_source=facebook`.
2. Complete a test purchase.
3. Confirm the `BenefitsGranted` PaymentEvent has `convertingPlatform: "meta"`, `attributionConfidence: "click"`.
4. Land with `?utm_source=Klaviyo&utm_medium=email`, purchase, confirm `klaviyo_email` / `utm_only`.

- [ ] **Step 7: Commit** (if authorized)

```bash
git add src/services/stripe-webhook-handlers/index.ts src/utils/payment/payment-processing.ts
git commit -m "feat(attribution): persist convertingPlatform on PaymentEvent with webhook fallback + sticky renewals"
```

---

### Task 14: Documentation (doc-sync hook requirement)

**Files:**
- Modify: `docs/tracking/*` (architecture.md, models.md, backend.md, frontend.md, gotchas.md, rules.md, EVENT_PARAMETER_MATRIX.md, KLAVIYO_INTEGRATION.md)
- Modify: `docs/payment/*` (models.md, architecture.md, backend.md, gotchas.md)
- Modify: `docs/PAYMENT_ATTRIBUTION.md`, `docs/UTM_ATTRIBUTION.md`
- Modify: `CLAUDE.md` Domain Manifest — add `src/services/attribution/**` and `src/types/attribution.ts` to the `tracking` domain `paths`.

- [ ] **Step 1: Add the new module paths to the manifest**

In `CLAUDE.md` (both repo-root and worktree copies), under the `tracking` domain `paths`, add: `"src/services/attribution/**"`, `"src/types/attribution.ts"`, `"src/utils/tracking/attribution-cookie.ts"`, `"src/utils/tracking/snapchat-helpers.ts"`, `"src/utils/tracking/click-capture.ts"`, `"src/utils/tracking/resolved-attribution-metadata.ts"`, `"src/services/attribution/resolveAtEdge.ts"`.

- [ ] **Step 2: Document the feature** in `docs/tracking/architecture.md` and `docs/PAYMENT_ATTRIBUTION.md`: the Send-vs-Count principle, the durable `_ta_attr` cookie, the click-capture registry, the resolver priority+window table, the `convertingPlatform`/`attributionConfidence`/`isRenewal` fields, sticky renewals, and the honest limits from spec §10 (view-through unreconcilable; ledger = click-based only). Update `docs/tracking/KLAVIYO_INTEGRATION.md` with the UTM-tuple (not `_kx`) attribution rule + the auto-UTM prerequisite.

- [ ] **Step 3: Run the doc-sync audit**

Run: the `/doc-sync` skill (or `node .claude/hooks/doc-sync.mjs` if invocable) — confirm no orphans/ghosts and no `BLOCKED: Stale docs`.

- [ ] **Step 4: Commit** (if authorized)

```bash
git add docs/ CLAUDE.md
git commit -m "docs(tracking,payment): document single-platform attribution + manifest paths"
```

---

## Follow-up plans (separate files, after Phase 1 lands)

These depend on Phase 1's field names being concrete on disk and are independently shippable — they get their own plans rather than bloating this one:

- **Phase 2 — Dashboard (`docs/superpowers/plans/…-phase2.md`):** extend `DashboardStatsDailySnapshot` with `attributedRevenue: Map<platform, {revenueCents, conversions, byConfidence}>`; group `revenueAggregator.ts` + `distinctUserCounts.ts` by `convertingPlatform`; surface per-platform attributed revenue + true ROAS in `GET /api/admin/dashboard/stats` and the admin UI. Domain: `admin`, `metrics-analytics`.
- **Phase 3 — Backfill (`docs/superpowers/plans/…-phase3.md`):** `scripts/backfill-converting-platform.ts` (+ `:dry`) deriving `inferred_backfill` rows from normalized historical `data.utmSource`/`attribution*`, never overwriting `click`/`utm_only`; append-mode audit log. Domain: `infrastructure`/`payment`.

---

## Self-Review

**Spec coverage (v2 §3):** §3.1 data model → Task 5 ✓. §3.2 durable cookie + capture (ScCid, ttclid ts, synthetic _fbc, no _kx) → Tasks 2,3,10 ✓. §3.3 resolver + normalization + fbc null-ts guard → Tasks 6,7,8 ✓. §3.4 hybrid edge+webhook write path across all 5 routes → Tasks 12,13 ✓. §3.7 persistence (401 clear, durable cookie, signupAttribution decouple, cookie attrs) → Tasks 1,2,3,4,10 ✓. isRenewal excl. upgrades → Task 9 ✓. Docs (§7) → Task 14 ✓. §3.5 dashboard + §3.6 backfill → deferred to Phase 2/3 plans (noted) ✓.

**Placeholder scan:** No "TBD"/"handle edge cases" — every code step has concrete code; integration steps name exact files + lines and require a confirming grep before edit. Manual staging steps are explicit.

**Type consistency:** `ConvertingPlatform`/`AttributionConfidence`/`PaidClickSignal`/`ResolveInput`/`ResolveResult` defined once in `src/types/attribution.ts` (Task 5) and referenced identically in Tasks 6–13. Function names stable: `resolveConvertingPlatform`, `normalizeUtmToPlatform`, `classifyIsRenewal`, `captureClickIds`, `extractClickIdsFromRequest`, `buildResolvedAttributionMetadata`, `extractResolvedPlatformFromMetadata`, `resolveAttributionAtEdge`. Cookie names (`_ta_attr`, `ttclid_ts`, `_sc_click`/`_sc_click_ts`) and metadata keys (`attr_platform`/`attr_confidence`/`attr_click_id`/`attr_click_ts`) consistent across Tasks 2,10,11,12,13.
