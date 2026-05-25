# Meta CAPI Identity Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift Meta Event Match Quality and event coverage by sending customer identity through the Conversions API for `AddPaymentInfo` and `InitiateCheckout`, and reliable `fbc`/`fbp` for `CompleteRegistration`.

**Architecture:** The server route `/api/tracking/conversion` already SHA-256-hashes a client-supplied `userData` object, but the browser mirror never sends one. We feed that existing pipe (Tasks 1–3) and add a client→body `fbc`/`fbp` path to the register route (Task 4). All identity goes to CAPI only; browser pixels are unchanged. Raw PII travels same-origin over HTTPS and is hashed server-side via the existing `hashPII`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Zod, Meta Pixel + Conversions API. Tests are standalone `tsx` scripts wired to `package.json` `test:*` scripts (no jest/vitest).

**Spec:** `docs/superpowers/specs/2026-05-25-meta-capi-identity-enrichment-design.md`

**Commit policy for this plan:** commit after each task. **Do NOT push.** (User-authorized: "commit every task phase but not push.")

**Per-task doc rule:** every task that edits `src/` must update the matching `docs/<domain>/` file in the SAME commit or the `Stop` doc-sync hook will block. Domains: tracking (`meta-capi-mirror`, `usePixelTracking`, conversion route), shared-ui (`MembershipModal`, `CardFormSection`), auth (register route).

---

## Task 1: userData plumbing through the mirror (+ `stripEmpty`)

**Files:**
- Modify: `src/utils/tracking/meta-capi-mirror.ts`
- Modify: `src/hooks/usePixelTracking.ts`
- Create: `src/lib/tracking/__tests__/capi-userdata-enrichment.test.ts`
- Modify: `package.json` (add `test:capi-userdata`)
- Modify: `docs/tracking/EVENT_PARAMETER_MATRIX.md`, `docs/tracking/gotchas.md`
- Modify: `docs/infrastructure/testing.md` (`package.json` is in the **infrastructure** domain — doc-sync requires a doc touch there in the same task)

- [ ] **Step 1: Write the failing test**

Create `src/lib/tracking/__tests__/capi-userdata-enrichment.test.ts`:

```ts
import assert from "node:assert/strict";
import { stripEmpty } from "../../../utils/tracking/meta-capi-mirror";
import { sendConversionWithProviders } from "../dispatch";
import { facebookProvider } from "../providers/facebook";
import type { CanonicalEvent, RequestContext } from "../types";

function snapshotEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}
function restoreEnv(saved: NodeJS.ProcessEnv) {
  process.env = saved;
}

// --- Test 1: stripEmpty drops undefined/null/"" and keeps real values ---
function testStripEmpty() {
  const out = stripEmpty({ a: "x", b: "", c: undefined, d: null as unknown as string, e: "y" });
  assert.deepEqual(out, { a: "x", e: "y" }, "stripEmpty must keep only non-empty values");
}

// --- Test 2: client userData reaching CAPI is SHA-256 hashed into em/ph/fn/ln ---
async function testGuestUserDataIsHashed() {
  const saved = snapshotEnv();
  process.env.VERCEL_ENV = "production";
  process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = "123456789";
  delete process.env.FACEBOOK_USE_TEST_EVENTS;
  delete process.env.FACEBOOK_TEST_EVENT_CODE;

  let captured: { user_data?: Record<string, string | undefined> } | null = null;
  const prevFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("facebook.com")) {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      captured = body?.data?.[0] ?? null;
    }
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  }) as typeof fetch;

  const event: CanonicalEvent = {
    eventName: "InitiateCheckout",
    eventId: "ic_test_1",
    eventTime: Math.floor(Date.now() / 1000),
    value: 19,
    currency: "AUD",
    userData: {
      email: "Guest@Example.com",
      phone: "+61 400 000 000",
      firstName: "Guest",
      lastName: "Buyer",
    },
    customData: { contentType: "product", numItems: 1 },
    eventSourceUrl: "https://toolsaustralia.com.au/",
  };
  const ctx: RequestContext = {
    clientIpAddress: "203.0.113.10",
    clientUserAgent: "Mozilla/5.0 (test)",
  };

  await sendConversionWithProviders(event, ctx, [facebookProvider]);

  assert.ok(captured, "InitiateCheckout with guest userData must POST to FB CAPI");
  const ud = (captured as { user_data?: Record<string, string | undefined> }).user_data ?? {};
  assert.ok(ud.em && ud.em.length === 64, "email must be hashed into em");
  assert.ok(ud.ph && ud.ph.length === 64, "phone must be hashed into ph");
  assert.ok(ud.fn && ud.fn.length === 64, "firstName must be hashed into fn");
  assert.ok(ud.ln && ud.ln.length === 64, "lastName must be hashed into ln");

  global.fetch = prevFetch;
  restoreEnv(saved);
}

async function run() {
  testStripEmpty();
  await testGuestUserDataIsHashed();
  console.log("capi-userdata-enrichment tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add the test script and run it to verify it fails**

In `package.json`, add to `"scripts"` (next to the other `test:*` entries):

```json
"test:capi-userdata": "tsx src/lib/tracking/__tests__/capi-userdata-enrichment.test.ts",
```

Run: `npm run test:capi-userdata`
Expected: FAIL — `stripEmpty` is not exported from `meta-capi-mirror` (import error / `SyntaxError: The requested module ... does not provide an export named 'stripEmpty'`).

- [ ] **Step 3: Implement `MirrorUserData` + `stripEmpty` + `userData` in the mirror**

In `src/utils/tracking/meta-capi-mirror.ts`, after the `MirrorCustomData` interface add:

```ts
/**
 * Client-supplyable PII for CAPI. The server route `/api/tracking/conversion`
 * SHA-256-hashes these via `hashPII`; never hashed client-side. Excludes
 * fbc/fbp/IP/UA (server-derived) by design.
 */
export interface MirrorUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  birthdate?: string;
  externalId?: string;
}

/** Drop undefined/null/empty-string so we never overwrite server/session data with blanks. */
export function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") {
      out[k as keyof T] = v as T[keyof T];
    }
  }
  return out;
}
```

Add `userData` to `MirrorParams` (after `customData`):

```ts
  /** Optional hashed-PII identity; empty fields are stripped before sending. */
  userData?: MirrorUserData;
```

In `mirrorMetaEventToCapi`, replace the `const body = {...}` construction with:

```ts
  const cleanedUserData = params.userData ? stripEmpty(params.userData) : undefined;

  const body = {
    eventName: params.eventName,
    eventId: params.eventId,
    ...(params.value !== undefined && { value: params.value }),
    ...(params.currency && { currency: params.currency }),
    ...(params.customData && { customData: params.customData }),
    ...(cleanedUserData && Object.keys(cleanedUserData).length > 0 && { userData: cleanedUserData }),
    eventSourceUrl,
  };
```

- [ ] **Step 4: Thread `userData` through `fireFunnelEvent` and forward it**

In `src/hooks/usePixelTracking.ts`:

Add `MirrorUserData` to the existing import from `@/utils/tracking/meta-capi-mirror`:

```ts
import {
  mirrorMetaEventToCapi,
  generateMirrorEventId,
  type MirrorEventName,
  type MirrorUserData,
} from "@/utils/tracking/meta-capi-mirror";
```

Change `fireFunnelEvent`'s signature and the `canonicalCustomData` + mirror call. Add the `userData` param, add a `packageType` passthrough (AddPaymentInfo uses it; without this it would be dropped from CAPI), and pass `userData` to the mirror only:

```ts
  const fireFunnelEvent = (
    eventName: MirrorEventName,
    metaCustomData: Record<string, unknown>,
    platforms: ("facebook" | "tiktok")[] = ["facebook", "tiktok"],
    userData?: MirrorUserData,
  ): void => {
```

Inside `canonicalCustomData`, add (next to the `numItems`/`orderId` entries):

```ts
      ...(typeof metaCustomData.packageType === "string" && {
        packageType: metaCustomData.packageType,
      }),
```

Change the final mirror call to include `userData`:

```ts
    mirrorMetaEventToCapi({ eventName, eventId, value, currency, customData: canonicalCustomData, userData });
```

Update `trackInitiateCheckout` and `trackAddPaymentInfo` to accept + forward `userData`:

```ts
  const trackInitiateCheckout = useCallback(
    (params: PixelEventParams, platforms?: ("facebook" | "tiktok")[], userData?: MirrorUserData) => {
      fireFunnelEvent("InitiateCheckout", buildMetaCustomData(params, { content_type: "product" }), platforms, userData);
    },
    [],
  );
```

```ts
  const trackAddPaymentInfo = useCallback(
    (params: PixelEventParams, platforms?: ("facebook" | "tiktok")[], userData?: MirrorUserData) => {
      fireFunnelEvent("AddPaymentInfo", buildMetaCustomData(params, { content_type: "product" }), platforms, userData);
    },
    [],
  );
```

> Note: `MirrorCustomData` already has `packageType?`, the route's `customDataSchema` accepts it, and `capiSend` maps it to `package_type` — so the only missing link was `fireFunnelEvent`'s `canonicalCustomData`, fixed above.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:capi-userdata`
Expected: PASS — prints `capi-userdata-enrichment tests passed`.

- [ ] **Step 6: Verify no regression + types**

Run: `npm run test:facebook-emq`
Expected: PASS — prints `facebook-emq tests passed`.
Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 7: Update docs (tracking domain)**

In `docs/tracking/EVENT_PARAMETER_MATRIX.md`, note that the browser mirror (`mirrorMetaEventToCapi` / `fireFunnelEvent`) can now carry an optional `userData` (em/ph/fn/ln/ct/st/zp/country/db/external_id), hashed server-side by `/api/tracking/conversion`. In `docs/tracking/gotchas.md`, add: "Funnel CAPI events only carry PII if a caller passes `userData`; empty fields are stripped (`stripEmpty`) so they never clobber session enrichment." In `docs/infrastructure/testing.md`, add the new `test:capi-userdata` script to the list of `tsx` test scripts (required because `package.json` is in the infrastructure domain).

- [ ] **Step 8: Commit**

```bash
git add src/utils/tracking/meta-capi-mirror.ts src/hooks/usePixelTracking.ts src/lib/tracking/__tests__/capi-userdata-enrichment.test.ts package.json docs/tracking/EVENT_PARAMETER_MATRIX.md docs/tracking/gotchas.md docs/infrastructure/testing.md
git commit -m "feat(tracking): carry hashed userData through the Meta CAPI mirror"
```

---

## Task 2: Route `AddPaymentInfo` through CAPI with billing PII (Fix A)

**Files:**
- Modify: `src/components/modals/PaymentMethodSelector/CardFormSection.tsx`
- Modify: `docs/shared-ui/gotchas.md`

- [ ] **Step 1: Add the hook + type imports**

In `CardFormSection.tsx`, add imports:

```ts
import { usePixelTracking } from "@/hooks/usePixelTracking";
import type { MirrorUserData } from "@/utils/tracking/meta-capi-mirror";
```

Add the hook call at the top of the component body, alongside `const { showToast } = useToast();` (it MUST be before the `isStripeLoading` early return — see the file's hooks invariant):

```ts
    const { trackAddPaymentInfo } = usePixelTracking();
```

- [ ] **Step 2: Replace the browser-only `trackConversion` block**

Replace the existing `if (event.complete && !addPaymentInfoFiredRef.current) { ... }` block (the one calling `trackConversion({ eventName: "AddPaymentInfo", ... })`) with:

```ts
              if (event.complete && !addPaymentInfoFiredRef.current) {
                addPaymentInfoFiredRef.current = true;
                const derivedPackageType =
                  intentType === "payment" && typeof amount === "number" && amount > 0
                    ? "one-time"
                    : "membership";

                // Identity from the billing details the shopper just entered; empty
                // fields are stripped downstream (stripEmpty in the mirror).
                const [bdFirst, ...bdRest] = (billingDetails?.name ?? "").trim().split(/\s+/);
                const apiUserData: MirrorUserData = {
                  email: billingDetails?.email,
                  phone: billingDetails?.phone,
                  firstName: bdFirst || undefined,
                  lastName: bdRest.length ? bdRest.join(" ") : undefined,
                  city: billingDetails?.city,
                  state: billingDetails?.state,
                  zipCode: billingDetails?.postalCode,
                  country: billingDetails?.country,
                };

                // Dual Pixel + CAPI via a shared event_id (fireFunnelEvent), so
                // AddPaymentInfo gains an EMQ score and dedup coverage.
                trackAddPaymentInfo(
                  {
                    value: typeof amount === "number" ? amount / 100 : undefined,
                    currency: typeof amount === "number" ? "AUD" : undefined,
                    numItems: 1,
                    packageType: derivedPackageType,
                  },
                  undefined,
                  apiUserData,
                );
              }
```

- [ ] **Step 3: Remove now-dead imports**

Remove `import { trackConversion } from "@/lib/tracking/dispatch-client";`. Then check whether `eventTimeNow` is still used anywhere in the file; if not, remove its import too:

Run: `npm run lint -- src/components/modals/PaymentMethodSelector/CardFormSection.tsx`
Expected: no `no-unused-vars` errors. Remove any import the linter flags.

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 5: Update docs (shared-ui domain)**

In `docs/shared-ui/gotchas.md`, add: "`CardFormSection` fires `AddPaymentInfo` via `usePixelTracking().trackAddPaymentInfo` (dual Pixel+CAPI, shared event_id) with `billingDetails`-derived PII — not the old browser-only `trackConversion`. It no longer fires the Snapchat browser pixel for AddPaymentInfo (consistent with other funnel events; Snap is reached server-side via the mirror)."

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/PaymentMethodSelector/CardFormSection.tsx docs/shared-ui/gotchas.md
git commit -m "feat(tracking): send AddPaymentInfo via CAPI with billing identity"
```

---

## Task 3: Attach guest PII to `InitiateCheckout` (Fix B)

**Files:**
- Modify: `src/components/modals/MembershipModal/index.tsx`
- Modify: `docs/shared-ui/gotchas.md`

- [ ] **Step 1: Guest signup fire site (`handleRegistration`)**

Find the `trackInitiateCheckout({ value: packagePrice, currency: "AUD", numItems: 1 })` call inside `handleRegistration` (the one guarded by `initiateCheckoutFiredRef` near the start of registration). Replace it with:

```ts
        trackInitiateCheckout(
          {
            value: packagePrice,
            currency: "AUD",
            numItems: 1,
          },
          undefined,
          {
            email: formData.email,
            firstName: formData.firstName,
            lastName: formData.lastName,
            phone: formData.phone,
            country: "AU",
          },
        );
```

- [ ] **Step 2: Checkout fire site (`handleSubmit`) — guest only**

Find the second `trackInitiateCheckout({ value: packagePrice, currency: "AUD", numItems: 1 })` call inside `handleSubmit` (guarded by `initiateCheckoutFiredRef`). Replace it with:

```ts
        trackInitiateCheckout(
          {
            value: packagePrice,
            currency: "AUD",
            numItems: 1,
          },
          undefined,
          isAuthenticated
            ? undefined
            : {
                email: formData.email,
                firstName: formData.firstName,
                lastName: formData.lastName,
                phone: formData.phone,
                country: "AU",
              },
        );
```

> Logged-in users send no client userData here — the conversion route's session enrichment already supplies authoritative PII. `stripEmpty` drops any blank guest fields.

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check`
Expected: no errors.
Run: `npm run lint -- src/components/modals/MembershipModal/index.tsx`
Expected: no new errors.

- [ ] **Step 4: Update docs (shared-ui domain)**

In `docs/shared-ui/gotchas.md`, add: "`MembershipModal` passes guest `formData` PII (email/first/last/phone, country AU) to `trackInitiateCheckout` so guest InitiateCheckout CAPI events carry identity; the checkout fire site sends it only when `!isAuthenticated` (logged-in users rely on session enrichment)."

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/MembershipModal/index.tsx docs/shared-ui/gotchas.md
git commit -m "feat(tracking): attach guest PII to InitiateCheckout CAPI events"
```

---

## Task 4: Reliable `fbc`/`fbp` for `CompleteRegistration` (Fix C)

**Files:**
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `src/components/modals/MembershipModal/index.tsx`
- Modify: `docs/auth/api.md`, `docs/auth/gotchas.md`
- Modify: `docs/shared-ui/gotchas.md` (MembershipModal is in the **shared-ui** domain — doc-sync requires a touch there too)

- [ ] **Step 1: Accept `fbc`/`fbp` in the register schema**

In `src/app/api/auth/register/route.ts`, add to `registerSchema` (after `ad_id`):

```ts
  fbc: z.string().optional(),
  fbp: z.string().optional(),
```

- [ ] **Step 2: Prefer body `fbc`/`fbp` over the cookie in all four CompleteRegistration blocks**

There are four blocks that currently read:

```ts
        if (ctx.fbc) userData.fbc = ctx.fbc;
        if (ctx.fbp) userData.fbp = ctx.fbp;
```

In EACH of the four, replace those two lines with:

```ts
        const fbc = validatedData.fbc ?? ctx.fbc;
        const fbp = validatedData.fbp ?? ctx.fbp;
        if (fbc) userData.fbc = fbc;
        if (fbp) userData.fbp = fbp;
```

(`validatedData` is the parsed body, in scope for the whole POST handler.)

- [ ] **Step 3: Send `fbc`/`fbp` from the client register call**

In `src/components/modals/MembershipModal/index.tsx`, add the import (merge into existing `facebook-helpers` import if one exists):

```ts
import { getFBCFromURL, getFBPFromCookie } from "@/utils/tracking/facebook-helpers";
```

In `handleRegistration`, just before the `await fetch("/api/auth/register", ...)` call (after `attributionParams` is built), compute:

```ts
    const fbc = typeof window !== "undefined" ? getFBCFromURL() : undefined;
    const fbp = typeof window !== "undefined" ? getFBPFromCookie() : undefined;
```

Then in the JSON body object, add (next to the `...(attributionParams.ad_id && ...)` line):

```ts
          ...(fbc && { fbc }),
          ...(fbp && { fbp }),
```

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check`
Expected: no errors.
Run: `npm run lint -- src/app/api/auth/register/route.ts src/components/modals/MembershipModal/index.tsx`
Expected: no new errors.

- [ ] **Step 5: Update docs (auth + shared-ui domains)**

In `docs/auth/api.md`, document that `POST /api/auth/register` now accepts optional `fbc` and `fbp` (Meta Click ID / browser ID) used to enrich the server-side `CompleteRegistration` CAPI event. In `docs/auth/gotchas.md`, add: "`CompleteRegistration` server CAPI prefers body `fbc`/`fbp` over the `_fbc`/`_fbp` cookie — the register POST can fire before the pixel writes the cookie and the API URL has no `fbclid` to reconstruct from, so the client (which can read the cookie or reconstruct from the landing fbclid) supplies them." In `docs/shared-ui/gotchas.md`, add: "`MembershipModal` sends client-computed `fbc`/`fbp` (`getFBCFromURL`/`getFBPFromCookie`) in the register POST body so the server `CompleteRegistration` CAPI event gets the Click ID."

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth/register/route.ts src/components/modals/MembershipModal/index.tsx docs/auth/api.md docs/auth/gotchas.md docs/shared-ui/gotchas.md
git commit -m "feat(tracking): send fbc/fbp for CompleteRegistration via register body"
```

---

## Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full type-check and lint**

Run: `npm run type-check`
Expected: no errors.
Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Run the affected tests**

Run: `npm run test:capi-userdata`
Expected: PASS.
Run: `npm run test:facebook-emq`
Expected: PASS.

- [ ] **Step 3: Confirm doc-sync is satisfied**

Confirm `docs/tracking/`, `docs/shared-ui/`, and `docs/auth/` were updated in the matching commits. If the `Stop` doc-sync hook reports any stale doc, update the named file and amend/commit.

- [ ] **Step 4: Post-deploy verification note (manual, after merge/deploy)**

In Events Manager over ~48h confirm: AddPaymentInfo shows server events + an EMQ score; InitiateCheckout em/ph coverage rises from ~1.84%; CompleteRegistration server `fbc` coverage rises and the diagnostic moves to "Previously detected".

---

## Self-Review

**Spec coverage:** Enabler/userData → Task 1. Fix A (AddPaymentInfo) → Task 2. Fix B (InitiateCheckout guest PII) → Task 3. Fix C (CompleteRegistration fbc/fbp) → Task 4. Test → Task 1. Docs (tracking/shared-ui/auth) → Tasks 1–4. Snapchat-pixel + dead-import edge cases → Task 2. `stripEmpty`/merge-order safety → Tasks 1–3. All spec sections covered.

**Type consistency:** `MirrorUserData` defined in Task 1, imported in Tasks 1–2 and inferred inline in Tasks 3–4. `trackInitiateCheckout`/`trackAddPaymentInfo` signatures `(params, platforms?, userData?)` consistent across Tasks 1–3. `stripEmpty`/`sendConversionWithProviders`/`facebookProvider` names match the actual exports verified in the code.

**Out of scope (not coded, by design):** Subscribe/GTM, Facebook Login ID, IPv6, InitiateCheckout fbc, upgrade/downgrade fbc, browser-side guest Advanced Matching, deduplication (already correct), PageView (correctly Pixel-only).
