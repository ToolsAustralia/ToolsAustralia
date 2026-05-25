# ErrorReport Catch-All (HTTP status + type) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **⚠ Repo rule — no auto-commit (CLAUDE.md §1):** the `Commit` steps below are the intended commit units, but you MUST NOT run `git commit/add/push` until the user authorizes with `commit`/`push`/`ship it`. If unauthorized, do the work and stop before the commit step.

> **⚠ Repo rule — doc-sync Stop hook (CLAUDE.md §2):** editing `src/**` requires updating the matching `docs/<domain>/` in the same unit of work or the Stop hook blocks. Doc steps are bundled into the last task of each domain (Tasks 4, 6, 7).

**Goal:** Make ErrorReport capture every non-thrown 4xx/5xx rejection across the **payment/subscription/Stripe route family (~33 routes)** — so `409 EXISTING_SUBSCRIPTION` and every other early-return rejection becomes visible — and surface HTTP status + type in the admin list.

**Scope:** the family under `api/stripe/**`, `api/subscription/**`, `api/payment-intent/**`, `api/payment-status/**`, `api/invoice/**`, `api/memberships/**`, **excluding `api/stripe/webhook`**. Checkout/cart, auth, and product-admin families are out of scope this round. The 2 `create-subscription` routes are detailed templates (Tasks 5-6); the remaining ~29 are the identical transform (Task 9).

**Architecture:** A pure classifier (`classifyHttpRejection`) decides capture + severity (reusing the existing `medium`/`high` tiers — no new `low` tier). `ErrorLoggingService.logHttpRejection` forces that severity and rides the existing `autoLogErrorServer` + dedup path. A route-layer `rejectAndLog` wrapper turns each non-thrown early return into one line. The admin list swaps the workflow-status badge for an HTTP-status chip; the workflow stays in the detail modal + filter. Existing `catch`-block auto-logging (for thrown errors) is left untouched — no double-logging.

**Tech Stack:** Next.js 15 App Router, Mongoose, Zod, standalone `tsx` test scripts (no jest/vitest).

---

## Non-blocking guarantee (HARD requirement)

The subscription-creation flow MUST NOT be delayed by, or break because of, this logging. The design guarantees it:

- `rejectAndLog` is a **synchronous** function. It calls `ErrorLoggingService.logHttpRejection(...)` **without `await`**, attaches `.catch(() => {})`, discards the promise with `void`, then immediately `return`s the same `NextResponse.json(body, { status })` the route returned before.
- `logHttpRejection` is `async`; the only synchronous work before its first `await` is `classifyHttpRejection` (two integer comparisons). The DB work (dedup `findOne` + `save`) runs **after** the first `await import(...)` — detached from the request path.
- Because `logHttpRejection` is `async`, any error (even a synchronous throw) becomes a rejected promise swallowed by `.catch()`. It can **never** throw into the route handler.
- The returned response body/status are **byte-identical** to the pre-change `NextResponse.json` calls — behavior is unchanged; only a detached log is added.
- Mirrors the codebase's existing fire-and-forget logging (`autoLogPaymentErrorServer(...).catch(...)`, `getServerSession(...).then(...)`), so no new execution model.

Accepted tradeoff (same as existing behavior): on serverless the detached write may occasionally not flush if the instance suspends right after responding — never at the cost of blocking the user.

**Implementation rule for every wiring step:** never put `await` in front of `logHttpRejection`/`rejectAndLog`; never call them inside a path the route `await`s before responding.

---

## File structure

- **Create** `src/utils/error-reporting/http-rejection-severity.ts` — pure classifier (the only unit-tested piece). *error-reporting domain.*
- **Create** `src/utils/error-reporting/__tests__/http-rejection-severity.test.ts` — tsx test. *error-reporting domain.*
- **Create** `src/utils/error-reporting/reject-and-log.ts` — `rejectAndLog` route wrapper. *error-reporting domain.*
- **Modify** `src/utils/error-reporting/auto-log-error-server.ts` — capture `httpStatus`/real `httpMethod`. *error-reporting domain.*
- **Modify** `src/services/error-reporting/ErrorLoggingService.ts` — add `logHttpRejection`. *error-reporting domain (admin domain by manifest — see note in Task 3).*
- **Modify** `src/app/api/stripe/create-subscription-existing-user/route.ts` — wire early returns. *billing-stripe domain.*
- **Modify** `src/app/api/stripe/create-subscription/route.ts` — wire early returns. *billing-stripe domain.*
- **Modify** `src/components/admin/ErrorReportsManagement.tsx` — HTTP-status column. *admin domain.*
- **Modify** `package.json` — add `test:http-rejection-severity`. *infrastructure domain.*
- **Modify (Task 8 — mandatory)** `src/utils/error-reporting/auto-log-error.ts` — fix `category:"stripe"` silent drop.
- **Modify (Task 9)** the remaining ~29 Stripe-family route files — same `rejectAndLog` transform (enumerated in Task 9). *billing-stripe / subscription / payment domains.*
- **Docs** `docs/error-reporting/*`, `docs/billing-stripe/*`, `docs/subscription/*`, `docs/payment/*`, `docs/admin/*` + manifest `lastVerified`.

---

## Task 1: `classifyHttpRejection` pure util (TDD)

**Files:**
- Create: `src/utils/error-reporting/http-rejection-severity.ts`
- Test: `src/utils/error-reporting/__tests__/http-rejection-severity.test.ts`
- Modify: `package.json` (add test script)

Reference the `writing-tsx-test` skill for the repo's test conventions before writing the test.

- [ ] **Step 1: Write the failing test**

`src/utils/error-reporting/__tests__/http-rejection-severity.test.ts`:

```ts
import assert from "node:assert";
import { classifyHttpRejection } from "../http-rejection-severity";

// < 400 (incl. 3xx) → not captured
for (const s of [200, 204, 301, 302, 304, 399]) {
  assert.equal(classifyHttpRejection(s).capture, false, `status ${s} should NOT be captured`);
}

// 4xx → captured as "medium"
for (const s of [400, 401, 403, 404, 409, 429, 499]) {
  const r = classifyHttpRejection(s);
  assert.equal(r.capture, true, `status ${s} should be captured`);
  assert.equal(r.severity, "medium", `status ${s} should be medium`);
}

// 5xx → captured as "high"
for (const s of [500, 502, 503, 599]) {
  const r = classifyHttpRejection(s);
  assert.equal(r.capture, true, `status ${s} should be captured`);
  assert.equal(r.severity, "high", `status ${s} should be high`);
}

// invalid input → not captured
for (const s of [Number.NaN, 0, -1]) {
  assert.equal(classifyHttpRejection(s).capture, false, `invalid status ${s} should NOT be captured`);
}

console.log("✅ classifyHttpRejection: all assertions passed");
```

- [ ] **Step 2: Add the test script to `package.json`**

Add to the `"scripts"` block (next to the other `test:*` entries):

```json
"test:http-rejection-severity": "tsx src/utils/error-reporting/__tests__/http-rejection-severity.test.ts",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:http-rejection-severity`
Expected: FAIL — `Cannot find module '../http-rejection-severity'`.

- [ ] **Step 4: Write the implementation**

`src/utils/error-reporting/http-rejection-severity.ts`:

```ts
/**
 * Classifies a non-2xx HTTP response for ErrorReport capture.
 *
 * Policy (docs/error-reporting): < 400 (incl. 3xx redirects) is NOT an error and is skipped.
 * 4xx (incl. 401/409/429 on the scoped routes) → "medium"; 5xx → "high".
 * Reuses existing severity tiers — intentionally no "low" tier (see the design spec).
 */
import type { ErrorSeverity } from "./error-severity-classifier";

export interface HttpRejectionClassification {
  capture: boolean;
  severity: ErrorSeverity;
}

export function classifyHttpRejection(status: number): HttpRejectionClassification {
  if (!Number.isFinite(status) || status < 400) {
    return { capture: false, severity: "medium" };
  }
  if (status >= 500) {
    return { capture: true, severity: "high" };
  }
  return { capture: true, severity: "medium" };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:http-rejection-severity`
Expected: PASS — `✅ classifyHttpRejection: all assertions passed`.

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 7: Commit** *(only if user authorized commits)*

```bash
git add src/utils/error-reporting/http-rejection-severity.ts src/utils/error-reporting/__tests__/http-rejection-severity.test.ts package.json
git commit -m "feat(error-reporting): add classifyHttpRejection for non-2xx capture policy"
```

---

## Task 2: Capture `httpStatus` + real `httpMethod` in `autoLogErrorServer`

**Files:**
- Modify: `src/utils/error-reporting/auto-log-error-server.ts`

Today `httpStatus` is never recorded and `httpMethod` is hardcoded `"POST"` — the admin column depends on fixing this.

- [ ] **Step 1: Add the two fields to the `additionalContext` param type**

Find (around line 40-52):

```ts
  additionalContext?: {
    category?: "payment" | "stripe" | "system" | "api" | "network" | "recovery";
    severity?: "critical" | "high" | "medium";
    paymentIntentId?: string;
```

Replace the opening of that object type with:

```ts
  additionalContext?: {
    category?: "payment" | "stripe" | "system" | "api" | "network" | "recovery";
    severity?: "critical" | "high" | "medium";
    httpStatus?: number;
    httpMethod?: string;
    paymentIntentId?: string;
```

- [ ] **Step 2: Use the real method instead of the hardcoded one**

Find (around line 86):

```ts
    const httpMethod = "POST"; // Default to POST for API routes
```

Replace with:

```ts
    const httpMethod = additionalContext?.httpMethod ?? "POST"; // Real method when provided, else default
```

- [ ] **Step 3: Add `httpStatus` to the built `ErrorContext`**

Find (around line 115-117):

```ts
      apiEndpoint,
      httpMethod,
      requestUrl: request.url,
```

Replace with:

```ts
      apiEndpoint,
      httpMethod,
      httpStatus: additionalContext?.httpStatus,
      requestUrl: request.url,
```

(`new ErrorReport({ ...errorContext })` at the bottom already persists every `ErrorContext` field, and the model + `IErrorReport` + the POST zod all already declare `httpStatus`, so nothing else is needed.)

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 5: Commit** *(only if authorized)*

```bash
git add src/utils/error-reporting/auto-log-error-server.ts
git commit -m "feat(error-reporting): record httpStatus and real httpMethod on server auto-log"
```

---

## Task 3: `ErrorLoggingService.logHttpRejection`

**Files:**
- Modify: `src/services/error-reporting/ErrorLoggingService.ts`

> Note: `src/services/error-reporting/**` is **not** an explicit manifest path; the closest matching domain is `error-reporting` (it owns `src/services/error-reporting/**`). Verify with `/doc-sync`; update `docs/error-reporting/` in Task 4.

- [ ] **Step 1: Import the classifier**

At the top of the file, after the existing imports (after the `autoLogError` import):

```ts
import { classifyHttpRejection } from "@/utils/error-reporting/http-rejection-severity";
```

- [ ] **Step 2: Add the method inside the `ErrorLoggingService` class**

Add after the existing `logError` method (before the closing `}` of the class):

```ts
  /**
   * Log a NON-thrown HTTP rejection (an early `return NextResponse.json(body, { status })`).
   * Forces severity from the status code (never uses detectCategoryAndSeverity, which would
   * escalate any payment-category error to "critical"). Skips < 400 (incl. 3xx). Fire-and-forget.
   */
  static async logHttpRejection(params: {
    status: number;
    request: { headers: Headers; url?: string };
    code?: string;
    message?: string;
    category?: "payment" | "network" | "api" | "system" | "recovery";
    httpMethod?: string;
    context?: {
      userId?: string;
      userEmail?: string;
      guestEmail?: string;
      packageId?: string;
      customerId?: string;
    };
  }): Promise<void> {
    const { capture, severity } = classifyHttpRejection(params.status);
    if (!capture) return;

    // Dynamic import keeps the server-only util out of any client bundle (existing pattern).
    const { autoLogErrorServer } = await import("@/utils/error-reporting/auto-log-error-server");

    const codePart = params.code ? `[${params.code}] ` : "";
    const message = `${codePart}${params.message ?? `HTTP ${params.status}`}`;

    await autoLogErrorServer(
      new Error(message),
      params.request,
      {
        category: params.category ?? "api", // MUST be a model-enum category — never "stripe"
        severity, // "medium" (4xx) or "high" (5xx) — both already valid enum values
        httpStatus: params.status,
        httpMethod: params.httpMethod ?? "POST",
        userId: params.context?.userId,
        userEmail: params.context?.userEmail,
        guestEmail: params.context?.guestEmail,
        packageId: params.context?.packageId,
        customerId: params.context?.customerId,
      }
    );
  }
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 4: Commit** *(only if authorized)*

```bash
git add src/services/error-reporting/ErrorLoggingService.ts
git commit -m "feat(error-reporting): add logHttpRejection for non-thrown 4xx/5xx returns"
```

---

## Task 4: `rejectAndLog` route wrapper + error-reporting docs

**Files:**
- Create: `src/utils/error-reporting/reject-and-log.ts`
- Docs: `docs/error-reporting/` + manifest

- [ ] **Step 1: Create the wrapper**

`src/utils/error-reporting/reject-and-log.ts`:

```ts
import { NextResponse } from "next/server";
import { ErrorLoggingService } from "@/services/error-reporting/ErrorLoggingService";

interface RejectContext {
  userId?: string;
  userEmail?: string;
  guestEmail?: string;
  packageId?: string;
  customerId?: string;
  /** Model-enum category; defaults to "payment" for the subscription-creation routes. */
  category?: "payment" | "network" | "api" | "system" | "recovery";
}

/**
 * Returns `NextResponse.json(body, { status })` AND fire-and-forget logs the rejection to
 * ErrorReport via ErrorLoggingService.logHttpRejection.
 *
 * Use ONLY at non-thrown early returns. `catch` blocks already auto-log thrown errors, so do
 * not wrap those. The classifier skips < 400 (incl. 3xx), so this is safe even if a 2xx/3xx
 * body is ever passed.
 */
export function rejectAndLog(
  request: { headers: Headers; url?: string; method?: string },
  status: number,
  body: { error?: string; code?: string; [key: string]: unknown },
  context?: RejectContext
): NextResponse {
  void ErrorLoggingService.logHttpRejection({
    status,
    request,
    code: typeof body.code === "string" ? body.code : undefined,
    message: typeof body.error === "string" ? body.error : undefined,
    category: context?.category ?? "payment",
    httpMethod: request.method,
    context: {
      userId: context?.userId,
      userEmail: context?.userEmail,
      guestEmail: context?.guestEmail,
      packageId: context?.packageId,
      customerId: context?.customerId,
    },
  }).catch(() => {
    /* fire-and-forget — never block or fail the response */
  });

  return NextResponse.json(body, { status });
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 3: Update error-reporting docs**

In `docs/error-reporting/` update the relevant files (verify exact filenames first):
- `patterns.md` — document `classifyHttpRejection` + `logHttpRejection` + `rejectAndLog`, and the rule "wrap non-thrown early returns only; leave `catch` blocks alone."
- `gotchas.md` — add: (a) `category` MUST be a model-enum value or the save is silently dropped; (b) `logHttpRejection` forces severity and must never call `detectCategoryAndSeverity`; (c) expected rejections reuse `medium` (no `low` tier).
- `architecture.md` / `api.md` — note `httpStatus`/`httpMethod` are now captured server-side.

Then bump `lastVerified` for the `error-reporting` domain in BOTH `CLAUDE.md` manifests (repo root and worktree copy share the same content — update the one in the working tree).

- [ ] **Step 4: Verify doc-sync is satisfied**

Run: `/doc-sync` (or rely on the Stop hook). Expected: no stale-doc block for error-reporting.

- [ ] **Step 5: Commit** *(only if authorized)*

```bash
git add src/utils/error-reporting/reject-and-log.ts docs/error-reporting/ CLAUDE.md
git commit -m "feat(error-reporting): add rejectAndLog wrapper + document HTTP-rejection capture"
```

---

## Task 5: Wire `create-subscription-existing-user` early returns

**Files:**
- Modify: `src/app/api/stripe/create-subscription-existing-user/route.ts`

Import `rejectAndLog`, then convert each **non-thrown** early `return NextResponse.json(body, { status })` to `return rejectAndLog(request, status, body, ctx)`. **Do NOT touch the `catch` block (lines ~608-668)** — it already auto-logs throws. **Skip the 429** rate-limit return (line ~74) and the **403 gate** (`enforceMajorDrawOpenForNewPurchasesOr403`, line ~115 — it returns a pre-built response).

Context available after line 86 (`validatedData` parsed) and line 58 (`session`): `session.user.id`, `session.user.email`, `validatedData.packageId`, and `stripeCustomerId` (after line 118).

- [ ] **Step 1: Add the import**

After the existing imports:

```ts
import { rejectAndLog } from "@/utils/error-reporting/reject-and-log";
```

- [ ] **Step 2: Convert the priority 409 (live-Stripe check, ~lines 306-314)**

Replace:

```ts
      if (hasLiveStripeSubscription) {
        return NextResponse.json(
          {
            success: false,
            error: EXISTING_SUBSCRIPTION_MESSAGE,
            code: EXISTING_SUBSCRIPTION_CODE,
            ...(correlationId && { correlationId }),
          },
          { status: 409 }
        );
      }
```

with:

```ts
      if (hasLiveStripeSubscription) {
        return rejectAndLog(
          request,
          409,
          {
            success: false,
            error: EXISTING_SUBSCRIPTION_MESSAGE,
            code: EXISTING_SUBSCRIPTION_CODE,
            ...(correlationId && { correlationId }),
          },
          {
            userId: session.user.id,
            userEmail: session.user.email ?? undefined,
            customerId: stripeCustomerId,
            packageId: validatedData.packageId,
          }
        );
      }
```

- [ ] **Step 3: Convert the guard 409 (~lines 103-106)**

Replace:

```ts
    const canCreate = checkCanCreateSubscription(existingUser);
    if (!canCreate.allowed) {
      return NextResponse.json(canCreate.body, { status: canCreate.status });
    }
```

with:

```ts
    const canCreate = checkCanCreateSubscription(existingUser);
    if (!canCreate.allowed) {
      return rejectAndLog(request, canCreate.status, canCreate.body, {
        userId: session.user.id,
        userEmail: session.user.email ?? undefined,
        packageId: validatedData.packageId,
      });
    }
```

- [ ] **Step 4: Convert the remaining non-thrown 4xx/5xx returns with the same pattern**

For each, replace `return NextResponse.json(<body>, { status: <s> })` with
`return rejectAndLog(request, <s>, <body>, { userId: session.user.id, userEmail: session.user.email ?? undefined, packageId: validatedData.packageId })` (add `customerId: stripeCustomerId` where defined):

- `404` user not found (~line 100) — context: `userId: session.user.id, userEmail: session.user.email ?? undefined`
- `400` invalid/inactive package (~line 111)
- `400` `new_payment_method` not set up (~line 174)
- `400` payment method setup failed (~line 196) — add `customerId: stripeCustomerId`
- `500` Stripe config missing (~line 214) — add `customerId: stripeCustomerId`
- `400` payment failed inside the `invoices.pay` catch (~line 530) — add `customerId: stripeCustomerId`
- `503` payment setup still in progress (~line 575) — add `customerId: stripeCustomerId`

Leave untouched: the `401` (line ~60, before `session` is confirmed and before `validatedData`), the `429` (line ~74), the `403` gate (line ~115), and the whole `catch` block.

> Note on the `401` at line 60: it returns before auth is established and before `validatedData`; it is intentionally NOT wired (no user context, and unauthenticated calls to a protected route are noise). Documented in the spec's held-back list.

- [ ] **Step 5: Type-check + lint**

Run: `npm run type-check`
Then: `npm run lint`
Expected: no errors. (`NextResponse` is still imported — used by the catch block.)

- [ ] **Step 6: Commit** *(only if authorized)* — docs for this domain are bundled in Task 6.

```bash
git add src/app/api/stripe/create-subscription-existing-user/route.ts
git commit -m "feat(billing-stripe): capture non-thrown 4xx/5xx returns on create-subscription-existing-user"
```

---

## Task 6: Wire `create-subscription` early returns + billing-stripe docs

**Files:**
- Modify: `src/app/api/stripe/create-subscription/route.ts`
- Docs: `docs/billing-stripe/` + manifest

This is the **guest/registration** flow — there is no session. Context: `registeredUser?._id?.toString()` (may be undefined for brand-new users) and `validatedData.userEmail`; `customer?.id` after line ~329. For guests (no `userId`), pass the email as `guestEmail`.

- [ ] **Step 1: Add the import**

After the existing imports:

```ts
import { rejectAndLog } from "@/utils/error-reporting/reject-and-log";
```

- [ ] **Step 2: Convert the priority 409 (~lines 504-514)**

Replace:

```ts
    if (hasLiveStripeSubscription) {
      return NextResponse.json(
        {
          success: false,
          error: EXISTING_SUBSCRIPTION_MESSAGE,
          code: EXISTING_SUBSCRIPTION_CODE,
          ...(correlationId && { correlationId }),
        },
        { status: 409 }
      );
    }
```

with:

```ts
    if (hasLiveStripeSubscription) {
      return rejectAndLog(
        request,
        409,
        {
          success: false,
          error: EXISTING_SUBSCRIPTION_MESSAGE,
          code: EXISTING_SUBSCRIPTION_CODE,
          ...(correlationId && { correlationId }),
        },
        {
          userId: registeredUser?._id?.toString(),
          userEmail: registeredUser ? validatedData.userEmail : undefined,
          guestEmail: registeredUser ? undefined : validatedData.userEmail,
          customerId: customer?.id,
          packageId: validatedData.packageId,
        }
      );
    }
```

- [ ] **Step 3: Convert the guard 409 (~lines 198-204)**

Replace:

```ts
    const canCreate = checkCanCreateSubscription(registeredUser ?? null);
    if (!canCreate.allowed) {
      return NextResponse.json(
        { success: false, ...canCreate.body },
        { status: canCreate.status }
      );
    }
```

with:

```ts
    const canCreate = checkCanCreateSubscription(registeredUser ?? null);
    if (!canCreate.allowed) {
      return rejectAndLog(
        request,
        canCreate.status,
        { success: false, ...canCreate.body },
        {
          userId: registeredUser?._id?.toString(),
          userEmail: registeredUser ? validatedData.userEmail : undefined,
          guestEmail: registeredUser ? undefined : validatedData.userEmail,
          packageId: validatedData.packageId,
        }
      );
    }
```

- [ ] **Step 4: Convert the remaining non-thrown 4xx/5xx returns with the same pattern**

Use the same context object shape as Step 3 (add `customerId: customer?.id` where `customer` is defined, i.e. from ~line 329 onward):

- `404` membership package not found (~line 172)
- `400` package not subscription type (~line 182)
- `400` `new_payment_method` not set up (~line 213)
- `400` payment method setup failed, customer-result branch (~line 337) — add `customerId: customer?.id`
- `400` payment method setup failed, update branch (~line 374) — add `customerId: customer?.id`
- `400` payment method cannot be reused (~line 386) — add `customerId: customer?.id`
- `500` Stripe config missing (~line 408) — add `customerId: customer?.id`
- `503` payment setup still in progress (~line 571) — add `customerId: customer?.id`

Leave untouched: the `429` (line ~94), the `403` gate (line ~191), and the entire `catch` block (lines ~720-836, which already auto-logs via `autoLogPaymentErrorServer`).

- [ ] **Step 5: Type-check + lint**

Run: `npm run type-check`
Then: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Update billing-stripe docs**

In `docs/billing-stripe/` (verify filenames): note that both `create-subscription` routes now capture non-thrown 4xx/5xx via `rejectAndLog`, that `catch` blocks remain the path for thrown errors, and that `429`/`403`-gate are intentionally excluded. Bump `lastVerified` for `billing-stripe` in the manifest.

- [ ] **Step 7: Commit** *(only if authorized)*

```bash
git add src/app/api/stripe/create-subscription/route.ts docs/billing-stripe/ CLAUDE.md
git commit -m "feat(billing-stripe): capture non-thrown 4xx/5xx returns on create-subscription"
```

---

## Task 7: Admin list — HTTP status + type column + admin docs

**Files:**
- Modify: `src/components/admin/ErrorReportsManagement.tsx`
- Docs: `docs/admin/` + manifest

The workflow status stays in the detail modal (lines ~292, ~407-443) and the status filter (`statusOptions`, line ~71) — only the **list** column changes.

- [ ] **Step 1: Add an HTTP-status color helper**

After the `categoryColors` map (around line 98):

```tsx
function httpStatusColor(status?: number): string {
  if (!status) return "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300";
  if (status >= 500) return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200";
  if (status >= 400) return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200";
  return "bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300";
}
```

- [ ] **Step 2: Make the header column non-sortable (desktop, ~lines 1028-1039)**

Replace the sortable tuple list + its `.map` so `status` is no longer a sort field, and add a plain `Status` header:

```tsx
                    {[
                      ["errorMessage", "Error"],
                      ["category", "Category"],
                      ["severity", "Severity"],
                    ].map(([field, label]) => (
                      <th key={field} className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
                        <SortButton field={field as SortField} activeField={sortBy} sortOrder={sortOrder} onSort={handleSort}>
                          {label}
                        </SortButton>
                      </th>
                    ))}
                    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Status</th>
```

- [ ] **Step 3: Swap the desktop row status cell (~line 1077)**

Replace:

```tsx
                        <td className="px-4 py-3"><Badge value={report.status} type="status" /></td>
```

with:

```tsx
                        <td className="px-4 py-3">
                          {report.httpStatus ? (
                            <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold", httpStatusColor(report.httpStatus))}>
                              HTTP {report.httpStatus}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-neutral-500">—</span>
                          )}
                        </td>
```

- [ ] **Step 4: Swap the mobile card status badge (~line 1125)**

Replace:

```tsx
                      <Badge value={report.severity} type="severity" />
                      <Badge value={report.category} type="category" />
                      <Badge value={report.status} type="status" />
```

with:

```tsx
                      <Badge value={report.severity} type="severity" />
                      <Badge value={report.category} type="category" />
                      {report.httpStatus ? (
                        <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold", httpStatusColor(report.httpStatus))}>
                          HTTP {report.httpStatus}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-neutral-500">No status</span>
                      )}
```

(The detail modal at line ~292 keeps `<Badge value={report.status} type="status" />` — workflow stays visible there, and the API section at ~line 333 already shows `HTTP {httpStatus}`.)

- [ ] **Step 5: Type-check + lint**

Run: `npm run type-check`
Then: `npm run lint`
Expected: no errors. (`Badge`/`statusColors` are still used by the detail modal, so no unused-symbol errors.)

- [ ] **Step 6: Visual check**

Run the app (`npm run dev`), open the admin error-reports page, confirm the list "Status" column shows `HTTP 409` (amber) / `HTTP 500` (red), the workflow filter and detail-modal controls still work, and historical rows show `—`.

- [ ] **Step 7: Update admin docs**

In `docs/admin/` note the error-reports list column now shows HTTP status (workflow status moved to detail/filter only). Bump `lastVerified` for `admin` in the manifest.

- [ ] **Step 8: Commit** *(only if authorized)*

```bash
git add src/components/admin/ErrorReportsManagement.tsx docs/admin/ CLAUDE.md
git commit -m "feat(admin): show HTTP status code in error-reports list column"
```

---

## Task 8 (mandatory): stop silently dropping Stripe-load errors

**Files:**
- Modify: `src/utils/error-reporting/auto-log-error.ts`

Pre-existing bug: `autoLogStripeError` sends `category:"stripe"`, which the POST zod rejects → the report is dropped. This is a Phase-1 (error-reporting) fix; can be done alongside Tasks 2-4.

- [ ] **Step 1: Map the category to a valid enum value (~line 242)**

Replace:

```tsx
  await autoLogError(enhancedError, {
    category: "stripe",
    severity: "critical",
```

with:

```tsx
  await autoLogError(enhancedError, {
    category: "payment",
    severity: "critical",
```

- [ ] **Step 2: Type-check, then commit** *(only if authorized)*

Run: `npm run type-check` → no errors.

```bash
git add src/utils/error-reporting/auto-log-error.ts docs/error-reporting/ CLAUDE.md
git commit -m "fix(error-reporting): stop dropping Stripe-load errors (category stripe -> payment)"
```

---

## Task 9: Roll out `rejectAndLog` to the rest of the Stripe family (~29 routes)

> **Execution:** best done **subagent-per-route** (or small batches) — each route is the *identical* transform proven in Tasks 5-6, but each has different return sites and context sources, so a fresh worker reading one route at a time is the safest. Tasks 5-6 are the canonical worked examples; do them first.

**Files (each: Modify):**

*billing-stripe domain (`api/stripe/**`, `api/invoice/**`):*
- `src/app/api/stripe/create-one-time-purchase/route.ts`
- `src/app/api/stripe/create-one-time-purchase-existing-user/route.ts`
- `src/app/api/stripe/cancel-subscription/route.ts`
- `src/app/api/stripe/cancel-incomplete-subscription/route.ts`
- `src/app/api/stripe/cancel-payment-intent/route.ts`
- `src/app/api/stripe/downgrade-subscription/route.ts`
- `src/app/api/stripe/upgrade-subscription-payment/route.ts`
- `src/app/api/stripe/renew-subscription/route.ts`
- `src/app/api/stripe/confirm-subscription-payment/route.ts`
- `src/app/api/stripe/pay-failed-invoice/route.ts`
- `src/app/api/stripe/force-charge-overdue/route.ts`
- `src/app/api/stripe/update-auto-renew/route.ts`
- `src/app/api/stripe/create-payment-intent/route.ts`
- `src/app/api/stripe/create-setup-intent/route.ts`
- `src/app/api/stripe/check-setup-intent-status/route.ts`
- `src/app/api/stripe/analyze-payment-intent/route.ts`
- `src/app/api/stripe/verify-payment-intent/route.ts`
- `src/app/api/stripe/verify-payment-complete/route.ts`
- `src/app/api/stripe/payment-methods/route.ts`
- `src/app/api/stripe/payment-methods/[id]/route.ts`
- `src/app/api/stripe/payment-methods/[id]/default/route.ts`
- `src/app/api/stripe/payment-intent/[id]/payment-method/route.ts`
- `src/app/api/stripe/subscription/update-payment-method/route.ts`
- `src/app/api/invoice/finalize/route.ts`

*payment domain (`api/payment-intent/**`, `api/payment-status/**`):*
- `src/app/api/payment-intent/[paymentIntentId]/metadata/route.ts`
- `src/app/api/payment-status/[paymentIntentId]/route.ts`

*subscription domain (`api/subscription/**`, `api/memberships/**`):*
- `src/app/api/subscription/benefits/route.ts`
- `src/app/api/subscription/cancellation-flow/route.ts`
- `src/app/api/memberships/route.ts`
- `src/app/api/memberships/[id]/route.ts`

> **Excluded (do NOT wire):** `src/app/api/stripe/webhook/route.ts` (server-to-server, high volume, special CSP).

**The transform (identical for every route):**

- [ ] **Step 1 (per route): add the import** (if not already present)

```ts
import { rejectAndLog } from "@/utils/error-reporting/reject-and-log";
```

- [ ] **Step 2 (per route): convert every non-thrown early `return NextResponse.json(body, { status })` with `status >= 400`**

From:

```ts
return NextResponse.json(body, { status });
```

To:

```ts
return rejectAndLog(request, status, body, ctx);
```

where `ctx` is built per the route's auth model:

- **Session-authenticated route** (has `getServerSession(authOptions)` → `session`): 
  ```ts
  { userId: session.user.id, userEmail: session.user.email ?? undefined }
  ```
- **Guest/registration route** (resolves a user by email, e.g. `registeredUser` + `validatedData.userEmail`):
  ```ts
  {
    userId: registeredUser?._id?.toString(),
    userEmail: registeredUser ? validatedData.userEmail : undefined,
    guestEmail: registeredUser ? undefined : validatedData.userEmail,
  }
  ```
- Add `customerId` / `packageId` only when those identifiers are already in scope at the return site.
- If the request param is not named `request`, pass whatever the handler's `NextRequest` is named.

- [ ] **Step 3 (per route): apply the hard rules**

- **Do NOT touch the `catch` block.** If the route already calls `autoLogPaymentErrorServer`/`ErrorLoggingService` in `catch`, leave it — `rejectAndLog` only covers non-thrown early returns.
- **Skip** the `429` rate-limit return, the `403` major-draw gate return (`enforceMajorDrawOpenForNewPurchasesOr403`), and any `401` that returns before user context exists.
- Leave `NextResponse` imported (still used by the catch and any skipped returns).

- [ ] **Step 4 (per route): verify**

Run: `npm run type-check` then `npm run lint`
Expected: no errors. Spot-check the diff: every converted line still returns the same body+status; only `rejectAndLog(...)` wraps it.

- [ ] **Step 5: update docs once the family is done**

Update `docs/billing-stripe/`, `docs/payment/`, and `docs/subscription/` to note the whole family now auto-captures non-thrown 4xx/5xx via `rejectAndLog` (webhook excluded). Bump `lastVerified` for `billing-stripe`, `payment`, `subscription` in the manifest.

- [ ] **Step 6: Commit** *(only if authorized)* — one commit per batch is fine.

```bash
git add src/app/api/stripe/ src/app/api/invoice/ src/app/api/payment-intent/ src/app/api/payment-status/ src/app/api/subscription/ src/app/api/memberships/ docs/billing-stripe/ docs/payment/ docs/subscription/ CLAUDE.md
git commit -m "feat(billing-stripe): capture non-thrown 4xx/5xx across the payment/subscription route family"
```

---

## Final verification (run before declaring done — see /ship)

- [ ] `npm run test:http-rejection-severity` → PASS
- [ ] `npm run type-check` → no errors
- [ ] `npm run lint` → no errors
- [ ] `/doc-sync` → no orphans/ghosts/stale for error-reporting, billing-stripe, payment, subscription, admin
- [ ] Grep check: no `await rejectAndLog` / `await ...logHttpRejection` anywhere (non-blocking invariant), and `api/stripe/webhook/route.ts` is untouched.
- [ ] Manual: trigger a 409 (attempt a second subscription) and confirm a new ErrorReport row appears with `HTTP 409`, category `payment`, severity `medium`, and the `EXISTING_SUBSCRIPTION` code in the message — and that the response is returned without added latency.

---

## Self-review notes (author)

- **Spec coverage:** Part 1 → Tasks 1-4 + Task 8; Part 2 (full family) → Tasks 5-6 (templates) + Task 9 (rest); Part 3 (admin) → Task 7; Part 4 (test/docs) → Task 1 + doc steps in 4/6/7/9. All covered.
- **Type consistency:** `classifyHttpRejection` returns `{capture, severity: ErrorSeverity}`; `logHttpRejection` consumes it and passes `severity` (medium/high) to `autoLogErrorServer` whose param type already accepts those. `rejectAndLog` → `logHttpRejection` param names match (`status`, `request`, `code`, `message`, `category`, `httpMethod`, `context`).
- **No new severity value** — confirmed nothing requires touching the 10 enum sites.
- **Double-logging** — every wired site is a non-thrown early return; all `catch` blocks left intact across all ~33 routes.
- **Non-blocking** — `rejectAndLog` returns synchronously; `logHttpRejection` is never awaited in any route path (verified in Final verification grep step).
- **Scope** — webhook excluded; checkout/auth/product-admin families deferred (item 6 in held-back).
