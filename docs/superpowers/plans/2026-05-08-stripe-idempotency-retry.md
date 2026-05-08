# Stripe Idempotency-Retry & FBC Determinism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `StripeIdempotencyError` from blocking checkout: catch it, cancel the orphan incomplete subscription, retry once with a fresh idempotency key — and remove the primary cause of metadata drift (`Date.now()` in server-side fbc reconstruction).

**Architecture:** Extract a single reusable helper `createSubscriptionWithIdempotencyRetry` in `src/utils/payment/stripe/`. Both subscription-create routes call it instead of `stripe.subscriptions.create` directly. Independently, change `extractFBCFromRequest` to read the `_fbc` cookie first and only fall back to building from `fbclid` when no cookie is set, so retries with the same UUID don't drift their metadata.

**Tech Stack:** Next.js 15 App Router, Stripe Node SDK, `tsx` test runner (no jest/vitest), `node:assert/strict` for assertions.

**CLAUDE.md hard rules respected:**
- **No auto-commit:** every task ends with a `Stage` step (`git add`) but never `git commit`. Commits are deferred until you explicitly say so.
- **Update docs when code changes:** Tasks 5 and 6 update `docs/billing-stripe/` and `docs/tracking/` to match the code changes.
- **Manifest:** all new files fall under existing manifest globs (`src/utils/payment/**` → `payment` domain; `src/utils/tracking/**` → `tracking` domain). No manifest edit needed.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `src/utils/payment/stripe/createSubscriptionWithIdempotencyRetry.ts` | **create** | Wrap `stripe.subscriptions.create` with one-shot retry on `StripeIdempotencyError` after cancelling the orphan incomplete sub matching customer+package |
| `src/utils/payment/stripe/__tests__/createSubscriptionWithIdempotencyRetry.test.ts` | **create** | tsx unit test for the helper, mocked Stripe client |
| `src/utils/tracking/facebook-helpers.ts` | **modify** | `extractFBCFromRequest`: read `_fbc` cookie first; fallback to URL fbclid build only when no cookie |
| `src/utils/tracking/__tests__/extractFBCFromRequest.test.ts` | **create** | tsx unit test verifying cookie-first determinism |
| `src/app/api/stripe/create-subscription/route.ts` | **modify** | Replace direct `stripe.subscriptions.create` call (~line 517-522) with `createSubscriptionWithIdempotencyRetry` |
| `src/app/api/stripe/create-subscription-existing-user/route.ts` | **modify** | Same replacement (~line 317-320) |
| `package.json` | **modify** | Add two `test:*` script entries |
| `docs/billing-stripe/patterns.md` | **modify** | Add `P10. One-shot idempotency-retry on key collisions` |
| `docs/billing-stripe/gotchas.md` | **modify** | Document the `capi_*` metadata drift gotcha |
| `docs/tracking/gotchas.md` | **modify** | Document fbc cookie-first behaviour |

**Layering split:** the helper lives in `src/utils/payment/stripe/` (pure, testable, no DB access). Route handlers stay thin — they only swap which function they call. No business-logic moves into `route.ts`.

---

## Task 1 — Make `extractFBCFromRequest` deterministic (cookie-first)

**Files:**
- Modify: `src/utils/tracking/facebook-helpers.ts:218-243`
- Create: `src/utils/tracking/__tests__/extractFBCFromRequest.test.ts`
- Modify: `package.json` (add `test:facebook-fbc-extract` script)

- [ ] **Step 1: Write the failing test**

Create `src/utils/tracking/__tests__/extractFBCFromRequest.test.ts` with:

```ts
import assert from "node:assert/strict";
import { extractFBCFromRequest } from "../facebook-helpers";

function makeRequest(opts: { url?: string; cookieValue?: string }) {
  return {
    url: opts.url,
    cookies: {
      get(name: string) {
        return opts.cookieValue && name === "_fbc" ? { value: opts.cookieValue } : undefined;
      },
    },
  };
}

function testReadsFbcCookieFirst() {
  const req = makeRequest({
    url: "https://example.com/checkout?fbclid=AbcXyz",
    cookieValue: "fb.1.1700000000.STABLE",
  });
  const fbc = extractFBCFromRequest(req);
  assert.equal(fbc, "fb.1.1700000000.STABLE");
}

function testFallsBackToFbclidWhenNoCookie() {
  const req = makeRequest({ url: "https://example.com/checkout?fbclid=AbcXyz" });
  const fbc = extractFBCFromRequest(req);
  assert.match(fbc ?? "", /^fb\.1\.\d+\.AbcXyz$/);
}

function testReturnsUndefinedWhenNoCookieAndNoFbclid() {
  const req = makeRequest({ url: "https://example.com/checkout" });
  assert.equal(extractFBCFromRequest(req), undefined);
}

function testTwoCallsWithCookieReturnSameValue() {
  const req = makeRequest({
    url: "https://example.com/checkout?fbclid=AbcXyz",
    cookieValue: "fb.1.1700000000.STABLE",
  });
  assert.equal(extractFBCFromRequest(req), extractFBCFromRequest(req));
}

function testFormattedFbcQueryParamPassesThrough() {
  const req = makeRequest({ url: "https://example.com/checkout?fbc=fb.1.999.YYY" });
  assert.equal(extractFBCFromRequest(req), "fb.1.999.YYY");
}

function run() {
  testReadsFbcCookieFirst();
  testFallsBackToFbclidWhenNoCookie();
  testReturnsUndefinedWhenNoCookieAndNoFbclid();
  testTwoCallsWithCookieReturnSameValue();
  testFormattedFbcQueryParamPassesThrough();
  console.log("extractFBCFromRequest tests passed");
}

run();
```

- [ ] **Step 2: Add the test:* script and run to verify FAIL**

Add to `package.json` `scripts` block (alongside the other `test:*` entries):

```json
"test:facebook-fbc-extract": "tsx src/utils/tracking/__tests__/extractFBCFromRequest.test.ts",
```

Run: `npm run test:facebook-fbc-extract`
Expected: FAIL on `testReadsFbcCookieFirst` — current code uses URL first, so it returns `fb.1.<Date.now()>.AbcXyz` instead of the cookie value.

- [ ] **Step 3: Update `extractFBCFromRequest` to read cookie first**

Replace `src/utils/tracking/facebook-helpers.ts:218-243` with:

```ts
/**
 * Extract Facebook Click ID (fbc) from NextRequest.
 *
 * Reads the `_fbc` cookie set by Facebook Pixel first — this value is
 * stable across server retries (set client-side at click time). Falls back
 * to building from `fbclid` query param using `Date.now()` only when no
 * cookie is present; that fallback drifts between calls and should be
 * avoided where the value flows into a Stripe idempotency-keyed request
 * body. See docs/tracking/gotchas.md.
 */
export function extractFBCFromRequest(request: {
  url?: string;
  headers?: Headers;
  cookies?: { get: (name: string) => { value: string } | undefined };
}): string | undefined {
  try {
    if (request.cookies) {
      const fbcCookie = request.cookies.get("_fbc");
      if (fbcCookie?.value) {
        return fbcCookie.value;
      }
    }

    if (!request.url) return undefined;

    const url = new URL(request.url);
    const urlParams = url.searchParams;

    const fbclid = urlParams.get("fbclid");
    if (fbclid) {
      const timestamp = Date.now();
      return `fb.1.${timestamp}.${fbclid}`;
    }

    const fbc = urlParams.get("fbc");
    if (fbc) {
      return fbc;
    }

    return undefined;
  } catch {
    return undefined;
  }
}
```

(Signature now accepts `cookies` — every existing caller already passes a request that includes `cookies`, so no caller changes needed.)

- [ ] **Step 4: Run test to verify PASS**

Run: `npm run test:facebook-fbc-extract`
Expected: `extractFBCFromRequest tests passed`

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 6: Stage**

```bash
git add src/utils/tracking/facebook-helpers.ts \
        src/utils/tracking/__tests__/extractFBCFromRequest.test.ts \
        package.json
```

(Do NOT commit. Wait for user authorization.)

---

## Task 2 — Create the idempotency-retry helper + unit test

**Files:**
- Create: `src/utils/payment/stripe/createSubscriptionWithIdempotencyRetry.ts`
- Create: `src/utils/payment/stripe/__tests__/createSubscriptionWithIdempotencyRetry.test.ts`
- Modify: `package.json` (add `test:stripe-idempotency-retry` script)

- [ ] **Step 1: Write the failing test**

Create `src/utils/payment/stripe/__tests__/createSubscriptionWithIdempotencyRetry.test.ts`:

```ts
import assert from "node:assert/strict";
import Stripe from "stripe";
import { createSubscriptionWithIdempotencyRetry } from "../createSubscriptionWithIdempotencyRetry";

type Call =
  | { method: "create"; payload: Stripe.SubscriptionCreateParams; opts: { idempotencyKey?: string } }
  | { method: "list"; params: Stripe.SubscriptionListParams }
  | { method: "cancel"; id: string };

function makeIdempotencyError(): Error {
  const err: Error = new Error(
    "Keys for idempotent requests can only be used with the same parameters they were first used with."
  );
  Object.setPrototypeOf(err, Stripe.errors.StripeIdempotencyError.prototype);
  return err;
}

function makeMockStripe(behavior: {
  firstCreateThrowsIdempotency?: boolean;
  firstCreateThrowsOther?: Error;
  listReturns?: Array<{ id: string; metadata?: Record<string, string> }>;
  listThrows?: Error;
}): { stripe: Stripe; calls: Call[] } {
  const calls: Call[] = [];
  let createCount = 0;
  const stripe = {
    subscriptions: {
      async create(payload: Stripe.SubscriptionCreateParams, opts: { idempotencyKey?: string }) {
        calls.push({ method: "create", payload, opts });
        createCount++;
        if (createCount === 1 && behavior.firstCreateThrowsIdempotency) throw makeIdempotencyError();
        if (createCount === 1 && behavior.firstCreateThrowsOther) throw behavior.firstCreateThrowsOther;
        return { id: `sub_${createCount}`, status: "incomplete" } as Stripe.Subscription;
      },
      async list(params: Stripe.SubscriptionListParams) {
        calls.push({ method: "list", params });
        if (behavior.listThrows) throw behavior.listThrows;
        return { data: behavior.listReturns ?? [] } as Stripe.ApiList<Stripe.Subscription>;
      },
      async cancel(id: string) {
        calls.push({ method: "cancel", id });
        return { id, status: "canceled" } as Stripe.Subscription;
      },
    },
  } as unknown as Stripe;
  return { stripe, calls };
}

const basePayload: Stripe.SubscriptionCreateParams = {
  customer: "cus_1",
  items: [{ price: "price_1" }],
};

async function testHappyPathSingleCreateCall() {
  const { stripe, calls } = makeMockStripe({});
  const sub = await createSubscriptionWithIdempotencyRetry({
    stripe,
    payload: basePayload,
    idempotencyKey: "uuid-original",
    customerId: "cus_1",
    packageId: "pkg_1",
  });
  assert.equal(sub.id, "sub_1");
  assert.equal(calls.filter((c) => c.method === "create").length, 1);
  assert.equal(calls.filter((c) => c.method === "list").length, 0);
  assert.equal(calls.filter((c) => c.method === "cancel").length, 0);
}

async function testRetriesAfterIdempotencyErrorAndCancelsOrphan() {
  const { stripe, calls } = makeMockStripe({
    firstCreateThrowsIdempotency: true,
    listReturns: [
      { id: "sub_orphan_other", metadata: { packageId: "pkg_OTHER" } },
      { id: "sub_orphan_match", metadata: { packageId: "pkg_1" } },
    ],
  });

  const sub = await createSubscriptionWithIdempotencyRetry({
    stripe,
    payload: basePayload,
    idempotencyKey: "uuid-original",
    customerId: "cus_1",
    packageId: "pkg_1",
  });

  assert.equal(sub.id, "sub_2", "retry result should be returned");

  const createCalls = calls.filter((c): c is Extract<Call, { method: "create" }> => c.method === "create");
  assert.equal(createCalls.length, 2);
  assert.equal(createCalls[0].opts.idempotencyKey, "uuid-original");
  assert.notEqual(createCalls[1].opts.idempotencyKey, "uuid-original");
  assert.match(createCalls[1].opts.idempotencyKey ?? "", /^[0-9a-f-]{36}$/i);

  const cancelCalls = calls.filter((c): c is Extract<Call, { method: "cancel" }> => c.method === "cancel");
  assert.equal(cancelCalls.length, 1);
  assert.equal(cancelCalls[0].id, "sub_orphan_match", "should cancel only the orphan matching this packageId");
}

async function testRetrySucceedsEvenWhenOrphanCancelFails() {
  const { stripe, calls } = makeMockStripe({
    firstCreateThrowsIdempotency: true,
    listThrows: new Error("list failed"),
  });

  const sub = await createSubscriptionWithIdempotencyRetry({
    stripe,
    payload: basePayload,
    idempotencyKey: "uuid-original",
    customerId: "cus_1",
    packageId: "pkg_1",
  });

  assert.equal(sub.id, "sub_2");
  assert.equal(calls.filter((c) => c.method === "create").length, 2);
}

async function testRetrySkipsCancelWhenNoMatchingOrphan() {
  const { stripe, calls } = makeMockStripe({
    firstCreateThrowsIdempotency: true,
    listReturns: [{ id: "sub_other", metadata: { packageId: "pkg_OTHER" } }],
  });

  await createSubscriptionWithIdempotencyRetry({
    stripe,
    payload: basePayload,
    idempotencyKey: "uuid-original",
    customerId: "cus_1",
    packageId: "pkg_1",
  });

  assert.equal(calls.filter((c) => c.method === "cancel").length, 0);
}

async function testNonIdempotencyErrorRethrownWithoutRetry() {
  const { stripe, calls } = makeMockStripe({
    firstCreateThrowsOther: new Error("card_declined"),
  });

  await assert.rejects(
    () =>
      createSubscriptionWithIdempotencyRetry({
        stripe,
        payload: basePayload,
        idempotencyKey: "uuid-original",
        customerId: "cus_1",
        packageId: "pkg_1",
      }),
    /card_declined/
  );

  assert.equal(calls.filter((c) => c.method === "create").length, 1);
  assert.equal(calls.filter((c) => c.method === "cancel").length, 0);
}

async function run() {
  await testHappyPathSingleCreateCall();
  await testRetriesAfterIdempotencyErrorAndCancelsOrphan();
  await testRetrySucceedsEvenWhenOrphanCancelFails();
  await testRetrySkipsCancelWhenNoMatchingOrphan();
  await testNonIdempotencyErrorRethrownWithoutRetry();
  console.log("createSubscriptionWithIdempotencyRetry tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add the test:* script and run to verify FAIL**

Add to `package.json` `scripts` block:

```json
"test:stripe-idempotency-retry": "tsx src/utils/payment/stripe/__tests__/createSubscriptionWithIdempotencyRetry.test.ts",
```

Run: `npm run test:stripe-idempotency-retry`
Expected: FAIL with "Cannot find module '../createSubscriptionWithIdempotencyRetry'".

- [ ] **Step 3: Implement the helper**

Create `src/utils/payment/stripe/createSubscriptionWithIdempotencyRetry.ts`:

```ts
import Stripe from "stripe";

interface CreateSubscriptionWithIdempotencyRetryOptions {
  stripe: Stripe;
  payload: Stripe.SubscriptionCreateParams;
  idempotencyKey: string;
  /** Used to scope orphan-cleanup search after an idempotency conflict. */
  customerId: string;
  /** Used to identify which incomplete subscription is the orphan to cancel. */
  packageId: string;
  /** Optional correlation id for log lines. */
  correlationId?: string;
}

/**
 * Wrap `stripe.subscriptions.create` with a one-shot retry on
 * `StripeIdempotencyError`. The retry first attempts to cancel the orphan
 * incomplete subscription that the original (idempotency-cached) request
 * created on Stripe — matched by `customer + metadata.packageId` — then
 * issues a fresh-key create. Cancel failure is non-fatal: Stripe auto-expires
 * unpaid incomplete subs in ~23 hours.
 *
 * Why this exists: server-side metadata (capi_*, attribution) can drift
 * between retries with the same client-supplied UUID, tripping Stripe's
 * "same key, different params" guard and locking customers out of checkout
 * for 24h. See docs/billing-stripe/gotchas.md.
 */
export async function createSubscriptionWithIdempotencyRetry(
  opts: CreateSubscriptionWithIdempotencyRetryOptions
): Promise<Stripe.Subscription> {
  const { stripe, payload, idempotencyKey, customerId, packageId, correlationId } = opts;

  try {
    return await stripe.subscriptions.create(payload, { idempotencyKey });
  } catch (err) {
    if (!(err instanceof Stripe.errors.StripeIdempotencyError)) {
      throw err;
    }

    console.warn(
      "[createSubscriptionWithIdempotencyRetry] idempotency conflict; cancelling orphan and retrying",
      {
        ...(correlationId ? { correlationId } : {}),
        customerId,
        packageId,
        originalKey: idempotencyKey,
      }
    );

    await cancelMatchingIncompleteSubscription({ stripe, customerId, packageId, correlationId });

    const freshKey = crypto.randomUUID();
    return await stripe.subscriptions.create(payload, { idempotencyKey: freshKey });
  }
}

async function cancelMatchingIncompleteSubscription(opts: {
  stripe: Stripe;
  customerId: string;
  packageId: string;
  correlationId?: string;
}): Promise<void> {
  const { stripe, customerId, packageId, correlationId } = opts;

  try {
    const incomplete = await stripe.subscriptions.list({
      customer: customerId,
      status: "incomplete",
      limit: 5,
    });

    const match = incomplete.data.find((sub) => sub.metadata?.packageId === packageId);
    if (!match) return;

    await stripe.subscriptions.cancel(match.id);
    console.log("[createSubscriptionWithIdempotencyRetry] cancelled orphan incomplete subscription", {
      ...(correlationId ? { correlationId } : {}),
      cancelledId: match.id,
    });
  } catch (cancelErr) {
    // Non-fatal: the orphan will auto-expire in ~23h regardless.
    console.warn("[createSubscriptionWithIdempotencyRetry] orphan cancel failed (non-fatal)", {
      ...(correlationId ? { correlationId } : {}),
      error: cancelErr instanceof Error ? cancelErr.message : String(cancelErr),
    });
  }
}
```

- [ ] **Step 4: Run test to verify PASS**

Run: `npm run test:stripe-idempotency-retry`
Expected: `createSubscriptionWithIdempotencyRetry tests passed`

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 6: Stage**

```bash
git add src/utils/payment/stripe/createSubscriptionWithIdempotencyRetry.ts \
        src/utils/payment/stripe/__tests__/createSubscriptionWithIdempotencyRetry.test.ts \
        package.json
```

(Do NOT commit.)

---

## Task 3 — Wire the helper into `create-subscription` (guest) route

**Files:**
- Modify: `src/app/api/stripe/create-subscription/route.ts:515-537`

- [ ] **Step 1: Add the import**

Add to the import block at the top of `src/app/api/stripe/create-subscription/route.ts` (alphabetical with other `@/utils/payment/stripe/*` imports):

```ts
import { createSubscriptionWithIdempotencyRetry } from "@/utils/payment/stripe/createSubscriptionWithIdempotencyRetry";
```

- [ ] **Step 2: Replace the direct `stripe.subscriptions.create` call**

Find this block (around line 515-537):

```ts
    let subscription;
    try {
      subscription = await stripe.subscriptions.create(
        createPayload,
        {
          idempotencyKey: idempotencyKey,
        }
      );

      if (correlationId) {
        console.log("[create-subscription] subscription created", {
          correlationId,
          subscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
        });
      }
      // console.log(`📊 Subscription status: ${subscription.status}`);
    } catch (stripeError) {
      console.error("❌ Stripe subscription creation failed:", stripeError, correlationId ? { correlationId } : {});
      throw new Error(
        `Failed to create Stripe subscription: ${stripeError instanceof Error ? stripeError.message : "Unknown error"}`
      );
    }
```

Replace with:

```ts
    let subscription;
    try {
      subscription = await createSubscriptionWithIdempotencyRetry({
        stripe,
        payload: createPayload,
        idempotencyKey,
        customerId: customer.id,
        packageId: validatedData.packageId,
        correlationId,
      });

      if (correlationId) {
        console.log("[create-subscription] subscription created", {
          correlationId,
          subscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
        });
      }
    } catch (stripeError) {
      console.error("❌ Stripe subscription creation failed:", stripeError, correlationId ? { correlationId } : {});
      throw new Error(
        `Failed to create Stripe subscription: ${stripeError instanceof Error ? stripeError.message : "Unknown error"}`
      );
    }
```

- [ ] **Step 3: Run lint + type-check**

Run: `npm run lint && npm run type-check`
Expected: no errors.

- [ ] **Step 4: Stage**

```bash
git add src/app/api/stripe/create-subscription/route.ts
```

(Do NOT commit.)

---

## Task 4 — Wire the helper into `create-subscription-existing-user` route

**Files:**
- Modify: `src/app/api/stripe/create-subscription-existing-user/route.ts:317-320`

- [ ] **Step 1: Add the import**

Add to the import block at the top of `src/app/api/stripe/create-subscription-existing-user/route.ts`:

```ts
import { createSubscriptionWithIdempotencyRetry } from "@/utils/payment/stripe/createSubscriptionWithIdempotencyRetry";
```

- [ ] **Step 2: Replace the direct `stripe.subscriptions.create` call**

Find this block (around line 317-320):

```ts
    const subscription = await stripe.subscriptions.create(
      createPayload,
      { idempotencyKey }
    );
```

Replace with:

```ts
    const subscription = await createSubscriptionWithIdempotencyRetry({
      stripe,
      payload: createPayload,
      idempotencyKey,
      customerId: stripeCustomerId,
      packageId: validatedData.packageId,
      correlationId,
    });
```

- [ ] **Step 3: Run lint + type-check**

Run: `npm run lint && npm run type-check`
Expected: no errors.

- [ ] **Step 4: Re-run all tests touched in this branch**

Run sequentially:

```bash
npm run test:facebook-fbc-extract
npm run test:stripe-idempotency-retry
```

Expected: both print `… tests passed`.

- [ ] **Step 5: Stage**

```bash
git add src/app/api/stripe/create-subscription-existing-user/route.ts
```

(Do NOT commit.)

---

## Task 5 — Update `docs/billing-stripe/`

**Files:**
- Modify: `docs/billing-stripe/patterns.md`
- Modify: `docs/billing-stripe/gotchas.md`

- [ ] **Step 1: Add pattern P10 to `patterns.md`**

Append to `docs/billing-stripe/patterns.md` (after `P9`):

```markdown
## P10. One-shot idempotency-retry on key collisions

Where a Stripe-mutating call uses a per-attempt UUID as the idempotency key (instead of a stable resource-derived key per [P3](#p3-stable-idempotency-keys-derived-from-the-resource)) and the request body includes any non-deterministic field (capi_*, attribution, IP), wrap the call so that on `StripeIdempotencyError` it:

1. Cancels the orphan incomplete resource on Stripe (matched by `customer + metadata.packageId` for subscriptions).
2. Retries once with a fresh `crypto.randomUUID()` idempotency key.

Reference implementation: [`createSubscriptionWithIdempotencyRetry`](../../src/utils/payment/stripe/createSubscriptionWithIdempotencyRetry.ts) — used by both `/api/stripe/create-subscription` and `/api/stripe/create-subscription-existing-user`. The retry is one-shot only — a second collision is rethrown so it surfaces in error reports rather than looping.
```

- [ ] **Step 2: Add gotcha to `gotchas.md`**

Append to `docs/billing-stripe/gotchas.md`:

```markdown
## Metadata drift locks customers out of checkout for 24h

Subscription create routes accept a client-supplied `subscriptionRequestId` UUID and use it as the Stripe idempotency key. The same call attaches request-derived metadata (`capi_client_ip`, `capi_user_agent`, `capi_fbc`, `capi_fbp`, `capi_event_source_url`, `attr_*`) which is rebuilt server-side on every call. If the customer retries with the same UUID and **any** of those values has drifted (mobile IP change, fbc rebuilt with different `Date.now()`, different referer), Stripe rejects with `StripeIdempotencyError` and locks the customer out of that key for 24h.

Mitigated by:
- [P10. One-shot idempotency-retry](./patterns.md#p10-one-shot-idempotency-retry-on-key-collisions) — catches the error, cancels the orphan, retries with a fresh key.
- `extractFBCFromRequest` reading `_fbc` cookie first ([docs/tracking/gotchas.md](../tracking/gotchas.md)) — eliminates the most common drift cause.
```

- [ ] **Step 3: Bump `lastVerified` for billing-stripe in CLAUDE.md**

In `CLAUDE.md`, find the `billing-stripe` domain entry inside the `Domain Manifest` JSON block and update `"lastVerified"` from `"2026-05-07"` to `"2026-05-08"`.

- [ ] **Step 4: Stage**

```bash
git add docs/billing-stripe/patterns.md docs/billing-stripe/gotchas.md CLAUDE.md
```

(Do NOT commit.)

---

## Task 6 — Update `docs/tracking/gotchas.md`

**Files:**
- Modify: `docs/tracking/gotchas.md`

- [ ] **Step 1: Document the cookie-first behaviour**

Append to `docs/tracking/gotchas.md`:

```markdown
## Server-side fbc reads `_fbc` cookie first; URL fallback uses `Date.now()`

[`extractFBCFromRequest`](../../src/utils/tracking/facebook-helpers.ts) reads the Facebook Pixel `_fbc` cookie first. Only when no cookie is present does it fall back to building `fb.1.{Date.now()}.{fbclid}` from a URL `?fbclid=…` parameter.

The fallback's timestamp is **the request time, not the click time** — Meta's spec calls for click time. We prefer it over rejecting fbc entirely so cookie-blocked visitors still contribute partial attribution.

Important: the fallback is non-deterministic across calls. Any code path that uses the returned fbc in a Stripe idempotency-keyed request body (subscription create) must wrap the call with the [billing-stripe P10 pattern](../billing-stripe/patterns.md#p10-one-shot-idempotency-retry-on-key-collisions). For other CAPI flows (the standard `/api/facebook/*` event endpoints), the drift is harmless.
```

- [ ] **Step 2: Bump `lastVerified` for tracking in CLAUDE.md**

In `CLAUDE.md`, find the `tracking` domain entry inside the `Domain Manifest` JSON block and update `"lastVerified"` from `"2026-04-28"` to `"2026-05-08"`.

- [ ] **Step 3: Run the doc-sync hook locally to verify no orphans**

Run: `node .claude/hooks/doc-sync.mjs --check` (if the hook supports a manual check flag) — otherwise this is verified automatically by the Stop hook on the next finish-task pass.

- [ ] **Step 4: Stage**

```bash
git add docs/tracking/gotchas.md CLAUDE.md
```

(Do NOT commit.)

---

## Task 7 — Final verification

- [ ] **Step 1: Run full lint + type-check**

```bash
npm run lint && npm run type-check
```

Expected: no errors.

- [ ] **Step 2: Run all touched test scopes**

```bash
npm run test:facebook-fbc-extract
npm run test:stripe-idempotency-retry
```

Expected: both pass.

- [ ] **Step 3: Confirm no other test scope regressed**

This change is additive (new helper + one-line route swap). The existing `test:anchor-billing`, `test:facebook-capi`, `test:redeemables` etc. should be unaffected. Spot-check the most relevant:

```bash
npm run test:facebook-capi
```

Expected: pass.

- [ ] **Step 4: `git status` review**

Run: `git status`
Expected staged set:

```
modified:   CLAUDE.md
modified:   docs/billing-stripe/gotchas.md
modified:   docs/billing-stripe/patterns.md
modified:   docs/tracking/gotchas.md
modified:   package.json
modified:   src/app/api/stripe/create-subscription-existing-user/route.ts
modified:   src/app/api/stripe/create-subscription/route.ts
modified:   src/utils/tracking/facebook-helpers.ts
new file:   src/utils/payment/stripe/__tests__/createSubscriptionWithIdempotencyRetry.test.ts
new file:   src/utils/payment/stripe/createSubscriptionWithIdempotencyRetry.ts
new file:   src/utils/tracking/__tests__/extractFBCFromRequest.test.ts
```

Stop here. Wait for the user to authorize a commit.

---

## Test Scope

| Script | Covers |
|---|---|
| `test:facebook-fbc-extract` (new) | Cookie-first read, fbclid fallback, undefined-when-empty, deterministic across calls |
| `test:stripe-idempotency-retry` (new) | Happy path single-call, retry after `StripeIdempotencyError`, orphan cancel by `metadata.packageId` match, cancel-failure non-fatal, non-idempotency error rethrown |

Existing tests (`test:anchor-billing`, `test:facebook-capi`, `test:stripe-collection-pause`, `test:refund-reversal`) are unaffected — we never change their inputs.

---

## Docs to update

| Doc | Change |
|---|---|
| `docs/billing-stripe/patterns.md` | New `P10. One-shot idempotency-retry on key collisions` |
| `docs/billing-stripe/gotchas.md` | New "Metadata drift locks customers out of checkout for 24h" entry |
| `docs/tracking/gotchas.md` | New "Server-side fbc reads `_fbc` cookie first" entry |
| `CLAUDE.md` (Domain Manifest) | `lastVerified` bumped for `billing-stripe` and `tracking` to `2026-05-08` |

---

## Risks

1. **Helper retry creates a second `incomplete` subscription on Stripe when the orphan-cancel step fails.** Mitigation: confirmed safe by codebase-investigator pass — webhook for orphan `subscription.created/updated/deleted` is gated on `user.stripeSubscriptionId === subscription.id` ([webhook/route.ts:2336](../../src/app/api/stripe/webhook/route.ts#L2336)) and on `subStatus === "past_due"` for past-due reconciliation ([recoverStrandedPastDue.ts:84](../../src/server/admin/recoverStrandedPastDue.ts#L84)); the orphan auto-expires in ~23h.
2. **`extractFBCFromRequest` signature change adds `cookies` to the request type.** Every call site (`extractRequestContext` only) already passes a request that includes `cookies` — no caller updates needed. Type-check in Task 1 Step 5 covers this.
3. **fbc cookie path changes Meta attribution slightly:** server-side fbc was already being rebuilt with request-time `Date.now()` (wrong per Meta spec). Cookie-first restores click-time accuracy where Pixel set `_fbc`, and keeps the existing wrong-but-tolerated fallback for cookie-blocked visitors. Net positive for attribution accuracy.
4. **The retry helper does not look up the orphan by `subscriptionRequestId`.** It matches only on `customer + metadata.packageId`. If a customer has multiple incomplete subs for the same package (rare — `cancelPreviousSubscriptionId` already prevents this on package switch), the helper cancels the first match in the list. Acceptable: the matched orphan, if not the actual one, will auto-expire too.
5. **Helper never retries more than once.** If a second collision occurs, the error is rethrown — surfaces in error reports for further investigation rather than masking a deeper bug.

---

## Manifest check

All new files fall under existing manifest globs:
- `src/utils/payment/stripe/createSubscriptionWithIdempotencyRetry.ts` → matches `src/utils/payment/**` (domain: `payment`).
- `src/utils/payment/stripe/__tests__/createSubscriptionWithIdempotencyRetry.test.ts` → matches the same glob.
- `src/utils/tracking/__tests__/extractFBCFromRequest.test.ts` → matches `src/utils/tracking/**` (domain: `tracking`).

No new domain or new path glob required. No `registering-new-domain` action needed.

> **Note on docs domain:** the helper sits in the `payment` domain by manifest, but the *behaviour* it implements (idempotency-retry pattern) belongs conceptually to `billing-stripe`. The pattern doc lives in `docs/billing-stripe/patterns.md` (with cross-link); the helper file itself, when modified later, will trigger doc-sync against `docs/payment/` per the manifest. That's acceptable — it's a thin wrapper around a Stripe call, and a future maintainer reading `docs/payment/` will be pointed to the billing-stripe pattern via the helper's doc-comment.
