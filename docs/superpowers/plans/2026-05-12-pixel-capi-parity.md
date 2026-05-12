# Pixel ↔ CAPI Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift Meta Event Match Quality and parameter parity across every browser ↔ CAPI Purchase flow, plus close the worst gap (Advanced Matching is not configured at all) so every browser-fired event picks up hashed PII for cross-device attribution.

**Architecture:** Two-step Advanced Matching (anon `fbq('init')` at top of layout + post-login `fbq('init', pixelId, AM)` re-init from a component mounted inside `UserProvider` so it can read the active user). Browser provider gets a `package_type` mapping and call sites get `contentIds` / `numItems`. Synthetic UA fallback is removed. The legacy `/api/facebook/track` shim and the duplicate Purchase fire in `PaymentProcessingScreen` are deleted. Two missing-event gaps (AddPaymentInfo, InitiateCheckout-on-signup) are wired up.

**Tech Stack:** Next.js 15 App Router · React 19 · next-auth · TypeScript · Mongoose · Stripe · `tsx` standalone test scripts (no jest/vitest).

**Spec:** [`docs/tracking/SPEC_PIXEL_CAPI_PARITY.md`](../../tracking/SPEC_PIXEL_CAPI_PARITY.md)

---

## Scope

This plan implements Phases **1, 3, 4, 5, 6** from the spec.

**Phase 2 (Shop checkout CAPI) is deliberately deferred** — the shop is not yet live, has no products, and has no published terms. There is no production attribution gap to close until the shop launches. When that happens, lift Phase 2 from the spec into its own follow-up plan; nothing here blocks it.

---

## Important repo conventions

- **No auto-commit.** [`CLAUDE.md`](../../../CLAUDE.md) hard rule: never run `git commit` / `git add` / `git push` / `gh pr` unless the user explicitly authorizes with `commit`, `push`, `merge`, or `ship it` in their *most recent* message. Every task lists the suggested commit command; you must ask the user before running it. Stop after the test/type-check step.
- **Tests are tsx scripts.** Pattern: `import assert from "node:assert/strict"`; mock `global.fetch`; snapshot/restore `process.env`. See [`src/lib/__tests__/facebook.test.ts`](../../../src/lib/__tests__/facebook.test.ts) and [`src/lib/tracking/__tests__/dispatch.test.ts`](../../../src/lib/tracking/__tests__/dispatch.test.ts) for canonical examples.
- **Every new test needs a `test:<scope>` script in [`package.json`](../../../package.json).** `npm test` alone only runs anchor-billing.
- **Production builds strip `console.log` / `info` / `debug` / `warn`** (`next.config.ts` `compiler.removeConsole`). For ad-hoc debug on staging use `console.error` — see the [tracking gotchas](../../tracking/gotchas.md). Don't ship debug logs.
- **Path alias:** `@/` maps to `src/`.
- **Browser-side hash function:** `hashData` from [`src/lib/facebook.ts`](../../../src/lib/facebook.ts) (uses `crypto`). Server-side uses `hashPII` from [`src/lib/tracking/canonical-event.ts`](../../../src/lib/tracking/canonical-event.ts) — same SHA-256 of lowercase+trimmed input. Identical hashes on both sides is the whole point of Advanced Matching, so use the same normalization.

---

## File structure

**Created (3 files):**

| Path | Responsibility |
|---|---|
| `src/lib/tracking/advanced-matching.ts` | Pure helper: `buildAdvancedMatching(user) → AdvancedMatchingFields`. Hashes PII, drops undefined fields, normalizes country. Used by both the inline init (via stringification) and the post-login re-init. |
| `src/lib/tracking/__tests__/advanced-matching.test.ts` | Unit tests covering field-by-field hashing, undefined-field stripping, phone digit cleaning, country normalization. |
| `src/components/tracking/ConversionPixelsAdvancedMatching.tsx` | Client component mounted **inside `<UserProvider>`** (so it can read user data). Subscribes to `useUserContext()`. On user-data change, calls `window.fbq('init', pixelId, AM)` to re-init in place. |

**Modified (~13 files):**

| Path | Change |
|---|---|
| `src/lib/tracking/providers/facebook.ts` | (a) `loadPixel` accepts optional `advancedMatching` and embeds it in the inline init script; (b) `pixelTrack` maps `customData.packageType` → `package_type` |
| `src/components/tracking/ConversionPixels.tsx` | No code change — note that initial AM is empty by design (above UserProvider); the new post-login component handles it |
| `src/app/providers.tsx` | Mount `<ConversionPixelsAdvancedMatching />` as a child of `<UserProvider>` |
| `src/components/modals/MembershipModal.tsx` | Pass `contentIds` + `numItems` to `buildPurchaseEvent` in both handlers (existing-user `handlePaymentProcessingSuccess` and new-user `handlePaymentSuccess`) |
| `src/components/modals/UpsellModal.tsx` | Same |
| `src/components/modals/SpecialPackagesModal.tsx` | Same |
| `src/components/features/MiniDrawPackages.tsx` | Same |
| `src/app/(site)/upsell-success/components/UpsellSuccessClient.tsx` | Same |
| `src/app/(site)/mini-draw-success/components/MiniDrawSuccessClient.tsx` | Same |
| `src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx` | Same |
| `src/lib/facebook.ts` | Remove `"Mozilla/5.0 (compatible; Server-Side-CAPI/1.0)"` synthetic UA fallback at 3 sites |
| `src/utils/tracking/pixel-purchase-tracking.ts` | Remove synthetic UA fallback at 3 sites |
| `src/components/loading/PaymentProcessingScreen.tsx` | Remove duplicate Purchase fire (lines ~169-177) |
| `src/components/modals/PaymentMethodSelector.tsx` | Fire `AddPaymentInfo` once when the user enters card details (Stripe `<PaymentElement>` `onChange` reports `complete: true`). This is the shared card-entry surface used by all purchase modals — one edit covers them all. |
| `src/components/modals/MembershipModal.tsx` (a second-pass edit) | Fire `InitiateCheckout` from the new-user signup path (today it only fires from the existing-user path at line ~3057) |
| `package.json` | Add `test:advanced-matching` script |

**Deleted (1 file):**

| Path | Reason |
|---|---|
| `src/app/api/facebook/track/route.ts` | Zero callers (grep-confirmed). The legacy shim and its `_legacyUserData` escape hatch in `facebookProvider.capiSend` become dead code. |

---

## Task index

### Phase 1 — Advanced Matching (P0)

1. Advanced-matching helper module + tests
2. Plumb AM through `facebookProvider.loadPixel`
3. `<ConversionPixelsAdvancedMatching />` component
4. Mount AM component inside `<UserProvider>`
5. Manual staging verification with Meta Pixel Helper

### Phase 3 — Parameter parity (P0+P1)

6. Map `package_type` in `facebookProvider.pixelTrack` + regression test
7. Pass `contentIds` + `numItems` from 4 in-modal Purchase sites
8. Pass `contentIds` + `numItems` from 3 success-page Purchase sites

### Phase 4 — UA forwarding (P1)

9. Remove synthetic UA fallback strings (let field be omitted when unknown)

### Phase 5 — Cleanup (P2)

10. Remove duplicate Purchase fire in `PaymentProcessingScreen`
11. Delete `/api/facebook/track` route + the `_legacyUserData` escape hatch in `facebookProvider.capiSend`

### Phase 6 — Other event-type parity (P1)

12. Wire up `AddPaymentInfo` at the card-entry surface
13. Fire `InitiateCheckout` on the new-user signup path

---

## Task 1: Advanced-matching helper module + tests

**Files:**
- Create: `src/lib/tracking/advanced-matching.ts`
- Create: `src/lib/tracking/__tests__/advanced-matching.test.ts`
- Modify: `package.json` (add `test:advanced-matching` script)

### Step 1: Write the failing test first

Create `c:/Codes/ToolsAustralia/src/lib/tracking/__tests__/advanced-matching.test.ts`:

```ts
import assert from "node:assert/strict";
import { buildAdvancedMatching } from "../advanced-matching";

function isHexHash64(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

async function testHashesAllProvidedFields() {
  const am = buildAdvancedMatching({
    _id: "user-123",
    email: "Buyer@Example.COM",
    firstName: "Alice ",
    lastName: " Tester",
    mobile: "+61 4 1234 5678",
    state: "QLD",
    birthdate: "1990-06-15",
  });

  assert.ok(isHexHash64(am.em), "em should be sha256 hex");
  assert.ok(isHexHash64(am.fn), "fn should be sha256 hex");
  assert.ok(isHexHash64(am.ln), "ln should be sha256 hex");
  assert.ok(isHexHash64(am.ph), "ph should be sha256 hex");
  assert.ok(isHexHash64(am.st), "st should be sha256 hex");
  assert.ok(isHexHash64(am.db), "db should be sha256 hex");
  assert.ok(isHexHash64(am.country), "country should be sha256 hex");
  assert.ok(isHexHash64(am.external_id), "external_id should be sha256 hex");
}

async function testNormalizationMatchesServerHashPII() {
  // The whole point of Advanced Matching is matching browser-side hashes against
  // server-side hashes in user_data. Both must apply identical normalization
  // (lowercase, trim) before SHA-256. Verify by computing the same value via
  // the server-side hashPII and asserting equality.
  const { hashPII } = await import("../canonical-event");
  const am = buildAdvancedMatching({
    _id: "user-123",
    email: "Buyer@Example.COM",
  });
  const serverEm = hashPII("Buyer@Example.COM");
  assert.equal(am.em, serverEm, "browser AM em must equal server hashPII(email)");
}

async function testPhoneStripsNonDigits() {
  // Meta requires phone as digits only before hashing.
  const { hashPII } = await import("../canonical-event");
  const am = buildAdvancedMatching({ _id: "u", mobile: "+61 (4) 1234-5678" });
  const expected = hashPII("61412345678");
  assert.equal(am.ph, expected);
}

async function testBirthdateNormalizedToYYYYMMDD() {
  // Meta requires db as YYYYMMDD before hashing.
  const { hashPII } = await import("../canonical-event");
  const am = buildAdvancedMatching({ _id: "u", birthdate: "1990-06-15" });
  const expected = hashPII("19900615");
  assert.equal(am.db, expected);
}

async function testCountryDefaultsToAU() {
  const { hashPII } = await import("../canonical-event");
  const am = buildAdvancedMatching({ _id: "u" });
  const expected = hashPII("au");
  assert.equal(am.country, expected);
}

async function testUndefinedFieldsAreDropped() {
  const am = buildAdvancedMatching({ _id: "u" });
  // Only external_id and country should be present
  const keys = Object.keys(am);
  assert.deepEqual(
    keys.sort(),
    ["country", "external_id"].sort(),
    "undefined fields must not appear in result",
  );
}

async function testEmptyStringTreatedAsMissing() {
  // Whitespace-only strings should not produce hash entries; otherwise we
  // pollute Meta with hashes of empty strings which lower EMQ.
  const am = buildAdvancedMatching({
    _id: "u",
    email: "",
    firstName: "   ",
    lastName: "Real",
  });
  assert.equal(am.em, undefined, "empty email should be dropped");
  assert.equal(am.fn, undefined, "whitespace firstName should be dropped");
  assert.ok(am.ln, "non-empty lastName should be hashed");
}

async function run() {
  await testHashesAllProvidedFields();
  await testNormalizationMatchesServerHashPII();
  await testPhoneStripsNonDigits();
  await testBirthdateNormalizedToYYYYMMDD();
  await testCountryDefaultsToAU();
  await testUndefinedFieldsAreDropped();
  await testEmptyStringTreatedAsMissing();
  console.log("advanced-matching tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

### Step 2: Add the `test:advanced-matching` script to package.json

Find the existing `test:tracking-dispatch` line in `c:/Codes/ToolsAustralia/package.json` and add directly below it:

```json
"test:advanced-matching": "tsx src/lib/tracking/__tests__/advanced-matching.test.ts",
```

### Step 3: Run the test — expect failure

Run from `c:\Codes\ToolsAustralia`:

```bash
npm run test:advanced-matching
```

Expected: FAIL with "Cannot find module '../advanced-matching'" — module doesn't exist yet.

### Step 4: Implement the helper

Create `c:/Codes/ToolsAustralia/src/lib/tracking/advanced-matching.ts`:

```ts
// src/lib/tracking/advanced-matching.ts
import { hashPII } from "./canonical-event";

/**
 * Subset of Meta's Advanced Matching parameters that we collect.
 * All values are SHA-256 hex hashes of normalized input.
 *
 * Reference: https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching
 *
 * Fields we deliberately don't collect today (and so don't send):
 * - ge (gender)
 * - ct (city) — not on user record
 * - zp (zip / postcode) — not always present
 */
export interface AdvancedMatchingFields {
  em?: string;
  fn?: string;
  ln?: string;
  ph?: string;
  db?: string;
  st?: string;
  country?: string;
  external_id?: string;
}

/** Input shape — accepts any object with these optional fields, including UserData. */
export interface AdvancedMatchingInput {
  _id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  state?: string;
  birthdate?: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Normalize ISO date string or any Date-parseable input to YYYYMMDD. */
function toYYYYMMDD(value: string | undefined): string | undefined {
  const trimmed = nonEmpty(value);
  if (!trimmed) return undefined;
  // Already YYYYMMDD (8 digits)
  if (/^\d{8}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return undefined;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Build a Meta Advanced Matching parameters object from a user-like input.
 *
 * The same `hashPII` helper is used here that the server-side `facebookProvider.capiSend`
 * uses for `user_data` — this guarantees identical hashes on both sides so Meta can
 * dedup user identity across browser pixel and CAPI events.
 *
 * Fields with no value (undefined / empty / whitespace-only) are omitted entirely
 * from the result so we don't pollute Meta with hashes of empty strings.
 *
 * `country` defaults to "au" (Tools Australia) when no explicit country is supplied.
 */
export function buildAdvancedMatching(input: AdvancedMatchingInput): AdvancedMatchingFields {
  const result: AdvancedMatchingFields = {};

  const email = nonEmpty(input.email);
  if (email) result.em = hashPII(email);

  const firstName = nonEmpty(input.firstName);
  if (firstName) result.fn = hashPII(firstName);

  const lastName = nonEmpty(input.lastName);
  if (lastName) result.ln = hashPII(lastName);

  const mobile = nonEmpty(input.mobile);
  if (mobile) {
    const digits = mobile.replace(/\D/g, "");
    if (digits.length > 0) result.ph = hashPII(digits);
  }

  const state = nonEmpty(input.state);
  if (state) result.st = hashPII(state);

  const dob = toYYYYMMDD(input.birthdate);
  if (dob) result.db = hashPII(dob);

  // Tools Australia ships only to AU. If we ever support multi-country, accept
  // an optional `country` field on input.
  result.country = hashPII("au");

  const externalId = nonEmpty(input._id);
  if (externalId) result.external_id = hashPII(externalId);

  return result;
}
```

### Step 5: Re-run the test

Run: `npm run test:advanced-matching`
Expected: PASS with output `advanced-matching tests passed`.

### Step 6: Run type-check

Run: `npm run type-check`
Expected: PASS (no errors).

### Step 7: Suggested commit (ask user first)

```bash
git add src/lib/tracking/advanced-matching.ts src/lib/tracking/__tests__/advanced-matching.test.ts package.json
git commit -m "feat(tracking): advanced-matching helper for browser pixel"
```

---

## Task 2: Plumb AM through `facebookProvider.loadPixel`

**Files:**
- Modify: `src/lib/tracking/providers/facebook.ts` (around lines 42-69)

### Step 1: Update `loadPixel` to accept optional advancedMatching

Open `c:/Codes/ToolsAustralia/src/lib/tracking/providers/facebook.ts`. Find the `loadPixel` function (around line 42) and replace it with:

```ts
function loadPixel(opts: { nonce?: string; advancedMatching?: Record<string, string> }): void {
  if (typeof window === "undefined") return;
  if (window._fbPixelInit) return;
  const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
  if (!pixelId) return;
  if (!getAllowedHostnames().includes(window.location.hostname)) return;

  // Render the init call. When advancedMatching is provided, fbq accepts it as
  // the second arg: fbq('init', pixelId, { em, ph, ... }). Mid-session login
  // re-init is handled separately by ConversionPixelsAdvancedMatching.
  const initCall = opts.advancedMatching
    ? `window.fbq('init', '${pixelId}', ${JSON.stringify(opts.advancedMatching)});`
    : `window.fbq('init', '${pixelId}');`;

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
    ${initCall}
    window.fbq('track', 'PageView');
    window._fbPixelInit = true;
  `;
  document.head.appendChild(script);
}
```

### Step 2: Update the `ConversionProvider` interface in `types.ts` to match

Open `c:/Codes/ToolsAustralia/src/lib/tracking/types.ts`. Find:

```ts
loadPixel(opts: { nonce?: string }): void;
```

Replace with:

```ts
loadPixel(opts: { nonce?: string; advancedMatching?: Record<string, string> }): void;
```

### Step 3: Update TikTok and Snapchat providers' loadPixel signatures to match

Both files already ignore the `nonce` field via `_opts`/`opts` — they just need to accept the new optional field. They won't *use* it (Advanced Matching is a Meta-specific concept), but the signature must match the interface.

In `c:/Codes/ToolsAustralia/src/lib/tracking/providers/tiktok.ts`, find:

```ts
function loadPixel(opts: { nonce?: string }): void {
```

Replace with:

```ts
function loadPixel(opts: { nonce?: string; advancedMatching?: Record<string, string> }): void {
```

In `c:/Codes/ToolsAustralia/src/lib/tracking/providers/snapchat.ts`, make the same change.

### Step 4: Run type-check

Run: `npm run type-check`
Expected: PASS (no errors).

### Step 5: Run existing tests to confirm no regression

Run: `npm run test:tracking-dispatch && npm run test:facebook-capi`
Expected: All PASS.

### Step 6: Suggested commit

```bash
git add src/lib/tracking/providers/facebook.ts src/lib/tracking/providers/tiktok.ts src/lib/tracking/providers/snapchat.ts src/lib/tracking/types.ts
git commit -m "feat(tracking): loadPixel accepts optional advancedMatching"
```

---

## Task 3: `<ConversionPixelsAdvancedMatching />` component

**Files:**
- Create: `src/components/tracking/ConversionPixelsAdvancedMatching.tsx`

### Step 1: Create the component

```tsx
// src/components/tracking/ConversionPixelsAdvancedMatching.tsx
"use client";

import { useEffect, useRef } from "react";
import { useUserContext } from "@/contexts/UserContext";
import { buildAdvancedMatching } from "@/lib/tracking/advanced-matching";
import { getAllowedHostnames } from "@/lib/tracking/hostname-gate";

/**
 * Post-login Advanced Matching re-init for the Facebook Pixel.
 *
 * The top-level <ConversionPixels /> mounts above <UserProvider> in the tree
 * (so it can render before next-auth resolves a session), which means it can't
 * see the authenticated user. This component mounts INSIDE UserProvider,
 * watches for user data to land, and re-initializes the FB Pixel with
 * Advanced Matching so subsequent events match users on hashed PII rather
 * than cookies alone.
 *
 * fbq.init is idempotent — calling it again with new AM fields updates AM
 * in place without re-loading the SDK.
 *
 * Why it matters: cookie-based matching (_fbp/_fbc) fails under ITP (Safari),
 * Enhanced Tracking Protection (Firefox), Brave, every ad-blocker, and every
 * device switch. AM matches against Meta's user graph via hashed PII, which
 * survives all of those.
 *
 * Reference: https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching
 */
export default function ConversionPixelsAdvancedMatching() {
  const { userData, isAuthenticated } = useUserContext();
  // Track the last user we sent AM for so we don't re-init on every render.
  // Re-init only when the user identity actually changes.
  const lastSentForUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isAuthenticated || !userData?._id) return;

    // Skip if we've already sent AM for this user
    if (lastSentForUserIdRef.current === userData._id) return;

    const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
    if (!pixelId) return;

    // Hostname gate — same rule as the rest of the registry
    if (!getAllowedHostnames().includes(window.location.hostname)) return;

    // fbq must already be loaded (top-level ConversionPixels injected the SDK).
    // If the SDK is still loading, the call queues; once loaded it'll be replayed.
    if (!window.fbq) return;

    const am = buildAdvancedMatching(userData);

    // Re-init with AM. fbq.init is idempotent — this updates AM in place
    // and every subsequent fbq('track', ...) call automatically includes it.
    window.fbq("init", pixelId, am as Record<string, unknown>);
    lastSentForUserIdRef.current = userData._id;
  }, [isAuthenticated, userData]);

  return null;
}
```

### Step 2: Type-check

Run: `npm run type-check`
Expected: PASS.

### Step 3: Suggested commit

```bash
git add src/components/tracking/ConversionPixelsAdvancedMatching.tsx
git commit -m "feat(tracking): post-login advanced matching component"
```

---

## Task 4: Mount AM component inside `<UserProvider>`

**Files:**
- Modify: `src/app/providers.tsx`

### Step 1: Add the import

Open `c:/Codes/ToolsAustralia/src/app/providers.tsx`. After the existing tracking imports (around line 28, near `KlaviyoUserIdentifier`), add:

```tsx
import ConversionPixelsAdvancedMatching from "@/components/tracking/ConversionPixelsAdvancedMatching";
```

### Step 2: Mount it inside `<UserProvider>`

Find the existing tracking components mounted as children of `<UserProvider>` (around lines 100-104):

```tsx
<DeviceTierProvider />
<AffiliateTracker />
<ReferralTracker />
<PromoLinkTracker />
<KlaviyoUserIdentifier />
```

Add `<ConversionPixelsAdvancedMatching />` directly after `<KlaviyoUserIdentifier />`:

```tsx
<DeviceTierProvider />
<AffiliateTracker />
<ReferralTracker />
<PromoLinkTracker />
<KlaviyoUserIdentifier />
<ConversionPixelsAdvancedMatching />
```

### Step 3: Type-check + lint

Run: `npm run type-check && npm run lint`
Expected: PASS (or only pre-existing warnings unrelated to providers.tsx).

### Step 4: Suggested commit

```bash
git add src/app/providers.tsx
git commit -m "feat(tracking): mount AM component inside UserProvider"
```

---

## Task 5: Manual staging verification with Meta Pixel Helper

This task has no code changes. It's a verification gate. Do not start Task 6 until this passes.

### Step 1: Deploy Tasks 1–4 to Vercel staging

Push the staging branch. Wait for the deploy to complete. Confirm `NEXT_PUBLIC_PIXEL_ALLOWED_HOSTNAMES=staging.toolsaustralia.com.au` is still set in Vercel staging env (carry-over from earlier work).

### Step 2: Install Meta Pixel Helper

Chrome extension: [Meta Pixel Helper](https://chromewebstore.google.com/detail/meta-pixel-helper) (built by Meta).

### Step 3: Test the guest case

1. Open `https://staging.toolsaustralia.com.au` in an Incognito window (no logged-in session).
2. Open Pixel Helper popup. Should show the FB Pixel firing PageView.
3. Click the PageView event → "Advanced Matching" tab. Should show **no matching parameters** (because we're guest — AM is empty by design at this stage). This confirms the initial pixel load isn't passing fake AM.

### Step 4: Test the post-login case

1. Sign in with a test account on staging.
2. Wait for the page to fully load + user data to fetch.
3. Open Pixel Helper popup → find the most recent event → "Advanced Matching" tab.
4. **Expected:** AM tab shows populated hex values for `em`, `fn`, `ln`, `external_id`, `country`, plus any of `ph` / `st` / `db` we have on the test user's record.

### Step 5: Test the regression case

1. Trigger a fresh test Purchase (any flow — membership, mini-draw, upsell).
2. In DevTools Network → filter `facebook.com/tr` → find the `ev=Purchase` request.
3. Confirm `eid=pi_xxx` matches the `paymentIntentId`.
4. In Meta Events Manager → Test Events tab: confirm Purchase appears with source = "Multiple" (browser + CAPI).
5. Confirm `[DEBUG fb.pixelTrack]` log lines do **not** appear in Console (those were removed last session).

### Step 6: Document the EMQ baseline

Open Meta Events Manager → Diagnostics tab. Take a screenshot of the current Event Match Quality column for each event. Save it somewhere. After 7 days, take another screenshot to measure lift from AM. There's no commit step here — this is observation only.

If Step 4 fails (AM tab is empty even when logged in), stop and diagnose before Task 6. Likely causes:

- Component didn't mount: check React DevTools for `<ConversionPixelsAdvancedMatching />` in the tree under `<UserProvider>`.
- User data didn't load: `useUserContext().userData` returns null. Check Network for `/api/users/[id]` call succeeding.
- `window.fbq` not loaded yet when the effect ran: add a retry on a `setTimeout(() => ..., 500)` if needed.

---

## Task 6: Map `package_type` in `facebookProvider.pixelTrack` + regression test

**Files:**
- Modify: `src/lib/tracking/providers/facebook.ts` (around lines 71-89)
- Modify: `src/lib/__tests__/facebook.test.ts` (extend existing translation test)

### Step 1: Add `package_type` mapping in `pixelTrack`

Open `c:/Codes/ToolsAustralia/src/lib/tracking/providers/facebook.ts`. Find the `pixelTrack` function (around line 71) and replace it with:

```ts
function pixelTrack(event: CanonicalEvent): void {
  if (typeof window === "undefined" || !window.fbq) return;
  if (!getAllowedHostnames().includes(window.location.hostname)) return;

  const customData: Record<string, unknown> = {};
  if (event.value !== undefined) customData.value = event.value;
  if (event.currency) customData.currency = event.currency;
  if (event.customData?.orderId) customData.order_id = event.customData.orderId;
  if (event.customData?.contentIds) customData.content_ids = event.customData.contentIds;
  if (event.customData?.contentType) customData.content_type = event.customData.contentType;
  if (event.customData?.contentName) customData.content_name = event.customData.contentName;
  if (event.customData?.contentCategory) customData.content_category = event.customData.contentCategory;
  if (event.customData?.numItems !== undefined) customData.num_items = event.customData.numItems;
  if (event.customData?.packageType) customData.package_type = event.customData.packageType;
  if (event.customData?.searchString) customData.search_string = event.customData.searchString;
  if (event.providerData?.facebook) Object.assign(customData, event.providerData.facebook);

  // Meta 4-arg form: { eventID } in last param enables Pixel↔CAPI dedup.
  window.fbq("track", event.eventName, customData, { eventID: event.eventId });
}
```

(The single change is the new line `if (event.customData?.packageType) customData.package_type = event.customData.packageType;` between `num_items` and `search_string`.)

### Step 2: Extend the FB provider translation test

Open `c:/Codes/ToolsAustralia/src/lib/__tests__/facebook.test.ts`. Find the `testFacebookProviderCanonicalTranslation` function and add an assertion checking that `package_type` round-trips through `capiSend` correctly (it already does on the CAPI side — this just confirms the round-trip is now symmetric).

Find this block in the test:

```ts
  assert.equal(event.event_name, "Purchase");
  assert.equal(event.event_id, "evt-translate-1");
  assert.equal(event.custom_data?.value, 49.99);
  assert.equal(event.custom_data?.currency, "AUD");
  assert.equal(event.custom_data?.order_id, "order-123");
```

Add `packageType` to the synthetic event input. Find:

```ts
      customData: { orderId: "order-123", contentType: "product" },
```

Replace with:

```ts
      customData: { orderId: "order-123", contentType: "product", packageType: "membership" },
```

Then add a new assertion after the existing `custom_data` assertions:

```ts
  assert.equal(
    (event.custom_data as { package_type?: string })?.package_type,
    "membership",
    "package_type must round-trip through capiSend custom_data",
  );
```

### Step 3: Run tests

Run from `c:\Codes\ToolsAustralia`:

```bash
npm run type-check && npm run test:facebook-capi && npm run test:tracking-dispatch
```

Expected: All PASS.

### Step 4: Suggested commit

```bash
git add src/lib/tracking/providers/facebook.ts src/lib/__tests__/facebook.test.ts
git commit -m "feat(tracking): pixelTrack maps customData.packageType to package_type"
```

---

## Task 7: Pass `contentIds` + `numItems` from 4 in-modal Purchase sites

**Files:**
- Modify: `src/components/modals/MembershipModal.tsx` (two `buildPurchaseEvent` calls — one per handler)
- Modify: `src/components/modals/UpsellModal.tsx`
- Modify: `src/components/modals/SpecialPackagesModal.tsx`
- Modify: `src/components/features/MiniDrawPackages.tsx`

The server-side `trackPixelPurchase` already passes `content_ids` + `num_items` ([payment-processing.ts:1416-1418](../../../src/utils/payment/payment-processing.ts#L1416-L1418)). The browser-side calls don't. After this task, they will.

### Step 1: MembershipModal — `handlePaymentProcessingSuccess` (existing-user path)

Open `c:/Codes/ToolsAustralia/src/components/modals/MembershipModal.tsx`. Find the `trackConversion` call inside `handlePaymentProcessingSuccess` (added in the 2026-05-12 modal-handler patches; near where `status?.data?.paymentIntentId` is read). The current customData block is:

```ts
customData: {
  orderId: membershipPaymentIntentId,
  contentType: "product",
  packageType: status.data?.packageType ?? "membership",
},
```

Replace with:

```ts
customData: {
  orderId: membershipPaymentIntentId,
  contentType: "product",
  contentIds: lastChargedStaticPackageIdRef.current
    ? [lastChargedStaticPackageIdRef.current]
    : undefined,
  numItems: 1,
  packageType: status.data?.packageType ?? "membership",
},
```

> `lastChargedStaticPackageIdRef` is an in-scope ref set by `chargePackage(...)` earlier in the same component (see uses at lines ~2855 and ~2897 of the existing file). It holds the static catalog package id — exactly what the server-side `trackPixelPurchase` passes as `content_ids[0]` ([payment-processing.ts:1417](../../../src/utils/payment/payment-processing.ts#L1417)). Using it here means browser and server send byte-identical `content_ids` → zero "parameter mismatch" warnings in Diagnostics.
>
> If the ref isn't set when this handler fires (edge case for some flows), `contentIds` is `undefined` and the field is dropped — safer than sending the package name as a fake id.

### Step 2: MembershipModal — `handlePaymentSuccess` (new-user / autologin path)

In the same file, find the `trackConversion` call inside `handlePaymentSuccess` (which I added in the second-pass autologin patch). The current customData block is:

```ts
customData: {
  orderId: effectivePaymentIntentId,
  contentType: "product",
  packageType: activePlan.period === "mo" ? "membership" : "one-time",
},
```

Replace with:

```ts
customData: {
  orderId: effectivePaymentIntentId,
  contentType: "product",
  contentIds: activePlan.id ? [activePlan.id] : undefined,
  numItems: 1,
  packageType: activePlan.period === "mo" ? "membership" : "one-time",
},
```

`activePlan.id` is the package id here (it's the catalog identifier the user selected before paying), which IS what `content_ids` should carry. No follow-up needed for this path.

### Step 3: UpsellModal

Open `c:/Codes/ToolsAustralia/src/components/modals/UpsellModal.tsx`. Find the `trackConversion` call in `handlePaymentSuccess`. The current customData block is:

```ts
customData: {
  orderId: upsellPaymentIntentId,
  contentType: "product",
  packageType: status.data?.packageType ?? "upsell",
},
```

Replace with:

```ts
customData: {
  orderId: upsellPaymentIntentId,
  contentType: "product",
  contentIds: offer?.id ? [offer.id] : undefined,
  numItems: 1,
  packageType: status.data?.packageType ?? "upsell",
},
```

(`offer` is the in-scope `UpsellOffer` for this handler — the same `offer.id` is used elsewhere in the same function for `getPartnerDiscountBenefitTextForPackageId(offer.id)`.)

### Step 4: SpecialPackagesModal

Open `c:/Codes/ToolsAustralia/src/components/modals/SpecialPackagesModal.tsx`. Find the `trackConversion` call in `handlePaymentSuccess`. The current customData block is:

```ts
customData: {
  orderId: specialPaymentIntentId,
  contentType: "product",
  packageType: status.data?.packageType ?? "one-time",
},
```

Replace with:

```ts
customData: {
  orderId: specialPaymentIntentId,
  contentType: "product",
  contentIds: selectedPackage?._id ? [selectedPackage._id] : undefined,
  numItems: 1,
  packageType: status.data?.packageType ?? "one-time",
},
```

(`selectedPackage` is the in-scope `StaticMembershipPackage` for this handler — the same field is used elsewhere in the file.)

### Step 5: MiniDrawPackages

Open `c:/Codes/ToolsAustralia/src/components/features/MiniDrawPackages.tsx`. Find the `trackConversion` call in the success handler (around the section where `setSuccessToastShown(true)` is called and benefits are processed). The current customData block is:

```ts
customData: {
  orderId: miniDrawPaymentIntentId,
  contentType: "product",
  packageType: status.data?.packageType ?? "mini-draw",
},
```

Replace with:

```ts
customData: {
  orderId: miniDrawPaymentIntentId,
  contentType: "product",
  contentIds: selectedPackageId ? [selectedPackageId] : undefined,
  numItems: 1,
  packageType: status.data?.packageType ?? "mini-draw",
},
```

> Note: confirm `selectedPackageId` is the in-scope identifier in this handler. The component uses `setSelectedPackageId(null)` elsewhere — it should be in scope. If the variable is named differently in the handler (e.g. `currentPackageId`, `packageId`), adapt the reference accordingly.

### Step 6: Type-check

Run: `npm run type-check`
Expected: PASS.

### Step 7: Lint

Run: `npm run lint`
Expected: PASS (ignore pre-existing warnings unrelated to these files).

### Step 8: Suggested commit

```bash
git add src/components/modals/MembershipModal.tsx src/components/modals/UpsellModal.tsx src/components/modals/SpecialPackagesModal.tsx src/components/features/MiniDrawPackages.tsx
git commit -m "feat(tracking): pass content_ids + num_items from in-modal Purchase sites"
```

---

## Task 8: Pass `contentIds` + `numItems` from 3 success-page Purchase sites

**Files:**
- Modify: `src/app/(site)/upsell-success/components/UpsellSuccessClient.tsx`
- Modify: `src/app/(site)/mini-draw-success/components/MiniDrawSuccessClient.tsx`
- Modify: `src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx`

(`CheckoutSuccessClient.tsx` for shop is deliberately out of scope — see "Scope" section above.)

### Step 1: PurchaseSuccessClient

Open `c:/Codes/ToolsAustralia/src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx`. Find the `customData` object in the `trackConversion` call:

```ts
customData: {
  orderId: paymentIntentId,
  contentType: "product",
  packageType: status.data.packageType,
},
```

Replace with:

```ts
customData: {
  orderId: paymentIntentId,
  contentType: "product",
  contentIds: status.data.packageType ? [status.data.packageType] : undefined,
  numItems: 1,
  packageType: status.data.packageType,
},
```

> Same caveat as Task 7 Step 1 — the success-page client only has access to `status.data.packageType`, not `packageId`. For parity we pass *something* in `content_ids`. Follow-up to extend `/api/payment-status` to return `packageId` is noted at the bottom of this plan.

### Step 2: UpsellSuccessClient

Open `c:/Codes/ToolsAustralia/src/app/(site)/upsell-success/components/UpsellSuccessClient.tsx`. Find:

```ts
customData: {
  orderId: paymentIntentId,
  contentType: "product",
  packageType: status.data.packageType ?? "upsell",
},
```

Replace with:

```ts
customData: {
  orderId: paymentIntentId,
  contentType: "product",
  contentIds: status.data.packageType ? [status.data.packageType] : undefined,
  numItems: 1,
  packageType: status.data.packageType ?? "upsell",
},
```

### Step 3: MiniDrawSuccessClient

Open `c:/Codes/ToolsAustralia/src/app/(site)/mini-draw-success/components/MiniDrawSuccessClient.tsx`. Find:

```ts
customData: {
  orderId: paymentIntentId,
  contentType: "product",
  packageType: status.data.packageType ?? "mini-draw",
},
```

Replace with:

```ts
customData: {
  orderId: paymentIntentId,
  contentType: "product",
  contentIds: status.data.packageType ? [status.data.packageType] : undefined,
  numItems: 1,
  packageType: status.data.packageType ?? "mini-draw",
},
```

### Step 4: Type-check + lint

Run: `npm run type-check && npm run lint`
Expected: PASS.

### Step 5: Suggested commit

```bash
git add src/app/\(site\)/purchase-success/components/PurchaseSuccessClient.tsx \
        src/app/\(site\)/upsell-success/components/UpsellSuccessClient.tsx \
        src/app/\(site\)/mini-draw-success/components/MiniDrawSuccessClient.tsx
git commit -m "feat(tracking): pass content_ids + num_items from success-page Purchase sites"
```

---

## Task 9: Remove synthetic UA fallback strings

**Files:**
- Modify: `src/lib/facebook.ts` (3 sites)
- Modify: `src/utils/tracking/pixel-purchase-tracking.ts` (3 sites)

The synthetic UA `"Mozilla/5.0 (compatible; Server-Side-CAPI/1.0)"` is recognised by Meta and downgrades Event Match Quality. Better to omit the field when the real UA is unknown — Meta accepts the event with lower (but honest) match quality.

> **Note on the bigger UA story:** the spec mentions storing the original purchase UA on the `Order` / payment record at creation time so webhook-driven CAPI events can use the real UA instead of `Stripe/1.0`. That requires schema changes and is deferred to a separate follow-up. This task only removes the synthetic placeholder.

### Step 1: `src/lib/facebook.ts` — remove the constant and its three usages

Open `c:/Codes/ToolsAustralia/src/lib/facebook.ts`. Find the constant declaration (around line 307):

```ts
const CAPI_USER_AGENT_FALLBACK = "Mozilla/5.0 (compatible; Server-Side-CAPI/1.0)";
```

Delete it.

Then find the three usages and replace each as follows.

**Site A** — inside `ensureWebsiteEventValid` (around line 314-320):

Current:

```ts
function ensureWebsiteEventValid(event: FacebookEvent): FacebookEvent {
  if (event.action_source !== "website") return event;

  const userData = { ...event.user_data };

  // Meta requires client_user_agent for website events - empty user_data causes _missing_event
  if (!userData.client_user_agent || userData.client_user_agent.trim() === "") {
    userData.client_user_agent = CAPI_USER_AGENT_FALLBACK;
  }
```

Replace with:

```ts
function ensureWebsiteEventValid(event: FacebookEvent): FacebookEvent {
  if (event.action_source !== "website") return event;

  const userData = { ...event.user_data };

  // Meta accepts website events without client_user_agent — match quality is lower
  // but at least the EMQ score reflects reality. Sending a synthetic UA Meta detects
  // ("Server-Side-CAPI/1.0") downgrades the score further. So if the real UA isn't
  // available, drop the field entirely.
  if (userData.client_user_agent && userData.client_user_agent.trim() === "") {
    delete userData.client_user_agent;
  }
```

**Site B** — inside `buildFacebookPurchaseEventDev` (around line 192-198):

Find this block:

```ts
  if (Object.keys(u).length === 0) {
    u.client_user_agent = userData.client_user_agent || "Mozilla/5.0 (compatible; Server-Side-CAPI/1.0)";
  }
```

Replace with:

```ts
  // No synthetic UA — if the real UA isn't available, leave the field out.
  // Meta will accept the event with reduced EMQ rather than rejecting it.
  if (Object.keys(u).length === 0 && userData.client_user_agent) {
    u.client_user_agent = userData.client_user_agent;
  }
```

**Site C** — search the file for any remaining `"Mozilla/5.0 (compatible; Server-Side-CAPI/1.0)"` literal and delete it. (There should be no remaining sites in this file after Sites A + B.)

### Step 2: `src/utils/tracking/pixel-purchase-tracking.ts` — remove three sites

Open `c:/Codes/ToolsAustralia/src/utils/tracking/pixel-purchase-tracking.ts`. The same synthetic UA appears in three helpers (around lines 531, 624, 692 — `trackPixelSubscriptionUpgrade`, `trackPixelSubscriptionDowngrade`, `trackPixelCancellation`). For each one, find:

```ts
        client_user_agent: "Mozilla/5.0 (compatible; Server-Side-CAPI/1.0)",
```

Replace with:

```ts
        // No synthetic UA — let Meta record the lower EMQ honestly.
        ...(/* placeholder */ false ? { client_user_agent: "" } : {}),
```

Wait — that's awkward. Just delete the line entirely. The object literal has a trailing field, so deleting the line is safe. After deletion the `user_data: { ... }` object will have one fewer key. Verify the surrounding code uses `client_user_agent` only as input to `sendFacebookEvent`, which already handles the missing field correctly (Site A fix above ensures that).

Concretely: for each of the three sites, locate the surrounding object — e.g. for `trackPixelSubscriptionUpgrade`:

```ts
const upgradeFacebookEvent: FacebookEvent = {
  event_name: "Subscribe",
  event_time: Math.floor(Date.now() / 1000),
  event_id: capiEventId,
  action_source: "website",
  user_data: {
    ...hashed,
    client_user_agent: "Mozilla/5.0 (compatible; Server-Side-CAPI/1.0)",
  },
  ...
};
```

Replace with:

```ts
const upgradeFacebookEvent: FacebookEvent = {
  event_name: "Subscribe",
  event_time: Math.floor(Date.now() / 1000),
  event_id: capiEventId,
  action_source: "website",
  user_data: hashed,
  ...
};
```

Apply the equivalent simplification to `trackPixelSubscriptionDowngrade` and `trackPixelCancellation`.

### Step 3: Run tests

Run from `c:\Codes\ToolsAustralia`:

```bash
npm run type-check && npm run test:facebook-capi && npm run test:tracking-dispatch
```

Expected: All PASS. The existing `test:facebook-capi` tests don't assert on the UA value, so they should keep passing.

### Step 4: Suggested commit

```bash
git add src/lib/facebook.ts src/utils/tracking/pixel-purchase-tracking.ts
git commit -m "fix(tracking): remove synthetic CAPI user-agent fallback"
```

---

## Task 10: Remove duplicate Purchase fire in `PaymentProcessingScreen`

**Files:**
- Modify: `src/components/loading/PaymentProcessingScreen.tsx` (around lines 169-177)

The modal handlers (Tasks 7 already-committed precursor changes) now fire Purchase on success. `PaymentProcessingScreen` ALSO fires from its render path. Same `event_id` means Meta dedups — but the render-side fire is wasted work and creates a confusing double-source if anyone debugs in Network/Console. Remove it.

### Step 1: Find and remove the render-time pixel fire

Open `c:/Codes/ToolsAustralia/src/components/loading/PaymentProcessingScreen.tsx`. Find this block (around lines 169-177):

```ts
  if (status?.processed && status.data) {
    if (!pixelPurchaseFiredRef.current && paymentIntentId && shouldPoll) {
      const value = status.data.price;
      if (typeof value === "number" && value > 0) {
        pixelPurchaseFiredRef.current = true;
        const currency = status.data.currency ?? "AUD";
        trackPurchaseWithEventId(value, currency, paymentIntentId, paymentIntentId);
      }
    }
```

Replace with:

```ts
  if (status?.processed && status.data) {
```

(Delete the entire 7-line inner block. The outer `if (status?.processed && status.data) {` opens the success-state render branch which still needs to render the JSX below.)

### Step 2: Remove the now-unused ref and import

In the same file:

1. Find `const pixelPurchaseFiredRef = useRef(false);` (around line 77) and delete it.
2. Find `import { trackPurchaseWithEventId } from "@/components/FacebookPixel";` (around line 9) and delete it.
3. If `useRef` is no longer used in this file after removing `pixelPurchaseFiredRef`, remove it from the React import too. Otherwise leave it.

### Step 3: Type-check + lint

Run: `npm run type-check && npm run lint`
Expected: PASS.

### Step 4: Manual smoke

Run a fresh test purchase on staging. Confirm the Purchase tr/ still fires (from the modal handler patches, not from PaymentProcessingScreen). The Console should show no `[DEBUG fb.pixelTrack]` lines (those were removed earlier this week).

### Step 5: Suggested commit

```bash
git add src/components/loading/PaymentProcessingScreen.tsx
git commit -m "refactor(tracking): remove duplicate Purchase fire from PaymentProcessingScreen"
```

---

## Task 11: Delete `/api/facebook/track` route + the `_legacyUserData` escape hatch

**Files:**
- Delete: `src/app/api/facebook/track/route.ts`
- Modify: `src/lib/tracking/providers/facebook.ts` (remove the `_legacyUserData` escape hatch in `capiSend`, around lines 95-104 and 125)

The route is a backwards-compat shim from the 2026-05-11 refactor. Grep confirms zero callers. Both the route and the special-case `_legacyUserData` handling in `capiSend` are dead.

### Step 1: Verify zero callers (sanity check)

Run from `c:\Codes\ToolsAustralia`:

```bash
grep -r "api/facebook/track" src/ --include="*.ts" --include="*.tsx"
```

Expected: zero hits in `src/`. (The string may legitimately appear in docs under `docs/`. That's fine — docs get updated separately.) **If any hit appears in `src/`, abort this task and reassess.**

### Step 2: Delete the route file

```bash
rm src/app/api/facebook/track/route.ts
```

Then check if the parent directories are now empty:

```bash
rmdir src/app/api/facebook/track 2>/dev/null
rmdir src/app/api/facebook 2>/dev/null
```

(The `2>/dev/null` swallows errors if the directory has remaining content. PowerShell: `Remove-Item -Path src/app/api/facebook -Recurse -ErrorAction SilentlyContinue` if both routes are now gone — but only do this if no other routes live under `/api/facebook/`.)

### Step 3: Remove the `_legacyUserData` escape hatch in `facebookProvider.capiSend`

Open `c:/Codes/ToolsAustralia/src/lib/tracking/providers/facebook.ts`. Find the `capiSend` function and locate this block (around lines 95-104):

```ts
  const u = event.userData ?? {};
  // Extract _legacyUserData escape hatch — pre-hashed Meta-format user_data from the
  // legacy /api/facebook/track shim. These fields take precedence over `event.userData`
  // (which the legacy shim doesn't populate) and must land on `user_data`, NOT `custom_data`,
  // so fbc/fbp/em-based Pixel↔CAPI dedup and Event Match Quality keep working.
  const fbProviderData = event.providerData?.facebook ?? {};
  const legacyUserData =
    (fbProviderData._legacyUserData as Record<string, string> | undefined) ?? {};
  const fbCustomFields = Object.fromEntries(
    Object.entries(fbProviderData).filter(([k]) => k !== "_legacyUserData"),
  );
```

Replace with:

```ts
  const u = event.userData ?? {};
  const fbCustomFields = event.providerData?.facebook ?? {};
```

Then find the `userData` object construction (around lines 106-126) and remove the legacy spread. The current `userData` object has this at the end:

```ts
    // Legacy pre-hashed user_data wins (legacy callers don't populate event.userData).
    ...legacyUserData,
  };
```

Replace with just:

```ts
  };
```

Then in the JSDoc above the `facebookProvider` export (around line 162), find the paragraph that describes the `_legacyUserData` convention and delete it. The remaining JSDoc should still describe the provider but no longer reference legacy callers.

### Step 4: Update the FB CAPI test to remove the legacy-user-data assertion if any

Open `c:/Codes/ToolsAustralia/src/lib/__tests__/facebook.test.ts`. Search for `_legacyUserData`. If any test references it, remove that test. (Likely none — the regression test only uses `event.userData`.)

### Step 5: Run all tracking tests

Run: `npm run type-check && npm run test:facebook-capi && npm run test:tracking-dispatch`
Expected: All PASS.

### Step 6: Update docs

Open `c:/Codes/ToolsAustralia/docs/tracking/api.md`. Find the line referencing `/api/facebook/track` as deprecated and either delete it or change it to past tense:

```markdown
- ~~`POST /api/facebook/track`~~ — **removed 2026-05-12**. Use `POST /api/tracking/conversion`.
```

### Step 7: Update the manifest in CLAUDE.md

Open `c:/Codes/ToolsAustralia/CLAUDE.md`. Find the `tracking` domain in the Domain Manifest. The `paths` array includes `src/app/api/facebook/**`. Leave that glob alone (it's still useful if `/api/facebook/` gets re-added later) — but the doc-sync hook may flag the orphan removal. If it does, address by removing the specific glob if no `src/app/api/facebook/` directory remains.

### Step 8: Suggested commit

```bash
git add -u
git commit -m "refactor(tracking): delete unused /api/facebook/track + legacy escape hatch"
```

---

## Task 12: Wire up `AddPaymentInfo` at the card-entry surface

**Files:**
- Modify: `src/components/modals/PaymentMethodSelector.tsx`

Meta's `AddPaymentInfo` event signals high purchase intent and is used by the platform's optimization. Today the helper exists ([`FacebookPixel.tsx:648`](../../../src/components/FacebookPixel.tsx#L648)) but is never called. `PaymentMethodSelector` is the shared component that wraps Stripe's `<PaymentElement>` across `MembershipModal`, `UpsellModal`, `SpecialPackagesModal`, `StripePaymentModal`, and `RenewalFailedModal`. Wire `AddPaymentInfo` here — one place covers all those surfaces.

### Step 1: Read the existing surface

Open `c:/Codes/ToolsAustralia/src/components/modals/PaymentMethodSelector.tsx`. Find the `<PaymentElement>` JSX. The component already has an `onChange` prop on `<PaymentElement>` (Stripe's standard event, fires with `{ complete: boolean, value: ..., empty: ..., elementType: 'payment' }`). If the file already has a `handlePaymentElementChange` or similar handler, the fire goes inside that. If not, you'll need to add the `onChange` prop.

### Step 2: Add the imports

At the top of `PaymentMethodSelector.tsx`, after the existing imports, add:

```ts
import { useRef } from "react";  // if not already imported
import { trackConversion } from "@/lib/tracking/dispatch-client";
import { eventTimeNow } from "@/lib/tracking/canonical-event";
```

(`useRef` may already be imported — check the existing import line and merge if so.)

### Step 3: Add a fired-once ref inside the component

Near the top of the component function body (with other state / refs):

```ts
const addPaymentInfoFiredRef = useRef(false);
```

### Step 4: Add the fire to the PaymentElement's onChange handler

The component receives props that include the package id and price (e.g. `packageId`, `packagePrice`, `packageType` — confirm the exact prop names by reading the component's props interface). Wire the fire as follows. If the component already has a `handlePaymentElementChange` (or similar) handler, add this block inside it. Otherwise, add `onChange={...}` to the `<PaymentElement>` directly.

```ts
const handlePaymentElementChange = (event: { complete: boolean; empty: boolean }) => {
  // Existing logic, if any, stays here.

  if (event.complete && !addPaymentInfoFiredRef.current) {
    addPaymentInfoFiredRef.current = true;
    trackConversion({
      eventName: "AddPaymentInfo",
      // Synthetic eventId — AddPaymentInfo has no CAPI counterpart so cross-channel
      // dedup isn't relevant. Stamp with packageId + timestamp so React Strict Mode
      // double-mounts in dev don't double-count.
      eventId: `addpaymentinfo-${packageId ?? "unknown"}-${Date.now()}`,
      eventTime: eventTimeNow(),
      value: typeof packagePrice === "number" ? packagePrice : undefined,
      currency: "AUD",
      customData: {
        contentType: "product",
        contentIds: packageId ? [packageId] : undefined,
        numItems: 1,
        packageType: packageType,
      },
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
    });
  }
};
```

Then wire it onto the `<PaymentElement>` element if not already wired:

```tsx
<PaymentElement
  options={...}
  onChange={handlePaymentElementChange}
/>
```

> **Confirm prop names before pasting.** `PaymentMethodSelector` may already destructure props as `{ packageId, price, packageType }` or `{ packageId, packagePrice, packageType }` — adapt the field references in the `trackConversion` call to match. The component's `Props` interface (defined at the top of the file) is the source of truth.

### Step 5: Reset the ref when the modal remounts (optional polish)

If the parent modal can be closed and reopened without unmounting `PaymentMethodSelector` (rare — but possible if the modal is kept rendered with display:none), reset the ref when `packageId` changes:

```ts
useEffect(() => {
  addPaymentInfoFiredRef.current = false;
}, [packageId]);
```

Add this near the existing effects in the component. Skip if `PaymentMethodSelector` always unmounts on close (the ref reinitializes on remount anyway).

### Step 6: Type-check + lint

Run: `npm run type-check && npm run lint`
Expected: PASS.

### Step 7: Manual staging verification

1. Deploy to staging.
2. Start a checkout flow on any package. Don't complete it.
3. Enter test card `4242 4242 4242 4242` and a valid expiry/CVC.
4. In DevTools Network → filter `ev=AddPaymentInfo`. One request should appear the moment the card form fully validates.
5. Confirm in Meta Test Events that `AddPaymentInfo` arrives with the correct `value` / `currency` / `package_type`.
6. Repeat for a different package — the fire should happen again (different `packageId`, different synthetic eventId).

### Step 8: Suggested commit

```bash
git add src/components/modals/PaymentMethodSelector.tsx
git commit -m "feat(tracking): fire AddPaymentInfo when card form validates"
```

---

## Task 13: Fire `InitiateCheckout` on the new-user signup path

**Files:**
- Modify: `src/components/modals/MembershipModal.tsx`

Today, `MembershipModal.tsx:3057` fires `InitiateCheckout` only from the existing-user purchase path. New-user signups bypass it.

### Step 0: Confirm the new-user payment-creation surface

Open `c:/Codes/ToolsAustralia/src/components/modals/MembershipModal.tsx` and search for where the `/api/auth/register` or `/api/stripe/create-subscription` call is made for new users. There's likely a `handleNewUserCheckout` or similar function. The `InitiateCheckout` fire should happen *before* the network request is made — that's when the user has committed to checkout intent.

### Step 1: Add the fire

In the new-user checkout-initiation function (find by searching for the existing `trackInitiateCheckout({ ... })` call at line ~3057, then look for a parallel handler for new users), add a corresponding fire. The existing call is:

```ts
trackInitiateCheckout({
  value: activePlan.price,
  currency: "AUD",
  contentName: activePlan.name,
  contentIds: [activePlan.id],
  packageType: activePlan.period === "mo" ? "membership" : "one-time",
});
```

In the new-user path (the function that handles the new-user-then-pay flow), add the same call at the moment the user clicks the final "purchase" button (before the network request to `/api/auth/register` or equivalent).

### Step 2: Type-check + lint

Run: `npm run type-check && npm run lint`
Expected: PASS.

### Step 3: Manual staging verification

1. Deploy to staging.
2. Use an Incognito window (no existing session) — start a fresh signup+purchase flow.
3. Fill in signup form, hit the purchase button.
4. In DevTools Network → filter `ev=InitiateCheckout`. One request should appear immediately on click.
5. Confirm in Meta Test Events.

### Step 4: Suggested commit

```bash
git add src/components/modals/MembershipModal.tsx
git commit -m "feat(tracking): fire InitiateCheckout on new-user signup path"
```

---

## Deferred items (not in this plan)

Listed for future reference. None of these block the current scope.

1. **Phase 2 — Shop checkout CAPI fire.** Shop is not yet live. When it launches:
   - Add a webhook handler for `payment_intent.succeeded` with `paymentType === "shop"` to call `trackPixelPurchase` server-side.
   - Verify `CheckoutSuccessClient.tsx` browser-side `eventId` (`order.orderNumber ?? orderId`) matches what the server uses for `event_id`.
   - Acceptance: shop test order shows "Multiple" source in Meta Test Events.

2. **Store real UA on Order / PaymentEvent at creation time.** Required for webhook-driven CAPI events to send the real browser UA instead of omitting the field. Touches the Order model, payment-intent creation routes, and `payment-processing.ts:1398`. Schema change, not a one-line tweak — needs its own design pass.

3. **Extend `/api/payment-status/[paymentIntentId]` to return `packageId`.** Currently returns `packageType` + `packageName` but not the catalog id. With `packageId` exposed, success-page Purchase events and the existing-user MembershipModal handler could pass byte-identical `content_ids` matching the server side (`payment-processing.ts:1417`), eliminating soft Diagnostics warnings. Small route change + small touch to each consumer.

4. **CSP allowlist for TikTok + Snapchat** when their pixel ids land. Add `analytics.tiktok.com` and `sc-static.net` to `src/utils/security/csp.ts`. Not blocking until those pixels are live.

5. **Phase 6 lower-priority items.** CAPI parity for `ViewContent` / `InitiateCheckout` (Meta uses these for cross-device retargeting). Wire up `AddToCart` / `Lead` if/when those user actions are added. Each is its own small task — bundle when convenient.

---

## Verification plan (end-to-end after all 13 tasks)

Run from `c:\Codes\ToolsAustralia`:

```bash
npm run type-check && npm run lint && npm run test:tracking-dispatch && npm run test:facebook-capi && npm run test:advanced-matching
```

All five should pass.

Then on staging:

1. **Guest test:** Incognito → Pixel Helper shows pixel firing PageView with empty Advanced Matching tab. ✅
2. **Login test:** sign in → Pixel Helper Advanced Matching tab populates with `em`, `fn`, `ln`, `external_id`, `country` (plus `ph` / `st` / `db` if test user has them). ✅
3. **Purchase dual-fire test** — for each of these flows, confirm Meta Test Events shows source = "Multiple" with matching `event_id`:
   - First-time membership signup
   - First-time one-time purchase
   - Existing-user membership purchase
   - Mini-draw purchase
   - Upsell (post-purchase offer)
   - Additional one-time package (SpecialPackagesModal)
4. **Param parity test:** open one Purchase row in Test Events → expand both browser and server entries → both rows should now show `package_type`, `content_ids`, `num_items`, `content_type`, `value`, `currency`, `order_id`. ✅
5. **AddPaymentInfo fires:** Network shows `tr/?ev=AddPaymentInfo` once when the card form is completed.
6. **InitiateCheckout fires on signup:** Network shows `tr/?ev=InitiateCheckout` when a new user clicks "purchase" on a package.
7. **No synthetic UA:** sample CAPI events in Test Events — `client_user_agent` field is either real (when available) or absent (when not). Never `"Mozilla/5.0 (compatible; Server-Side-CAPI/1.0)"`.
8. **No `/api/facebook/track` route:** `curl https://staging.toolsaustralia.com.au/api/facebook/track` returns 404.
9. **No duplicate Purchase fire:** `PaymentProcessingScreen` does not produce a tr/ request — only the modal handler does.

After 7 days of post-deploy traffic:

10. Meta Events Manager → Diagnostics → EMQ column for browser-source Purchase has climbed from baseline ([screenshot baseline taken in Task 5 Step 6]). Target: ≥ 7.0 ("Good") for Purchase and CompleteRegistration.
11. Diagnostics shows zero new "parameter mismatch" warnings on Purchase.
12. Test Events tab: every browser purchase has a matching server-source row deduped into one event.

If any verification step fails, revert that specific commit and reassess. The 13 tasks are independent commits — partial rollback is possible.
