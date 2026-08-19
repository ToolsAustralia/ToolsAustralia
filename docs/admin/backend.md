# Admin — Backend

## Server-only code

[src/server/admin/](../../src/server/admin/):
- `chargePastDueJob.ts` — **the cron-free CHUNKED bulk-charge engine** (replaced the legacy single-request loop that did all ~800 charges in one HTTP call and overran Vercel's 300s cap, leaving runs stuck `running` and money half-collected). Three entry points, all driven by the client:
  - `startChargePastDueJob({ adminId })` — atomically acquires the global `ChargeJobLock`, sweeps orphaned runs (`sweepOrphanRuns`), snapshots the eligible worklist **ONCE** via `previewChargePastDueInvoices` (one Stripe list pass, **no charging**), creates the `ChargeJobRun` + `ChargeJobWorklist`, and returns `{ runId, total, done, allowlist? }`. An empty worklist finalizes immediately, releases the lock, and returns early (no allowlist sweep runs). Throws `ChargeJobLockedError` (→ 409) if another job holds the lock.

    **Phase 0 allowlist sweep.** For a non-empty worklist, right after creating the run (and still inside the lock, before any chunk charges), `startChargePastDueJob` calls [`reconcileAllowlistFromBlocked`](../billing-stripe/gotchas.md#past-due-bulk-charge-hitting-blocked-card-failures-phase-b5-sweep) scoped to `{ kind: "customers", stripeCustomerIds }` for exactly this run's worklist customers — allowlisting any of their cards that were previously Stripe-blocked (same eligibility gate as the manual sync script: paying member, no fraud-signal / permanent-issue decline code, `allowOverride: false`). This is **best-effort**: it's wrapped in its own `try/catch`, logs via `console.error` on failure, and never aborts the run or touches the lock — allowlisting is an optimization, collection is the job. The resulting `ReconcileSummary` is returned as `allowlist` on the `start` response (`undefined` if the worklist was empty or the sweep threw). `ChargePastDueModal` reads `start.allowlist` and, when `added > 0`, shows "Allowlisted N previously-blocked cards before charging" (plus an "(M already on the list)" suffix when applicable). **No cron runs this** — it only fires inline when an admin starts a bulk charge run.
  - `processChargePastDueChunk({ runId, adminId, chunkSize? })` — charges the next `chunkSize` worklist invoices that don't yet have an `InvoiceChargeLog` row for the run, in sub-batches of `SUB_BATCH_SIZE = 15` with a `500ms` delay (mirrors the legacy 15-parallel throttle), renews the lock, recomputes live totals from the logs, and finalizes + releases the lock once the worklist is drained. `DEFAULT_CHUNK_SIZE = 30`, `MAX_CHUNK_SIZE = 60`.

    **Per-item pay-vs-recover routing (2026-07-19).** `chargeWorklistItem` retrieves the invoice with `expand: ["customer", "payments"]` and branches via the pure `decideBulkChargeAction` (in `chargeOrRecoverPolicy.ts`): live invoices delegate to `payOpenInvoiceAsPastDueAdmin` (30s debounce, 6h recent-attempt lock, late still-past-due re-check, already-paid catch, run-scoped `admin-charge-${invoiceId}-run-${runId}` key); **stranded** invoices — retries exhausted AND every invoice_payment canceled, which `stripe.invoices.pay()` rejects with "This invoice can no longer be paid" (558/744 rows of the 2026-07-19 run) — take the recover path. An exhausted invoice that still has a payable invoice_payment (status `"open"`, e.g. a recovered-then-declined cycle) stays on the **pay** branch — recovery would dead-end it at `no_held_draft` while a direct pay still reaches the card (28 of the 2026-07-19 run's 177 real declines were this shape).

    **Recover-branch double-charge guards (added after adversarial review, same day).** The danger is a SECOND recovery for the same member picking a *sibling* same-amount held draft with fresh idempotency keys (multi-cycle paused members hold one draft per missed cycle). Three stacked guards prevent it: (1) the branch acquires the per-subscription **`RecoveryClaim`** (`acquireRecoveryClaim(subscriptionId, "bulk-charge:<runId>")`, released in `finally`) — serializing against the member Pay-Now / renew / Force-Charge flows and against a concurrent chunk; claim held → summary `skipped`; (2) it calls `recoverStrandedPastDueInvoice` with **`bypassRecentRecoveryLock: false`** — the 6h `hasRecentRecoveryAttempt` guard on the ORIGINAL invoice stays active, so a crash-resumed chunk or same-day re-run refuses instead of re-recovering (possible because the pay primitive's 6h check now excludes recovery step-audit rows — see `chargePastDueShared.ts` — which was the only reason other callers had to bypass); (3) the recovery's Stripe keys + the paid-draft-leaves-the-pool guard dedupe same-draft repeats as before.

    **Recover-branch accounting.** Exactly **one run-tagged summary row keyed on the ORIGINAL worklist invoice id** is written per item (mapped by the pure `summarizeBulkRecoveryOutcome`; `result.recovery.bulk: true` + `newInvoiceId`). The recovery's PAY row on the NEW invoice id **is run-tagged** (via the new `chargeRunId` param on `recoverStrandedPastDueInvoice`) so it stays out of the Manual Retries view and carries the real `declineCode` for decline analytics — while `recomputeTotalsFromLogs` restricts totals to **worklist invoice ids**, so that pay row never double-counts the member's outcome or revenue. Step-audit rows stay untagged but carry `result.recovery.step` and are excluded from both Manual Retries and the decline summary (see `chargePastDueHistory.ts`). The recover call passes **`mintCurrentCycleIfNoDraft: true` + `callerHoldsRecoveryClaim: true`**, so the `no_held_draft` cohort is now **minted-and-charged (or a notifying decline), not skipped** — the summary row above stays the single authoritative row because `callerHoldsRecoveryClaim: true` suppresses the mint's own `result.recovery.rebill` row (which would otherwise double-count against the worklist original invoice id); see the [`no_held_draft` on-demand re-bill note](#auto-recovery-wrapper-chargeorrecover) below.
  - `abortChargePastDueJob({ runId, adminId })` — admin stop / modal close: recomputes real totals from logs, marks the run `aborted`, releases the lock so a re-run can start immediately.

  Totals are **recomputed from `InvoiceChargeLog` rows** (via `recomputeTotalsFromLogs` → `aggregateRunTotals`), not in-memory counters, so a crashed/killed run never shows 0/0/0. (Operational tooling for orphaned runs lives in the [infrastructure](../infrastructure/) domain — `scripts/fix-stuck-charge-jobs.ts`, npm `fix:stuck-charge-jobs`.)

  **Skip-reason vocabulary (`src/utils/admin/chargeSkipReasons.ts`, 2026-07-20).** Pure, dependency-free module shared by the totals aggregator, `recomputeTotalsFromLogs`'s `classifySkipReason`, and the admin drawer, so all three bucket skips identically. Named buckets: `noHeldDraft` (stranded member, no re-billable held draft yet — self-heals next cycle), `awaitingRetry` (no payable attempt now but Stripe has a scheduled retry — `payOpenInvoiceAsPastDueAdmin` reclassifies the old "This invoice can no longer be paid"/`payment_intent_unexpected_state`-with-`next_payment_attempt` case here, with an accurate message instead of Stripe's dev-facing "consider voiding"), plus the pre-existing `recentlyAttempted`/`noLongerPastDue`/`alreadyPaid`/`missingPaymentMethod`/`other`. `PastDueChargeHistoryDrawer` recomputes the SKIP BREAKDOWN client-side from the run's rows via `classifySkipBucketFromMessage` so historical runs (persisted totals predate the new buckets) display correctly, and adds a per-run **"Why charges declined"** chip panel (failed rows grouped by `declineCode ?? errorCode`) that filters the per-invoice attempts list by decline reason. Tested by `npm run test:past-due-history` (`chargeSkipReasons.test.ts`). Norm mirrors the run totals — the two new fields were added to `src/lib/internal-norm/schemas/charge-past-due.ts` + `docs/internal-norm/norm-context.md` in lockstep.
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

**`no_held_draft` on-demand re-bill (per-user + bulk, 2026-07-21).** When `recoverStrandedPastDueInvoice` hits `no_held_draft` (stranded member, but no held draft to finalize — their next cycle hasn't minted one) and the caller passes `mintCurrentCycleIfNoDraft: true`, it falls back to [`mintCurrentCycleInvoice`](../../src/services/subscription/mintCurrentCycleInvoice.ts): unpause + `billing_cycle_anchor:'now'` force-collects the current cycle (auto-charge) and moves the renewal ~1 month out (so it doubles as the reanchor). **Both** the per-user path (`chargeOrRecover`) **and** the bulk chunk (`chargeWorklistItem`) now enable it, so a bulk run collects — or produces a **NOTIFYING decline** — for every stranded member instead of skipping the no-draft cohort (previously the bulk passed neither flag and reported this cohort as SKIPPED). The mint's outcome maps to **skipped** for its guard/concurrency reasons (`claim_held`, `member_ending` = scheduled-to-cancel, `already_collected` = a prior re-bill already collected while `active`/`trialing`, `subscription_inactive` = the sub is `canceled`/`incomplete`/`incomplete_expired` and not collectible — 2026-07-21) and **failed** only for a real charge decline or mid-flight error (so skips stay out of the decline analytics).

**Who writes the rebill `InvoiceChargeLog` row.** The `result.recovery.rebill` row is written **only on the per-user path** — guarded by `if (!params.callerHoldsRecoveryClaim)` in [`recoverStrandedPastDue.ts`](../../src/server/admin/recoverStrandedPastDue.ts), where that row IS the audit. The **bulk** path passes `callerHoldsRecoveryClaim: true`, which **suppresses** that row: the bulk already writes exactly one run-tagged summary row (via `summarizeBulkRecoveryOutcome`, keyed on the ORIGINAL worklist invoice id), and writing the rebill row too would **double-count** the outcome/revenue in the run totals (a guard-skip's rebill row falls back to the worklist original invoice id, which `recomputeTotalsFromLogs` aggregates). `callerHoldsRecoveryClaim: true` also threads into the mint as `skipClaim`: the bulk already holds this subscription's `RecoveryClaim` (acquired per member earlier in `chargeWorklistItem`), so the mint reuses it rather than self-deadlocking to `claim_held`.

The mint itself is hardened against double-charge / cancelling-member / upgrade-entry misclassification — see [subscription/backend.md](../subscription/backend.md#mintcurrentcycleinvoiceparams-deps). See [CHARGE_PAST_DUE_CUSTOMERS.md](../CHARGE_PAST_DUE_CUSTOMERS.md) and [subscription/backend.md](../subscription/backend.md#mintcurrentcycleinvoiceparams-deps).

The **bulk** job does not use the `chargeOrRecover` wrapper itself but applies the same branching via `decideBulkChargeAction` + `recoverStrandedPastDueInvoice` directly in `chargeWorklistItem` (see the chunk bullet above). `decideBulkChargeAction` differs from `chooseChargeAction` in one load-bearing way: an open-exhausted invoice is only routed to recovery when **no payable invoice_payment remains** (requires the invoice retrieved with `expand: ["payments"]`; falls back to "pay" when not expanded). `summarizeBulkRecoveryOutcome` maps the recovery result onto the single run-tagged log row (pre-Stripe refusals → `skipped`, mid-flight `void_failed`/`draft_create_failed`/`finalize_failed` → `failed`); its skip messages are phrased so `classifySkipReason` buckets them (`not past_due` → `noLongerPastDue`, `already_paid` → `alreadyPaid`, `payment method` → `missingPaymentMethod`, `no_held_draft` → `other`). Its **success message is generic** — `Recovered: collected the owed cycle now (invoice …)` — because recover now either finalizes a held draft **or** (the `no_held_draft` cohort) mints+charges a fresh current cycle; both "collect the owed cycle now," so it no longer hard-codes "held draft finalized and paid." Both helpers are pure — tested by `npm run test:charge-or-recover-policy`. Force Charge and the per-invoice recover endpoint keep their existing primitive paths.

### Manual-action lock bypass

`payOpenInvoiceAsPastDueAdmin` accepts `bypassRecentAttemptLock?: boolean`. When true, the default 1-per-window (6h) budget check is skipped via the pure `shouldSkipForRecentAttempt(rows, bypass)` predicate in [`past-due-charge-idempotency.ts`](../../src/server/admin/past-due-charge-idempotency.ts); the 30s spam debounce still fires. `recoverStrandedPastDueInvoice` and `checkRecoveryEligibility` accept the analogous `bypassRecentRecoveryLock?: boolean` (which skips the `hasRecentRecoveryAttempt` check and forwards as `bypassRecentAttemptLock: true` into the final inner pay call). All three admin-initiated routes (per-user charge-past-due POST, per-user recover-past-due-invoice POST/GET, bulk invoices/recover-past-due POST) pass `true`. The bulk charge job's **recover branch deliberately passes `bypassRecentRecoveryLock: false`** — its repeats are machine-driven, so the 6h `hasRecentRecoveryAttempt` repeat-guard must stay active (see "Recover-branch double-charge guards" above). This is viable because `payOpenInvoiceAsPastDueAdmin`'s 6h recent-attempt query now excludes recovery step-audit rows (`result.recovery.step`), the same exclusion the 30s debounce always had — a non-bypassed recovery pay no longer self-blocks on its own just-written audit rows. The bulk **pay** branch and Force Charge pass nothing (existing locks apply).

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
5. Produce the payable invoice: a **draft** is finalized (`force-finalize-${invoiceId}`); a **stranded** target is **recovered** via [`prepareRecoveredCycleInvoice`](../../src/services/subscription/prepareRecoveredCycleInvoice.ts) under the per-sub `RecoveryClaim` lock (void stranded + finalize the held draft) — **the finalized DRAFT is what gets paid**, so the budget / idempotency key / `subscriptionId` stamp are all re-anchored on the **draft id** (not the stranded-open id), and the pay key stays the **per-attempt** `buildForceChargeIdempotencyKey` (never the stable admin-recovery key — a stable key would be replayed for 24h and re-collect $0). For a stranded target with **no held draft**, both routes now pass `mintCurrentCycleIfNoDraft: true` → the orchestrator **mints a fresh current cycle** on the default card ([`mintCurrentCycleInvoice`](../../src/services/subscription/mintCurrentCycleInvoice.ts), acquiring its own `RecoveryClaim` since none is held at that point — this is BEFORE the pay path's claim/budget) instead of the old `no_held_draft` 409, mapping the outcome onto existing reasons via the pure `mapMintFailureToForceChargeReason` (decline → `pay_failed`; already-collected → `period_already_paid`; canceled/scheduled-to-cancel → `subscription_inactive`; concurrent claim → `recent_charge_attempt`; unit-tested `npm run test:force-charge-mint-map`). This applies to **both** the admin Force-Charge route and the member self-serve `force-charge-overdue` route — admin Force-Charge on a stranded open goes fail→recover, and a no-draft member is now **re-billed rather than dead-ended** (2026-07-21).
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
  - `adChannelProviders.ts` — provider registry (`AD_CHANNEL_PROVIDERS`). Contains `facebookAdChannelProvider` (live Meta API fetch) and, since 2026-07-24 (panel F-001), `tiktokAdChannelProvider` — key `"tiktok"`, which does NOT call the Marketing API live: it sums that AEST day's already-synced `TikTokAdInsightsDaily` rows (spend/revenue/roas from `spendCents`/`revenueCents`; revenue is TikTok-reported), so it's cheap and rate-limit-free. Same status contract as facebook: unconfigured or read-failure → `"error"` (writer preserves prior value — the June-2026 wipe guard), zero rows / future day → `"empty"`. Add Snapchat by appending another `AdChannelProvider` — no schema change required; the snapshot stores `adChannels` as a Map.
  - `DashboardStatsSnapshotWriter.ts` — `writeSnapshotForDate(dateKey, refundedSet)` computes and upserts one snapshot row. `writeSlidingWindow({ todayAESTDateKey, windowDays })` re-upserts today + previous N days in sequence. `aestDayBounds(dateKey)` → `{ dayStartUTC, dayEndUTC }` (DST-correct). `expandDateKeyRange(start, end)` → ordered list of AEST date keys. All writes use `findOneAndUpdate` with `{ upsert: true }` so they are idempotent.
  - `DashboardStatsSnapshotReader.ts` — `readStatsForRange({ rangeStartUTC, rangeEndUTC })` returns `SnapshotReadResult`. Sums snapshot rows for complete AEST days, computes today live (not yet snapshotted), falls back to live for any date missing a snapshot (flagged in `meta.missingSnapshotDates`). ROAS per channel is recomputed from summed totals rather than averaged. `userCount` per bucket is always live (distinct users not additive across days).
  - `distinctUserCounts.ts` — `computeDistinctUserCounts(start, end)` → `Record<RevenueBucketKey, number>`. Single aggregation pipeline: match `BenefitsGranted` events, exclude refunded PIs via `excludeRefundedBenefitsGrantedStages()`, group by `(packageType, packageId, billingReason)` using `$addToSet` on `userId`, then re-union into a Set per bucket to avoid double-counting the same user across multiple tuples in the same bucket.

### Per-platform attributed revenue (dashboard-stats)

**`snapshotSchema.ts` — `PLATFORM_TO_AD_CHANNEL_KEY`**

A mapping from `AttributedPlatformKey` (e.g. `"meta"`) to the ad-spend provider key used in `adChannels` (e.g. `"facebook"`). `null` means no spend channel exists for that platform (applies to `"direct"`, `"other"`, `"klaviyo_email"`, `"klaviyo_sms"`). `"meta" → "facebook"` and `"tiktok" → "tiktok"` are live (both providers registered); `"google"`/`"snapchat"` map to keys whose providers don't exist yet, so they behave as spend-less until one is appended. Used by the route to join attributed revenue with ad spend for ROAS calculation.

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

`src/services/admin/tiktok/` — the TikTok analogue of the Meta ad-level insights that feed `MetaAdInsightsDaily`. These files power the TikTok tab's per-ad breakdown table (see [frontend.md](./frontend.md#tiktok-ads-tab--per-ad-spend-breakdown-2026-07-16)); the writer is driven nightly by the `/api/cron/sync-tiktok-ads` cron (infrastructure domain; history/backfill via `npm run seed:tiktok-insights`). Since 2026-07-24 (panel F-001) the synced rows ALSO feed the dashboard-stats `adChannels` / MER pipeline via `tiktokAdChannelProvider` (see the dashboard-stats section above) — the overview Advertising card, blended ROAS, and MER pick up TikTok spend from the snapshot once rows exist.

- `tiktokAdInsights.ts` — read-only TikTok Marketing-API client. `fetchTikTokAdInsightsDaily(startDate, endDate)` GETs `report/integrated/get/` at `data_level=AUCTION_AD`, dimensions `["ad_id","stat_time_day"]`, paginating (page_size 1000) into normalized per-ad×day rows (adId/adName/adset/campaign labels, `spendCents`/`impressions`/`clicks`/`conversions`/`revenueCents`, full `raw` row retained). Creds-gated on `TIKTOK_ADVERTISER_ID` + `TIKTOK_MARKETING_ACCESS_TOKEN` (`isTikTokAdInsightsConfigured()`); returns `null` ONLY when unconfigured — since 2026-07-24 (panel F-002) any API/HTTP failure **throws `TikTokReportError`** (exported here; carries `httpStatus` + TikTok's `tiktokCode`/message, e.g. 40001) so the cron can persist a truthful sync status instead of conflating "broken" with "not set up". Each request carries `signal: AbortSignal.timeout(8000)` (panel F-007) — these fetchers also run on the admin request path, so a hanging TikTok API must not hold a Vercel function open. **An unparseable body is an error, not an empty success** (panel F-013): the check is `!res.ok || !body || body.code !== 0`, so an HTTP 200 carrying a gateway error page can no longer be read as "code 0" and reported as a successful 0-row sync.

Also exported here (panel F-006): **`checkTikTokAccountAssumptions()`** GETs `/advertiser/info/` (needs the *Ad Account Management: read* scope) and compares the live account against what the sync hard-codes — currency must be **AUD** (spend is stored as AUD cents) and the reporting timezone must look like **Australia/Sydney** (hourly spend is bucketed as AEST beside AEST revenue). Both are silent corrupters if wrong, so they are checked rather than assumed. **`describeAccountAssumptionMismatch()`** turns a failed check into the human sentence the cron logs. Wired into: `seed:tiktok-insights:dry` (the token-day pre-flight) and the nightly cron (post-sync, best-effort — a failure here never fails the sync, and it returns `assumptionsWarning` in the JSON). **✅ VERIFIED against the live API 2026-07-29** (advertiser 7561254031700557840). All three previously-guessed assumptions were checked, and **two of the three guesses were wrong**:

| Assumption | Verdict |
|---|---|
| Currency AUD, timezone Australia/Sydney | ✅ **Correct** — confirmed via `/advertiser/info/`; the `spend × 100 → cents` conversion and AEST bucketing are sound. |
| Purchase-value metric `total_complete_payment_value` | ❌ **Does not exist.** The request 40002'd on it; 14 other plausible total-value names were also rejected. This account exposes value only PER UNIT, so total value is **derived**: `value_per_complete_payment × complete_payment`. Cross-checked against the independent `complete_payment_roas × spend` over a 30-day/68-row window — $1024.93 vs $1024.37, 99.95% agreement (2-dp rounding). The per-unit form is the more accurate: its error scales with the purchase COUNT, the ROAS form's with SPEND. |
| Conversion-count metric `conversion` | ❌ **Wrong metric — would have been ~300× too high.** `conversion` counts each ad group's OWN optimization event, so landing-page-view-optimised groups inflate it wildly: the verified window returned `conversion` = 13,701 against **45** actual purchases. The purchase count is **`complete_payment`**, which is also what makes the platform figure comparable to our first-party `PaymentEvent` count. **Never fall back to `conversion`** — a plausible-but-wrong number is worse than a zero, because nothing downstream questions it. |

Fidelity audit after the first real sync (86 ad×day rows, 31 ads): stored spend/purchases/value matched the live API **exactly** ($1305.45 / 45 / $1024.93, zero row-level mismatches). Re-runnable with `npm run verify:tiktok-readpath`, which drives the real `getTikTokAdInsights` + `tiktokAdChannelProvider` and asserts they agree with the stored rows (catches writer↔reader drift). The `raw` row is still stored so a future TikTok vocabulary change stays inspectable without a code change.
- `TikTokInsightsSyncService.ts` — `syncDateRange({ since, until }, { onProgress? })` writer, mirroring `MetaInsightsSyncService.syncDateRange`. Pulls the rows and `bulkWrite`-upserts them into `TikTokAdInsightsDaily`, **idempotent** keyed by `adAccountId` (= advertiserId) + `date` + `adId`, always `$set syncedAt` (refreshes the TTL clock). Batches at 800 ops (`ordered: false`). Returns `{ configured, rowsUpserted, adIds, dateRange, totals }` — `configured: false` is a clean no-op ONLY when creds are unset; a configured-but-failing fetch propagates the fetcher's `TikTokReportError` (the throw-loudly contract — the cron 500s so Vercel cron monitoring stays red; panel F-002/F-008, pinned by `npm run test:tiktok-sync-contract`). `totals` (window sums of clicks/conversions/revenueCents) feeds the exported pure predicate **`metricNamesSuspect(totals)`** (panel F-005): `clicks > 0 && conversions === 0 && revenueCents === 0` is the signature of a wrong metric-name guess writing confident zeros (the report API returns only the metrics you name, so `parseMetric`'s fallback keys can never appear). The cron logs `WARNING metric-names-suspect` + returns `warning: "metric-names-suspect"`; the seed script prints the same. Verify against a stored row's `raw.metrics` keys.
- `tiktokSyncStatus.ts` (2026-07-24, panel F-002) — `recordTikTokSyncRun({...})` upserts the single `TikTokSyncRun` status doc (best-effort: its own failures are logged and swallowed so status-writing can never break the cron); `getTikTokSyncHealth()` returns `{ configured, lastRun (outcome/errorCode/errorMessage/rowsUpserted/finishedAt), lastSyncedAt (max syncedAt row write) }` — composed into the admin insights route's response as `syncHealth` so the UI can tell "failing" from "no spend yet".
- `tiktokAdInsightsQuery.ts` — `getTikTokAdInsights({ startDate, endDate, level? })` read. Projects with an explicit `.select()` include-list that **excludes `raw`** (panel F-023 — the aggregation never reads the stored API row, and shipping it per doc is the repo's unprojected-`.find()` footgun at 1000 ads × 60 days). Aggregates `TikTokAdInsightsDaily` over the inclusive AEST date range, returns `rows` sorted by spend desc + a summed `totals`, money in dollars, `roas = revenue ÷ spend` (0 when spend 0), and a `configured` flag (`isTikTokAdInsightsConfigured()`). The TikTok analogue of the Meta ad-level insights read. Read-only; powers `GET /api/admin/tiktok-ads/insights`.

  **`level` grouping (2026-08-11).** `"campaign" | "adset" | "ad"`, **default `"ad"`** — the pre-switcher behaviour, so every existing caller (including the Norm mirror) keeps its exact shape. The grouping key is the id at the requested level.

  - **Rolling up is sound, not an approximation.** Each stored document is one ad-day, keyed uniquely on `adAccountId + date + adId`, so summing every ad-day in a campaign counts each spend figure exactly once. `totals` is therefore **identical at every level** — if the totals ever differ between levels, something is dropping rows.
  - **Identity is populated for the requested level and the levels ABOVE it only.** An ad-set row still names its campaign; `adId`/`adName` are `null` above ad level, because that group spans many children and naming one of them would be a lie. This made `adId` nullable — which is why the Norm schema had to move in lockstep (see [internal-norm](../internal-norm/)).
  - **Rows missing an id at the requested level get a visible bucket,** labelled `(no campaign reported)` / `(no ad set reported)`. `campaignId`/`adsetId` are optional on the model; dropping those rows would make the same window report different totals at different levels, and silently — the exact class of quiet disagreement that destroys trust in a spend table.
  - Conversions and revenue stay **TikTok-reported at every level** (the platform's own attribution), unchanged from what the ad-level table always showed.

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

## Cobber transcript reads (`chatTranscripts.ts`, 2026-08-10)

`src/services/admin/chatTranscripts.ts` — the admin read-side for Cobber conversation transcripts. Kept separate from `chatbotCostAnalytics.ts` on purpose: that file answers *"what is Cobber costing us"* from `ChatAuditLog` aggregates only, this one answers *"what are people asking and how did Cobber reply"* by reading the stored `ChatConversation` / `ChatMessage` documents. Read-only — no mutations on this surface.

- **`listChatTranscripts(params)`** — newest-first (`updatedAt: -1`) page of conversations. `days` is clamped to `MESSAGE_TTL_DAYS` (90) because nothing older can exist; `limit` clamps to `MAX_LIMIT` (100), default 25.
  - `actorKind` is **derived, not stored**: a conversation with a `userId` is a member, without is anonymous — hence `userId: {$ne: null}` / `userId: null` rather than a stored discriminator.
  - `kind` maps to `modelTier`: `deflected` → `{$size: 0}` (every answer came from the FAQ decision tree, zero AI cost), `generative` → `{"modelTier.0": {$exists: true}}`. Verified on prod: the two are a true partition (28 + 48 = 76).
  - **Search** runs first and narrows by `_id`: a regex over `ChatMessage.content` collects matching `conversationId`s. Input goes through `escapeRegex()` — without it a pasted `(` throws and a `.` matches everything. Empty match set short-circuits to an empty result rather than issuing a pointless `$in: []`. Message volume is ~10/day so the regex is cheap; revisit if Cobber traffic grows by orders of magnitude.
  - Per-page enrichment is **two batched reads, not N+1**: one `$group` aggregate over the page's `conversationId`s for `messageCount` / `userMessageCount` / `firstUserMessage` (via `$first` + `$$REMOVE` so only user rows are considered), and one `User.find({_id: {$in}})` projecting `firstName` alone.
- **`getChatTranscript(id)`** — one full transcript. Guards `ObjectId.isValid` first so a garbage id returns `null` (→ 404) instead of throwing a `CastError`. Fetches messages and `ChatAuditLog` turns concurrently via `Promise.all`.
  - **`possiblyTruncated`** flags a real TTL asymmetry: `ChatConversation`'s TTL rides on `updatedAt` (sliding — it renews on every new turn) while `ChatMessage`'s rides on `createdAt` (fixed). A conversation active for longer than 90 days therefore **outlives its own earliest messages**. The flag stops the UI presenting a partial transcript as complete. Low impact today (chats are short-lived); the durable fix would be aligning both TTLs onto `createdAt`.
- **Pure helpers** (no Mongo, unit-testable): `escapeRegex`, `buildPreview` (whitespace-collapse + 160-char ellipsis), `isDeflectedOnly`.
- **PII boundary.** Content is already redacted at write time by `redactPII()` in `ChatService`, so this layer never handles raw PII (verified on prod: 0 stored messages match a raw email pattern). Identity is the Norm projection — `firstName` + opaque `userId`. Do not widen it.

Consumed by `GET /api/admin/chatbot-conversations[/[id]]`, both gated by **`submissions.view`** (not the `overview.view` of the chatbot-cost sibling). Not currently mirrored to Norm — see the note in [rules.md](./rules.md).

## Cross-domain projection helpers

Some services under `src/services/admin/` expose secondary "projection" methods consumed by the internal-norm read tier so that admin + Norm share one code path:

- `PromoBannerTextService.listBannerTextsProjection()` / `.getActiveBannerTextProjection()` — return banner-text rows in the shared `{id, ..., createdBy: {id, name, email}}` shape with `startDate` / `endDate` AEST-converted at the service boundary. The existing `getAllBannerTexts` / `getActiveBannerText` remain for the admin route's response envelope; the projection wrappers are what `/api/internal/norm/v1/promo/banner-text` and `…/banner-text/active` call.

## Streak-related admin touches (2026-07-15)

- `MajorDrawService.getMajorDrawParticipantsSafe` — the `zeroEntriesBySource()` shape (and `MajorDrawParticipantSafe`) now includes `"promo-link"` and `streak`, so participants projections (admin + the Norm mirror `major-draw.participants`) carry the Membership Streak bucket instead of silently dropping it.
- `delete-user-cascade` — now also deletes the user's `MilestoneIssuance` + `RedeemableIssuance` rows (step 8b); orphaned issuance rows previously kept polluting the milestone/redeemables performance aggregates after account deletion.
- **Admin streak visibility (2026-07-15, owner-requested):** the user-detail route + `UserAdminQueryService` (list AND detail) project `subscription.streakMonths` (+ `streakGeneration` on detail); `UserDetailModal`'s Current Subscription grid shows a "Membership Streak" cell (flame + `N renewals`, `· gen G` when > 1); the users page has a **Streak filter** (1+/2+/4+/6+/8+/10+/12+ (Founding) / No streak) wired through the shared `buildUserFilter` (`streak` param: `"none"` = missing-or-0, numeric = `$gte` on `subscription.streakMonths`) so the list, the CSV/XLSX export, and Norm's export counts all honour it; the export field registry gained `subscription.streakMonths` ("Membership Streak (renewals)"). Norm lockstep done in the same change: `users` list + `users/[id]` schemas/routes carry `streakMonths` (+ `streakGeneration` on detail), manifest rebuilt, both routes smoke-tested 200.
- **Known admin gaps (deliberate, P4 scope):** the user-detail entries-by-source breakdowns do not list the streak bucket, the users LIST table has no streak column (filter + detail modal only), and there is no manual streak-adjustment tool (support uses the repair script `backfill:membership-streaks`).

### Signups per acquisition platform (2026-07-24)

[`src/services/admin/signupsByPlatform.ts`](../../src/services/admin/signupsByPlatform.ts) — `getSignupsByPlatform(startDate, endDate)` counts accounts created in the window, grouped by acquisition platform, for the Advertising card's per-platform **signup** figure (the companion to revenue/conversions: how many *accounts* a channel created, not just how much revenue it converted).

Two sources, in priority order, both read off `User.signupAttribution`:

1. **`clickPlatform`** — a paid click id (`_fbc`/`ttclid`/`_sc_click`) was in the request cookies at registration (see [auth](../auth/)). Confidence **click-verified** — the same basis `resolveConvertingPlatform` uses for payments, so signups and conversions on the same row are comparable.
2. **`utmSource`** → `normalizeUtmToPlatform` (already folds `facebook.com`, `vm.tiktok.com`, … ). Confidence **utm_only**.

Neither ⇒ **`direct`**, never dropped — so per-platform counts always sum to the range's total signups. Counting `clickPlatform` first matters: a paid ad landing without UTM tags would otherwise be indistinguishable from organic and under-count the channel that paid for it. Accounts created before 2026-07-24 have no `clickPlatform` and fall back to UTM. The query projects only the two attribution fields (footgun rule #3 — `User` carries large arrays that must never be pulled for a count). Returns `{ byPlatform, total, byConfidence }`.

### Dual ROAS on `attributedRevenue` (2026-07-24)

`DashboardStatsService` now emits **two** ROAS figures per platform, plus signups:

| Field | Meaning |
|---|---|
| `trueRoas` | **SERVER ROAS** — our own payment-attributed acquisition revenue ÷ ad spend. The final word for budget decisions. |
| `platformRoas` / `platformRevenue` | **PLATFORM ROAS** — the ad platform's OWN reported conversion value ÷ the same spend. |
| `signups` | Accounts created attributed to this platform (see above). |

The platform figures were **already being captured** per channel by each `AdChannelProvider` (`AdChannelMetrics { spend, revenue, roas }` — Meta from its API, TikTok summed from `TikTokAdInsightsDaily` by `tiktokAdChannelProvider`); the service simply read `.spend` and discarded the rest. Exposing them is a read change, not new plumbing.

**The two ROAS values disagree by design** — different attribution models, lookback windows, and de-duplication — and the *gap* is the signal (a platform claiming far more than the server confirms is over-attributing). Never present them as one number or reconcile them. A platform with spend but no reported value yields `platformRoas` absent → the card renders `noData`, which is deliberately distinct from "not applicable" (owned channels). A platform with **signups but no revenue** now still produces a row — that channel is creating accounts that haven't converted, which is exactly what the signup column exists to reveal.

### `adTotals` — all-platform Ad Spend / ROAS for the headline KPIs (2026-07-29)

`DashboardStatsService` emits `adTotals: { spend, revenue, roas, spendTrend?, roasTrend? }` — every ad channel with a spend feed, summed (Meta + TikTok today; a new `AdChannelProvider` joins automatically).

**Why it is a NEW field rather than a redefinition of `facebookAds`.** The Overview's Ad Spend / ROAS KPIs read `facebookAds` alone, which was accurate while Meta was the only channel with spend. TikTok's spend sync is live, so a Meta-only headline understates what the business actually spent. But `facebookAds` is **also read by the Norm gateway** (`/v1/dashboard/stats`), and silently widening its meaning would drift Norm's numbers with no schema change to notice (rule 10). So `facebookAds` stays Meta-only and true to its name; `adTotals` is the combined figure and the KPI cards read that.

**ROAS keeps its semantic, widens its scope.** `adTotals.roas` is *platform-reported revenue ÷ spend* — exactly what `facebookAds.roas` always meant, now across every channel. It is **not** switched to server-attributed revenue: that figure is already surfaced as the Advertising card's **Blended ROAS** and its per-platform **ROAS · server** column, and quietly changing the definition of a number the team reads daily would be worse than the scope gap it fixes. The two answer different questions and the dashboard now shows both.

**Trends compare like with like.** `spendTrend`/`roasTrend` are computed from the previous period's *all-platform* totals. Comparing an all-platform current value against a Meta-only previous value would have rendered a huge spend "increase" on the day TikTok's sync went live, when nothing about the spending changed.

**Also fixed a pre-existing mismatch:** the **New-Member ROAS** KPI divided new-membership revenue from *every* channel by *Meta-only* spend, inflating it. It now uses `adTotals.spend`.

### TikTok ad → landing-URL resolution (W2, 2026-07-29)

[`src/services/admin/tiktok/TikTokAdDestinationService.ts`](../../src/services/admin/tiktok/TikTokAdDestinationService.ts) implements the `AdDestinationResolver` seam; the shared tail (canonicalize → `unknown://` placeholder → `multiUrl` → upsert) lives once in [`src/services/analytics/adDestinationWriter.ts`](../../src/services/analytics/adDestinationWriter.ts) so Meta, TikTok and a future Snapchat do not each re-implement it.

**The id bridge is the whole trick — get it wrong and you get a silent 0%.** Reporting rows are keyed by `ad_id`; `/smart_plus/ad/get/` is keyed by `smart_plus_ad_id`. **They are different ids.** Measured live:

| join | result |
|---|---|
| reporting `ad_id` === `smart_plus_ad_id` | **0 / 31** |
| `ad_id` → (`/ad/get/`) → `smart_plus_ad_id` → (`/smart_plus/ad/get/`) → URLs | **31 / 31** |

So `/ad/get/` is a **mandatory bridge**, not a fallback — it is the only endpoint carrying both ids. Several `ad_id`s map to one `smart_plus_ad_id` (Smart+ spawns variants from one configuration); each variant correctly inherits that configuration's destinations. `/ad/get/`'s own `landing_page_url` is used as a secondary source for classic (non-Smart+) ads. **`/ad/get/` exposes no landing URL for Smart+ ads even when requested explicitly in `fields`** — that is why this indirection exists.

**Unusable URLs are rejected, not stored** (`isUsableLandingUrl`): a macro in the PATH (`/promotions/__X__`) would canonicalize into a phantom landing page carrying real spend and matching no prize slug; a non-http scheme likewise. Macros in the QUERY are harmless — canonicalization drops the query entirely, which is why TikTok's `__CAMPAIGN_ID__`/`__AID_NAME__` utm params need no special handling.

**Run it:** `npm run sync:tiktok-destinations:dry` (reports coverage, distinct landing paths, the packages-focus tally and the multi-URL count without writing), then `npm run sync:tiktok-destinations`. The run **fails below 50% coverage** — a silent drop to zero is exactly what a changed id bridge looks like, and it would otherwise present as "no TikTok URL data" rather than as an error. First live run: **31/31 ads, 100%, 3 distinct landing paths, 0 multi-URL ads.**

## Excessive-retry cooldown

`chargeWorklistItem` sits a card out for **3 days** (`EXCESSIVE_RETRY_COOLDOWN_DAYS`) after Stripe
blocks it with `previously_declined_do_not_retry`. Stripe support's guidance is 2–3 days between
retries of the same transaction; the allow list cannot override this block and no setting disables
it (see [billing-stripe/gotchas.md](../billing-stripe/gotchas.md#adaptive-acceptance-blocks-are-not-overridable-by-the-radar-allow-list)).

**Scoped to the CARD, never the customer.** `shouldCooldownForExcessiveRetry`
([chargeOrRecoverPolicy.ts](../../src/server/admin/chargeOrRecoverPolicy.ts)) is pure and compares
the blocked fingerprint against the fingerprint the invoice will actually charge. Three cases it
deliberately does **not** cool down — each one keeps collecting money that a customer-scoped check
would have frozen:

1. **Member added a new card** → different fingerprint → charged immediately.
2. **Radar-type block** (`rule` / `highest_risk_level` / `blocklist`) → allowlisting genuinely fixes
   those, so no back-off.
3. **Block aged past the window** (boundary is inclusive → retryable).

**Cost: zero extra Stripe calls.** The invoice retrieve now expands `default_payment_method` and
`customer.invoice_settings.default_payment_method`, so `resolveChargedCardFingerprint` reads the
fingerprint from objects already in hand. The block lookup is
`findLatestBlockByFingerprint` ([blockedTransactionRepo.ts](../../src/services/allowlist/blockedTransactionRepo.ts)),
one query on the existing `cardFingerprint` index, sorted by **`capturedAt`** — never `createdAt`,
which holds the PaymentIntent's creation time and can precede the block by days.

**Fails open.** Any lookup error, or a fingerprint that cannot be resolved, falls through to a
normal charge attempt — retrying once too often beats silently not collecting.

**Surfacing.** A held item writes a `skipped` row bucketed as `excessiveRetryCooldown`, labelled
**"Retry in 3 days"** in the run drawer's SKIP BREAKDOWN. The bucket exists in
`SkipBucketKey`, `ChargeJobRunSkippedBreakdown` and the drawer's client-side recompute — all three
must stay in lockstep. Regression-guarded by `npm run test:excessive-retry-cooldown`.

⚠️ **Still open:** the cooldown limits *per-invoice* velocity only. Stripe also flagged **batch**
velocity ("spread them over a longer time window rather than submitting them all at once") — the
run still fires its whole worklist in one burst. Cohorting / pacing is not implemented.

## Automated charge run (cron)

`GET /api/cron/charge-past-due` runs the same job as the admin button, on a schedule, with
**different pacing**. Opt-in: it no-ops unless `CHARGE_CRON_ENABLED=true`, so merging it changes
nothing.

**Why the pacing differs.** The admin run is human-supervised and rare, so it keeps its fast
15-parallel pacing (`DEFAULT_PACING`). The cron carries the *daily* volume, and daily volume at that
burst rate is what generates Stripe's excessive-retry blocks — Stripe support: *"too many payment
attempts were made in a short time window… spread them over a longer time window rather than
submitting them all at once."* The cron therefore runs `concurrency: 1` with
`CHARGE_CRON_DELAY_MS` (default 2000) between charges: ~20/min instead of ~196/min, ~45 min for a
~880 worklist. **Concurrency is the burst**; the delay only tunes what remains.

**Scheduling — Vercel crons are UTC only.** Sydney is UTC+10 (AEST) / UTC+11 (AEDT), so a
fixed UTC hour drifts an hour across DST. The schedule is therefore `*/5 * * * *` and the handler
resolves the **real Sydney local hour** with `date-fns-tz`. One entry, no DST maintenance, and
`CHARGE_CRON_START_HOUR` is freely configurable 0-23 (a narrower UTC window would silently make most
values unreachable for half the year). A non-integer or out-of-range value refuses loudly rather
than no-opping every day.

**Start window, not a start hour.** A run may begin at `startHour` through `startHour + 2`, so a day
whose previous run overran still gets one. The anti-double-start guard is the one-run-per-local-day
count, whose day boundary uses `fromZonedTime` — a bare `new Date("YYYY-MM-DDT00:00:00")` parses in
the SERVER timezone (UTC on Vercel) and would put the boundary hours in the future, disabling the
guard entirely.

**Orphan sweep runs FIRST, every tick.** `sweepOrphanRuns` otherwise only runs inside
`startChargePastDueJob`, which is unreachable while any run is `running` — so an admin run left
`running` by a closed browser tab would disable the cron indefinitely while every tick returned
HTTP 200. Standing down for a live admin run also `console.error`s, because a silent skip means the
day collected nothing.

**Tick model.** Vercel caps the function at 300s, so a run is never one long process. The invocation
deadline is passed **into** the chunk and enforced per item — a chunk cost is dominated by Stripe
round-trips, not by our sleep, so the caller cannot predict it up front. Every item writes its log
row before the next begins, so stopping mid-chunk is safe and fully resumable.

### Conflict rules

| Situation | Behaviour |
|---|---|
| **Admin run in progress** | Cron **skips entirely** (`admin_run_in_progress`). It never resumes or aborts a run a human started — the admin owns it. |
| **Cron's own run in progress** | Resumes it, **regardless of hour**, until drained. The start-hour gate applies only to *starting*. |
| **Admin starts one while cron runs** | Existing global `ChargeJobLock` → 409, unchanged. Admin can abort the cron run and take over. Per-user charging is **never** blocked (that route deliberately does not take the bulk lock). |
| **Member self-serves mid-run** | Already handled: `shouldSkipForNotPastDue` re-reads live status immediately before every `invoices.pay`, so they are skipped as `no_longer_past_due`. Pacing makes this *better* — more members self-resolve before the run reaches them. |
| **Two ticks overlap** | Second gets `ChargeJobLockedError` → reported as `skipped: "locked"`, retried next tick. Not an error. |
| **Double start (extra UTC tick / DST)** | Start-hour gate, plus a one-run-per-local-day count on `trigger: "cron"`. |
| **Worklist anomaly** | Above `CHARGE_CRON_MAX_WORKLIST` (3000) the run is aborted immediately and logged, rather than charging an unexpected population unattended. |

`ChargeJobRun.trigger` (`"admin"` | `"cron"`, default `"admin"`) is what lets the cron tell its own
run from a human's. Legacy rows have no value and read as `"admin"` — which is the safe default,
since the cron will not touch them.
