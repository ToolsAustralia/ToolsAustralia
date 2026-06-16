# Bulk Stranded-Invoice Recovery — Design

**Status:** Draft for review
**Date:** 2026-06-16
**Author:** DJ + Claude
**Domain:** `admin` (extends the existing past-due charge + stranded-recovery subsystem)

## Problem (grounded in real prod data, 2026-06-16)

The daily bulk past-due charger (`POST /api/admin/invoices/charge-past-due`) charges almost nobody. The latest run (`6a30148229e78ed2bad2cf32`, 2026-06-15):

```
attempted 591 · succeeded 12 · failed 579 · skipped 257 · revenue $400
```

Failure breakdown of the 579:

| Reason | Count | Recoverable here? |
|---|---|---|
| **`INVOICE_NO_LONGER_PAYABLE`** ("this invoice can no longer be paid") | **376** | **Yes — this spec** |
| insufficient_funds | 112 | No — card problem |
| card_declined | 36 | No — card problem |
| wrong card number / unsupported / PI-method / invalid account / expired | ~55 | No — card problem |

The 376 are repeated every run (runs show 3–25 successes, ~570 failures consistently), so the same ~376 members are perpetually un-collectible. **This is the "many stranded users."**

### Why they're stuck (verified on Stripe — example `sub_1SoYKd`, jessendan0, Foreman $40)

| Invoice | Cycle | Status | Note |
|---|---|---|---|
| in_1SoYKd | Jan (signup) | paid | OK |
| in_1Szn7Y | Feb | **open** | `attempt_count 9` — Stripe smart-retried 9× then gave up |
| in_1T9wSq | Mar | **open** | `attempt_count 9` |
| in_1TLBEV | Apr | **open** | what the bulk charger hits → **"no longer be paid"** |
| in_1TW3Wh | May | **draft** | held (pause_collection) |
| in_1ThIJ4 | Jun (current) | **draft** | held — current cycle, never charged |

Two facts the current bulk charger doesn't handle:

1. **Multiple stale OPEN cycle invoices** accumulated before `pause_collection: keep_as_draft` took over. Stripe refuses `invoices.pay()` on these superseded open invoices → "no longer be paid." (There are **0 `uncollectible`** invoices account-wide — so the May-2026 stranded-recovery flow, whose eligibility only accepts `uncollectible`/`void` originals, does **not** match this population.)
2. The **current cycle is a held DRAFT** that the bulk charger never finalizes/pays (it lists `status: "open"` only).

So a stranded member = past_due + ≥1 held draft (current cycle) blocked behind stale open invoices. The fix is to **void the stale opens and finalize+pay the current held draft** — one cycle.

## Goal

An **admin-triggered, capped, preview-first batch** action that recovers stranded members: for each, void the stale open/superseded invoices and finalize + pay the **current cycle's held draft**. Reuse the existing per-invoice pay primitive, locks, idempotency, and audit.

## Decisions (locked with DJ)

- **Charge the current cycle only.** Void the stale open invoices and delete superseded drafts; collect exactly one cycle (the current held draft). Missed months are written off — the member received no benefits while past_due. (Same philosophy as the existing per-user recovery.)
- **Cap 25 per run.** Recover in controlled batches; review; repeat.
- **Admin-triggered with preview + typed `RECOVER` confirmation.** Not an unattended cron — the void step is irreversible.
- **Out of scope:** the ~203 card-failure members (need a card-update flow), and any stranded member with **no held draft** (can't be recovered without minting a manual invoice, which breaks the renewal webhook — flag them in the preview for separate handling).

## Detection (the preview)

Read-only. Source of truth is live Stripe, seeded by the past_due cohort:

1. Mongo: members with `subscription.status === "past_due"` and a `stripeSubscriptionId` (~609 candidates).
2. For each (rate-limited, reuse the `batchFetchCustomers` batching), list the subscription's invoices and classify:
   - **current held draft** = the `draft` cycle invoice whose period matches the subscription's current item period (Basil: `items.data[].current_period_*`).
   - **stale opens** = `open` cycle invoices for earlier periods (these are the "no longer be paid" blockers).
   - **superseded drafts** = `draft` cycle invoices for earlier periods.
3. Classify the member:
   - `RECOVERABLE` — has a current held draft (with a payment method available). Report: email, customerId, subscriptionId, current-draft id + amount, list of invoice ids to void/delete, expected charge.
   - `BLOCKED_NO_DRAFT` — past_due, stale opens, but **no** current held draft → out of scope, flagged.
   - `NOT_STRANDED` — has a directly chargeable open current invoice (the normal bulk charger handles it) → excluded.
4. Preview returns the worklist + totals: # recoverable, # blocked, # not-stranded, **total $ to be charged** (= recoverable × one cycle).

## Execute (the destructive run)

`POST` with `{ confirmation: "RECOVER", limit (default 25, hard max e.g. 100), userIds? }`:

1. Typed `RECOVER` gate (else 400). Admin auth + role check.
2. Acquire the global **`ChargeJobLock`** (no overlap with the bulk charger). Create a **`ChargeJobRun`** (reuse, or a `kind: "recover"` discriminator) → `chargeRunId`.
3. Take up to `limit` `RECOVERABLE` members (optionally filtered to `userIds` from the preview). For each, sequentially / rate-limited:
   1. Re-verify eligibility live (state can change between preview and execute).
   2. **Void** each stale open invoice (`stripe.invoices.voidInvoice`, idempotency-keyed). **Delete** each superseded draft (`stripe.invoices.del`).
   3. **Finalize** the current held draft (`finalizeInvoice`, idempotency-keyed) → `open`.
   4. **Pay** via existing `payOpenInvoiceAsPastDueAdmin({ invoice, paymentMethodId, customerId, user, adminId, chargeRunId, bypassRecentAttemptLock: true })` — it writes its own `InvoiceChargeLog` row, handles the post-pay PI decision, and fires `resumeAfterSuccessfulRenewalPayment` (clears `pause_collection`) on success.
   5. Every Stripe write logs an `InvoiceChargeLog` row tagged `chargeRunId` + `result.recovery.step`.
4. Update `ChargeJobRun.totals` (recovered, failed, skipped, revenueCents). Return the per-member result summary (same shape as bulk charge).

### Safety properties

- **Preview before any void** — nothing irreversible until typed confirmation.
- **Per-run cap (25)** — bounded blast radius and Stripe rate-limit headroom.
- **Idempotency** — stable Stripe idempotency keys per void/finalize/pay; the existing per-invoice 24h lock + `ChargeJobLock` prevent double-charge / concurrent runs. Re-running a partially-completed member is safe (void is idempotent, finalize/pay keyed).
- **Live re-verify** inside the loop (status may flip from past_due mid-run).
- **Audit** — full `InvoiceChargeLog` trail by `chargeRunId` and `result.recovery.step`; `ChargeJobRun` summary row.
- **Never mint manual invoices** — only finalize Stripe-created `subscription_cycle` drafts (manual invoices have `billing_reason: "manual"` and silently skip the renewal webhook pipeline). Members with no held draft are skipped, not invented.

## Architecture

### New
- `src/server/admin/recoverStrandedBulk.ts` — detector + batch orchestrator. `previewStrandedRecovery()` (read-only worklist) and `runStrandedRecovery({ adminId, limit, userIds })`.
- `src/server/admin/recoverStrandedBulkPolicy.ts` — pure classification (current-draft vs stale-open vs superseded-draft; member status) + unit-tested.
- `src/app/api/admin/invoices/recover-stranded/route.ts` — `GET` (preview) + `POST` (execute, typed confirm). Mirrors `charge-past-due/route.ts` auth + confirmation + lock.
- `src/server/admin/__tests__/recoverStrandedBulkPolicy.test.ts` — `tsx` test of the classifier (the jessendan0 invoice shape, no-draft, not-stranded, multi-open). `npm run test:recover-stranded-bulk`.

### Extended (small, surgical)
- `recoverStrandedPastDue.ts` — generalize the recovery to accept **`open`-stale** originals (today it only voids `uncollectible`). Either extend `checkRecoveryEligibility` / `recoverStrandedPastDueInvoice` to handle a list of stale-open invoices, or have the bulk orchestrator perform the void/delete itself and call only the finalize+pay tail. Prefer the latter (keeps the per-user manual flow untouched, lower regression risk).
- `payOpenInvoiceAsPastDueAdmin` already accepts `chargeRunId` — thread it.

### Reused (no change)
`ChargeJobLock`, `ChargeJobRun`, `payOpenInvoiceAsPastDueAdmin`, `resumeAfterSuccessfulRenewalPayment`, `batchFetchCustomers`, `getSubscriptionPeriodStart/End`, the typed-confirmation + idempotency patterns.

### UI (thin, can follow the endpoint)
A "Recover Stranded" panel on the existing charge-past-due admin page: **Preview** (worklist + totals), then **Recover N** (cap input + typed `RECOVER`). Reuses existing admin table/modal patterns.

## Testing
- `recoverStrandedBulkPolicy.test.ts` — classification on the real invoice shapes (multi-open + current draft → RECOVERABLE with correct void list; no draft → BLOCKED_NO_DRAFT; chargeable current open → NOT_STRANDED).
- Manual: preview on prod (read-only) → recover **1** member (jessendan0) → verify the stale opens voided, current draft paid, `pause_collection` cleared, member flips active, next anchor bills normally. **Hold 24h.** Then batches of 25.

## Rollout
1. Land endpoint + policy + tests. Preview (read-only) on prod, eyeball the worklist + total $.
2. Recover **one** member, verify end-to-end, hold 24h.
3. Batches of 25, reviewing `ChargeJobRun` + `InvoiceChargeLog` between runs.

No feature flag — admin gating + typed confirmation + per-run cap + 24h per-invoice lock provide the rollout control.

## Open questions
1. Extend `recoverStrandedPastDueInvoice` to handle open-stale originals, or keep that helper for the uncollectible/void case and put the void/delete logic in the bulk orchestrator? (Leaning: orchestrator owns void/delete + reuse only the finalize+pay tail.)
2. UI now or endpoint-first (drive preview/execute via the API while the panel is built)?
3. `ChargeJobRun` — add a `kind: "charge" | "recover"` discriminator, or a separate `RecoveryJobRun`? (Leaning: discriminator on the existing model.)
