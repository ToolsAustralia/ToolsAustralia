# Stranded past-due member recovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, recommended for this money-path change) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a past-due member self-recover a "stranded" (open-but-retry-exhausted) renewal invoice by voiding it and collecting on the held cycle draft — via one shared primitive used by all member + admin pay paths.

**Architecture:** One primitive `prepareRecoveredCycleInvoice` (pick held draft → finalize → void, non-fatal). Approach B: detect stranded at the *pay* step; never mutate the shared invoice picker. See the spec: [docs/superpowers/specs/2026-07-07-stranded-past-due-member-recovery-design.md](../specs/2026-07-07-stranded-past-due-member-recovery-design.md) — sections referenced as `spec §N`.

**Tech stack:** Next.js 15 / Stripe (Basil API) / Mongoose / tsx test scripts (no jest). Test = `npm run test:<scope>`.

## Global Constraints (apply to every task)

- **COMMITS ARE GATED.** Do NOT run `git commit`/`git add`/`git push` until the user explicitly authorizes (CLAUDE.md rule 1). The `git add`/`commit` steps below are the *intended* boundaries; pause at each and ask.
- **Never create a manual Stripe invoice** — `billing_reason` must stay `subscription_cycle` or the webhook renewal pipeline + reanchor are skipped. Only ever finalize a Stripe-created held draft.
- **Approach B:** never change the behavior/shape of `pickOpenInvoiceForFailedRenewal` or `selectCurrentSubscriptionChargeable` (admin `willRecover` + Norm depend on them returning the stranded invoice).
- **`RecoverStrandedResult.reason` union is frozen** — never remove/rename a member (superset is fine).
- Before each work session: `git fetch origin && git merge --ff-only origin/main` on this branch.
- After any service/model change: `npm run type-check`, `npm run lint`, the scoped `test:*`, and (after admin/service refactors) `npm run norm:smoke`.
- doc-sync Stop hook: editing `src/utils/payment/**`→`docs/payment/`, `src/server/admin/**` & `src/services/admin/**`→`docs/admin/`, `src/app/api/stripe/**`→`docs/billing-stripe/` in the SAME task.

---

## Phase 1 — Foundations (pure helpers + models)

### Task 1.1: Relocate pure recovery helpers to a neutral module

**Files:**
- Create: `src/utils/payment/recovery/stranded-invoice-policy.ts`
- Modify: `src/server/admin/recoverStrandedPastDuePolicy.ts` (re-export from new location; keep `hasRecentRecoveryAttempt`)
- Modify imports: `src/server/admin/chargeOrRecoverPolicy.ts`, `recoverStrandedBulkPolicy.ts`, `recoverStrandedBulk.ts`, `recoverStrandedPastDue.ts`, `forceChargePastDuePolicy.ts`
- Test: `src/utils/payment/recovery/__tests__/stranded-invoice-policy.test.ts` (move from `src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts`)

**Produces:** `isOriginalInvoiceEligibleForRecovery`, `pickHeldDraftForRecovery`, `buildRecovery{Void,Finalize,Create,Item}IdempotencyKey` from the neutral path.

- [ ] **Step 1** Move the four pure exports verbatim into the new file. Leave `hasRecentRecoveryAttempt` + its `cutoffForRecentAttempt` import in `recoverStrandedPastDuePolicy.ts`; have that file `export { ... } from "@/utils/payment/recovery/stranded-invoice-policy"` for backward-compat so admin importers keep working.
- [ ] **Step 2** Point `forceChargePastDuePolicy.ts` (new consumer) and the primitive at the neutral module.
- [ ] **Step 3** Move the policy test to the new `__tests__` dir; add `test:stranded-invoice-policy` to `package.json` (keep the old `test:recover-stranded-past-due-policy` script pointing at whatever remains, or repoint it).
- [ ] **Step 4** Run: `npm run test:stranded-invoice-policy` and `npm run type-check`. Expected: PASS, no unresolved imports.
- [ ] **Step 5** Update `docs/payment/` + `docs/admin/` (the helpers moved domains). Commit (gated).

### Task 1.2: `InvoiceChargeLog` gains `actor`; `adminId` optional for non-admin

**Files:**
- Modify: `src/models/InvoiceChargeLog.ts` (add `actor: 'admin'|'member'|'system'`; `adminId` `required` only when `actor==='admin'`)
- Modify writers (pass `actor`): `src/server/admin/chargePastDueShared.ts`, `forceChargePastDue.ts`, `recoverStrandedPastDue.ts`, `chargePastDueJob.ts`
- Test: `src/models/__tests__/invoice-charge-log-actor.test.ts`

**Produces:** an `InvoiceChargeLog` that accepts member-actor rows without an `adminId`.

- [ ] **Step 1** Write failing test: creating a doc with `actor:'member'`, `userId`, no `adminId` validates; `actor:'admin'` without `adminId` fails.
- [ ] **Step 2** Run: `npm run test:invoice-charge-log-actor` → FAIL (schema rejects missing adminId).
- [ ] **Step 3** Implement the conditional-required `adminId` + `actor` enum (default `'admin'` for back-compat at existing call sites until they pass it).
- [ ] **Step 4** Update existing writers to pass `actor:'admin'` explicitly (behavior-preserving). Confirm readers (`adminLabel()`, `buildManualRetriesFilter`) already tolerate missing adminId.
- [ ] **Step 5** Run the test + `test:past-due-admin-charge` + `type-check`. Expected PASS. Update `docs/admin/`. Commit (gated).

### Task 1.3: `RecoveryClaim` per-subscription lock model

**Files:**
- Create: `src/models/RecoveryClaim.ts` (`_id: "recover:<subscriptionId>"`, `claimedAt`, `claimedBy`, TTL index ~120s)
- Create: `src/utils/payment/recovery/recovery-claim.ts` (`acquireRecoveryClaim(subscriptionId, by): Promise<boolean>`, `releaseRecoveryClaim(subscriptionId)`)
- Test: `src/utils/payment/recovery/__tests__/recovery-claim.test.ts`

**Produces:** `acquireRecoveryClaim`, `releaseRecoveryClaim`.

- [ ] **Step 1** Failing test (pure-ish): second `acquireRecoveryClaim` for the same sub returns `false` while held; returns `true` after release. (Use a mongodb-memory harness OR gate this as a manual/integration test if none exists — check how `src/lib/__tests__` handles Mongo.)
- [ ] **Step 2** Implement via `findOneAndUpdate({_id, claimedAt<cutoff|null}, {$set}, {upsert, new})` returning whether we won the claim; TTL index for crash-release.
- [ ] **Step 3** Run the test + `type-check`. Add `test:recovery-claim`. Commit (gated).

### Task 1.4: Live-price `expectedAmountCents` in `checkRecoveryEligibility`

**Files:**
- Modify: `src/server/admin/recoverStrandedPastDue.ts` (`checkRecoveryEligibility`, ~line 115)
- Test: extend `src/server/admin/__tests__/*` or a small pure helper test

- [ ] **Step 1** Extract a pure `deriveExpectedCycleAmountCents(subscription, packageFallback)` → `subscription.items.data[0].price.unit_amount ?? Math.round(pkg.price*100)`. Failing unit test for both branches + `unit_amount===null` fallback.
- [ ] **Step 2** Wire it into `checkRecoveryEligibility`; the `package_not_found` gate stays only as the *fallback* path (not the primary blocker).
- [ ] **Step 3** Run: `npm run type-check` + the new test + `test:past-due-admin-charge`. Commit (gated).

---

## Phase 2 — The shared primitive

### Task 2.1: `prepareRecoveredCycleInvoice`

**Files:**
- Create: `src/services/subscription/prepareRecoveredCycleInvoice.ts`
- Test: `src/services/subscription/__tests__/prepareRecoveredCycleInvoice.test.ts`

**Consumes:** `isOriginalInvoiceEligibleForRecovery`, `pickHeldDraftForRecovery`, `buildRecovery*` keys (Task 1.1); `acquireRecoveryClaim`/`releaseRecoveryClaim` (1.3); `InvoiceChargeLog` actor (1.2).

**Produces:** `prepareRecoveredCycleInvoice(params) -> { ok:true, finalizedInvoice, paymentIntent } | { ok:false, reason:'no_held_draft'|'draft_create_failed'|'finalize_failed', message }` — ordering **pick → finalize(auto_advance:false) → void(non-fatal)**, audit rows tagged `result.recovery.step` when `audit` supplied, per spec §4/§6.

- [ ] **Step 1** Failing **pure-decision** test (inject a fake Stripe surface like `recoverStrandedBulk.test.ts` does): (a) no matching held draft → returns `no_held_draft` and **voidInvoice was NOT called**; (b) draft found → finalize called with `auto_advance:false`, then void called; (c) void throws → still returns `ok` (non-fatal); (d) audit ctx omitted → no `InvoiceChargeLog.create`; supplied → rows created with `actor`.
- [ ] **Step 2** Run: `npm run test:prepare-recovered-cycle` → FAIL (module missing). Add the `test:*` entry.
- [ ] **Step 3** Implement per spec §4 (pick-first ordering; `auto_advance:false`; non-fatal void; `result.recovery.step` tags; NO pay/resume/reanchor).
- [ ] **Step 4** Run the test → PASS. `npm run type-check`.
- [ ] **Step 5** Manual smoke: extend/param `scripts/test-recover-stranded-past-due.ts` to call the primitive against a test-mode stranded invoice; confirm the finalized invoice keeps `billing_reason: subscription_cycle` and a confirmable PI is returned. Update `docs/subscription/` + `docs/billing-stripe/`. Commit (gated).

---

## Phase 3 — Admin refactor (prove byte-identical + intended deltas)

### Task 3.1: `recoverStrandedPastDueInvoice` calls the primitive

**Files:**
- Modify: `src/server/admin/recoverStrandedPastDue.ts` (replace the inline void/find-draft/finalize block, lines ~249–361, with a `prepareRecoveredCycleInvoice` call passing the admin audit ctx; keep eligibility/reload/pay/`buildAdminChargeIdempotencyKey`)
- Test: existing `test:recover-stranded-past-due-policy` (green) + manual `scripts/test-recover-stranded-past-due.ts`

**Consumes:** `prepareRecoveredCycleInvoice` (2.1).

- [ ] **Step 1** Map prepare's failure reasons 1:1 back onto the existing `RecoverStrandedResult` reasons (`no_held_draft`/`draft_create_failed`/`finalize_failed`); union unchanged (still lists `void_failed`, now unreached).
- [ ] **Step 2** Keep the pay step + pause-resume (inside `payOpenInvoiceAsPastDueAdmin`) after prepare; `newInvoiceId = finalizedInvoice.id`.
- [ ] **Step 3** Run: `npm run test:recover-stranded-past-due-policy`, `test:charge-or-recover-policy`, `test:past-due-idempotency-keys` → PASS. Manual smoke against a real test-mode stranded sub: assert same audit-row shapes + `result.subscriptionId` stamp on success.
- [ ] **Step 4** `npm run type-check` + `npm run norm:smoke` (checkRecoveryEligibility shape unchanged → PASS). Update `docs/admin/` (extraction + void-open-stranded + non-fatal void gotchas). Commit (gated).

---

## Phase 4 — Member pay paths

### Task 4.1: `pay-failed-invoice` interactive stranded branch

**Files:**
- Modify: `src/app/api/stripe/pay-failed-invoice/route.ts` (insert after the already-paid check ~line 102, before PI-extraction)

**Consumes:** `isOriginalInvoiceEligibleForRecovery`, `prepareRecoveredCycleInvoice`, `acquireRecoveryClaim`.

- [ ] **Step 1** Add guarded early branch: if `isOriginalInvoiceEligibleForRecovery(invoiceData.invoice).eligible` → acquire claim → `prepareRecoveredCycleInvoice({subscriptionId, strandedInvoice, expectedAmountCents, audit:{actor:'member',userId,customerId,amount}})` → on `ok`, `isPaymentIntentClientConfirmable(paymentIntent)` then RETURN the existing `requiresPaymentConfirmation` shape with `data.invoiceId=finalizedInvoice.id`, `data.paymentIntent=<finalized PI>`; on failure → terminal `invoice_not_payable` + support `details`. Release claim in `finally`. MUST return directly (no fall-through).
- [ ] **Step 2** Verify non-stranded path untouched (still-retrying open / draft → branch skipped).
- [ ] **Step 3** Manual smoke: seed a stranded member (`scripts/seed-past-due-member.ts`), POST the route, assert `requiresPaymentConfirmation` + finalized-draft id + confirmable PI. `type-check` + `lint`. Update `docs/billing-stripe/` + `docs/payment/`. Commit (gated).

### Task 4.2: `force-charge` stranded recovery (off_session)

**Files:**
- Modify: `src/server/admin/forceChargePastDuePolicy.ts` (`pickForceChargeTarget` → `kind:'stranded'`)
- Modify: `src/server/admin/forceChargePastDue.ts` (`forceChargeCurrentCycle` handles `stranded` via prepare; re-anchor pay-key/budget/stamp on the finalized-draft id; keep per-attempt `buildForceChargeIdempotencyKey`)
- Modify: `src/app/api/stripe/force-charge-overdue/route.ts` + `src/app/api/admin/users/[id]/force-charge/route.ts` (`statusByReason`: `no_held_draft→409`, `draft_create_failed→502`)
- Test: `src/server/admin/__tests__/forceChargePastDuePolicy.test.ts`

- [ ] **Step 1** Failing tests for `pickForceChargeTarget`: stranded open → `kind:'stranded'`; live open (next_payment_attempt set) → `kind:'open'`; live preferred over stranded; existing cases stay green (their fixtures are `attempt_count 0` → live).
- [ ] **Step 2** Implement `kind:'stranded'` (partition opens via `isOriginalInvoiceEligibleForRecovery`).
- [ ] **Step 3** In `forceChargeCurrentCycle`: on `stranded` → acquire claim → `prepareRecoveredCycleInvoice` (audit actor by `triggeredBy`) → off_session pay the **finalized draft** with per-attempt key anchored on the draft id; stamp `result.subscriptionId`. Add reasons to both routes' Records.
- [ ] **Step 4** Run `npm run test:force-charge-policy` → PASS; `type-check`. Manual smoke: force-charge a seeded stranded member → recovers. Update `docs/admin/`. Commit (gated).

### Task 4.3: `renew-subscription` retry_payment stranded-aware

**Files:**
- Modify: `src/app/api/stripe/renew-subscription/route.ts` (retry_payment branch ~line 212–239)

- [ ] **Step 1** Before `stripe.invoices.pay(latestInvoice)`: if the sub is `past_due`/`unpaid` and the recovery target is stranded (or `latest_invoice` is the held draft under pause), acquire claim → `prepareRecoveredCycleInvoice` → return the finalized draft PI via the existing `requiresPaymentConfirmation` shape (StripePaymentModal confirms client-side — spec §6.5). Non-stranded reactivate/create unchanged.
- [ ] **Step 2** Manual smoke against a seeded stranded member hitting renew. `type-check` + `lint`. Update `docs/billing-stripe/`. Commit (gated).

---

## Phase 5 — Regression + safety nets

### Task 5.1: Selection & idempotency regression

**Files/Tests:**
- `src/utils/payment/__tests__/failed-invoice-pause-selection.test.ts` — assert `pickOpenInvoiceForFailedRenewal` STILL returns a stranded open (Approach B guard).
- `src/server/admin/__tests__/chargePastDueSelectionPolicy.test.ts` — assert `selectCurrentSubscriptionChargeable` STILL returns the stranded invoice as `target`.
- `src/server/admin/__tests__/pastDueChargeIdempotencyKeys.test.ts` — extend `testSchemesNeverCollide` if any new key was introduced.

- [ ] **Step 1** Add the regression cases; run `test:stripe-collection-pause`, `test:past-due-admin-charge`, `test:past-due-idempotency-keys` → PASS.
- [ ] **Step 2** Full gate: `npm run type-check` + `npm run lint` + `npm run norm:smoke`. Commit (gated).

---

## Phase 6 — Docs / Norm / business / manifest

### Task 6.1: Domain + top-level docs

**Files:** `docs/admin/{backend,gotchas,api}.md`, `docs/payment/{backend,gotchas}.md`, `docs/billing-stripe/{api,backend,gotchas}.md`, `docs/FAILED_RENEWAL_PAY_NOW.md`, `docs/CHARGE_PAST_DUE_CUSTOMERS.md`, `docs/STRIPE_COLLECTION_PAUSE_RECOVERY.md`, `docs/PAST_DUE_REANCHOR.md`.

- [ ] **Step 1** Apply the edits enumerated in spec §11 (esp. correcting the "never finalize" invariant in `FAILED_RENEWAL_PAY_NOW.md`; the shared-picker-must-not-be-hardened gotcha; the id-anchoring gotcha).
- [ ] **Step 2** Verify the doc-sync Stop hook is satisfied for all touched source domains.

### Task 6.2: BUSINESS + manifest

**Files:** `BUSINESS.md` (§9), `CLAUDE.md` Domain Manifest.

- [ ] **Step 1** BUSINESS.md §9: member Pay-Now / Force-Charge now self-recover stranded "Failed" invoices.
- [ ] **Step 2** Add `src/models/RecoveryClaim.ts` to the appropriate domain `paths` (admin or subscription). Add new `test:*` entries confirmation.
- [ ] **Step 3** Final: `npm run type-check`, `npm run lint`, all touched `test:*`, `npm run norm:smoke`, `npm run build` (turbopack manifest). Commit (gated).

---

## Self-review (done)

- **Spec coverage:** §4 primitive→T2.1; §5 relocation→T1.1; §6.1 amount→T1.4; §6.2 void→T2.1/T3.1; §6.3 lock+actor→T1.2/1.3+all paths; §6.4 auto_advance→T2.1; §7.1–7.4 paths→T4.1/4.2/4.3/T3.1; §7.5 Approach B guards→T5.1; §8 frontend→server-only (no required task; optional cleanup out of this plan); §9 inventory→covered; §10 tests→per task; §11 docs/Norm→T6; §12 edge cases→T2.1 tests. No gaps.
- **Placeholders:** none (steps reference concrete files/functions/commands).
- **Type consistency:** primitive signature + reason set consistent between T2.1, T3.1, T4.x.
