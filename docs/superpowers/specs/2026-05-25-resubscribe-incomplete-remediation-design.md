# Resubscribe / abandoned-incomplete remediation — design

**Date:** 2026-05-25
**Branch:** `feature/user-audit`
**Status:** design approved (forks confirmed), pending implementation plan

## Background

Users who join on the 25th–27th (anchor billing sets `trial_end`) and abandon the
initial $20 payment leave a Stripe subscription whose object `.status` is
`incomplete` but which has a future `trial_end`. Stripe's
`subscriptions.list({ status: "trialing" })` filter returns such a subscription
even though it is not a live membership. The resubscribe guard
(`stripeCustomerHasManageableSubscription` → `findRecoverableSubscriptionForCustomer`)
trusted that filter and permanently blocked resubscribe with a 409
`EXISTING_SUBSCRIPTION`. The user's `/my-account` shows them as unsubscribed, so
they have no self-service path → lost revenue.

**Already shipped on this branch (core fix):** `findRecoverableSubscriptionForCustomer`
now re-validates each listed subscription's real `.status` with
`isManageableStripeSubscriptionStatus()` instead of trusting the query filter.
Regression test: `npm run test:find-recoverable-subscription`. Documented in
`docs/subscription/gotchas.md`.

This spec covers the three remaining follow-ups.

## Goals

1. **Backfill cleanup (full cohort):** cancel leftover abandoned `incomplete`
   subscriptions, void their open initial $20 invoices, and repair-or-clear dead
   `stripeSubscriptionId` pointers.
2. **Prevent-at-source hygiene:** stop the same user re-accumulating abandoned
   incomplete subscriptions on each resubscribe.
3. **Double-toast fix:** show one actionable toast on a blocked subscribe, not two.

## Non-goals

- No recurring cron sweep (rejected to avoid standing infrastructure; the backfill
  script is idempotent and re-runnable for stragglers).
- No change to anchor-billing trial mechanics.
- No rework of the modal's pre-warm architecture beyond the toast suppression.

## Architecture

### Shared helper (the only place that mutates Stripe for abandoned checkouts)

`cancelIncompleteSubscriptionAndVoidInvoice(stripe, subscriptionId)` — new function
in `src/services/subscription/` (co-located with `SubscriptionReferenceService.ts`).

Behaviour (strict, idempotent):
1. **Re-retrieve** the subscription (TOCTOU guard — never act on stale scan data).
2. If status is **not** `incomplete` or `incomplete_expired` → return
   `{ action: "skipped", reason }`. Never touches `active/trialing/past_due/unpaid/paused/canceled`.
3. If status is `incomplete` → `subscriptions.cancel(id)`.
4. Find the subscription's initial invoice; if its status is **`open`** →
   `invoices.voidInvoice(id)`. (incomplete ⟹ unpaid, so voiding is safe and prevents
   a later dunning charge.) Skip `draft`/`paid`/`void` invoices.
5. Return a structured result `{ action, cancelled, invoiceVoided, reason }` for logging.

Reused by both Part 1 (script) and Part 2 (runtime). Unit-tested with a mock Stripe
client so the dangerous logic is written and verified exactly once.

### Part 1 — Backfill script

`scripts/cleanup-abandoned-incomplete-subscriptions.ts` (+ `cleanup:abandoned-incomplete`
and `cleanup:abandoned-incomplete:dry` in `package.json`). Mirrors the proven safety
harness of `scripts/repair-wrong-stripe-subscription-ids.ts`:

- **Dry-run by default**; `--live` to mutate.
- `--older-than-hours` (default **24**) — never touches an in-flight checkout.
- `--limit`, `--concurrency`, rate-limit retry with backoff, production countdown
  (`CONFIRM_BACKFILL_PRODUCTION`), per-user try/catch.
- Targets only `incomplete` subs older than the threshold → calls the shared helper.
- **Pointer repair:** if a genuinely-recoverable sub exists for the customer → point
  `stripeSubscriptionId` to it; if none → **clear** the pointer and set `isActive:false`,
  preserving `packageId` + `lastMonthAccumulatedEntries` for resubscribe carry-over.
  (The existing repair script only handles the "recoverable exists" case.)
- **Operator runs `--live`** after reviewing dry-run output. Implementation/diagnosis
  in this session is read-only only.

### Part 2 — Prevent-at-source (runtime)

In `src/app/api/stripe/create-subscription/route.ts` and
`create-subscription-existing-user/route.ts`, after the guard passes and before
creating the new subscription, cancel the user's stale `pendingStripeSubscriptionId`
via the shared helper, merged with the existing `cancelPreviousSubscriptionId` logic
(deduped, non-fatal). The route-level orchestration delegates to a thin service
function so route handlers stay thin.

**Why it's safe:** `handleSubmit` *confirms* the pre-created subscription without
re-calling the route, so a new route call always means a genuinely fresh attempt —
we never cancel the subscription currently being paid.

### Part 3 — Double-toast fix

`src/components/modals/MembershipModal/index.tsx`: the auto-create-on-open `onError`
handler **suppresses** the `EXISTING_SUBSCRIPTION` toast (background pre-warm, not a
user action; logs only). The single actionable "Active Subscription Found" toast
remains on the purchase click. Scoped strictly to `EXISTING_SUBSCRIPTION`; all other
error handling unchanged.

## Observability requirement (all scripts)

Long Stripe scans must never look frozen. Every script in this work:

- **Phase banners:** `[1/4] Connecting to Mongo…`, `[2/4] Scanning Stripe…`,
  `[3/4] Planning…`, `[4/4] Applying (live)…`.
- **Progress with ETA** every N processed items (stderr), like the repair script:
  `Progress: 120/540 (22%) | elapsed 0m45s | ~2m left | cancelled 18 | voided 18 | errors 0`.
- **Time-based heartbeat:** a `still working… (N done, Ms elapsed)` line every ~10s,
  so even slow paginated `subscriptions.list` calls show movement.
- **Per-item action lines** in both modes:
  `[WOULD CANCEL]/[CANCELLED]`, `[WOULD VOID]/[VOIDED]`, `[WOULD CLEAR POINTER]/[CLEARED]`.
- **Start/end timestamps + total duration**, and a final summary table:
  scanned, targeted, cancelled, voided, pointers repaired, pointers cleared,
  skipped (manageable / too-new), errors. Plus the affected-emails list.
- Logs flushed immediately (no buffering).

## Tests

- `npm run test:find-recoverable-subscription` — existing core-fix regression (green).
- New unit test for `cancelIncompleteSubscriptionAndVoidInvoice` (mock Stripe):
  skips manageable/canceled, cancels `incomplete`, voids only `open` invoices,
  idempotent on re-run. Wired as a `test:*` script.
- Cleanup script verified via **test-mode dry-run** before any live run.

## Docs to update

- `docs/subscription/` — shared helper + prevent-at-source behaviour (backend.md/patterns.md);
  cross-link from gotchas.md.
- `docs/infrastructure/testing.md` — new `cleanup:*` and `test:*` commands.
- `docs/shared-ui/` — MembershipModal toast change (modal maps to shared-ui in the manifest).

## Manifest check

All new paths match existing globs — no orphans, no new domain:
- `scripts/cleanup-abandoned-incomplete-subscriptions.ts` → `scripts/cleanup-*.ts` → **infrastructure**.
- `src/services/subscription/*` (helper + test) → **subscription**.
- `package.json` → **infrastructure**.
- `src/components/modals/MembershipModal/**` → `src/components/modals/**` → **shared-ui**.
- route changes → `src/app/api/stripe/**` → **billing-stripe** (existing-user) / per manifest.

## Risks & mitigations

1. **Stripe cancel/void ordering for trial+incomplete** — verify on one test-mode sub
   before live; helper re-checks status before acting.
2. **TOCTOU (sub transitions between scan and mutate)** — helper re-retrieves and acts
   only on `incomplete`.
3. **Canceling an in-flight 3DS sub** — `--older-than-hours` threshold (script);
   "never cancel the just-created sub" invariant (runtime).
4. **Voiding a payable invoice** — only `open` invoices on `incomplete` subs.
5. **Dead-pointer clear affecting cancel flow** — `resolveCancellableStripeSubscription`
   already handles a missing pointer gracefully (throws `NO_ACTIVE_SUBSCRIPTION`, correct).
6. **doc-sync hook** — MembershipModal change requires a `docs/shared-ui/` edit.
