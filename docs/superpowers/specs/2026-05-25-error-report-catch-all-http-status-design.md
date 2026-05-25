# Design — ErrorReport as the catch-all, identified by HTTP status + type

**Date:** 2026-05-25
**Branch:** feature/user-audit
**Status:** Approved (design); hardened after deep pre-implementation review

## Problem

Controlled non-2xx API responses are invisible for debugging. The trigger case: a
`409 EXISTING_SUBSCRIPTION` from `POST /api/stripe/create-subscription-existing-user`
never reaches ErrorReport or Vercel error logs, because:

- It is a deliberate early `return NextResponse.json(..., { status: 409 })`
  ([route.ts:303-315](../../../src/app/api/stripe/create-subscription-existing-user/route.ts#L303-L315)),
  not a thrown error — so it never reaches the `catch` block that is the only caller of
  `ErrorLoggingService.logError` ([route.ts:608-648](../../../src/app/api/stripe/create-subscription-existing-user/route.ts#L608-L648)).
- The client special-cases `EXISTING_SUBSCRIPTION` into a toast-only branch that bypasses the
  client auto-logger ([MembershipModal/index.tsx:4206-4218](../../../src/components/modals/MembershipModal/index.tsx#L4206-L4218)).
- A 409 is a 4xx; Vercel only flags 5xx / uncaught exceptions as `error` level, and no
  `console.error` fires on this path.

The user wants ErrorReport to be the **single catch-all for every type of error**, staying
readable (it was previously flooded with expected rejections and deliberately de-noised — see
[docs/error-reporting/gotchas.md](../../error-reporting/gotchas.md)), and the admin page to
identify each report by **HTTP status code + error type** rather than workflow state.

## Decisions (locked with user)

1. **Destination:** everything into ErrorReport (one pane of glass), not a separate stream.
2. **Policy:** capture all 4xx + 5xx; **exclude 3xx** (a redirect is a success, not an error).
3. **Severity:** **reuse the existing `medium` tier** for expected rejections — NO new `low`
   tier. (Avoids a ~10-site enum change; see "Why no `low` tier".) Real failures keep their
   `critical`/`high` tags from the existing catch-block path.
4. **Rollout (broadened):** wire the explicit `rejectAndLog` pattern across the **entire
   payment/subscription/Stripe route family (~33 routes** under `api/stripe/**`,
   `api/subscription/**`, `api/payment-intent/**`, `api/payment-status/**`, `api/invoice/**`,
   `api/memberships/**`), **excluding the `api/stripe/webhook` route** (server-to-server, high
   volume, special handling — deferred). Checkout/cart, auth, and product-admin families are NOT
   in scope this round (user decision). The reusable helper means those can adopt later.
5. **Admin page:** the main list "Status" column becomes **HTTP status code + error type**; the
   new/investigating/resolved/dismissed **workflow is kept** (filter + resolve/dismiss/archive
   stay in the detail view), not removed.
6. **Non-blocking (HARD requirement):** logging must never delay or break a route's response.
   `rejectAndLog` returns the response synchronously and fires `logHttpRejection` detached
   (un-awaited, `.catch()`-swallowed). See "Non-blocking guarantee".
7. **Stripe-load silent-drop fix is IN scope** (was optional): `autoLogStripeError`'s
   `category:"stripe"` → `"payment"` so those reports stop being rejected by the POST zod.

## Why no `low` tier (key risk reduction)

Adding a `low` severity would require edits in ~10 places, each a silent-failure point if
missed: model enum [ErrorReport.ts:92](../../../src/models/ErrorReport.ts#L92);
`IErrorReport` + `ErrorReportsQueryParams` [types:78,163](../../../src/types/error-reporting.ts#L78);
classifier type [error-severity-classifier.ts:15](../../../src/utils/error-reporting/error-severity-classifier.ts#L15);
the **hardcoded** `VALID_SEVERITIES` [admin route:19](../../../src/app/api/admin/error-reports/route.ts#L19)
(a missed update here makes the `low` filter silently return everything); the **POST zod enum**
[error-reports/route.ts:64](../../../src/app/api/error-reports/route.ts#L64) (a `low` value
would 400 and drop the report); two logger param types; the rate limiter. Reusing `medium`
removes all of this. Reports are still distinguishable by the new HTTP-status column, the
existing `category` column, and the `apiEndpoint` filter.

## Capture policy & severity mapping

`classifyHttpRejection(status)`:

| Response | Captured? | Severity |
|---|---|---|
| < 400 (incl. 3xx) | no | — |
| 4xx (incl. 401, 409, 429 on the scoped routes) | yes | `medium` |
| 5xx (non-thrown early returns, e.g. 503) | yes | `high` |

Note: site-wide 401 is high-volume; **scope is payment/subscription routes only**, where a 401
means "session expired mid-checkout" — low-volume and debugging-relevant. Revisit 401/429
exclusion if/when expanding site-wide (deferred).

## Hard constraints discovered in review (must hold or bugs recur)

- **Force severity; never call `detectCategoryAndSeverity`.** It returns `critical` for any
  `payment` category ([classifier:165](../../../src/utils/error-reporting/error-severity-classifier.ts#L165)),
  which would tag every captured 409 `critical`.
- **Use only model-enum categories** (`payment | network | api | system | recovery`). Passing
  `"stripe"` makes the Mongoose save throw and be **swallowed silently**
  ([auto-log-error-server.ts:200](../../../src/utils/error-reporting/auto-log-error-server.ts#L200)) —
  the report vanishes. Scoped routes use `category: "payment"`.
- **The code goes in `errorMessage`/`userNotes`, not `errorName`** — `errorName` is overwritten
  to `${category}_ERROR` ([auto-log-error-server.ts:112](../../../src/utils/error-reporting/auto-log-error-server.ts#L112)).
- **Volume control is dedup only** — `autoLogErrorServer` has no rate limiting. The category-aware
  dedup window (payment = 30 min) collapses a user spamming retry into one row.
- **`httpStatus` is the dependency for the admin column** — it is never captured today and
  `httpMethod` is hardcoded `"POST"` ([line 86](../../../src/utils/error-reporting/auto-log-error-server.ts#L86)).
  Must be threaded through for the column to render.

## Non-blocking guarantee (HARD requirement)

Logging must never delay or break a route's response. Guaranteed by construction:

- `rejectAndLog` is **synchronous**: it calls `logHttpRejection(...)` **un-awaited**, attaches
  `.catch(() => {})`, `void`s the promise, then returns the same `NextResponse.json(body, { status })`.
- `logHttpRejection` is `async`; the only sync work before its first `await` is `classifyHttpRejection`
  (two integer comparisons). The dedup `findOne` + `save` run after `await import(...)` — detached.
- Being `async`, any error (even a sync throw) becomes a rejected promise the `.catch()` swallows —
  it can never throw into the handler.
- Returned body/status are **byte-identical** to the pre-change `NextResponse.json` calls — behavior
  unchanged, only a detached log added.
- Mirrors the existing fire-and-forget pattern (`autoLogPaymentErrorServer(...).catch(...)`,
  `getServerSession(...).then(...)`).

Accepted tradeoff (same as today): on serverless the detached write may occasionally not flush if
the instance suspends right after responding — never at the cost of blocking the user.

## Design

### Part 1 — Capture plumbing (error-reporting domain)

- `src/utils/error-reporting/auto-log-error-server.ts`: accept `httpStatus?: number` and
  `httpMethod?: string` in `additionalContext`; write them into the saved `ErrorContext`
  (`ErrorContext` already declares both fields — no type change). Default method stays `"POST"`.
- New pure util `src/utils/error-reporting/http-rejection-severity.ts`:
  `classifyHttpRejection(status: number) → { capture: boolean; severity: "high" | "medium" }`.
  `capture === false` for `status < 400`. This is the unit under regression test.
- `ErrorLoggingService.logHttpRejection({ status, code, message, request, context })`: consults
  `classifyHttpRejection`; if `capture`, fire-and-forget calls `autoLogErrorServer` with
  `category: "payment"` (scoped routes), the forced `severity`, `httpStatus`, `httpMethod`,
  `userId`/`email`, and `code` folded into the message. Never calls `detectCategoryAndSeverity`.
- **`rejectAndLog(request, status, body, context)` convenience** (route-layer helper): returns
  `NextResponse.json(body, { status })` **and** fire-and-forget calls `logHttpRejection`. Rationale
  discovered in review: the two routes have **~23 non-thrown early returns** between them; a
  one-line wrapper at each site is far less error-prone than two hand-written lines, and guarantees
  no return is forgotten. It reads `code` from `body.code` and `message` from `body.error`.

### Part 2 — Wire the payment/subscription/Stripe family (~33 routes; billing-stripe + subscription + payment domains)

Apply the **same** transform to every route in the family: convert each **non-thrown early
`return NextResponse.json(body, { status })`** to `return rejectAndLog(request, status, body, ctx)`.
The two `create-subscription` routes are the worked templates (detailed in the plan); the rest are
the identical mechanical transform.

**Routes in scope** (under `api/stripe/**`, `api/subscription/**`, `api/payment-intent/**`,
`api/payment-status/**`, `api/invoice/**`, `api/memberships/**`): create-subscription (×2),
create-one-time-purchase (×2), cancel-subscription, cancel-incomplete-subscription,
cancel-payment-intent, downgrade-subscription, upgrade-subscription-payment, renew-subscription,
confirm-subscription-payment, pay-failed-invoice, force-charge-overdue, update-auto-renew,
create-payment-intent, create-setup-intent, check-setup-intent-status, analyze-payment-intent,
verify-payment-intent, verify-payment-complete, payment-methods (×3), subscription/update-payment-method,
payment-intent/[id]/payment-method, payment-intent/[paymentIntentId]/metadata, payment-status/[id],
invoice/finalize, memberships (×2), subscription/benefits, subscription/cancellation-flow.

**Context derivation rule per route type:**
- *Session-authenticated routes* (most `api/stripe/*`, `api/subscription/*`): `getServerSession` →
  `userId: session.user.id`, `userEmail: session.user.email ?? undefined`.
- *Guest/registration routes* (create-subscription, create-one-time-purchase): `userId:
  registeredUser?._id?.toString()`, and the request email as `userEmail` when a user exists else
  `guestEmail`.
- Add `customerId`/`packageId` wherever those are already in scope at the return site.

**Hard rules (apply to every route):**
- **Leave every `catch` block untouched.** Routes that already auto-log thrown errors in `catch`
  (e.g. `autoLogPaymentErrorServer`) keep doing so; `rejectAndLog` covers only the non-thrown early
  returns the catch never sees → no double-logging.
- **Excluded everywhere:** `429` rate-limit returns; the externally-built `403` major-draw gate
  (`enforceMajorDrawOpenForNewPurchasesOr403` returns a pre-built response); and the
  **`api/stripe/webhook`** route entirely (server-to-server, high volume, special CSP handling).
- Pre-`validatedData`/pre-auth `401`s that have no user context are skipped (noise).

### Part 3 — Admin page (admin domain)

`src/components/admin/ErrorReportsManagement.tsx` — the status badge renders in **4 sites**:
- desktop table cell [1077](../../../src/components/admin/ErrorReportsManagement.tsx#L1077)
- sortable header tuple [1032](../../../src/components/admin/ErrorReportsManagement.tsx#L1032)
- mobile card (~1120)
- detail modal [292](../../../src/components/admin/ErrorReportsManagement.tsx#L292)

Change: the list "Status" column shows `HTTP <httpStatus>` + a type indicator (category) instead
of the workflow badge. **Make the new column non-sortable** (plain `<th>`) so we don't have to
touch `VALID_SORT_FIELDS` ([admin route:20](../../../src/app/api/admin/error-reports/route.ts#L20))
or `SortField`. Keep the workflow status badge + resolve/dismiss/archive actions + status filter
in the detail modal (already present). The list query returns `httpStatus` already (no projection
— [admin route:217-223](../../../src/app/api/admin/error-reports/route.ts#L217-L223)).

### Part 4 — Regression test + docs

- `src/utils/error-reporting/__tests__/http-rejection-severity.test.ts` (+ `test:*` entry in
  `package.json`): 3xx/<400 → not captured; 5xx → `high`; 4xx → `medium`.
- Update domain docs per phase; bump manifest `lastVerified`.

## Phasing (each phase updates its own docs to satisfy the doc-sync Stop hook)

1. **Plumbing + helper + test** — `httpStatus`/`httpMethod` capture, `http-rejection-severity`
   util, `logHttpRejection`, `rejectAndLog`, regression test + `package.json` entry,
   `docs/error-reporting/`. Includes the `autoLogStripeError` `category` fix.
2. **Subscription-creation routes (templates)** — wire both `create-subscription` routes;
   `docs/billing-stripe/`. Ships the ask: `EXISTING_SUBSCRIPTION` now visible.
3. **Rest of the Stripe family** — apply the identical transform to the remaining ~29 routes under
   `api/stripe/**`, `api/invoice/**`, `api/payment-intent/**`, `api/payment-status/**`,
   `api/memberships/**` (excl. webhook); `docs/billing-stripe/` + `docs/payment/`.
   Best executed subagent-per-route.
4. **Subscription domain routes** — `api/subscription/**` (benefits, cancellation-flow);
   `docs/subscription/`.
5. **Admin column** — repurpose the 4 render sites; `docs/admin/`.

## Held back / deliberately simplified — notes for future implementations

Full disclosure of every place this design chose the leaner/safer option instead of the maximal
one. Each is a conscious tradeoff, not an oversight. Listed with **why** and the **trigger** that
should make a future implementer revisit it.

### A. Deliberate simplifications (chose safer/leaner)

1. **Reused `medium` instead of a real `low` tier.** *Why:* avoids a ~10-site enum change, each a
   silent-failure point. *Cost:* expected rejections (409) are indistinguishable from genuine
   `medium` errors when filtering/aggregating **by severity** — you must filter by `httpStatus` /
   `category` / `apiEndpoint` instead. The `bySeverity` analytics bucket will lump them together.
   *Trigger to revisit:* if the team wants severity-based dashboards/alerts that separate
   "expected business rejection" from "real medium bug", invest in the proper `low` tier (update
   all 10 sites listed under "Why no `low` tier").

2. **New admin HTTP column is non-sortable.** *Why:* keeps us from touching `VALID_SORT_FIELDS`
   ([admin route:20](../../../src/app/api/admin/error-reports/route.ts#L20)), `SortField`, and
   `ErrorReportsQueryParams.sortBy`. *Cost:* you can't sort the list by status code. *Trigger:*
   if sorting by status code is wanted, add `"httpStatus"` to all three in lockstep.

3. **Forced `category: "payment"` for the scoped routes.** *Why:* the model enum has no
   business-rule/validation category, and adding one has the same multi-site cost as `low`.
   *Cost:* a 409 "you already have a subscription" is semantically a business-rule rejection, not
   a "payment failure" — the category is imprecise. *Trigger:* if categories need to distinguish
   business-rule rejections, add a `"business"`/`"validation"` category (model enum + both zod/
   filter allowlists + colors).

4. **`errorName` left as `PAYMENT_ERROR`; code only in `errorMessage`/`userNotes`.** *Why:*
   `autoLogErrorServer` overwrites `errorName` to `${category}_ERROR`
   ([line 112](../../../src/utils/error-reporting/auto-log-error-server.ts#L112)); changing that
   overwrite affects existing callers and the dedup hash. *Cost:* the admin "name" field won't say
   `EXISTING_SUBSCRIPTION`; you read it from the message. *Trigger:* if a code-named `errorName`
   is wanted, refactor the overwrite carefully (it feeds dedup — re-check collision behavior).

5. **`httpMethod` hardcode fixed only on the helper path.** *Why:* scope. *Cost:* every other
   server-auto-logged error still records `"POST"` regardless of real method
   ([line 86](../../../src/utils/error-reporting/auto-log-error-server.ts#L86)). *Trigger:* a
   broader cleanup of `autoLogErrorServer` should make all callers pass the real method.

### B. Deferred scope (reusable foundation, not built yet)

6. **Other route families** — checkout/cart/orders/upsell, auth/user/users, product-admin CRUD, and
   the **`api/stripe/webhook`** route are NOT wired this round (user scoped to the payment/
   subscription/Stripe family). The `rejectAndLog` helper is reusable, so adopting them later is the
   same one-line transform. A **`withResponseCapture()` wrapper** is the option for a true all-`api/**`
   rollout (different mechanism — reads response bodies, needs an `x-error-logged` marker to avoid
   double-logging the routes that already log in `catch`, cannot capture stack traces). **Revisit
   401/429 + dedup-window then** — site-wide they are high-volume; `autoLogErrorServer` derives the
   window from category only (payment=30m, net=2h, else=1h) with no per-severity override.

7. **Client-side capture** of these rejections (the toast-only branches). *Why:* server-side
   covers the debugging need and avoids duplicate rows. *Trigger:* if a rejection can occur
   without a server round-trip and still needs logging.

### C. Known pre-existing issues

8. **`autoLogStripeError` silent drop — NOW IN SCOPE (Phase 1).** Sends `category:"stripe"`, rejected
   by the POST zod enum → Stripe payment-form load errors are never logged today
   ([auto-log-error.ts:242](../../../src/utils/error-reporting/auto-log-error.ts#L242)). Fixed here
   by mapping `"stripe" → "payment"`.

9. **`skipDeduplication: true` + hash collision = silent E11000 drop.** The `deduplicationHash`
   has a global unique index; with dedup-check skipped, a same-window collision throws on save and
   is swallowed ([auto-log-error-server.ts:200](../../../src/utils/error-reporting/auto-log-error-server.ts#L200)).
   *Mitigation:* our helper does **not** pass `skipDeduplication`. *Trigger:* never set it on a
   high-frequency path.

### D. Accepted limitations (no action planned)

10. **Historical rows show "Status not captured"** in the new column — `httpStatus` wasn't
    recorded before this change and cannot be backfilled. Only forward data populates.
11. **No self-monitoring of the helper** — it's fire-and-forget with swallowed errors (matches the
    existing pattern). If logging itself fails, we won't know.
12. **Per-rejection DB cost** — each captured 4xx/5xx does a dedup `findOne` + possible insert.
    Bounded by scoping + dedup, not load-tested. Watch DB load when expanding site-wide (item 6).
13. **Test coverage is the pure util only** (`classifyHttpRejection`). No integration test for the
    DB write, route wiring, or admin render — the repo has no component/integration test runner.

### Explicitly NOT doing

- Removing the workflow-status feature (kept in detail view + filter).

## Risks & mitigations

- **Double-logging:** helper only on non-thrown returns; catch keeps throws; dedup is backstop.
- **Noise regression:** dedup window + scoping to payment/subscription routes keeps expected
  rejections from burying real failures (the failure mode `gotchas.md` documents).
- **Silent save-drop:** enforced enum-valid category in the helper (constraint above).
