# Admin — Backend

## Server-only code

[src/server/admin/](../../src/server/admin/):
- `chargePastDueJob.ts` — **the cron-free CHUNKED bulk-charge engine** (replaced the legacy single-request loop that did all ~800 charges in one HTTP call and overran Vercel's 300s cap, leaving runs stuck `running` and money half-collected). Three entry points, all driven by the client:
  - `startChargePastDueJob({ adminId })` — atomically acquires the global `ChargeJobLock`, sweeps orphaned runs (`sweepOrphanRuns`), snapshots the eligible worklist **ONCE** via `previewChargePastDueInvoices` (one Stripe list pass, **no charging**), creates the `ChargeJobRun` + `ChargeJobWorklist`, and returns `{ runId, total, done, allowlist? }`. An empty worklist finalizes immediately, releases the lock, and returns early (no allowlist sweep runs). Throws `ChargeJobLockedError` (→ 409) if another job holds the lock.

    **Phase 0 allowlist sweep.** For a non-empty worklist, right after creating the run (and still inside the lock, before any chunk charges), `startChargePastDueJob` calls [`reconcileAllowlistFromBlocked`](../billing-stripe/gotchas.md#past-due-bulk-charge-hitting-blocked-card-failures-phase-b5-sweep) scoped to `{ kind: "customers", stripeCustomerIds }` for exactly this run's worklist customers — allowlisting any of their cards that were previously Stripe-blocked (same eligibility gate as the manual sync script: paying member, no fraud-signal / permanent-issue decline code, `allowOverride: false`). This is **best-effort**: it's wrapped in its own `try/catch`, logs via `console.error` on failure, and never aborts the run or touches the lock — allowlisting is an optimization, collection is the job. The resulting `ReconcileSummary` is returned as `allowlist` on the `start` response (`undefined` if the worklist was empty or the sweep threw). `ChargePastDueModal` reads `start.allowlist` and, when `added > 0`, shows "Allowlisted N previously-blocked cards before charging" (plus an "(M already on the list)" suffix when applicable). **No cron runs this** — it only fires inline when an admin starts a bulk charge run.
  - `processChargePastDueChunk({ runId, adminId, chunkSize? })` — charges the next `chunkSize` worklist invoices that don't yet have an `InvoiceChargeLog` row for the run, in sub-batches of `SUB_BATCH_SIZE = 15` with a `500ms` delay (mirrors the legacy 15-parallel throttle), renews the lock, recomputes live totals from the logs, and finalizes + releases the lock once the worklist is drained. `DEFAULT_CHUNK_SIZE = 30`, `MAX_CHUNK_SIZE = 60`. Each item delegates to `payOpenInvoiceAsPastDueAdmin` **unchanged** — resumability/double-charge safety is entirely that primitive's job (30s debounce, 6h recent-attempt lock, late still-past-due re-check, already-paid catch, stable `admin-charge-${invoiceId}` key).
  - `abortChargePastDueJob({ runId, adminId })` — admin stop / modal close: recomputes real totals from logs, marks the run `aborted`, releases the lock so a re-run can start immediately.

  Totals are **recomputed from `InvoiceChargeLog` rows** (via `recomputeTotalsFromLogs` → `aggregateRunTotals`), not in-memory counters, so a crashed/killed run never shows 0/0/0. (Operational tooling for orphaned runs lives in the [infrastructure](../infrastructure/) domain — `scripts/fix-stuck-charge-jobs.ts`, npm `fix:stuck-charge-jobs`.)
- `chargePastDueShared.ts` — shared logic for past-due charge retry (used by single + bulk endpoints). `payOpenInvoiceAsPastDueAdmin` enforces the 6h DB skip window via `InvoiceChargeLog` (`RECENT_ATTEMPT_WINDOW_HOURS`) and takes a **required** `idempotencyKey` for `stripe.invoices.pay` — there is no stable default. Each caller MUST scope the key to its dedupe unit (bulk → per-run, per-user click → per-invocation), because Stripe **replays** a reused key for 24h without re-charging (incident 2026-06-29 — see [gotchas](./gotchas.md) and [CHARGE_PAST_DUE_CUSTOMERS.md](../CHARGE_PAST_DUE_CUSTOMERS.md)). See [billing-stripe/gotchas#multi-layer-protection-on-the-bulk-endpoint](../billing-stripe/gotchas.md#multi-layer-protection-on-the-bulk-endpoint).

  **`extractStripeErrorFields(err)` helper:** module-private helper near `sanitizeStripeResponse` that pulls `{ errorCode, declineCode, errorMessage }` off a `Stripe.errors.StripeError`. `decline_code` is Stripe's specific reason (`do_not_honor`, `insufficient_funds`, `lost_card`, etc.); `code` is the generic bucket (`card_declined`). Persisting both lets the UI prefer the specific one. All four `InvoiceChargeLog.create` save sites in `payOpenInvoiceAsPastDueAdmin` now persist `declineCode`: the outer Stripe-error catch (uses `extractStripeErrorFields` via spread), the PI-confirm catch (destructured), the "already paid" skip path (inline cast on the originating Stripe error), and the decision-based failed path (reads `decision.declineCode` from `PostPayDecision.failed`).

  **`chargeRunId` plumbing:** the bulk job (`startChargePastDueJob` in `chargePastDueJob.ts`) creates a `ChargeJobRun` document at kickoff; each `processChargePastDueChunk` passes its `_id` as `chargeRunId` to every `payOpenInvoiceAsPastDueAdmin` call. The function writes that ObjectId onto every resulting `InvoiceChargeLog` row. The per-user route (`POST /api/admin/users/[id]/charge-past-due`) passes `null`, so manual retries are queryable with `chargeRunId: null`.

  **Late "still past-due?" re-check:** `payOpenInvoiceAsPastDueAdmin` calls `shouldSkipForNotPastDue` (from `past-due-charge-idempotency.ts`) immediately before `stripe.invoices.pay`. This re-fetches the user's current `subscription.status` from the DB; if it has flipped from `past_due` to `active` between list-time and call-time (e.g. a concurrent webhook settled the invoice), the attempt is skipped with `skipReason: "no_longer_past_due"` and the `ChargeJobRun` totals credit `skippedBreakdown.noLongerPastDue`.

  **Single-invoice scoping via `selectCurrentSubscriptionChargeable`:** both the per-user and bulk routes call this helper (also in `chargePastDueShared.ts`) after the standard eligibility filter. It uses `pickOpenInvoiceForFailedRenewal` (from `src/utils/payment/failed-invoice-selection.ts`) to pick the one open invoice attached to `user.stripeSubscriptionId`, returning it as `target` and all others as `skipped`. Callers push `skipped` invoices into `results` with `skipReason: "duplicate_or_stale_cycle_invoice"` so the audit log stays honest about what was seen vs charged. This prevents "This invoice can no longer be paid" Stripe errors that occur when `pause_collection` did not fire in time and a customer has accumulated multiple open cycle invoices — only the newest one on the current subscription is chargeable. If `stripeSubscriptionId` is null/empty, `target` is `null` and all invoices are returned as skipped. The GET (preview) handlers apply the same scoping and surface a `duplicateOrStaleCycle` counter in `filterStats`. **Stripe API 2025-04-01+ compatibility:** the subscription ID is read from `invoice.parent.subscription_details.subscription` first (new API shape), falling back to `invoice.subscription` (legacy shape). The canonical implementation lives in `chargePastDueSelectionPolicy.ts` (`resolveInvoiceSubId`). The same pattern is applied in `recoverStrandedPastDue.ts` (ownership check) and in `payOpenInvoiceAsPastDueAdmin` (resume-collection after successful payment).

### Auto-recovery wrapper (`chargeOrRecover`)

The per-user admin "Charge past due" route ([src/app/api/admin/users/[id]/charge-past-due/route.ts](../../src/app/api/admin/users/[id]/charge-past-due/route.ts)) wraps the pay primitive in `chargeOrRecover` ([src/server/admin/chargeOrRecover.ts](../../src/server/admin/chargeOrRecover.ts)), which picks the branch via the pure `chooseChargeAction` decision function ([src/server/admin/chargeOrRecoverPolicy.ts](../../src/server/admin/chargeOrRecoverPolicy.ts)):

- **`'pay'`** — live `open` invoice with a scheduled retry; route to `payOpenInvoiceAsPastDueAdmin`.
- **`'recover'`** — invoice is `uncollectible`, `void`, or `open`-but-dead (`attempt_count >= 1 && next_payment_attempt == null`). Route to `recoverStrandedPastDueInvoice`.

When the recovery branch is taken the returned row carries `recovered: true` and `newInvoiceId: <in_…>`. The admin modal renders an amber "Recovered" badge.

Bulk cron job, Force Charge, and the per-invoice recover endpoint do NOT use `chargeOrRecover` — each keeps its existing primitive path.

### Manual-action lock bypass

`payOpenInvoiceAsPastDueAdmin` accepts `bypassRecentAttemptLock?: boolean`. When true, the default 1-per-window (6h) budget check is skipped via the pure `shouldSkipForRecentAttempt(rows, bypass)` predicate in [`past-due-charge-idempotency.ts`](../../src/server/admin/past-due-charge-idempotency.ts); the 30s spam debounce still fires. `recoverStrandedPastDueInvoice` and `checkRecoveryEligibility` accept the analogous `bypassRecentRecoveryLock?: boolean` (which skips the `hasRecentRecoveryAttempt` check and forwards as `bypassRecentAttemptLock: true` into the final inner pay call). All three admin-initiated routes (per-user charge-past-due POST, per-user recover-past-due-invoice POST/GET, bulk invoices/recover-past-due POST) pass `true`. Bulk cron job and Force Charge pass nothing (existing locks apply).

- `chargePastDuePostPayPolicy.ts` — **pure** helpers for deciding what to do after `stripe.invoices.pay()` returns. Extracted so the logic is unit-testable without `STRIPE_SECRET_KEY`. Exports:
  - `decidePostPayAction(invoice, paymentIntent)` — inspects the invoice's final `status` and the PI's `status` and returns a tagged-union `PostPayDecision`: `success`, `needs_confirm` (PI in `requires_confirmation`), `requires_authentication` (3DS), or `failed` with an `errorCode`/`errorMessage` pair plus an **optional `declineCode`** (Stripe's specific reason). The `requires_payment_method` branch surfaces `paymentIntent.last_payment_error?.decline_code` as `declineCode`. Other failure branches leave it `undefined`.
  - `extractPaymentIntentId(invoice)` — resolves the PI id from `invoice.payment_intent` regardless of whether it is a string id or an expanded `PaymentIntent` object.

  **Why this exists:** Stripe sometimes leaves the PaymentIntent in `requires_confirmation` after `invoices.pay()` — particularly when the invoice already had a PI from a prior finalization attempt (common in Force Charge flows). Without this check the original code logged `status: "success"` and returned `ok: true` even though no charge was attempted (`latest_charge: null`, no error). The fix: after `invoices.pay()`, always fetch the PI and call `decidePostPayAction`. If the decision is `needs_confirm`, `payOpenInvoiceAsPastDueAdmin` explicitly calls `stripe.paymentIntents.confirm({ off_session: true })` then re-fetches the invoice and re-decides on the final state. Only `decision.kind === "success"` produces a `status: "success"` log row. Tested by `npm run test:charge-past-due-post-pay`.

- `chargePastDueSelectionPolicy.ts` — **pure** helpers for invoice-to-subscription matching, extracted from `chargePastDueShared.ts` so they're unit-testable without `STRIPE_SECRET_KEY`. Exports:
  - `resolveInvoiceSubId(inv)` — resolves the subscription ID from a Stripe Invoice compatible with both legacy API (<2025-04-01, `invoice.subscription`) and the 2025-04-01+ shape (`invoice.parent.subscription_details.subscription`). Parent field takes precedence.
  - `selectCurrentSubscriptionChargeable(invoices, userStripeSubscriptionId)` — canonical implementation of the invoice filter (see `chargePastDueShared.ts` entry above for behaviour). `chargePastDueShared.ts` delegates to this.
  Tested by `src/server/admin/__tests__/chargePastDueSelectionPolicy.test.ts` (included in `npm run test:past-due-admin-charge`).
- `past-due-charge-idempotency.ts` — pure helpers (`RECENT_ATTEMPT_WINDOW_HOURS`, `cutoffForRecentAttempt`, `shouldSkipForNotPastDue`) plus the **idempotency-key builders** that encode the dedupe unit per caller: `buildBulkChargeIdempotencyKey(invoiceId, runId)` (bulk run-scoped), `buildOneOffChargeIdempotencyKey(invoiceId, token)` (per-click), `buildAdminChargeIdempotencyKey(invoiceId)` (stable per-invoice — recovery's fresh invoice only), `buildForceChargeIdempotencyKey(...)` (per-attempt). The module header documents the **24h replay trap**. Stripe-free so it's unit-testable without `STRIPE_SECRET_KEY`. Tested by `src/server/admin/__tests__/chargePastDueShared.test.ts` and `src/server/admin/__tests__/pastDueChargeIdempotencyKeys.test.ts` (`npm run test:past-due-admin-charge` / `npm run test:past-due-idempotency-keys`).
- `recoverStrandedPastDuePolicy.ts` — pure helpers for the "recover stranded past-due invoice" flow (no Stripe SDK / Mongo imports). Covers: stable idempotency keys for each recovery step (`buildRecoveryVoidIdempotencyKey`, `buildRecoveryCreateIdempotencyKey`, `buildRecoveryFinalizeIdempotencyKey`), eligibility check for the original invoice (`isOriginalInvoiceEligibleForRecovery` — eligible when `uncollectible` or `void`), held-draft picker (`pickHeldDraftForRecovery` — finds the newest matching-amount draft on the subscription), and a 24h lock predicate (`hasRecentRecoveryAttempt` — reuses `RECENT_ATTEMPT_WINDOW_HOURS` from `past-due-charge-idempotency.ts`). Tested by `src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts` (`npm run test:recover-stranded-past-due-policy`).
- `forceChargePastDuePolicy.ts` — pure helpers for the Force Charge past-due flow (no Stripe SDK / Mongo imports). Exports: `buildForceChargeFinalizeIdempotencyKey(invoiceId)` — stable key for the finalize step; `pickForceChargeTarget(openInvoices, draftInvoices, expectedAmountCents)` — prefers an existing `open` invoice (charge_automatically, amount_remaining>0) then falls back to the newest matching-amount `draft`; returns `null` when neither fits so the caller blocks with `"no_chargeable_invoice"`. Never returns a candidate that would require creating a new invoice — manual invoices have `billing_reason: "manual"` which the webhook dispatch ladder does not handle. `isCurrentPeriodAlreadyPaid(paidInvoices, periodStart, periodEnd)` — double-billing guard based on Unix-second period overlap. `hasRecentSuccessfulChargeOnSubscription(rows, subscriptionId, now?)` — 24h success-lock predicate; reads `result.subscriptionId` from `InvoiceChargeLog` rows written by the orchestrator. Tested by `src/server/admin/__tests__/forceChargePastDuePolicy.test.ts` (`npm run test:force-charge-policy`).
- (other shared admin code)

## Stranded past-due invoice recovery

When Stripe's smart retries exhaust, the original past-due invoice transitions to `uncollectible` (or `void`). At that point both the bulk past-due charger and the per-user retry surface "This invoice can no longer be paid" because `stripe.invoices.pay()` rejects non-`open` invoices.

The recovery flow lives in [`src/server/admin/recoverStrandedPastDue.ts`](../../src/server/admin/recoverStrandedPastDue.ts) and runs the sequence:

1. Verify state — admin auth, user `subscription.status === "past_due"`, original invoice in `uncollectible`/`void`, customer/subscription ids match.
2. 24h lock — query `InvoiceChargeLog` for any prior recovery on the same original invoice via `hasRecentRecoveryAttempt` from [`recoverStrandedPastDuePolicy.ts`](../../src/server/admin/recoverStrandedPastDuePolicy.ts).
3.–5. **Void + finalize via the shared primitive** [`prepareRecoveredCycleInvoice`](../../src/services/subscription/prepareRecoveredCycleInvoice.ts): pick the held draft (matched against the **live-price expected cycle amount** — `checkRecoveryEligibility` derives it from `subscription.items.data[0].price.unit_amount` via `deriveExpectedCycleAmountCents`, falling back to the DB package price only when `null`, so a past-due **tier switch** with a stale DB `packageId` still matches the draft billed at the new price), `finalizeInvoice(auto_advance:false)` it, then void the stranded original **last and non-fatally**. If no held draft exists it returns `no_held_draft` **without voiding anything** and never creates a manual invoice (`billing_reason: "manual"` would skip the webhook renewal pipeline — no status flip, no entries, no Klaviyo event). Two intended behavior deltas vs the old inline flow: **(a)** it now voids **open-stranded** originals too, not only `uncollectible`; **(b)** a void failure is **non-fatal** (logged, recovery proceeds — a lingering un-voided original is cleanup, not a blocker) so `void_failed` is no longer returned — the `RecoverStrandedResult.reason` union still *lists* it (unreached) so the downstream exhaustive switches keep compiling.
6. Delegate to `payOpenInvoiceAsPastDueAdmin` ([`chargePastDueShared.ts`](../../src/server/admin/chargePastDueShared.ts)) for the actual charge — inherits its log row + idempotency key + `resumeAfterSuccessfulRenewalPayment` on success.

The pure helpers (eligibility predicate + held-draft picker + recovery idempotency-key builders) now live in the neutral module [`src/utils/payment/recovery/stranded-invoice-policy.ts`](../../src/utils/payment/recovery/stranded-invoice-policy.ts) — relocated out of `src/server/admin/` so the shared recovery primitive (`prepareRecoveredCycleInvoice`) and member-facing pay paths reuse them without a service → server/admin dependency. [`recoverStrandedPastDuePolicy.ts`](../../src/server/admin/recoverStrandedPastDuePolicy.ts) re-exports them for backward compatibility and keeps the admin-only 24h-lock predicate `hasRecentRecoveryAttempt`. All testable without `STRIPE_SECRET_KEY`. Tests: `npm run test:recover-stranded-past-due-policy`.

### Idempotency model

| Step | Stripe key | DB lock |
|---|---|---|
| Void | `recover-void-${originalInvoiceId}` | — |
| Find draft (no create) | — | 24h via `result.recovery.originalInvoiceId` |
| Finalize | `recover-finalize-${newInvoiceId}` | — |
| Pay | `admin-charge-${newInvoiceId}` (existing) | 24h via `invoiceId` (existing) |

**Per-subscription recovery lock ([`RecoveryClaim`](../../src/models/RecoveryClaim.ts)):** a fine-grained
claim keyed `_id: "recover:<subscriptionId>"` (helper
[`recovery-claim.ts`](../../src/utils/payment/recovery/recovery-claim.ts) — `acquireRecoveryClaim` /
`releaseRecoveryClaim`) serializes stranded recovery so concurrent member clicks and cross-tool
attempts (member Pay-Now / Force-Charge / admin Charge / Force-Charge / switch-tier teardown) cannot
finalize+pay two different held drafts for the same subscription. It is **not** the global
`ChargeJobLock` singleton; a stale claim (older than `RECOVERY_CLAIM_STALE_MS` = 120s) is deterministically
reclaimed, with a 300s TTL index as a crash-release backstop.

The 24h DB lock checks for any `InvoiceChargeLog` row tagged `result.recovery.originalInvoiceId === <id>`; the pay step's lock continues to work via the standard past-due window since the new invoice id is fresh.

### Failure semantics

Each step is naturally idempotent. If a step fails mid-sequence, the customer is no worse than before:

- Void fails → no state change
- No held draft → original voided, no invoice; `reason: "no_held_draft"` returned (admin must wait for Stripe to generate a cycle draft)
- Finalize fails → original voided, draft exists (admin retries; draft is still there)
- Pay fails → original voided, fresh `open` invoice (admin uses existing per-user retry)

## Bulk stranded-invoice recovery

### What "stranded" means

A member is stranded when the daily bulk charger (`/api/admin/invoices/charge-past-due`) consistently fails with Stripe's "this invoice can no longer be paid." This happens when Stripe has exhausted its automatic retries on their open cycle invoice — leaving it in an uncollectible or terminal-open state — while simultaneously holding a DRAFT invoice for the current billing cycle that was never finalized (because `pause_collection: keep_as_draft` kept it held). The standard charger only knows how to call `stripe.invoices.pay()` on open invoices, so it can never unstick these members.

### Recovery sequence

The orchestrator ([`src/server/admin/recoverStrandedBulk.ts`](../../src/server/admin/recoverStrandedBulk.ts)) runs the following per-member sequence:

1. **Void** all stale `open` invoices on the subscription (those Stripe exhausted retries on).
2. **Delete** superseded held `draft` invoices — drafts for earlier missed cycles that are no longer the current cycle.
3. **Finalize** the current cycle's held `draft` — the one invoice Stripe created for the billing period the member should now pay for.
4. **Pay** the freshly-finalized invoice via `payOpenInvoiceAsPastDueAdmin` ([`chargePastDueShared.ts`](../../src/server/admin/chargePastDueShared.ts)), which writes an `InvoiceChargeLog` row and triggers the full renewal pipeline on success.

The classifier ([`src/server/admin/recoverStrandedBulkPolicy.ts`](../../src/server/admin/recoverStrandedBulkPolicy.ts)) pre-screens each candidate via `classifyMemberForRecovery`, returning one of:

- **`RECOVERABLE`** — stale open invoices present, current held draft found, eligible to run the sequence.
- **`BLOCKED_NO_DRAFT`** — stale invoices present but no current held draft exists; surfaced in the preview and excluded from the run (cannot recover without a draft to finalize).
- **`NOT_STRANDED`** — member does not match the stranded pattern; excluded silently.

### Current-cycle-only write-off

Only the current billing cycle's held draft is finalized and charged. Any months the member was past-due while on `pause_collection` are written off — those drafts are deleted rather than finalized. This is deliberate: charging for missed months would surprise members and is not recoverable via this flow. The member got no benefits during the past-due period, so writing off the arrears is the correct outcome.

### Safety model

- **Preview-first:** `previewStrandedRecovery` (from `recoverStrandedBulk.ts`) returns the full candidate list including `RECOVERABLE` / `BLOCKED_NO_DRAFT` breakdown and estimated revenue before any writes are made.
- **Typed confirmation:** the POST body must include `confirmation: "RECOVER"` — any other value returns HTTP 400.
- **Per-batch cap:** the `POST /api/admin/invoices/recover-stranded` route clamps `limit` to `DEFAULT_LIMIT = 20` / `MAX_LIMIT = 30` so a batch fits Vercel's 300s cap (each member is ~5–7 serial Stripe round-trips). The admin UI ([`RecoverStrandedPanel`](../../src/components/admin/RecoverStrandedPanel.tsx)) **auto-loops** batches of 30 until a batch recovers nothing (no re-clicking) — see [frontend.md](./frontend.md#recover-stranded-panel) and [gotchas.md](./gotchas.md#recover-stranded-runs-in-30-member-batches-vercel-300s-cap).
- **Shared `ChargeJobLock`:** the bulk stranded-recovery run acquires the same global `ChargeJobLock` used by the normal bulk past-due charger. The two jobs cannot overlap.
- **Run recorded:** each run creates a `ChargeJobRun(kind: "recover")` document. Each step per member writes an `InvoiceChargeLog` row tagged `result.recovery.step`.
- **`userIds` scoping:** callers may pass a `userIds` array to restrict the run to a specific subset (e.g. the `RECOVERABLE` members from a prior preview). The worklist deduplicates by `userId` before processing.

### Structural double-charge guarantee

A recovered member cannot be double-charged by a subsequent recovery or bulk-charge run because:

1. **Paid draft drops out of the scan:** once the held draft is finalized and paid it is no longer a `draft`, so it will never appear as a candidate in the next `previewStrandedRecovery` or `classifyMemberForRecovery` scan.
2. **Stripe idempotency key:** the pay step uses `admin-charge-${draftId}`, so a duplicate call to `stripe.invoices.pay()` on the same invoice returns Stripe's cached first response.
3. **Worklist dedup by `userId`:** within a single run, duplicates are removed before processing begins.
4. **"Already paid" skip:** `payOpenInvoiceAsPastDueAdmin` re-checks invoice status before charging and skips with `skipReason: "already_paid"` if it was settled between preview and execution.

## Force Charge for stuck-paused subscriptions

When `pause_collection: keep_as_draft` was applied (or the user has cancelled-and-resubscribed leaving orphan invoices), the user's current subscription may have no chargeable open invoice — only held drafts. Force Charge finalizes such a draft (or pays an existing open invoice) on the current subscription.

The orchestrator [`forceChargeCurrentCycle`](../../src/server/admin/forceChargePastDue.ts):

1. Verify state — admin (or self) auth, `subscription.status === "past_due"`, customer/sub ids present, package found, expected amount derived.
2. DB eligibility check — `hasRecentSuccessfulChargeOnSubscription` from [`forceChargePastDuePolicy.ts`](../../src/server/admin/forceChargePastDuePolicy.ts) (subscription-level 24h success lock; separate from per-invoice 6h budget window below).
3. Stripe paid-period check — `isCurrentPeriodAlreadyPaid` against `stripe.invoices.list({ status: "paid" })` for the current `current_period`.
4. Pick target — `pickForceChargeTarget` returns a **live** open (`kind:"open"`), a **stranded** open (`kind:"stranded"` — retry-exhausted, cannot be paid directly), or a held draft (`kind:"draft"`) matching expected amount (never null + create — see "Critical safety property").
5. Produce the payable invoice: a **draft** is finalized (`force-finalize-${invoiceId}`); a **stranded** target is **recovered** via [`prepareRecoveredCycleInvoice`](../../src/services/subscription/prepareRecoveredCycleInvoice.ts) under the per-sub `RecoveryClaim` lock (void stranded + finalize the held draft) — **the finalized DRAFT is what gets paid**, so the budget / idempotency key / `subscriptionId` stamp are all re-anchored on the **draft id** (not the stranded-open id), and the pay key stays the **per-attempt** `buildForceChargeIdempotencyKey` (never the stable admin-recovery key — a stable key would be replayed for 24h and re-collect $0). New failure reasons: `no_held_draft` (409). This applies to **both** the admin Force-Charge route and the member self-serve `force-charge-overdue` route — admin Force-Charge on a stranded open now goes fail→recover.
6. Pay via existing `payOpenInvoiceAsPastDueAdmin` — preserves `billing_reason: "subscription_cycle"`, triggers full webhook renewal pipeline.

### Critical safety property

Force Charge never creates new manual invoices. The webhook's [`invoice.payment_succeeded`](../../src/app/api/stripe/webhook/route.ts#L3598-L3618) dispatch ladder rejects unknown `billing_reason` values, so a manually-created invoice (`billing_reason: "manual"`) would charge the customer but skip the renewal pipeline (no status flip, no entries, no Klaviyo event). By only paying invoices Stripe created (which retain `subscription_cycle`), the pipeline runs as normal.

If no chargeable invoice exists on the current sub, the orchestrator returns `reason: "no_chargeable_invoice"` and the admin/user is prompted to contact support.

### Idempotency model (pre-2026-05-06)

| Step | Stripe key | DB lock |
|---|---|---|
| Finalize | `force-finalize-${invoiceId}` | (covered by InvoiceChargeLog subscription-level 24h success-status lock) |
| Pay | `admin-charge-${invoiceId}` (existing) | (existing per-invoice 24h lock, superseded by 6h + budget model below) |

Concurrent admin + user fires deduplicated via stable Stripe idempotency keys.

### Window + budget model (effective 2026-05-06)

The 24h-per-invoice lock was tightened to 6h with per-path attempt budgets:

| Path | Window | Max attempts per window | Idempotency key |
|---|---|---|---|
| Bulk past-due charger | 6h | 1 | Run-scoped `admin-charge-${invoiceId}-run-${runId}` |
| Per-user admin retry | 6h | 1 | Window-bucketed `admin-charge-${invoiceId}-once-${floor(now/30s)}` — concurrent submits in one 30s bucket dedupe to one charge; a retry 30s+ later is fresh |
| Admin Force Charge | 6h | 3 | Per-attempt `admin-charge-${invoiceId}-fc-admin-${N}` |
| User self-serve | 6h | 3 | Per-attempt `admin-charge-${invoiceId}-fc-user-${N}` |
| Stranded recovery (pay step) | — | — | Stable `admin-charge-${newInvoiceId}` (invoice is freshly created per recovery) |

Admin and user budgets are tracked **separately** via `result.forceCharge.triggeredBy` on the InvoiceChargeLog rows the orchestrator writes after pay.

**30-second debounce:** independent of budget. Any second attempt on the same invoice within 30s of the prior attempt is blocked with `skipReason: "too_soon"`. Applies uniformly across all paths to absorb spam-clicks.

**The keys MUST vary across runs/clicks (the 24h replay trap).** Stripe caches an idempotency key for 24h and **replays** the cached response for any reuse within that window *without re-charging* (response header `idempotent-replayed: true`). The DB skip window is only 6h, so in the 6h–24h gap the code calls Stripe but Stripe replays — reporting the old outcome with no real charge. This is exactly what bit the bulk charger on 2026-06-29 when it used a static `admin-charge-${invoiceId}`: 656/668 invoices replayed prior declines, $0 collected. The fix scopes each key to its dedupe unit (run / click / attempt), so the only place a key is intentionally stable is the recovery pay step (where the invoice id itself is new each time). `payOpenInvoiceAsPastDueAdmin` therefore takes `idempotencyKey` as a **required** param — no stable default exists to fall into. Regression-guarded by `npm run test:past-due-idempotency-keys`.

**Worst-case decline-fee bound per invoice per 6h:** 1 (bulk) + 3 (admin FC) + 3 (user) = 7 fresh attempts.

### `recent_charge_attempt` reason — expanded semantics

The reason name is unchanged but its meaning differs by caller:
- Bulk / regular admin retry: any prior attempt within 6h.
- Admin Force Charge: 3+ admin Force Charge attempts within 6h.
- User self-serve: 3+ user-triggered attempts within 6h.

The error message string distinguishes them.

## Features

[src/features/admin/](../../src/features/admin/) — feature-modular admin code.

## Services

[src/services/admin/](../../src/services/admin/) — admin services:
- `ActivityLogService.ts` — `getActivityLog(input)` builds the admin "Recent activity" feed: collects candidate rows from the last **90 days** across signups / payments / subscription changes / completed major draws / cancellation saves / staff role updates / affiliate payouts, filters by type + search, sorts into a deterministic total order, and **keyset-paginates**. Signature is `{ cursor?: string | null, limit, typeFilter?, searchTerm? }` (**not** `page`); returns `pagination: { limit, total, nextCursor: string | null, hasMore }`. Two exported pure helpers — `compareActivitiesNewestFirst(a, b)` (timestamp DESC, then id DESC) and `paginateActivitiesByCursor(sorted, cursor, limit)` (cursor format `"<timestampMs>:<id>"`) — carry the keyset logic, which **replaced offset pagination** to stop the live top-of-feed inserts from shifting the window and duplicating rows (see [gotchas.md](./gotchas.md#activity-log-feed-used-offset-pagination-over-a-live-top-growing-list--duplicate-rows-2026-07)). Consumed by `GET /api/admin/activity-log` and the Norm `/v1/activity-log` route. Distinct from `getRecentActivities` (`dashboardSlices.ts`), a separate non-cursor legacy slice. Test: `npm run test:activity-log-keyset`.
- `chargePastDueHistory.ts` — read-only query service for the past-due charge history UI. Exports:
  - `parseAestDayStartUtc(s)` — parses a `YYYY-MM-DD` string as the **start** of an Australia/Sydney calendar day (via `date-fns-tz` `fromZonedTime`) and returns the corresponding UTC `Date`. Returns `undefined` for null/empty/non-matching input. Used as the inclusive lower bound (`$gte`).
  - `parseAestDayEndExclusiveUtc(s)` — parses the same `YYYY-MM-DD` string as the start of the **next** AEST day and returns its UTC instant. Used as the **exclusive** upper bound (`$lt`) so the entire local day is included regardless of DST transitions. Both helpers are imported directly by the runs/manual-retries route handlers (which dropped their previous local `parseDate` helper).
  - `escapeUserSearchRegex(s)` — escapes regex metacharacters so a user-supplied substring can't break out of the case-insensitive `User.email` regex match used by `listManualRetries`.
  - `buildRunsFilter(input)` / `buildManualRetriesFilter(input)` — Mongo filter builders. `endDate` is applied as `$lt` (exclusive upper bound, matching the AEST helpers above).
  - `listChargeRuns(filter)` — paginated list of `ChargeJobRun` documents; accepts `startDate`, `endDate`, `adminId`, `status`, `limit`, `offset` (default page size 50, max 200).
  - `getChargeRunDetail(runId)` — returns `{ run, rows }` for a single bulk run (run doc + all matching `InvoiceChargeLog` rows). Each `RunDetailRow` includes `declineCode?` alongside `errorCode?`/`errorMessage?` so callers can prefer the most specific Stripe signal.
  - `listManualRetries(filter)` — same filter shape as `listChargeRuns` plus a new `userSearch?: string` field on `ManualRetriesFilterInput`. When non-empty, the service first runs a User-collection regex pre-lookup (`{ $regex: escapeUserSearchRegex(trimmed), $options: "i" }`, capped at **500** matches and trimmed/sliced to **120 chars**) and constrains the main query to those user IDs. If no users match, the call returns `{ rows: [], total: 0 }` without touching `InvoiceChargeLog`. Rows include `declineCode?` (same select+map as `getChargeRunDetail`).

  The pure `formatDurationMs` formatter lives in [src/utils/admin/chargePastDueFormat.ts](../../src/utils/admin/chargePastDueFormat.ts) and is re-exported here for server callers — client components must import directly from `utils/admin/chargePastDueFormat` so Mongoose is not pulled into the client bundle.

### `summariseDeclineCodes(filter)` — page-level decline reasons

Wraps a single `InvoiceChargeLog.aggregate` over `status: "failed"` rows in the given AEST-anchored range, groups by `declineCode → errorCode → "unknown"`, sorts desc, then delegates to the pure helper `bucketDeclineCodeCounts` for top-5-plus-other bucketing.

`bucketDeclineCodeCounts` is exported separately and unit-tested in `chargePastDueHistory.test.ts`. The aggregation itself is verified manually against staging data.

- `dashboard-stats/` — dashboard stats daily snapshot subsystem:
  - `snapshotSchema.ts` — `classifyRevenueBucket(args)` maps a PaymentEvent's `(packageType, packageId, billingReason)` to a `RevenueBucketKey | null`. Also exports `REVENUE_BUCKET_KEYS` and `emptyBucket()`. Mirrors the live aggregation logic in the dashboard stats route so snapshots are bit-for-bit comparable.
  - `revenueAggregator.ts` — `aggregateRevenueForDay(start, end, refundedPISet)` queries `PaymentEvent` for the given UTC range and returns per-bucket totals. `loadRefundedPaymentIntentIds()` loads the global refunded-PI set.
  - `adChannelProviders.ts` — provider registry (`AD_CHANNEL_PROVIDERS`). Currently contains `facebookAdChannelProvider` only. Add TikTok/Snapchat by appending a new `AdChannelProvider` object — no schema change required; the snapshot stores `adChannels` as a Map.
  - `DashboardStatsSnapshotWriter.ts` — `writeSnapshotForDate(dateKey, refundedSet)` computes and upserts one snapshot row. `writeSlidingWindow({ todayAESTDateKey, windowDays })` re-upserts today + previous N days in sequence. `aestDayBounds(dateKey)` → `{ dayStartUTC, dayEndUTC }` (DST-correct). `expandDateKeyRange(start, end)` → ordered list of AEST date keys. All writes use `findOneAndUpdate` with `{ upsert: true }` so they are idempotent.
  - `DashboardStatsSnapshotReader.ts` — `readStatsForRange({ rangeStartUTC, rangeEndUTC })` returns `SnapshotReadResult`. Sums snapshot rows for complete AEST days, computes today live (not yet snapshotted), falls back to live for any date missing a snapshot (flagged in `meta.missingSnapshotDates`). ROAS per channel is recomputed from summed totals rather than averaged. `userCount` per bucket is always live (distinct users not additive across days).
  - `distinctUserCounts.ts` — `computeDistinctUserCounts(start, end)` → `Record<RevenueBucketKey, number>`. Single aggregation pipeline: match `BenefitsGranted` events, exclude refunded PIs via `excludeRefundedBenefitsGrantedStages()`, group by `(packageType, packageId, billingReason)` using `$addToSet` on `userId`, then re-union into a Set per bucket to avoid double-counting the same user across multiple tuples in the same bucket.

### Per-platform attributed revenue (dashboard-stats)

**`snapshotSchema.ts` — `PLATFORM_TO_AD_CHANNEL_KEY`**

A mapping from `AttributedPlatformKey` (e.g. `"meta"`) to the ad-spend provider key used in `adChannels` (e.g. `"facebook"`). `null` means no spend channel exists for that platform (applies to `"direct"`, `"other"`, `"klaviyo_email"`, `"klaviyo_sms"`, `"google"`, `"tiktok"`, `"snapchat"` until their ad providers are added). Used by the route to join attributed revenue with ad spend for ROAS calculation.

**`revenueAggregator.ts` — `aggregateRevenueForDay`**

In addition to the existing per-bucket totals, the aggregator now returns a `byPlatform` map:

- Iterates refund-excluded `BenefitsGranted` `PaymentEvent` rows for the day.
- Groups by `PaymentEvent.convertingPlatform`. A `null` platform is folded to `"direct"` with confidence `inferred_backfill`.
- Platform accumulation runs **above** the `!bucketKey` guard, so events that don't map to a revenue bucket (e.g. unrecognized types) still contribute to per-platform totals — ensuring `byPlatform` revenue reconciles to `revenue.total`.
- **Renewal discrimination:** Before accumulating into `newRevenue` vs `renewalRevenue`, each row is tested with the predicate `packageType === "membership" && data.billingReason === "subscription_cycle"`. Rows that match are added to `renewalRevenue` and **excluded** from `newRevenue`, `conversions`, and `byConfidence`. Rows that do not match are counted as acquisition and added to `newRevenue`/`conversions`/`byConfidence`.

  This is the same `$nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }]` predicate already used by `PaymentEventRepository.aggregateRevenueByHourAndPlatform` (the hourly breakdown). Using `data.billingReason` (present on every PaymentEvent) rather than the top-level `isRenewal` field (defaults `false` on pre-feature rows) ensures the discriminator is robust on all historical data.

- Within each platform, `newRevenue` is partitioned into `byConfidence` tiers (`click`, `utm_only`, `inferred_backfill`). The three tiers sum to the platform's `newRevenue`. Renewal events do not contribute to `byConfidence`.

**`DashboardStatsSnapshotReader.ts`**

When reading across a date range, the reader sums `attributedRevenue` entries additively across completed snapshot days and the live today/missing-day values. The summation accumulates both `newRevenue` and `renewalRevenue` independently (pure per-platform sums). ROAS is **not** recomputed inside the reader — that join happens in the route handler after all totals are available, using only `newRevenue` as the numerator.

The summed `attributedRevenue` map is returned as part of `SnapshotReadResult`.

- `cancellationFlowAnalytics.ts` — read-only cancellation-flow analytics (Task 18). Three exports:
  - `summarizeCancellationEvents(events, now)` — **pure**, no I/O. Shapes `ICancellationFlowEvent[]` into `CancellationFlowSummary`: `triggered`, `byReason` (per `CANCELLATION_REASONS`, `{ count, sharePct, accepted, cancelled, abandoned }` — outcome split uses the same definitions as the funnel, so abandoned = `outcome "in_progress" && startedAt <= now-1h`), `funnel` (`reachedReason` = total; `reachedOffer` = `offersShown.length > 0 && !pastDue`; `accepted` = `outcome "saved"`; `cancelled` = `outcome "cancelled"`; `abandoned` as above), `saveRate`/`saveRatePct` (`accepted / (accepted+cancelled+abandoned)`, 0-denom guarded), `byOfferAccepted` (per `OFFER_TYPES`, saved-only), `pastDueExcludedFromOfferConversion` (count of past-due events), `retention90` (`{ retained, churned, pending }` over saved events — `retained`/`churned` only when matured i.e. `savedAt <= now-90d` and `retention90` set, else `pending`), `retention90ByOffer` (`Record<OfferType, { retained, churned, pending }>` — the **same** matured/pending boundary as `retention90`, keyed by `offerAccepted`; only saved events with a non-null `offerAccepted` contribute; every `OfferType` key always present/zeroed so per-offer totals reconcile with the overall split — identical cutoff to the §6a maturity cron, no skew), and `otherReasonTexts` (the trimmed free-text content of every `reason === "other"` event with a non-empty `reasonText`, plus that event's `startedAt`, `outcome`, and an optional `userId` passed through from the event — the email/name fields on `OtherReasonEntry` (`userEmail`, `userFirstName`, `userLastName`) are populated by the DB-touching wrapper below, **not** by this pure shaper; sorted by `startedAt` desc; whitespace-only entries excluded). All `%` divisions guard divide-by-zero (`triggered === 0` → all `sharePct` 0; empty array → save rate 0). Unit-tested: `npm run test:cancellation-analytics`.
  - `getCancellationFlowAnalytics({ from?, to? })` — DB entry. `await connectDB()`, queries `CancellationFlowEvent` with a **bounded** `startedAt` window (`$gte from` / `$lt to`; defaults to **last 90 days** when neither given — never an unbounded scan), `.lean()`, delegates to the pure shaper with `new Date()`. After shaping, **hydrates user details** for `otherReasonTexts` entries via a single batched `User.find({ _id: { $in: [...uniq userIds] } }).select({ email: 1, firstName: 1, lastName: 1 }).lean()` so the admin "Other" table can render a clickable email column without N+1 queries (no lookup when the events array carries no `userId`s). Service signature still uses UTC `Date` bounds; the `GET /api/admin/cancellation-flow-analytics` route accepts AEST `startDate`/`endDate` (yyyy-MM-dd) from the UI and converts to UTC bounds before calling the service.
  - `getCancellationFlowUsersByReason({ reason, outcome?, from?, to?, page?, limit? })` — paginated user-level rows for a single reason; powers the **Reason × outcome** drill-down modal. `await connectDB()`. Filter is `{ reason, startedAt: { $gte, $lt? }, outcome? }` with the same default-to-last-90-days lower bound as `getCancellationFlowAnalytics` (never an unbounded scan); `outcome` narrowing is optional. Runs `countDocuments` + a paged `find().sort({ startedAt: -1 }).skip(...).limit(...)` in parallel (`Promise.all`). `limit` is clamped to `[1, 100]` (default 20); `page` is clamped to `≥1` (default 1). Hydrates user details with the same batched `User.find({ _id: { $in: [...] } })` pattern. Returns `{ rows: ReasonUserRow[], totalCount }` where each row carries `eventId`, optional user fields, ISO `startedAt`, `outcome`, optional `reasonText` (set only when `reason === "other"` and the trimmed text is non-empty), and `offerAccepted` (the event's accepted offer or `null`). New `ReasonUserRow`, `ReasonUsersResult`, and `CancellationFlowUsersByReasonParams` interfaces are exported.

- `UserAdminQueryService` ([src/services/admin/UserAdminQueryService.ts](../../src/services/admin/UserAdminQueryService.ts)) — admin-facing user list / search / aggregate-export / per-id readers. Extracted from the fat admin user routes (`/api/admin/users`, `/api/admin/users/search`, `/api/admin/users/export`, `/api/admin/users/[id]`, `/api/admin/users/[id]/charge-past-due` GET, `/api/admin/users/[id]/recover-past-due-invoice` GET, `/api/admin/users/[id]/payment-events`) during the Norm wiring so admin + Norm numbers match by construction. Framework-agnostic — no `Request` / `NextResponse` types. Exports:
  - `listAdminUsers(args)` — paginated + filtered list with computed `totalSpent` (refund-net `BenefitsGranted` minus matching `RefundProcessed` by `paymentIntentId`), `majorDrawEntries` (currently-active major draw only), `miniDrawCount` per row + headline counts (`totalUsers`/`activeSubscriptions`/`verifiedUsers`/`conversions`). Computed-field sorting (`totalSpent`/`majorDrawEntries`/`miniDrawCount`) is applied after a full-collection scan; standard fields use Mongo `sort+skip+limit`.
  - `searchAdminUsers(args)` — fuzzy `q` against `firstName`/`lastName`/`email`/`mobile` or exact `ObjectId`; optional `majorDrawId`/`miniDrawId` scoping that filters by participation and joins per-source entry breakdown.
  - `aggregateUserExport(args)` — count-only aggregate (`totalCount`/`byState`/`byPackage`/`bySubscriptionStatus`) used by Norm's `/v1/users/export` projection. Honours the same `buildUserFilter` as the admin CSV/Excel export so totals match by construction; supports the `top20MajorDraw` segment.

**Export field catalog** ([userExportFields.ts](../../src/services/admin/userExportFields.ts)) — the selectable column set for the `GET /api/admin/users/export` CSV/Excel download. Default columns: first name, last name, email, mobile, state, subscription package, subscription-active flag, total spent, major-draw entries. Additional opt-in columns (via the `fields=` param / export UI): **profession** (the customer's trade, e.g. Builder/Electrician), user ID, role, account/verification status flags, join + last-login dates, subscription start/end/status/auto-renew, mini-draw count, rewards points, accumulated entries. Direct `User` fields (name/email/mobile/state/**profession**/role) are read straight off the lean doc; `totalSpent`/`majorDrawEntries`/`miniDrawCount`/`subscription.packageName` are computed/derived in [userExportTransformation.ts](../../src/services/admin/userExportTransformation.ts). `profession` is non-default (added for TikTok Custom Audience / ad-agency exports where trade-based segmentation is wanted). **`subscription.packageName` is gated on a current membership** — shown only when `subscription.isActive === true` **OR** `subscription.status` is in `SUBSCRIBED_SUBSCRIPTION_STATUSES` (`active`/`trialing`/`past_due`, reused from [userFilterBuilder.ts](../../src/utils/admin/userFilterBuilder.ts) so "subscribed" means the same thing here as in the admin user filters). A fully **cancelled / expired / unpaid** member keeps `subscription.packageId` set (never cleared) but has `isActive=false` and a non-subscribed status, so their column is deliberately **blank** rather than showing a stale package. **past_due members DO show their package** (a lapsed-but-recoverable win-back audience); trials always show even if the `isActive` flag lags. (Status→`isActive`: the Stripe webhook sets `isActive=false` on `past_due`/`unpaid`/`canceled` and `isActive=true` on `active`/`trialing` — see `src/services/stripe-webhook-handlers/index.ts`.)
  - `getAdminUserDetail(userId)` — single-user detail with a `statistics` block (totals + counts; no orders array, no referrals feed, no Stripe `savedPaymentMethods` lookups).
  - `previewUserChargePastDue({ userId })` — per-user past-due preview (`{ ok: true, preview: {...} } | { ok: false, status, message }`) using the same eligibility filters as the bulk charge job. Reuses `chargePastDueShared.ts` (`batchFetchCustomers`/`resolveInvoicePaymentMethodId`/`selectCurrentSubscriptionChargeable`) and `chargeOrRecoverPolicy.ts` (`chooseChargeAction` → `willRecover`).
  - `previewUserRecoverPastDueInvoice({ userId, originalInvoiceId })` — verdict from `checkRecoveryEligibility` (from `recoverStrandedPastDue.ts`) joined with minimal Stripe invoice metadata; the invoice metadata is fetched regardless of verdict so callers can explain ineligibility without revealing customer PII.
  - `listUserPaymentEvents({ userId, page, limit })` — paged `PaymentEvent.find({userId})` with a `hasRefundProcessed` flag computed by matching `BenefitsGranted` paymentIntentIds against `RefundProcessed` rows under the same `paymentIntentId`; limit capped at 50 (tighter than the standard 100).

- `platformRevenueBreakdown.ts` ([src/services/admin/platformRevenueBreakdown.ts](../../src/services/admin/platformRevenueBreakdown.ts)) — per-platform acquisition revenue breakdown powering the Advertising card's hover popover, click modal, and the Norm `dashboard.revenue-details.by-platform` tool (2026-06-04). Exports:
  - `classifyAcquisitionCategory(event)` — **pure**. Maps one `LeanRevenueEvent` to one of 5 `AcquisitionCategory` values (`membership-purchase | one-time-purchase | additional-one-time | mini-draw | upsell`), or `null` to exclude it. Membership renewals (`data.billingReason === "subscription_cycle"`) return `null`; unknown package types return `null`. One-time packages whose `packageId` starts with `"additional-"` are classified as `additional-one-time`; all others as `one-time-purchase`. **Mirrors the snapshot bucketer `classifyRevenueBucket`** (`dashboard-stats/snapshotSchema.ts`) — NOT `getRevenueDetails`, whose one-time matcher is narrower — because the Advertising + global Revenue Breakdown cards are snapshot-driven. The two classifiers are kept in lockstep by an assertion in `test:platform-revenue-breakdown`.
  - `buildByCategory(events)` — **pure**. Groups a set of `LeanRevenueEvent`s into a zero-filled 5-bucket `PlatformByCategoryEntry[]` in stable `ACQUISITION_CATEGORIES` order. Each bucket accumulates `revenue`, `purchaseCount`, and distinct `userCount`. Unit-tested: `npm run test:platform-revenue-breakdown`.
  - `getPlatformRevenueBreakdown(input)` — **async, DB-touching**. Fetches net acquisition `BenefitsGranted` events for the given `platform` + date range via `fetchNetBenefitsGrantedWithMatch`, classifies them in memory, and returns both the category summary (always 5 buckets) and a paginated buyer list (`RevenueDetailsUserRow[]`). When `summaryOnly: true`, skips the `User.find` hydration (hover-path optimisation). **Key invariants:**
    - **Platform grouping:** `convertingPlatform` field; `null`/missing values fold into `"direct"` (master-spec §3.1 invariant #1).
    - **Renewals excluded:** the Mongo `$or` query requires `packageType ∈ {one-time, mini-draw, upsell}` OR `packageType=membership AND data.billingReason ≠ subscription_cycle`. This uses `data.billingReason` rather than the top-level `isRenewal` field, matching the rest of the snapshot pipeline and remaining robust on all historical data.
    - **Whole-row refund netting:** via `fetchNetBenefitsGrantedWithMatch` (same helper used by `getRevenueDetails`); this is what makes the bars reconcile with the Advertising card's snapshot for settled date ranges.
    - **Shared buyer-list hydration:** the per-user grouping + `User` hydration + pagination is the shared `hydrateRevenueUserRows` helper in `dashboardSlices.ts` (also used by `getRevenueDetails`), so the two buyer lists — and their PII-safe Norm projections (`toNormRevenueUserRow`) — cannot drift.
    - **Snapshot vs live lag:** for the current in-progress day the live read may differ slightly from the snapshot (snapshot updates hourly / daily); callers should note this in UX.

### TikTok ad-level insights (per-ad spend breakdown)

`src/services/admin/tiktok/` — the TikTok analogue of the Meta ad-level insights that feed `MetaAdInsightsDaily`. Three files power the TikTok tab's per-ad breakdown table (see [frontend.md](./frontend.md#tiktok-ads-tab--per-ad-spend-breakdown-2026-07-16)); the writer is driven nightly by the `/api/cron/sync-tiktok-ads` cron (infrastructure domain). This surface is separate from the dashboard-stats `adChannels` / MER pipeline — it does **not** add TikTok to `AD_CHANNEL_PROVIDERS` or `PLATFORM_TO_AD_CHANNEL_KEY` (those still map `meta → facebook` only).

- `tiktokAdInsights.ts` — read-only TikTok Marketing-API client. `fetchTikTokAdInsightsDaily(startDate, endDate)` GETs `report/integrated/get/` at `data_level=AUCTION_AD`, dimensions `["ad_id","stat_time_day"]`, paginating (page_size 1000) into normalized per-ad×day rows (adId/adName/adset/campaign labels, `spendCents`/`impressions`/`clicks`/`conversions`/`revenueCents`, full `raw` row retained). Creds-gated on `TIKTOK_ADVERTISER_ID` + `TIKTOK_MARKETING_ACCESS_TOKEN` (`isTikTokAdInsightsConfigured()`); returns `null` when unconfigured **or on any API/HTTP error** so the caller leaves the admin view empty rather than showing wrong numbers. **⚠️ UNVERIFIED against the live API** (no creds at build time — same stance as `tiktokHourlySpend.ts`): the conversion-count metric (assumed `conversion`), the purchase-value metric (assumed `total_complete_payment_value`), and the currency/timezone (assumed AUD decimal dollars → cents) must be verified when creds exist; `parseMetric()` already tries several candidate keys defensively and the `raw` row is stored so live field names can be inspected without a code change.
- `TikTokInsightsSyncService.ts` — `syncDateRange({ since, until }, { onProgress? })` writer, mirroring `MetaInsightsSyncService.syncDateRange`. Pulls the rows and `bulkWrite`-upserts them into `TikTokAdInsightsDaily`, **idempotent** keyed by `adAccountId` (= advertiserId) + `date` + `adId`, always `$set syncedAt` (refreshes the TTL clock). Batches at 800 ops (`ordered: false`). Returns `{ configured, rowsUpserted, adIds, dateRange }` — `configured: false` is a no-op when creds are unset / the fetch errored.
- `tiktokAdInsightsQuery.ts` — `getTikTokAdInsights({ startDate, endDate })` read. Aggregates `TikTokAdInsightsDaily` per ad over the inclusive AEST date range (sums each ad's days, keeps the most-recent non-empty labels), returns `rows` sorted by spend desc + a summed `totals`, money in dollars, `roas = revenue ÷ spend` (0 when spend 0), and a `configured` flag (`isTikTokAdInsightsConfigured()`). The TikTok analogue of the Meta ad-level insights read. Read-only; powers `GET /api/admin/tiktok-ads/insights`.

- `MembershipAnalyticsService` — renewal, past-due, and cancellation metrics.
  - `getAnalyticsBundle(startDate, endDate, dateRange, options?)` — returns `MembershipAnalyticsBundle`. Accepts optional `{ membershipAsOfMode, asOfDate, precomputedRenewals }`. When `precomputedRenewals: { purchaseCount, userCount }` is passed, skips the full-range `fetchNetBenefitsGrantedInRange` scan and uses the values directly — the dashboard stats route threads `snapshotRead.revenue.buckets.membershipRenewal` through to avoid scanning the entire `paymentevents` collection twice (once inside `DashboardStatsSnapshotReader`, once here). Without it the service falls back to the live scan. The `cancellationsInRange` count is always live (delta query).
  - `getMembershipByPackageLive()` — live per-package counts.
  - `getMembershipByPackageLiveForSnapshot()` — four-count shape used by snapshot writer cron.
  - `getMembershipByPackageSnapshot(asOfDate)` — point-in-time counts from `MembershipDailySnapshot`; falls back to live data with `snapshotMissing: true` when no row exists.
  - `getRenewalBaseAsOf(date)` *(private)* — queries `MembershipDailySnapshot` for the period's first day and sums `activeCount + pastDueCount` across all subscription packages. If no snapshot exists for the exact date, it uses the nearest later snapshot (capped at 7 days out). Returns `{ base, snapshotDate, snapshotMissing }`.

### Renewal Rate KPI (2026-05-29, updated 2026-06-02)

`getAnalyticsBundle` now **always** populates `renewalProgress: RenewalProgress` on every call, regardless of the `dateRange` parameter. Previously it was only computed when `dateRange` resolved to `current-draw` or `last-draw`. The computation is performed by the new private method `getCurrentCycleRenewalProgress()`.

**Current-cycle anchoring:** The cycle is always the **current billing cycle** — independent of the selected date range filter. Cycle start = the day after the last completed `MajorDraw.drawDate` (AEST, computed via `aestDayBounds(...).dayEndUTC`); cycle end = now. The `dateRange` parameter no longer controls whether `renewalProgress` is present; it only controls other fields in the bundle (e.g. `membershipRenewals`).

**Definition:**

| Field | Value |
|---|---|
| `base` | `getRenewalBaseAsOf(cycleStart)` — `activeCount + pastDueCount` from `MembershipDailySnapshot` at the cycle's first day (nearest-later-day fallback, up to 7 days) |
| `renewed` | Distinct members with a `MembershipRenewalCycle` row whose `succeededAt` (or `recoveredAt`) falls within the current cycle |
| `renewalRate` | `renewed / base`, capped at 1.0 (≤ 100%) |
| `remaining` | `base - renewed` (non-negative) |
| `remainingLabel` | `"expected"` (cycle still open) |
| `snapshotMissing` | `true` when no snapshot was found within the 7-day window |

**Type:** `RenewalProgress` in `src/types/admin/membershipAnalytics.ts`. Field on `MembershipAnalyticsBundle` changed from optional to always-present.

**API surface:** `GET /api/admin/dashboard/stats` always exposes `stats.users.renewalProgress` (not draw-gated).

**Validation script:** `npm run find:renewal-rate` (`scripts/find-renewal-rate.ts`). Supports `--last-draw`, `--draw N`, `--coverage`, and the new **`--current-cycle`** mode (oracle that mirrors `getCurrentCycleRenewalProgress` exactly — use this to cross-check the headline KPI card value). See [infrastructure/patterns.md](../infrastructure/patterns.md#p6-read-only-audit-scripts-find--list) for the full mode table.

**Spec:** `docs/superpowers/specs/2026-05-29-renewal-rate-metric-design.md`.

## Routes

[src/app/api/admin/](../../src/app/api/admin/) — extensive route family. Includes:
- User management
- Payment events / refund replay
- Charge past-due (single + bulk)
- Error reports
- Contact submissions
- Partner applications
- **Inbox unread count** (`/api/admin/submissions/unviewed-count`): returns `{ contact, partner, total }` for the admin sidebar badge. Delegates to [`getUnviewedSubmissionsCount`](../../src/services/admin/submissionsCountService.ts) (extracted from the route during the Norm wiring so the same code answers both the admin GET and the Norm tool).
- Promo management
- **Upsell multipliers** (`/api/admin/upsell-multipliers`):
  - `GET /api/admin/upsell-multipliers` — returns the singleton `UpsellMultiplierConfig` document (`{ membership, oneTime, additional, updatedAt }`). Returns defaults `{ membership: 10, oneTime: 2, additional: 2 }` if no document exists yet. The GET body now delegates to [`getUpsellMultiplierConfig`](../../src/services/upsell/UpsellMultiplierResolver.ts) (shared with the Norm wiring at `/api/internal/norm/v1/upsell-multipliers`).
  - `PUT /api/admin/upsell-multipliers` — upserts the config document. Zod-validated; all three fields required; values must be members of `PROMO_MULTIPLIERS`. Called by `useUpsellMultipliersMutation()` in the admin panel.
- Affiliate management
- Draw management
- Analytics dashboards (`/api/admin/dashboard/stats`)
  - `GET /api/admin/dashboard/stats`: accepts `dateRange`, `startDate`, `endDate`. When `membershipAsOfMode === "snapshot"`, standing cancellation count and revenue impact are sourced from the snapshot table; delta metrics (cancelledMemberships, renewals) remain live. Response includes `snapshotMissingForStanding: true` when a snapshot row is absent for the requested date. **Refactored (PR4, 754→533 lines):** revenue aggregation and Facebook ad metrics now delegate to `readStatsForRange` (from `DashboardStatsSnapshotReader`) for both the main range and the comparison/trends range. Response shape unchanged; per-bucket breakdown now exposes `userCount` (live, via `computeDistinctUserCounts`) rather than an inline `userIds: Set<string>`.
- Snapshot health check
  - `GET /api/admin/health/dashboard-stats-snapshot`: admin-only. Returns expected vs present snapshot counts from site launch through yesterday-AEST (today excluded). Response: `{ expectedCount, presentCount, missingCount, missingDates, latestPresent }`. Use this as the first step of the ops runbook when dashboard stats look stale.
- User metrics (`/api/admin/metrics/users`)
  - `GET /api/admin/metrics/users`: accepts `startDate`, `endDate`, `groupBy`, `daily`. Also accepts `dateRange` (forwarded to `parseAdminDashboardDateRange` to derive `asOfDate`). When the resolved `asOfDate` is non-null (snapshot mode), `membershipStatus.active/cancelled/pastDue` in the response are sourced from `MembershipDailySnapshot` for that date; `membershipStatus.renewed` remains a live range delta. If no snapshot exists for the date, live values from the User-loop are returned.

### `resolveNormDateRange` utility

[`src/utils/admin/resolveNormDateRange.ts`](../../src/utils/admin/resolveNormDateRange.ts) wraps `parseAdminDashboardDateRange` for the internal Norm API. The admin UI today resolves `current-draw`/`last-draw` client-side and forwards the dates as `custom`; Norm calls server-side without knowing the draw dates, so this utility looks up `MajorDraw` and supplies the dates before delegating:

- `current-draw` → `MajorDraw.findOne({ status: { $in: ["active", "frozen"] } })` sorted by `activationDate desc`.
- `last-draw` → `MajorDraw.findOne({ status: "completed" })` sorted by `drawDate desc`.
- Throws `Error("No <range> found in MajorDraw collection")` when no matching draw exists.
- `today` / `yesterday` / `all-time` / `custom` pass straight through to `parseAdminDashboardDateRange` with no DB call.

The MajorDraw schema uses `activationDate` (start) and `drawDate` (end) — not `startDate`/`endDate`. Status enum is `"queued" | "active" | "frozen" | "completed" | "cancelled"`.

Test: `npm run test:resolve-norm-date-range` (covers today/yesterday/all-time/custom; current-draw degrades cleanly when no active draw exists).

> _TODO: enumerate the exact subdirectories under api/admin/ and document each._

## Winner notification email (admin select-winner)

`POST /api/admin/major-draw/select-winner` (the "record the winner selected via the government app" path) sends a **SendGrid winner email to the winning member only** after a Winner doc is first created — i.e. only in the new-selection branch, **not** when an existing winner is updated (re-uploading an image / editing testimony must not re-email). It calls `emailService.sendWinnerEmail(winnerUser.email, { firstName, prizeName, winnersUrl })`, best-effort (try/catch); the gold CTA is "See the Winners' Hall of Fame" → `winnersUrl` = `/winners`. The public weighted-random path mirrors this — see [draws/backend.md](../draws/backend.md). Template/sender: [email](../email/architecture.md).

## Auth pattern

Every handler:
```ts
const session = await getServerSession(authOptions);
const adminCheck = requireAdmin(session);
if (adminCheck) return adminCheck; // 401/403
// ... admin work
```

## Repeat-purchase analytics (`repeatPurchaseAnalytics.ts`)

`src/services/admin/repeatPurchaseAnalytics.ts` — one-time-package repeat-purchase (reconversion) analytics, the one-time counterpart of `MembershipAnalyticsService`. Split into a **pure shaper** and thin **I/O wrappers** (the cancellation-flow pattern):

- `summarizeRepeatPurchases(events, opts)` — pure, no I/O, `now` injected. Groups refund-netted one-time events per user, fixes each user's **anchor** (earliest purchase) and second purchase, and derives the summary + per-user rows. `bucketForDays(days)` maps a first→second gap to a bucket. Fully unit-tested (`__tests__/repeatPurchaseAnalytics.test.ts`, `npm run test:repeat-purchase-analytics`).
- **Per-package rollup (`summary.packages`, 2026-07-10)** — one row per one-time package with **two attributions over the same cohort purchases**: (a) *anchor-grouped* "started with this pack" — each buyer counted once under their **first** pack: `startedBuyers` (denominator), `startedReturned`, `startedRepeatRate`, `startedBecameMembers`, `startedMemberRate`, `startedRevenue` (all their one-time spend, "downstream"); (b) *per-purchase gross* — each purchase under the pack actually bought: `purchases`, `grossRevenue`. Key = `packageId || packageName || "unknown"` (both optional on `PaymentEvent`). Sorted by `startedBuyers` desc (biggest/most-trustworthy cohorts first; ties → `startedRevenue` → `grossRevenue`). **Invariant** (unit-tested + verified on prod): `Σ startedRevenue === Σ grossRevenue === total cohort one-time revenue`, and `Σ purchases===totalPurchases`, `Σ startedBuyers===oneTimeBuyers`, `Σ startedReturned===repeatBuyers`, `Σ startedBecameMembers===becameMembers`. Packs that only ever appear as later/add-on buys (the `additional-*` packs) surface with `startedBuyers: 0` — gross figures, no anchor rates.
- `getRepeatPurchaseSummary(range)` / `getRepeatPurchaseUsers(params)` / `getRepeatPurchaseUsersForExport(params)` — I/O wrappers. `loadCohort` runs the **three independent reads concurrently** (`Promise.all`: refunded-PI set, one-time `BenefitsGranted` scan, and a server-side `$group`/`$min` for new-membership conversions — the last two replaced an earlier full-membership-collection pull that made the first prod run take ~10 s), then calls the shaper. Live aggregation, **no snapshot**. The cohort date filter (`startDate`/`endDate`, on the **anchor** date) is applied after anchors are fixed, then the shaper re-runs over the kept users so every derived figure stays internally consistent. `getRepeatPurchaseUsers` pages (default 50) + hydrates PII per page; `getRepeatPurchaseUsersForExport` returns the whole filtered cohort PII-hydrated for CSV. Each user row carries `firstPurchaseAt`, `secondPurchaseAt` (the reconversion event), and `lastPurchaseAt` (most-recent; = first for single-purchase buyers) — the UI shows First + Last (not First + Second) to avoid the redundant-date confusion when second == last.

**Definitions:** countable purchase = one-time `BenefitsGranted`, refund-netted, no `processedBy`/`price>0` filter. Excludes upsell/mini-draw/membership. **Cohort = one-time buyers who were NOT an ACTIVE member when they bought** — people choosing one-time packs *instead of* a subscription (the persuade-to-subscribe target). A user is excluded only if they were an active member at their first one-time purchase (`wasActiveMemberAt(chargesAsc, anchorTs)`): active = a membership charge exists after the anchor (they renewed past it) OR the most recent membership charge is within `MEMBERSHIP_COVERAGE_DAYS` (30) before it. This **keeps** never-members, one-time buyers who *later* subscribe (`becameMember`), and **lapsed members who buy one-time after their subscription ended** (e.g. charged 9 Jun, bought 10 Jul → 31d → lapsed → included); it **excludes** active members topping up with Additional packs. Membership timeline comes from a `$group` over ALL membership `BenefitsGranted` per user (`{t, isNew}`, `isNew` = `billingReason !== "subscription_cycle"`). `daysToReturn` in AEST calendar days. `windows[]` uses **matured denominators**. Identity is per `userId`. Caveats: the 30-day coverage is an approximation of one billing cycle (no per-charge period-end stored), and a member who signed up before the paymentevents collection began (2025-11-27) may only have renewal rows. Mirrored to Norm as `analytics.repeat-purchases` (summary only — including `packages[]` — aggregate/no-PII).

## Cross-domain projection helpers

Some services under `src/services/admin/` expose secondary "projection" methods consumed by the internal-norm read tier so that admin + Norm share one code path:

- `PromoBannerTextService.listBannerTextsProjection()` / `.getActiveBannerTextProjection()` — return banner-text rows in the shared `{id, ..., createdBy: {id, name, email}}` shape with `startDate` / `endDate` AEST-converted at the service boundary. The existing `getAllBannerTexts` / `getActiveBannerText` remain for the admin route's response envelope; the projection wrappers are what `/api/internal/norm/v1/promo/banner-text` and `…/banner-text/active` call.
