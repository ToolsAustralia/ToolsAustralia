# Facebook CAPI EMQ Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four confirmed bugs in the Facebook Pixel + CAPI integration so every event carries the maximum user_data we have on hand (`db`, `st`, `ip`, `ua`, plus the correct `fbc` value on the browser), and lock the regressions with two focused test files.

**Architecture:** Surgical edits only — no signature refactors beyond what's needed to thread `requestContext` into two tracking helpers and to extract a tiny shared user-data builder in `register/route.ts`. Reuse the existing `toYYYYMMDD` and `hashPII` helpers; add no new abstractions. Delete one dead function (`trackPixelCancellation`).

**Tech Stack:** Next.js 15 App Router, TypeScript, Node `assert/strict` + `tsx` for tests (no test runner — each test is its own script wired to `test:*` in `package.json`).

**Source spec:** [`docs/superpowers/specs/2026-05-14-fb-capi-emq-fixes-design.md`](../specs/2026-05-14-fb-capi-emq-fixes-design.md)

---

## File Structure

**Modify:**
- `src/utils/tracking/facebook-helpers.ts` — export `toYYYYMMDD`; fix browser `getFBCFromURL` to read `_fbc` cookie first.
- `src/lib/tracking/providers/facebook.ts` — add `db` mapping inside `capiSend`.
- `src/utils/tracking/pixel-purchase-tracking.ts` — extend `trackPixelSubscription` user fields; refactor `trackPixelSubscriptionUpgrade` and `trackPixelSubscriptionDowngrade` to accept `requestContext` + extra user fields; **delete** `trackPixelCancellation`.
- `src/app/api/stripe/upgrade-subscription-payment/route.ts` — pass `requestContext` + extra user fields to `trackPixelSubscriptionUpgrade`.
- `src/app/api/stripe/downgrade-subscription/route.ts` — same for downgrade.
- `src/app/api/auth/register/route.ts` — add `userDataForRegistration` helper near the top of the file; use it in all 4 `prepareUserData` call sites.
- `src/lib/__tests__/facebook.test.ts` — extend with one new test case asserting canonical-provider maps `birthdate` to `db`.
- `package.json` — add `test:facebook-emq` script.
- `docs/tracking/gotchas.md`, `docs/tracking/api.md`, `docs/tracking/backend.md`, `docs/tracking/testing.md`, `docs/tracking/SPEC_PIXEL_CAPI_PARITY.md` — small doc updates.

**Create:**
- `src/utils/tracking/__tests__/facebook-emq.test.ts` — boundary-level test that captures the FB CAPI request body fired by each tracking function under test, asserts the `user_data` payload shape includes `st`, `db`, `client_ip_address`, `client_user_agent` where applicable.

**Delete (within `pixel-purchase-tracking.ts`):** the entire `trackPixelCancellation` function (lines 643–704 in current state).

---

## Task 1 — Export `toYYYYMMDD` from facebook-helpers.ts

**Files:**
- Modify: `src/utils/tracking/facebook-helpers.ts:96`

**Why:** Task 2 needs to call this helper from `providers/facebook.ts`. Today it's a private function in `facebook-helpers.ts`. Cheaper to export it once than to duplicate the date-parsing logic.

- [ ] **Step 1: Read the current declaration.**

Open `src/utils/tracking/facebook-helpers.ts` and confirm line 96 reads `function toYYYYMMDD(birthdate: string | Date): string | null {`.

- [ ] **Step 2: Add `export` keyword.**

Change line 96 from:

```ts
function toYYYYMMDD(birthdate: string | Date): string | null {
```

to:

```ts
export function toYYYYMMDD(birthdate: string | Date): string | null {
```

No other change. The function body is correct.

- [ ] **Step 3: Verify type-check.**

Run: `npm run type-check`
Expected: 0 errors.

---

## Task 2 — Canonical provider maps `birthdate` → `db`

**Files:**
- Modify: `src/lib/tracking/providers/facebook.ts:108-126`
- Modify: `src/lib/__tests__/facebook.test.ts` (extend with new test case)
- Test: `npm run test:facebook-capi`

- [ ] **Step 1: Write the failing test.**

Open `src/lib/__tests__/facebook.test.ts`. After `testFacebookProviderCanonicalTranslation` (line 128) and before the `run()` function (line 130), insert a new test function:

```ts
async function testFacebookProviderHashesBirthdateAsDb() {
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
  const { hashData } = await import("../facebook");

  // Case 1: birthdate as ISO string is normalized to YYYYMMDD then SHA-256 lowercased.
  await facebookProvider.capiSend(
    {
      eventName: "Purchase",
      eventId: "evt-db-1",
      eventTime: 1700000000,
      value: 10,
      currency: "AUD",
      userData: { email: "x@y.com", birthdate: "1990-06-15" },
      customData: { orderId: "o-1" },
    },
    {},
  );
  const body1 = capturedBody as { data: unknown[] };
  const event1 = body1.data[0] as { user_data?: { db?: string } };
  assert.equal(event1.user_data?.db, hashData("19900615"), "db must be SHA-256 of YYYYMMDD");

  // Case 2: unparseable birthdate is skipped (no db key).
  capturedBody = null;
  await facebookProvider.capiSend(
    {
      eventName: "Purchase",
      eventId: "evt-db-2",
      eventTime: 1700000000,
      value: 10,
      currency: "AUD",
      userData: { email: "x@y.com", birthdate: "not-a-date" },
      customData: { orderId: "o-2" },
    },
    {},
  );
  const body2 = capturedBody as { data: unknown[] };
  const event2 = body2.data[0] as { user_data?: { db?: string } };
  assert.equal(event2.user_data?.db, undefined, "db must be absent when birthdate is unparseable");

  // Case 3: missing birthdate is skipped.
  capturedBody = null;
  await facebookProvider.capiSend(
    {
      eventName: "Purchase",
      eventId: "evt-db-3",
      eventTime: 1700000000,
      value: 10,
      currency: "AUD",
      userData: { email: "x@y.com" },
      customData: { orderId: "o-3" },
    },
    {},
  );
  const body3 = capturedBody as { data: unknown[] };
  const event3 = body3.data[0] as { user_data?: { db?: string } };
  assert.equal(event3.user_data?.db, undefined, "db must be absent when birthdate is missing");

  global.fetch = prevFetch;
  restoreEnv(saved);
}
```

Then register the new test in `run()` (line 130). Change:

```ts
async function run() {
  await testRefusesPurchaseWithoutEventId();
  await testRefusesNonProdWithoutTestEventCode();
  await testFacebookProviderCanonicalTranslation();
  console.log("facebook CAPI guard tests passed");
}
```

to:

```ts
async function run() {
  await testRefusesPurchaseWithoutEventId();
  await testRefusesNonProdWithoutTestEventCode();
  await testFacebookProviderCanonicalTranslation();
  await testFacebookProviderHashesBirthdateAsDb();
  console.log("facebook CAPI guard tests passed");
}
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `npm run test:facebook-capi`
Expected: FAIL on Case 1 — `db must be SHA-256 of YYYYMMDD` (because the canonical provider doesn't emit `db` yet).

- [ ] **Step 3: Implement the fix in the canonical provider.**

Open `src/lib/tracking/providers/facebook.ts`. At line 8 (the existing imports block), add `toYYYYMMDD`:

```ts
import {
  sendFacebookEvent,
  type FacebookEvent,
} from "@/lib/facebook";
import { toYYYYMMDD } from "@/utils/tracking/facebook-helpers";
```

Then inside `capiSend`, in the `userData` object literal (lines 108-126), add a `db` mapping line. The current state, around line 117, looks like:

```ts
    ...(u.externalId && { external_id: hashPII(u.externalId) }),
    ...(u.fbc && { fbc: u.fbc }),
```

Insert a new line **before** `...(u.fbc && ...)`:

```ts
    ...(u.externalId && { external_id: hashPII(u.externalId) }),
    ...((u.birthdate && toYYYYMMDD(u.birthdate)) && {
      db: hashPII(toYYYYMMDD(u.birthdate)!),
    }),
    ...(u.fbc && { fbc: u.fbc }),
```

The double-call to `toYYYYMMDD` is intentional: the spread guard already proves the value is non-null, and the `!` non-null assertion keeps TypeScript happy without introducing a temporary variable that would force a control-flow refactor of the object literal.

- [ ] **Step 4: Run test to verify it passes.**

Run: `npm run test:facebook-capi`
Expected: all four cases pass, including `testFacebookProviderHashesBirthdateAsDb`.

- [ ] **Step 5: Type-check.**

Run: `npm run type-check`
Expected: 0 errors.

---

## Task 3 — Browser `getFBCFromURL` reads `_fbc` cookie first

**Files:**
- Modify: `src/utils/tracking/facebook-helpers.ts:22-51`

**Why:** Today the browser helper rebuilds `fb.1.{Date.now()}.{fbclid}` on every call, ignoring an existing `_fbc` cookie that the Pixel SDK set at click time. This produces a different `fbc` value than the browser Pixel SDK uses internally, breaking pixel↔CAPI consistency.

This task has no test in `facebook.test.ts` — it's covered by Task 10's new emq test file (which mocks `document.cookie`).

- [ ] **Step 1: Replace the function body.**

Open `src/utils/tracking/facebook-helpers.ts`. Replace lines 22–51 (the entire `getFBCFromURL` function and its preceding doc comment) with:

```ts
/**
 * Extract Facebook Click ID (fbc) on the browser side.
 *
 * Priority order (matches server-side `extractFBCFromRequest`):
 *   1. The `_fbc` cookie set by the Pixel SDK at click time (this is what
 *      the Pixel itself reads — using it preserves pixel↔CAPI consistency).
 *   2. Fallback: build `fb.1.{Date.now()}.{fbclid}` from the URL when no
 *      cookie is present. The fallback timestamp drifts across calls but
 *      is acceptable for first-touch cookie-blocked visits.
 *
 * @returns Facebook Click ID if found, undefined otherwise
 */
export function getFBCFromURL(): string | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    // 1. Cookie set by Pixel SDK (canonical fb.1.{ts}.{fbclid} format).
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "_fbc" && value) {
        // SDK does not URL-encode the value; decode defensively only when
        // there is a percent sign in the raw value.
        return value.includes("%") ? decodeURIComponent(value) : value;
      }
    }

    // 2. URL fallback when cookie is absent.
    const urlParams = new URLSearchParams(window.location.search);
    const fbclid = urlParams.get("fbclid");
    if (fbclid) {
      return `fb.1.${Date.now()}.${fbclid}`;
    }

    const fbc = urlParams.get("fbc");
    if (fbc) return fbc;

    return undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 2: Type-check.**

Run: `npm run type-check`
Expected: 0 errors.

---

## Task 4 — `trackPixelSubscription` includes state + birthdate

**Files:**
- Modify: `src/utils/tracking/pixel-purchase-tracking.ts:313-394` (the `trackPixelSubscription` function signature + body)

**Why:** The initial Subscribe / Unsubscribe path correctly threads ip/ua/fbc/fbp but never accepts or forwards `state`/`birthdate`/`zipCode`. Add optional params and forward them to `prepareUserData`.

- [ ] **Step 1: Extend the params object on the function signature.**

Open `src/utils/tracking/pixel-purchase-tracking.ts`. Find the params type for `trackPixelSubscription` (lines 314–339, the object after `action: "Subscribe" | "Unsubscribe",`). Add three new optional fields immediately after `userLastName?: string;`:

```ts
    userLastName?: string;
    userState?: string;
    userBirthdate?: string | Date;
    userZipCode?: string;
    entriesPerMonth?: number;
```

- [ ] **Step 2: Destructure the new fields.**

In the destructure block (lines 342–359), add the new names. Change:

```ts
      userFirstName,
      userLastName,
      entriesPerMonth,
```

to:

```ts
      userFirstName,
      userLastName,
      userState,
      userBirthdate,
      userZipCode,
      entriesPerMonth,
```

- [ ] **Step 3: Forward them into `prepareUserData`.**

Find the `prepareUserData` call (lines 389–394). Change:

```ts
      const userData = prepareUserData({
        email: userEmail,
        phone: userPhone,
        firstName: userFirstName,
        lastName: userLastName,
      });
```

to:

```ts
      const userData = prepareUserData({
        email: userEmail,
        phone: userPhone,
        firstName: userFirstName,
        lastName: userLastName,
        state: userState,
        birthdate: userBirthdate,
        zipCode: userZipCode,
      });
```

- [ ] **Step 4: Verify type-check.**

Run: `npm run type-check`
Expected: 0 errors. (Callers that don't pass the new fields are unaffected because the fields are optional.)

---

## Task 5 — `trackPixelSubscriptionUpgrade` accepts requestContext + full user fields

**Files:**
- Modify: `src/utils/tracking/pixel-purchase-tracking.ts:463-550` (the `trackPixelSubscriptionUpgrade` function)

- [ ] **Step 1: Extend the params object on the function signature.**

Find the params type for `trackPixelSubscriptionUpgrade` (lines 463–477). Replace it with:

```ts
export async function trackPixelSubscriptionUpgrade(params: {
  oldValue: number;
  newValue: number;
  currency: string;
  oldPackageId: string;
  newPackageId: string;
  oldPackageName: string;
  newPackageName: string;
  subscriptionId: string;
  userId?: string;
  userEmail?: string;
  userPhone?: string;
  userFirstName?: string;
  userLastName?: string;
  userState?: string;
  userBirthdate?: string | Date;
  userZipCode?: string;
  paymentIntentId?: string;
  prorationAmount?: number;
  entriesAdded?: number;
  requestContext?: {
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
    event_source_url?: string;
  };
}): Promise<void> {
```

- [ ] **Step 2: Destructure the new fields.**

In the destructure block (currently lines 479–493), add the new names:

```ts
    const {
      oldValue,
      newValue,
      currency,
      oldPackageId,
      newPackageId,
      oldPackageName,
      newPackageName,
      subscriptionId,
      userId,
      userEmail,
      userPhone,
      userFirstName,
      userLastName,
      userState,
      userBirthdate,
      userZipCode,
      paymentIntentId,
      prorationAmount,
      entriesAdded,
      requestContext,
    } = params;
```

- [ ] **Step 3: Build a richer `prepareUserData` input and attach request context.**

Find the existing `prepareUserData` call (lines 518–522):

```ts
    const hashed = prepareUserData({
      email: userEmail,
      country: "AU",
      ...(userId && { externalId: userId }),
    });
```

Replace with:

```ts
    const hashed = prepareUserData({
      email: userEmail,
      phone: userPhone,
      firstName: userFirstName,
      lastName: userLastName,
      state: userState,
      birthdate: userBirthdate,
      zipCode: userZipCode,
      country: "AU",
      ...(userId && { externalId: userId }),
    });
    if (requestContext?.client_ip_address) hashed.client_ip_address = requestContext.client_ip_address;
    if (requestContext?.client_user_agent) hashed.client_user_agent = requestContext.client_user_agent;
    if (requestContext?.fbc) hashed.fbc = requestContext.fbc;
    if (requestContext?.fbp) hashed.fbp = requestContext.fbp;
```

- [ ] **Step 4: Use `requestContext.event_source_url` when available.**

Find the existing `event_source_url` line (line 539):

```ts
      event_source_url: getServerEventSourceUrlFallback(),
```

Replace with:

```ts
      event_source_url: requestContext?.event_source_url ?? getServerEventSourceUrlFallback(),
```

- [ ] **Step 5: Type-check.**

Run: `npm run type-check`
Expected: 0 errors.

---

## Task 6 — `trackPixelSubscriptionDowngrade` accepts requestContext + full user fields

**Files:**
- Modify: `src/utils/tracking/pixel-purchase-tracking.ts:555-640` (the `trackPixelSubscriptionDowngrade` function)

Apply the same shape of changes as Task 5. The structure of `trackPixelSubscriptionDowngrade` is parallel to `trackPixelSubscriptionUpgrade`.

- [ ] **Step 1: Extend the params type.**

Find the params type for `trackPixelSubscriptionDowngrade` (lines 555–569). Replace with:

```ts
export async function trackPixelSubscriptionDowngrade(params: {
  oldValue: number;
  newValue: number;
  currency: string;
  oldPackageId: string;
  newPackageId: string;
  oldPackageName: string;
  newPackageName: string;
  subscriptionId: string;
  userId?: string;
  userEmail?: string;
  userPhone?: string;
  userFirstName?: string;
  userLastName?: string;
  userState?: string;
  userBirthdate?: string | Date;
  userZipCode?: string;
  paymentIntentId?: string;
  prorationAmount?: number;
  entriesRemoved?: number;
  requestContext?: {
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
    event_source_url?: string;
  };
}): Promise<void> {
```

- [ ] **Step 2: Destructure the new fields.**

Replace the destructure block (currently lines 571–585) with:

```ts
    const {
      oldValue,
      newValue,
      currency,
      oldPackageId,
      newPackageId,
      oldPackageName,
      newPackageName,
      subscriptionId,
      userId,
      userEmail,
      userPhone,
      userFirstName,
      userLastName,
      userState,
      userBirthdate,
      userZipCode,
      paymentIntentId,
      prorationAmount,
      entriesRemoved,
      requestContext,
    } = params;
```

- [ ] **Step 3: Build the richer user_data + attach request context.**

Find the existing `prepareUserData` call (lines 608–612):

```ts
    const hashedDown = prepareUserData({
      email: userEmail,
      country: "AU",
      ...(userId && { externalId: userId }),
    });
```

Replace with:

```ts
    const hashedDown = prepareUserData({
      email: userEmail,
      phone: userPhone,
      firstName: userFirstName,
      lastName: userLastName,
      state: userState,
      birthdate: userBirthdate,
      zipCode: userZipCode,
      country: "AU",
      ...(userId && { externalId: userId }),
    });
    if (requestContext?.client_ip_address) hashedDown.client_ip_address = requestContext.client_ip_address;
    if (requestContext?.client_user_agent) hashedDown.client_user_agent = requestContext.client_user_agent;
    if (requestContext?.fbc) hashedDown.fbc = requestContext.fbc;
    if (requestContext?.fbp) hashedDown.fbp = requestContext.fbp;
```

- [ ] **Step 4: Use `requestContext.event_source_url` when available.**

Find the `event_source_url` line (line 629):

```ts
      event_source_url: getServerEventSourceUrlFallback(),
```

Replace with:

```ts
      event_source_url: requestContext?.event_source_url ?? getServerEventSourceUrlFallback(),
```

- [ ] **Step 5: Type-check.**

Run: `npm run type-check`
Expected: 0 errors.

---

## Task 7 — Delete `trackPixelCancellation`

**Files:**
- Modify: `src/utils/tracking/pixel-purchase-tracking.ts:643-704` (delete the entire function)

**Why:** Function has no callers anywhere in `src/`. Confirmed via:

```bash
grep -rn "trackPixelCancellation" src/
```

Only the function declaration itself is matched.

- [ ] **Step 1: Re-confirm no callers exist.**

Run: `grep -rn "trackPixelCancellation" src/`
Expected: only `src/utils/tracking/pixel-purchase-tracking.ts` appears in the output. If anything else appears, STOP and report.

- [ ] **Step 2: Delete the function.**

Open `src/utils/tracking/pixel-purchase-tracking.ts`. Delete the lines covering the doc comment + `export async function trackPixelCancellation` + body + closing brace. In the current file state this is approximately lines 642–704 (the doc comment at 642–644, the function signature at 645–654, and the body through 704).

After deletion, the next function should be `trackPixelSubscriptionRenewal` starting with its doc comment.

- [ ] **Step 3: Type-check.**

Run: `npm run type-check`
Expected: 0 errors. (No callers means no broken imports.)

---

## Task 8 — Pass `requestContext` + extra user fields from upgrade route

**Files:**
- Modify: `src/app/api/stripe/upgrade-subscription-payment/route.ts:326-346`

- [ ] **Step 1: Add the `extractRequestContext` import.**

At the top of `src/app/api/stripe/upgrade-subscription-payment/route.ts`, locate the existing imports. If `extractRequestContext` is not already imported from `@/utils/tracking/facebook-helpers`, add:

```ts
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";
```

(If the file already imports from `@/utils/tracking/facebook-helpers`, just add `extractRequestContext` to that named-import list.)

- [ ] **Step 2: Extract requestContext and pass it + extra user fields.**

Find the `trackPixelSubscriptionUpgrade` call (lines 327–342). Replace the entire call (and the `try` block contents around it) with:

```ts
      try {
        const { trackPixelSubscriptionUpgrade } = await import("@/utils/tracking/pixel-purchase-tracking");
        const requestContext = extractRequestContext(request);
        await trackPixelSubscriptionUpgrade({
          oldValue: currentPackage.price,
          newValue: newPackage.price,
          currency: "AUD",
          oldPackageId: currentPackage._id,
          newPackageId: newPackage._id,
          oldPackageName: currentPackage.name,
          newPackageName: newPackage.name,
          subscriptionId: updatedSubscription.id,
          userId: user._id.toString(),
          userEmail: user.email,
          userPhone: user.mobile,
          userFirstName: user.firstName,
          userLastName: user.lastName,
          userState: user.state,
          userBirthdate: user.birthdate,
          userZipCode: user.postCode,
          paymentIntentId: paymentIntent?.id,
          prorationAmount: prorationAmount / 100,
          entriesAdded: (newPackage.entriesPerMonth || 0) - (currentPackage.entriesPerMonth || 0),
          requestContext,
        });
      } catch (pixelError) {
        console.error("❌ Pixel upgrade tracking failed (non-blocking):", pixelError);
      }
```

**Field-name gotcha:** Verify the User model field names match — `user.mobile`, `user.firstName`, `user.lastName`, `user.state`, `user.birthdate`, `user.postCode`. Open `src/models/User.ts` and grep for each. If any field has a different name (e.g. `zipCode` vs `postCode`), use the actual field name from the model. The plan assumes the User document already loaded at this point in the route has access to these (it should — the route called `user.save()` immediately before).

- [ ] **Step 3: Type-check.**

Run: `npm run type-check`
Expected: 0 errors. If a field name is wrong, fix per the User model and re-run.

---

## Task 9 — Pass `requestContext` + extra user fields from downgrade route

**Files:**
- Modify: `src/app/api/stripe/downgrade-subscription/route.ts:241-260`

Apply the same shape as Task 8.

- [ ] **Step 1: Add the `extractRequestContext` import.**

At the top of `src/app/api/stripe/downgrade-subscription/route.ts`, if not already imported:

```ts
import { extractRequestContext } from "@/utils/tracking/facebook-helpers";
```

- [ ] **Step 2: Extract requestContext and pass it + extra user fields.**

Find the `trackPixelSubscriptionDowngrade` call (lines 242–256). Replace the entire `try` block with:

```ts
    try {
      const { trackPixelSubscriptionDowngrade } = await import("@/utils/tracking/pixel-purchase-tracking");
      const requestContext = extractRequestContext(request);
      await trackPixelSubscriptionDowngrade({
        oldValue: currentPackage.price,
        newValue: newPackage.price,
        currency: "AUD",
        oldPackageId: currentPackage._id,
        newPackageId: newPackage._id,
        oldPackageName: currentPackage.name,
        newPackageName: newPackage.name,
        subscriptionId: user.stripeSubscriptionId,
        userId: user._id.toString(),
        userEmail: user.email,
        userPhone: user.mobile,
        userFirstName: user.firstName,
        userLastName: user.lastName,
        userState: user.state,
        userBirthdate: user.birthdate,
        userZipCode: user.postCode,
        prorationAmount: 0,
        entriesRemoved: (currentPackage.entriesPerMonth || 0) - (newPackage.entriesPerMonth || 0),
        requestContext,
      });
    } catch (pixelError) {
      console.error("❌ Pixel downgrade tracking failed (non-blocking):", pixelError);
    }
```

Verify field names against `src/models/User.ts` per the same gotcha noted in Task 8.

- [ ] **Step 3: Type-check.**

Run: `npm run type-check`
Expected: 0 errors.

---

## Task 10 — Add `state` + `birthdate` to all 4 register-route `prepareUserData` calls

**Files:**
- Create: `src/utils/tracking/registration-user-data.ts`
- Modify: `src/app/api/auth/register/route.ts` (4 call sites around lines 333, 455, 547, 710)

**Why:** Each of the four CompleteRegistration code paths builds `prepareUserData(...)` with email/phone/firstName/lastName/externalId but omits `state` and `birthdate` which are available on the in-scope user document. Adding them is null-safe because `prepareUserData` already skips falsy fields.

Approach: extract a tiny pure helper `userDataForRegistration(u)` into its own file under `src/utils/tracking/`, then use it at all four call sites. The new file is justified by (a) eliminating 4× duplication across the four branches and (b) making the helper trivially testable without pulling the entire route module's side-effect imports (Mongoose models, NextAuth, Klaviyo, etc.) into the test process. The file lives under the `tracking` domain manifest path (`src/utils/tracking/**`) so no manifest edit is needed.

- [ ] **Step 1: Create the helper file.**

Create `src/utils/tracking/registration-user-data.ts` with this content:

```ts
/**
 * Build the input object passed to `prepareUserData` for a CompleteRegistration
 * CAPI event. Includes `state` and `birthdate` so the resulting `user_data`
 * carries hashed `st` and `db` whenever the user has those fields populated.
 *
 * Pure: no I/O, no module side effects. Safe to import from tests.
 */
export function userDataForRegistration(u: {
  email: string;
  mobile?: string;
  firstName?: string;
  lastName?: string;
  state?: string;
  birthdate?: string | Date;
  _id: { toString(): string };
}) {
  return {
    email: u.email,
    phone: u.mobile,
    firstName: u.firstName,
    lastName: u.lastName,
    state: u.state,
    birthdate: u.birthdate,
    externalId: u._id.toString(),
  };
}
```

- [ ] **Step 2: Import the helper in `register/route.ts`.**

Open `src/app/api/auth/register/route.ts`. Locate the existing imports from `@/utils/tracking/...` (there is already one for `prepareUserData` / `extractRequestContext`). Add `userDataForRegistration`:

```ts
import { userDataForRegistration } from "@/utils/tracking/registration-user-data";
```

- [ ] **Step 3: Replace the 4 `prepareUserData(...)` invocations.**

Find each of the 4 occurrences (lines approximately 333, 455, 547, 710 in current state). Each looks like:

```ts
const userData = prepareUserData({
  email: existingUser.email,        // or newUser.email at line 710
  phone: existingUser.mobile,
  firstName: existingUser.firstName,
  lastName: existingUser.lastName,
  externalId: existingUser._id.toString(),
});
```

Replace each with:

```ts
const userData = prepareUserData(userDataForRegistration(existingUser));
```

For the 4th occurrence (around line 710) the local variable is `newUser` not `existingUser`:

```ts
const userData = prepareUserData(userDataForRegistration(newUser));
```

- [ ] **Step 4: Type-check.**

Run: `npm run type-check`
Expected: 0 errors.

---

## Task 11 — New test file: `facebook-emq.test.ts` + wire `test:facebook-emq` script

**Files:**
- Create: `src/utils/tracking/__tests__/facebook-emq.test.ts`
- Modify: `package.json` (add `test:facebook-emq` entry near line 78)

This test file covers the four bug fixes that aren't directly testable through the existing `test:facebook-capi` (which already covers the canonical-provider `db` mapping after Task 2).

- [ ] **Step 1: Add the new script to `package.json`.**

Open `package.json`. Locate line 78:

```json
    "test:facebook-capi": "tsx src/lib/__tests__/facebook.test.ts",
```

Add the new line immediately after:

```json
    "test:facebook-capi": "tsx src/lib/__tests__/facebook.test.ts",
    "test:facebook-emq": "tsx src/utils/tracking/__tests__/facebook-emq.test.ts",
```

- [ ] **Step 2: Write the failing test file.**

Create `src/utils/tracking/__tests__/facebook-emq.test.ts` with this content:

```ts
import assert from "node:assert/strict";

function snapshotEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}

function restoreEnv(saved: NodeJS.ProcessEnv) {
  process.env = saved;
}

// --- Test 1: trackPixelSubscriptionUpgrade emits st/db/ip/ua ---
async function testUpgradeFiresFullUserData() {
  const saved = snapshotEnv();
  process.env.VERCEL_ENV = "production";
  process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = "123456789";
  delete process.env.FACEBOOK_USE_TEST_EVENTS;
  delete process.env.FACEBOOK_TEST_EVENT_CODE;

  let captured: { user_data?: Record<string, string | undefined> } | null = null;
  const prevFetch = global.fetch;
  global.fetch = async function _capture(_url, init) {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    captured = body?.data?.[0] ?? null;
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  } as typeof fetch;

  const { trackPixelSubscriptionUpgrade } = await import("../pixel-purchase-tracking");
  await trackPixelSubscriptionUpgrade({
    oldValue: 10,
    newValue: 20,
    currency: "AUD",
    oldPackageId: "pkg-old",
    newPackageId: "pkg-new",
    oldPackageName: "Old",
    newPackageName: "New",
    subscriptionId: "sub_123",
    userId: "user_abc",
    userEmail: "buyer@example.com",
    userPhone: "+61400000000",
    userFirstName: "Jane",
    userLastName: "Doe",
    userState: "NSW",
    userBirthdate: "1990-06-15",
    paymentIntentId: "pi_x",
    prorationAmount: 5,
    entriesAdded: 1,
    requestContext: {
      client_ip_address: "203.0.113.7",
      client_user_agent: "Mozilla/5.0 (test)",
    },
  });

  assert.ok(captured, "Upgrade must POST to FB CAPI");
  const ud = captured!.user_data ?? {};
  assert.ok(ud.em && ud.em.length === 64, "Upgrade must hash email into em");
  assert.ok(ud.st && ud.st.length === 64, "Upgrade must hash state into st");
  assert.ok(ud.db && ud.db.length === 64, "Upgrade must hash birthdate into db");
  assert.equal(ud.client_ip_address, "203.0.113.7", "Upgrade must forward raw IP");
  assert.equal(ud.client_user_agent, "Mozilla/5.0 (test)", "Upgrade must forward raw UA");
  assert.ok(ud.external_id, "Upgrade must include hashed external_id");

  global.fetch = prevFetch;
  restoreEnv(saved);
}

// --- Test 2: trackPixelSubscriptionDowngrade emits st/db/ip/ua ---
async function testDowngradeFiresFullUserData() {
  const saved = snapshotEnv();
  process.env.VERCEL_ENV = "production";
  process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = "123456789";
  delete process.env.FACEBOOK_USE_TEST_EVENTS;
  delete process.env.FACEBOOK_TEST_EVENT_CODE;

  let captured: { user_data?: Record<string, string | undefined> } | null = null;
  const prevFetch = global.fetch;
  global.fetch = async function _capture(_url, init) {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    captured = body?.data?.[0] ?? null;
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  } as typeof fetch;

  const { trackPixelSubscriptionDowngrade } = await import("../pixel-purchase-tracking");
  await trackPixelSubscriptionDowngrade({
    oldValue: 20,
    newValue: 10,
    currency: "AUD",
    oldPackageId: "pkg-old",
    newPackageId: "pkg-new",
    oldPackageName: "Old",
    newPackageName: "New",
    subscriptionId: "sub_123",
    userId: "user_abc",
    userEmail: "buyer@example.com",
    userState: "VIC",
    userBirthdate: new Date("1985-12-31T00:00:00Z"),
    requestContext: {
      client_ip_address: "203.0.113.8",
      client_user_agent: "Mozilla/5.0 (down)",
    },
  });

  assert.ok(captured, "Downgrade must POST to FB CAPI");
  const ud = captured!.user_data ?? {};
  assert.ok(ud.st && ud.st.length === 64, "Downgrade must hash state into st");
  assert.ok(ud.db && ud.db.length === 64, "Downgrade must hash birthdate into db");
  assert.equal(ud.client_ip_address, "203.0.113.8", "Downgrade must forward raw IP");
  assert.equal(ud.client_user_agent, "Mozilla/5.0 (down)", "Downgrade must forward raw UA");

  global.fetch = prevFetch;
  restoreEnv(saved);
}

// --- Test 3: trackPixelSubscription forwards state + birthdate ---
async function testSubscribeFiresStateAndBirthdate() {
  const saved = snapshotEnv();
  process.env.VERCEL_ENV = "production";
  process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = "123456789";
  delete process.env.FACEBOOK_USE_TEST_EVENTS;
  delete process.env.FACEBOOK_TEST_EVENT_CODE;

  let captured: { user_data?: Record<string, string | undefined> } | null = null;
  const prevFetch = global.fetch;
  global.fetch = async function _capture(_url, init) {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    captured = body?.data?.[0] ?? null;
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  } as typeof fetch;

  const { trackPixelSubscription } = await import("../pixel-purchase-tracking");
  await trackPixelSubscription("Subscribe", {
    value: 19,
    currency: "AUD",
    packageId: "pkg-1",
    packageName: "Starter",
    subscriptionId: "sub_1",
    userId: "u1",
    userEmail: "x@y.com",
    userFirstName: "Alex",
    userLastName: "Smith",
    userState: "QLD",
    userBirthdate: "1992-02-29",
    clientIpAddress: "203.0.113.9",
    clientUserAgent: "Mozilla/5.0 (sub)",
  });

  assert.ok(captured, "Subscribe must POST to FB CAPI");
  const ud = captured!.user_data ?? {};
  assert.ok(ud.st && ud.st.length === 64, "Subscribe must hash state into st");
  assert.ok(ud.db && ud.db.length === 64, "Subscribe must hash birthdate into db");

  global.fetch = prevFetch;
  restoreEnv(saved);
}

// --- Test 4: register helper userDataForRegistration includes state + birthdate ---
async function testRegisterHelperIncludesStateAndBirthdate() {
  const { userDataForRegistration } = await import("../registration-user-data");
  const result = userDataForRegistration({
    email: "alice@example.com",
    mobile: "+61400000000",
    firstName: "Alice",
    lastName: "Lee",
    state: "WA",
    birthdate: "1995-03-10",
    _id: { toString: () => "user_id_123" },
  });
  assert.equal(result.state, "WA", "helper must forward state");
  assert.equal(result.birthdate, "1995-03-10", "helper must forward birthdate");
  assert.equal(result.externalId, "user_id_123", "helper must stringify _id");
  assert.equal(result.email, "alice@example.com");
  assert.equal(result.phone, "+61400000000");
}

// --- Test 5: browser getFBCFromURL reads _fbc cookie first ---
async function testBrowserGetFBCReadsFbcCookieFirst() {
  // Stub window + document for browser-only helper.
  const prevWindow = (globalThis as { window?: unknown }).window;
  const prevDocument = (globalThis as { document?: unknown }).document;

  (globalThis as { window?: unknown }).window = { location: { search: "?fbclid=URLCLICKID" } };
  (globalThis as { document?: unknown }).document = {
    cookie: "_fbp=fb.1.111.aaa; _fbc=fb.1.222.COOKIECLICK",
  };

  // Force a fresh import so the helper closes over the new globals.
  const helpersPath = require.resolve("../facebook-helpers");
  delete require.cache[helpersPath];
  const { getFBCFromURL } = await import("../facebook-helpers");

  const got = getFBCFromURL();
  assert.equal(got, "fb.1.222.COOKIECLICK", "must return _fbc cookie value verbatim, ignoring URL fbclid");

  // Clear cookie → fall back to URL.
  (globalThis as { document?: unknown }).document = { cookie: "" };
  delete require.cache[helpersPath];
  const { getFBCFromURL: getFBCFromURL2 } = await import("../facebook-helpers");
  const fallback = getFBCFromURL2();
  assert.ok(fallback?.startsWith("fb.1.") && fallback.endsWith(".URLCLICKID"), "fallback must build from URL fbclid");

  (globalThis as { window?: unknown }).window = prevWindow;
  (globalThis as { document?: unknown }).document = prevDocument;
}

async function run() {
  await testUpgradeFiresFullUserData();
  await testDowngradeFiresFullUserData();
  await testSubscribeFiresStateAndBirthdate();
  await testRegisterHelperIncludesStateAndBirthdate();
  await testBrowserGetFBCReadsFbcCookieFirst();
  console.log("facebook-emq tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Run the test.**

Run: `npm run test:facebook-emq`
Expected: `facebook-emq tests passed`.

If Test 5 (cookie-first) fails with a `require.cache` error, the project may treat the test as pure ESM. In that case replace the two `delete require.cache[helpersPath];` lines with a cache-busting query param re-import:

```ts
const { getFBCFromURL } = await import("../facebook-helpers?cb=" + Date.now());
```

Validate Test 5 logic only — Tests 1–4 do not depend on cache busting.

- [ ] **Step 4: Run the existing test to confirm no regression.**

Run: `npm run test:facebook-capi`
Expected: all four cases pass.

---

## Task 12 — Verification (lint + type-check + both test scripts)

**Files:** none.

- [ ] **Step 1: Lint.**

Run: `npm run lint`
Expected: 0 errors. Fix anything reported before continuing.

- [ ] **Step 2: Type-check.**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 3: Both test scripts.**

Run: `npm run test:facebook-capi && npm run test:facebook-emq`
Expected: both report "passed".

---

## Task 13 — Docs updates (per CLAUDE.md doc-sync rule)

**Files:**
- Modify: `docs/tracking/gotchas.md`
- Modify: `docs/tracking/api.md`
- Modify: `docs/tracking/backend.md`
- Modify: `docs/tracking/testing.md`
- Modify: `docs/tracking/SPEC_PIXEL_CAPI_PARITY.md`

All five files belong to the `tracking` domain per the manifest. The doc-sync Stop hook will block the commit if any source file we touched lacks a corresponding doc update.

- [ ] **Step 1: Update `docs/tracking/gotchas.md`.**

Edit the existing "Server-side fbc reads `_fbc` cookie first; URL fallback uses `Date.now()`" entry to note the browser helper now mirrors this priority order:

Find the heading `## Server-side fbc reads _fbc cookie first; URL fallback uses Date.now()` and rewrite it to:

```markdown
## Both browser and server fbc read `_fbc` cookie first; URL fallback uses `Date.now()`

[`extractFBCFromRequest`](../../src/utils/tracking/facebook-helpers.ts) (server) and [`getFBCFromURL`](../../src/utils/tracking/facebook-helpers.ts) (browser) both read the Facebook Pixel `_fbc` cookie first. Only when no cookie is present do they fall back to building `fb.1.{Date.now()}.{fbclid}` from a URL `?fbclid=…` parameter.

The fallback's timestamp is **the request time, not the click time** — Meta's spec calls for click time. We prefer it over rejecting fbc entirely so cookie-blocked first-touch visitors still contribute partial attribution.

The browser helper was previously *only* using the URL fallback, even when the SDK had already written a canonical `_fbc` cookie. That produced a different `fbc` on every call and caused pixel↔CAPI mismatches. Fixed 2026-05-14.

Important: the fallback is non-deterministic across calls. Any code path that uses the returned fbc in a Stripe idempotency-keyed request body (subscription create) must wrap the call with the [billing-stripe P10 pattern](../billing-stripe/patterns.md#p10-one-shot-idempotency-retry-on-key-collisions). For other CAPI flows (the standard `/api/facebook/*` event endpoints), the drift is harmless.
```

Then add a new gotcha section at the end of the file:

```markdown
## CAPI user_data: raw vs hashed field matrix

Meta's CAPI accepts some `user_data` fields **raw** and others as SHA-256 hashes. Mixing them up silently degrades Event Match Quality with no error.

| Field | Format | Examples |
|---|---|---|
| `em`, `ph`, `fn`, `ln`, `ct`, `st`, `zp`, `country`, `external_id`, `db` | SHA-256 lowercased | `hashPII("nsw")` |
| `fbp`, `fbc`, `client_ip_address`, `client_user_agent` | Raw | `fb.1.1700000000000.AbC123` |

`hashPII` and `prepareUserData` both lowercase-trim before hashing. Pass `"NSW"` and the helper handles normalization. Do not pre-hash any field — that double-hashes it.

## `db` (birthdate) format is `YYYYMMDD`, not ISO

The `db` parameter must be hashed `YYYYMMDD` digits (e.g. `hashPII("19900615")`), **not** ISO `YYYY-MM-DD`. Use `toYYYYMMDD()` from `facebook-helpers.ts` — it accepts `Date` objects, ISO strings, and pre-formatted 8-digit strings, and returns `null` for unparseable input so the caller can skip the field. Wrong format produces no error but silently drops match quality.
```

- [ ] **Step 2: Update `docs/tracking/api.md`.**

Open `docs/tracking/api.md`. Find any user_data field matrix or table that lists which CAPI parameters are sent. Add `db` and confirm `st`/`client_ip_address`/`client_user_agent` are all listed for the Subscribe/Unsubscribe/CompleteRegistration flows. If no matrix exists, add a short subsection:

```markdown
## CAPI user_data field coverage by event

| Event | em | ph | fn/ln | st | db | external_id | ip | ua | fbp | fbc |
|---|---|---|---|---|---|---|---|---|---|---|
| Purchase | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Subscribe (initial) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Subscribe (upgrade) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Subscribe (downgrade) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CompleteRegistration | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

All fields above flow when the corresponding user document has the data populated and the request reaches the helper with a `requestContext`. Empty values are skipped null-safely.
```

- [ ] **Step 3: Update `docs/tracking/backend.md`.**

Open `docs/tracking/backend.md`. Find the section describing Subscribe-family helpers (or add a short subsection if none exists):

```markdown
## Subscribe-family helpers thread `requestContext`

`trackPixelSubscriptionUpgrade` and `trackPixelSubscriptionDowngrade` both accept an optional `requestContext?: { client_ip_address?; client_user_agent?; fbc?; fbp?; event_source_url? }` parameter. Route handlers in `src/app/api/stripe/upgrade-subscription-payment/` and `src/app/api/stripe/downgrade-subscription/` build this via `extractRequestContext(request)` (from `@/utils/tracking/facebook-helpers`) and pass it through. The helpers attach `client_ip_address` and `client_user_agent` raw onto `user_data` so Meta receives the request-time IP and UA.

Both helpers also accept `userState`, `userBirthdate`, `userZipCode` so the resulting CAPI event carries hashed `st`/`db`/`zp`. Pass them from the in-scope User document fields (`user.state`, `user.birthdate`, `user.postCode` — verify exact field names in `src/models/User.ts`).
```

- [ ] **Step 4: Update `docs/tracking/testing.md`.**

Open `docs/tracking/testing.md`. Find the section listing test scripts (or add one). Add an entry for the new test:

```markdown
- `npm run test:facebook-emq` — `src/utils/tracking/__tests__/facebook-emq.test.ts`. Stubs `global.fetch` and asserts that `trackPixelSubscriptionUpgrade`, `trackPixelSubscriptionDowngrade`, and `trackPixelSubscription` all emit `user_data` containing hashed `st`/`db` plus raw `client_ip_address`/`client_user_agent` when the helpers receive populated user fields + requestContext. Also tests the pure `userDataForRegistration` helper from the register route, and the cookie-first behavior of the browser `getFBCFromURL`.
```

If `test:facebook-capi` is already documented, extend its description to mention the new `testFacebookProviderHashesBirthdateAsDb` case.

- [ ] **Step 5: Update `docs/tracking/SPEC_PIXEL_CAPI_PARITY.md`.**

Open `docs/tracking/SPEC_PIXEL_CAPI_PARITY.md`. At the top of the file (under the `Status:` line) add a cross-link:

```markdown
> 2026-05-14: Subscribe-family + register + canonical-`db` parity gaps closed under spec [`docs/superpowers/specs/2026-05-14-fb-capi-emq-fixes-design.md`](../superpowers/specs/2026-05-14-fb-capi-emq-fixes-design.md). See plan [`docs/superpowers/plans/2026-05-14-fb-capi-emq-fixes.md`](../superpowers/plans/2026-05-14-fb-capi-emq-fixes.md).
```

If §2.2 ("What's broken") enumerates the Subscribe-family gaps, mark them as resolved with a short note pointing to the spec link above. Do not delete the historical content.

- [ ] **Step 6: Verify the doc-sync Stop hook will be satisfied.**

The `tracking` domain manifest path already covers every file we touched (everything under `src/utils/tracking/**`, `src/lib/tracking/providers/**`, `src/app/api/stripe/**`, `src/app/api/auth/**`, and the test paths). No manifest edit required. The Stop hook compares `git diff --name-only` against the manifest; if it complains, re-read the manifest entries for `tracking` and `subscription` in `CLAUDE.md` and add any missing doc updates.

---

## Task 14 — User-gated commit

**Files:** none — this is a checkpoint, not a code change.

Per CLAUDE.md rule #1, the implementer **must not** run `git add`, `git commit`, `git push`, or `gh pr create` unless the user has explicitly authorized commits this session using one of the keywords: `commit`, `push`, `merge`, `make a PR`, `create a PR`, `open a PR`, `ship it`.

- [ ] **Step 1: Run `git status` and report what changed.**

Run: `git status`
Report the file list to the user.

- [ ] **Step 2: Ask the user how to proceed.**

Ask: *"All tasks done. Lint, type-check, and both FB test scripts green. Want me to commit, or do you want to review the diff first?"*

Wait for explicit authorization before any git operation. If the user has already authorized commits this session (per the hook's session-level scan), proceed with a commit using the message:

```
fix(tracking): close FB CAPI EMQ gaps in Subscribe-family, register, and canonical db
```

Followed by a body that lists the four bug fixes and the dead-code deletion.

---

## Risks recap

1. **User model field names.** Tasks 8 and 9 assume `user.mobile`, `user.firstName`, `user.lastName`, `user.state`, `user.birthdate`, `user.postCode`. Verify each by reading `src/models/User.ts` before saving the route changes. If a field is named differently, use the actual name.
2. **Mongo refetch in Upgrade/Downgrade.** Not introduced by this plan — both routes already have the `user` document loaded in scope. We just read more fields off it.
3. **`_fbc` cookie URL encoding.** Task 3 defensively decodes only when the cookie value contains `%`. SDK does not URL-encode in practice; the guard is cheap insurance.
4. **Test 5 ESM cache busting.** Documented in Task 11 Step 3 — fall back to query-string cache busting if `require.cache` mutation fails under tsx's ESM mode.
5. **Doc-sync hook false positives.** If the Stop hook complains about a file you didn't expect, the manifest may have a glob that doesn't match exactly. Read the hook's output, find the manifest entry it points to, and either widen the glob or add a small note to the implicated doc.

---

## Self-review checklist (run after implementation)

- [ ] All 13 code-bearing tasks complete (Task 14 is the commit gate; do not pre-check it).
- [ ] `npm run lint` clean.
- [ ] `npm run type-check` clean.
- [ ] `npm run test:facebook-capi` includes the new `testFacebookProviderHashesBirthdateAsDb` case and passes.
- [ ] `npm run test:facebook-emq` passes all five tests.
- [ ] `grep -rn "trackPixelCancellation" src/` returns zero matches.
- [ ] `docs/tracking/{gotchas,api,backend,testing}.md` all reflect the new behavior.
- [ ] `docs/tracking/SPEC_PIXEL_CAPI_PARITY.md` cross-links to this plan + the spec.
- [ ] No `git commit` / `git push` / `gh pr` invocations have run unless the user explicitly authorized.
