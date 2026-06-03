# Design — ErrorReport catch-all for non-thrown rejections (HTTP status + type)

**Date:** 2026-05-25
**Branch:** feature/user-audit
**Status:** Approved. Mechanism re-confirmed after a deep multi-reviewer evaluation (global wrapper considered and rejected — see "Why not a global wrapper").

## Problem

Controlled non-2xx API responses are invisible for debugging. The trigger case: a
`409 EXISTING_SUBSCRIPTION` from `POST /api/stripe/create-subscription-existing-user`
never reaches ErrorReport or Vercel error logs, because:

- It is a deliberate early `return NextResponse.json(..., { status: 409 })`, not a thrown
  error — so it never reaches the `catch` block that is the only caller of
  `ErrorLoggingService.logError`.
- The client special-cases `EXISTING_SUBSCRIPTION` into a toast-only branch that bypasses
  the client auto-logger.
- A 409 is a 4xx; Vercel only flags 5xx / uncaught exceptions as `error` level, and no
  `console.error` fires on this path.

The owner wants these to be visible **the moment they happen**, so the team can act without
waiting for a user to report it via the contact form — while keeping ErrorReport readable
(it was previously flooded with expected rejections and deliberately de-noised — see
[docs/error-reporting/gotchas.md](../../error-reporting/gotchas.md)).

## What "catch it right away" means here (capture policy)

We capture the rejections worth investigating and skip routine gate traffic:

| Response | Captured? | Severity | Why |
|---|---|---|---|
| `< 400` (incl. 3xx) | no | — | success / redirect, not an error |
| `401`, `403`, `404`, `429` | **no** | — | routine auth / permission / not-found / rate-limit gates — high-volume noise; logging them buries the real signal and (for 429) amplifies a brute-force into thousands of DB writes |
| other `4xx` **with a business `code`** (e.g. `409 EXISTING_SUBSCRIPTION`, payment 400 w/ decline code) | **yes** | `medium` | a deliberate, named business rejection — the user couldn't do the thing and it matters |
| other `4xx` **without** a code | no | — | usually generic validation/client noise; not worth a row |
| `5xx` (incl. non-thrown early returns like `503`) | **yes** | `high` | a genuine failure regardless of code |

Severity reuses the existing `medium`/`high` tiers — **no new `low` tier** (avoids a ~10-site
enum change; see "Why no `low` tier"). The business `code` is folded into the report message so
the type (e.g. `EXISTING_SUBSCRIPTION`) is identifiable in the admin list.

## Decisions (locked with owner)

1. **Destination:** everything into ErrorReport (one pane of glass), not a separate stream.
2. **Policy:** capture `5xx` + `4xx`-with-a-business-`code`; **skip** `3xx`/`<400` and the
   routine gates `401/403/404/429` and codeless 4xx (table above).
3. **Severity:** reuse `medium` (captured rejections) / `high` (5xx). No new `low` tier.
4. **Mechanism: per-return `rejectAndLog` helper, NOT a global wrapper.** A one-line
   `return rejectAndLog(request, status, body, ctx)` at each business-meaningful early return.
   The developer's choice of *where* to call it is the primary selector for "is this worth
   logging"; the classifier is a safety net that still skips the noise statuses. (A global
   handler wrapper was evaluated in depth and rejected — see next section.)
5. **Scope:** the payment/subscription/Stripe family, led by the two `create-subscription`
   routes (the actual reported pain). Other business-coded returns in the family are wired
   incrementally. **Not** a blanket sweep of all ~308 API routes.
6. **Future routes:** `rejectAndLog` is the documented convention for new routes; the same
   one-liner covers them. No mass retrofit.
7. **Admin page:** the main list "Status" column shows **HTTP status code**; the
   new/investigating/resolved/dismissed workflow stays in the detail view + filter.
8. **Non-blocking (HARD requirement):** logging must never delay or break a route's response
   (see "Non-blocking guarantee").
9. **Stripe-load silent-drop fix is in scope:** `autoLogStripeError`'s `category:"stripe"`
   (rejected by the model/zod enum → report silently dropped) → `"payment"`.
10. **No real-time alerting** (email/Slack) this round — recording to the admin page is enough.

## Why not a global wrapper (deep review — recorded so we don't relitigate)

A global `withErrorCapture(handler)` HOF on every route export was the initially-preferred
"future-proof everything" option. A deep multi-reviewer evaluation (two independent reviewers
+ direct verification) rejected it for **this** codebase. Verified facts:

- **308 API route files**, all using `export async function GET/POST` (386 declarations);
  **zero** use `export const POST = ...`. A wrapper means rewriting all 308 into a new export
  style — and [`.cursor/rules/.cursorrules:9`](../../../.cursor/rules/.cursorrules) forbids
  "introduc[ing] new patterns without need." No existing route-handler HOF exists to extend.
- **832 `status: 4xx` literals across 232 files** — in this codebase 4xx is overwhelmingly
  *normal control flow* (auth gates, validation, conflicts). A blanket "log every ≥400"
  floods ErrorReport with non-actionable noise and a DB write on the hot path.
- **`autoLogErrorServer` applies no rate limiting** — the `skipRateLimit` option is dead code;
  only dedup throttles. A global wrapper does one dedup `findOne` per rejected request, so a
  `429` brute-force burst becomes read-amplification against the ErrorReport collection (a
  self-inflicted DoS vector).
- **No App Router middleware post-hook** — middleware runs before handlers and cannot read the
  response status/body, so there is no zero-touch global option; "global" genuinely means
  editing 308 files.
- A global wrapper also needs a long mandatory exclusion list (webhook, cron, health,
  error-reports, nextauth, debug/test/dev, binary/export routes), an `x-error-logged` marker on
  the 7 routes that already self-log, content-type guards for non-JSON bodies, header-stripping,
  and node-runtime constraints — complexity that the per-return helper avoids entirely.

The per-return helper is *inherently better at separating signal from noise* here: the developer
calls it only at meaningful rejection sites, instead of a wrapper trying (and failing) to
distinguish a business `409` from a routine `401` via heuristics.

## Why no `low` tier (key risk reduction)

A `low` severity would require edits in ~10 places, each a silent-failure point if missed
(model enum, `IErrorReport`/query types, classifier type, the hardcoded `VALID_SEVERITIES` in
the admin route, the POST zod enum, two logger param types, the rate limiter). Reusing `medium`
removes all of this. Captured rejections stay distinguishable by the new HTTP-status column, the
`category` column, the `apiEndpoint` filter, and the business `code` in the message.

## Hard constraints discovered in review (must hold or bugs recur)

- **Force severity; never call `detectCategoryAndSeverity`.** It returns `critical` for any
  `payment` category, which would tag every captured 409 `critical`. `autoLogErrorServer` uses
  the passed severity directly — so passing `medium`/`high` is honored (verified).
- **Use only model-enum categories** (`payment | network | api | system | recovery`). Passing
  `"stripe"` makes the save throw and be swallowed — the report vanishes. Scoped routes use
  `category: "payment"`.
- **The code goes in `errorMessage`/`userNotes`, not `errorName`** — `errorName` is overwritten
  to `${category}_ERROR`.
- **Volume control is dedup only** — `autoLogErrorServer` has no rate limiting. The
  category-aware dedup window (payment = 30 min) collapses a user's retry spam into one row.
  This is why the capture policy excludes the high-volume gate statuses up front.
- **`httpStatus` is the dependency for the admin column** — never captured today; `httpMethod`
  is hardcoded `"POST"`. Both must be threaded through (`ErrorContext`, `IErrorReport`, the
  model schema, and the POST zod all already declare them — verified — so only the write path
  needs fixing).

## Non-blocking guarantee (HARD requirement)

Logging must never delay or break a route's response. Guaranteed by construction:

- `rejectAndLog` is **synchronous**: it calls `logHttpRejection(...)` **un-awaited**, attaches
  `.catch(() => {})`, `void`s the promise, then returns the same `NextResponse.json(body, { status })`.
- `logHttpRejection` is `async`; the only sync work before its first `await` is
  `classifyHttpRejection` (a few integer/`Set` checks). The dedup `findOne` + `save` run after
  `await import(...)` — detached.
- Being `async`, any error (even a sync throw) becomes a rejected promise the `.catch()`
  swallows — it can never throw into the handler.
- Returned body/status are **byte-identical** to the pre-change `NextResponse.json` calls.
- Mirrors the existing fire-and-forget pattern (`autoLogPaymentErrorServer(...).catch(...)`).

Accepted tradeoff (same as today): on serverless the detached write may occasionally not flush
if the instance suspends right after responding — never at the cost of blocking the user.

## Design

### Part 1 — Capture plumbing (error-reporting domain)

- `src/utils/error-reporting/auto-log-error-server.ts`: accept `httpStatus?: number` and
  `httpMethod?: string` in `additionalContext`; write them into the saved `ErrorContext`. Use
  the real method when provided (default stays `"POST"`).
- New pure util `src/utils/error-reporting/http-rejection-severity.ts`:
  `classifyHttpRejection(status, { hasBusinessCode }) → { capture, severity }`, encoding the
  capture-policy table (skip `<400`, skip `401/403/404/429`, `5xx`→high, other `4xx`→medium
  **only if** `hasBusinessCode`). This is the unit under regression test.
- `ErrorLoggingService.logHttpRejection({ status, code, message, request, context })`: derives
  `hasBusinessCode = !!code`, consults `classifyHttpRejection`; if `capture`, fire-and-forget
  calls `autoLogErrorServer` with `category: "payment"`, the forced `severity`, `httpStatus`,
  real `httpMethod`, identity, and `code` folded into the message. Never calls
  `detectCategoryAndSeverity`.
- `rejectAndLog(request, status, body, context)` route helper: returns
  `NextResponse.json(body, { status })` **and** fire-and-forget calls `logHttpRejection`, reading
  `code` from `body.code` and `message` from `body.error`.

### Part 2 — Wire the business rejections (billing-stripe + subscription + payment domains)

Convert each **non-thrown, business-meaningful early `return NextResponse.json(body, { status })`**
to `return rejectAndLog(request, status, body, ctx)`. Worked templates: the two
`create-subscription` routes. Extend to other business-coded returns in the payment/subscription
family incrementally.

**Context derivation per route type:**
- *Session-authenticated routes:* `userId: session.user.id`, `userEmail: session.user.email ?? undefined`.
- *Guest/registration routes:* `userId: registeredUser?._id?.toString()`, request email as
  `userEmail` when a user exists else `guestEmail`.
- Add `customerId`/`packageId` wherever already in scope at the return site.

**Hard rules (every route):**
- **Leave every `catch` block untouched** — thrown errors are already auto-logged there; the
  classifier + selective placement mean no double-logging of the same error (dedup is a backstop).
- **Never wrap** `401`/`403`/`404`/`429` returns, the externally-built `403` major-draw gate, or
  the `api/stripe/webhook` route.

### Part 3 — Admin page (admin domain)

`src/components/admin/ErrorReportsManagement.tsx`: the list "Status" column shows
`HTTP <httpStatus>` (color-coded by class) instead of the workflow badge. Make the column
non-sortable (plain `<th>`) so we don't touch `VALID_SORT_FIELDS`/`SortField`. Keep the workflow
badge + resolve/dismiss/archive + status filter in the detail modal (already present).
`cn` is already imported and `report.httpStatus` is already used there (verified).

### Part 4 — Regression test + docs

- `http-rejection-severity.test.ts` (+ `test:*` entry): `<400` not captured; `401/403/404/429`
  not captured (regardless of code); `5xx` → high; coded `4xx` → medium; codeless `4xx` not
  captured; invalid input not captured.
- Update domain docs per phase; bump manifest `lastVerified`.

## Phasing (each phase updates its own docs to satisfy the doc-sync Stop hook)

1. **Plumbing + helper + test** — `httpStatus`/`httpMethod` capture, `classifyHttpRejection`,
   `logHttpRejection`, `rejectAndLog`, regression test, `docs/error-reporting/`. Includes the
   `autoLogStripeError` `category` fix.
2. **Subscription-creation routes (templates)** — wire both `create-subscription` routes;
   `docs/billing-stripe/`. Ships the ask: `EXISTING_SUBSCRIPTION` now visible.
3. **Admin column** — repurpose the list status cell; `docs/admin/`.
4. **Incremental rollout** — extend `rejectAndLog` to other business-coded returns in the
   payment/subscription family as needed; document the convention for new routes;
   `docs/billing-stripe/` + `docs/subscription/` + `docs/payment/`.

## Held back / deliberately simplified

1. **Reused `medium` instead of a real `low` tier** — avoids a ~10-site enum change. *Trigger to
   revisit:* if severity-based dashboards must separate "expected business rejection" from "real
   medium bug", build the `low` tier.
2. **New admin HTTP column is non-sortable** — avoids touching `VALID_SORT_FIELDS`/`SortField`.
   *Trigger:* if sorting by status code is wanted.
3. **Forced `category: "payment"`** for scoped routes — the model enum has no business/validation
   category. *Trigger:* if categories must distinguish business-rule rejections.
4. **`errorName` stays `PAYMENT_ERROR`; the code lives in the message** — `autoLogErrorServer`
   overwrites `errorName`. *Trigger:* if a code-named `errorName` is wanted (it feeds dedup —
   re-check collision behavior).
5. **No global wrapper / no all-routes sweep** — rejected after deep review (see above). The
   `rejectAndLog` convention covers new routes one line at a time. *Trigger:* if Next.js ever
   gains a response post-hook, or the team accepts a 308-file wrap + exclusion list + server-path
   rate cap, revisit a true global net.
6. **`httpMethod` hardcode fixed only on the helper path** — other server-auto-logged errors still
   record `"POST"`. *Trigger:* a broader `autoLogErrorServer` cleanup.
7. **No alerting / no client-side capture** — server-side recording covers the debugging need.
8. **Test coverage is the pure classifier only** — repo has no integration runner for the DB
   write / route wiring / admin render.

## Risks & mitigations

- **Double-logging:** helper only on non-thrown returns; `catch` keeps throws; dedup is backstop.
- **Noise regression:** capture policy excludes `401/403/404/429` + codeless 4xx, and scope is
  the payment/subscription family — keeps expected rejections from burying real failures.
- **Silent save-drop:** helper enforces an enum-valid `category`.
- **Wrong-tool risk (global wrapper):** explicitly evaluated and rejected; recorded above.
