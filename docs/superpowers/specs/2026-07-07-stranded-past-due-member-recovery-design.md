# Stranded past-due member recovery — design spec

- **Date:** 2026-07-07
- **Branch:** `fix/stranded-past-due-member-recovery` (based on `origin/main` @ `6639146f`)
- **Status:** design approved (independent review: 8/10 — see §14), ready for implementation plan
- **Domains touched:** `billing-stripe`, `payment`, `admin`, `subscription`, `shared-ui`

---

## 1. Problem & verified root cause

A member's renewal fails, Stripe's Smart Retries eventually exhaust, and the renewal invoice becomes **"stranded"**: Stripe status stays `open` but `attempt_count >= 1` and `next_payment_attempt == null` (the Dashboard labels these **"Failed"**). `stripe.invoices.pay()` on such an invoice is rejected with *"This invoice can no longer be paid. Consider voiding, marking as uncollectible, or marking as paid out of band instead."*

Separately, on a failed renewal the app sets `pause_collection: { behavior: "keep_as_draft" }` (`pauseAfterRenewalFailure`), so the **current cycle sits as a payable `draft`** invoice.

The **admin** path already recovers correctly — `chargeOrRecover` → `chooseChargeAction` → `recoverStrandedPastDueInvoice` **voids the stranded invoice, finalizes the held cycle draft, and pays the draft** (off_session). The **member-facing** paths do **not**: they select the stranded `open` invoice and call `stripe.invoices.pay()` directly, hit the rejection, and dead-end the member at a "This bill can't be paid here / contact support" modal.

Confirmed against production Stripe for the reporting user `boss6lthsv@gmail.com` (`cus_Tjy3oROl9kVJqc`, sub `sub_1SmU8U…`, `past_due`, `pause_collection: keep_as_draft`): the endpoint targets the stranded open invoice `in_1TfE6K…` (`open`, `attempt_count 1`, `next_payment_attempt null`) while the payable current-cycle draft `in_1Tq6P5…` sits unused. This is **systemic** — any member whose retries have exhausted ("resolving after a long time") is affected.

### The exposed member pay paths
1. **`POST /api/stripe/pay-failed-invoice`** (interactive) — `pickOpenInvoiceForFailedRenewal` → stranded open → `invoices.pay()` → `invoice_not_payable` 400. *(the reported error)*
2. **`POST /api/stripe/force-charge-overdue`** (off_session; shared `forceChargeCurrentCycle`) — `pickForceChargeTarget` prefers any open → stranded → `pay_failed`.
3. **`POST /api/stripe/renew-subscription`** (`retry_payment` branch) — pays `latest_invoice` with no stranded/paused awareness (latent; UI routes `past_due` members to path 1, but the branch handles `past_due`/`unpaid` server-side).
4. **`POST /api/stripe/confirm-subscription-payment`** — **out of scope**: its `invoices.pay()` is gated on `subscription.status === "incomplete"`, which is short-circuited at route line 134 (`FIRST_CHARGE_CLIENT_ONLY`). New-signup confirmation only, not reachable by `past_due` members.

---

## 2. Goals / non-goals

**Goals**
- No member-facing pay path ever calls `stripe.invoices.pay()` on a stranded invoice again.
- A stranded member self-recovers **seamlessly** (server-only fix; existing Payment Element / off_session flows unchanged) by voiding the dead invoice and collecting on the held cycle draft.
- **Exactly one** void+finalize implementation, shared by all paths (member interactive, member off_session, admin recover).
- No double-charge, no double-grant, no skipped `pause_collection` clear or reanchor; `billing_reason` stays `subscription_cycle` so the webhook renewal pipeline runs.

**Non-goals (explicit)**
- **Bulk daily cron** (`chargePastDueJob`) stays **fail-not-recover** — a documented existing gap (`docs/billing-stripe/gotchas.md`), separate follow-up. It selects stranded invoices via the shared policy and logs them `failed`; it does not further strand the member (the draft is untouched).
- **`recoverStrandedBulk`** keeps its own multi-invoice disposal loop (different semantics: N stale opens + N superseded drafts). The "one implementation" claim is scoped to the **single-invoice** paths.
- No change to Stripe's dunning/retry configuration or the pause strategy itself — recovery, not prevention, is the correct layer.

---

## 3. Design overview

**One shared primitive** that every path routes through, and **Approach B** for selection (detect stranded at the *pay* step; never mutate the shared invoice picker).

```
member interactive  ─┐
member off_session  ─┤→ detect stranded (shared predicate) ─→ prepareRecoveredCycleInvoice ─→ { finalizedInvoice, paymentIntent }
member renew        ─┤                                          (pick draft → finalize → void)      │
admin recover       ─┘                                                                              ├─ interactive: return PI client_secret
                                                                                                    └─ off_session: pay the finalized draft
```

### Approach B — why selection is NOT hardened
`pickOpenInvoiceForFailedRenewal` (and its wrapper `selectCurrentSubscriptionChargeable`) has exactly two runtime consumers: the member interactive handler and the **admin** selection policy. The admin recover path **depends on the shared selection *returning* the stranded invoice** so `chooseChargeAction` can route it to recover; `previewUserChargePastDue` computes `willRecover` from the same selection, and Norm mirrors that value. Mutating the picker to exclude stranded invoices would (a) break the one currently-working recover path, (b) silently flip `willRecover` true→false — a **Norm value drift invisible to `tsc` and the `z.boolean()` schema** (CLAUDE.md rule 10's exact trap), and (c) drop stranded members from the bulk worklist. Therefore member paths detect stranded **at the pay step** via the single-sourced predicate; the picker is left byte-identical.

---

## 4. The shared primitive

**Home:** `src/services/subscription/prepareRecoveredCycleInvoice.ts` (service layer). It imports only **neutral** pure helpers (see §5 relocation), never `src/server/admin/*`.

**Signature**
```ts
prepareRecoveredCycleInvoice(params: {
  subscriptionId: string;
  strandedInvoice: Stripe.Invoice;        // the eligible-for-recovery original
  expectedAmountCents: number;            // single-sourced by the caller's eligibility (see §6.1)
  audit?: {                               // supplied by admin; omitted by member paths
    adminId?: string; userId: string; customerId: string; amount: number;
  };
}): Promise<
  | { ok: true; finalizedInvoice: Stripe.Invoice; paymentIntent: Stripe.PaymentIntent | null }
  | { ok: false; reason: "no_held_draft" | "draft_create_failed" | "finalize_failed"; message: string }
  // note: void is the LAST step and non-fatal (§4 step 3) — a void failure is logged, not returned
>
```

**Ordering — PICK → FINALIZE → VOID (critical correctness fix).** The current admin code voids *first*; combined with the new "void open-stranded" behavior that would risk destroying an un-rebillable cycle when no held draft exists (manual invoices are forbidden). The primitive therefore:

1. **Pick the held cycle draft** — `pickHeldDraftForRecovery(drafts, expectedAmountCents)` (byte-identical; strict newest-matching-amount). If **none → return `no_held_draft` WITHOUT voiding anything** (the member's current cycle is left intact; the caller surfaces a terminal, member-safe error). Never create a manual invoice.
2. **Finalize the draft** — `stripe.invoices.finalizeInvoice(draftId, { expand: ["payment_intent"], auto_advance: false })`. `auto_advance: false` prevents Stripe from auto-collecting during `pause_collection`, so the interactive path gets a confirmable PI. On failure → `finalize_failed`.
3. **Void the stranded original** — void when the original is recovery-eligible (`uncollectible` | `void`[skip] | **open-exhausted**), skipping if already `void`. **Best-effort / non-fatal:** if the void fails *after* the draft is finalized, **log and proceed** — the primitive still returns `ok` (the original is already un-payable; a lingering void-failed original is a monitorable cleanup task, not a payment blocker; `void_failed` is therefore never a returned reason). This is a deliberate behavior change vs today's uncollectible-only *and* abort-on-void-failure behavior — see §6.
4. **Return** `{ finalizedInvoice, paymentIntent }`. The primitive **never** pays, resumes `pause_collection`, or reanchors — those stay in the caller / the `invoice.payment_succeeded` webhook.

**Idempotency:** reuses `buildRecoveryVoidIdempotencyKey(originalId)` + `buildRecoveryFinalizeIdempotencyKey(draftId)` (relocated, see §5). A concurrent/subsequent call is safe: the finalized draft is the **newest** open invoice and is not stranded (`attempt_count 0`), so the normal (non-stranded) path returns its PI; if the original was voided it also drops out of the open set. Self-healing on re-entry even when the void failed.

**Audit:** **all** callers supply an `audit` ctx — admin with `actor: "admin"` + `adminId`, member paths with `actor: "member"` + `userId` (no `adminId`; see §6.3). The primitive always writes the recovery `InvoiceChargeLog` rows tagged `result.recovery.step` (`void`/`create`/`finalize`) with that `actor`, so the void+finalize are **audited on member paths too**, and `payOpenInvoiceAsPastDueAdmin`'s 30s debounce (which excludes `result.recovery.step` rows) does not self-skip the subsequent off_session pay. `audit` is optional only for pure unit tests.

---

## 5. Neutral-layer relocation (fixes backwards dependency)

Move these **pure** helpers out of `src/server/admin/recoverStrandedPastDuePolicy.ts` into a neutral module **`src/utils/payment/recovery/stranded-invoice-policy.ts`** (pure move + import updates only):

- `isOriginalInvoiceEligibleForRecovery` (the single-sourced "stranded" predicate)
- `pickHeldDraftForRecovery`
- `buildRecovery{Void,Finalize,Create,Item}IdempotencyKey`

**Keep in admin** (admin-specific, depends on `past-due-charge-idempotency`): `hasRecentRecoveryAttempt` and its `cutoffForRecentAttempt` import — this avoids dragging the idempotency constants into the neutral layer (the review watch-item). Member paths use the new `RecoveryClaim` lock (§6.3), not the admin 6h recovery lock.

Import-update consumers: `chargeOrRecoverPolicy`, `recoverStrandedBulkPolicy`, `recoverStrandedBulk`, `recoverStrandedPastDue`, `forceChargePastDuePolicy` (new consumer), the new primitive, and the relocated policy tests.

---

## 6. Money-path safeguards (the pinned decisions)

### 6.1 Single-source the expected amount from the LIVE subscription price
The mismatch after a tier change/coupon is fixed **at the derivation point, not in the picker.** Change `checkRecoveryEligibility` (`recoverStrandedPastDue.ts` ~line 115) and any peer that derives `expectedAmountCents` for recovery to read the **live Stripe subscription price**:

```
expectedAmountCents = subscription.items.data[0].price.unit_amount   // authoritative per-cycle amount
  ?? Math.round(getPackageById(user.subscription.packageId).price * 100)   // fallback when unit_amount is null (tiered/metered — not used today, but guarded)
```

This also removes the `package_not_found`/stale-price gate as a false blocker for tier-changed members. The picker stays strict-match; the primitive consumes the correct amount. Coupon/proration residual (draft amount ≠ sub price) → `no_held_draft` → terminal support (rare, documented).

### 6.2 Void behavior change (open-stranded)
The primitive voids open-stranded invoices (§4 step 3), not only `uncollectible`. This closes the "two live invoices per cycle → future double-charge surface." It changes admin recover behavior too (intended improvement) — the admin path now genuinely voids the stranded original instead of writing a misleading "Voided" row. Documented in `docs/admin/gotchas.md`.

### 6.3 Serialization — `RecoveryClaim` per-subscription lock + audit actor
- **New `RecoveryClaim` collection** (dedicated model, **not** the global `ChargeJobLock` singleton): `_id: "recover:<subscriptionId>"`, `claimedAt`, `claimedBy` (path label), with a **TTL index (~2 min)** for crash-release. Acquired via `findOneAndUpdate` upsert-if-absent at the **start of every recovery entry** — member pay-failed-invoice, member force-charge, member renew, admin recover, admin charge, and `switch-tier-past-due` teardown — released in `finally`. Wraps the void→finalize critical section (interactive) or void→finalize→pay (off_session). Prevents concurrent clicks / cross-tool from finalizing+paying two different drafts.
- **Stamp `result.subscriptionId`** on recover success (member + admin) so the Force-Charge 24h success lock (`hasRecentSuccessfulChargeOnSubscription`) blocks a subsequent charge on the same sub — closing the async reanchor-webhook race window the `period_already_paid` guard alone cannot.
- **Audit actor:** add `actor: "admin" | "member" | "system"` to `InvoiceChargeLog`; make `adminId` **optional** when `actor !== "admin"`. Member recovery rows are written with `actor: "member"` + `userId` (no more silent money-path mutation). Readers already tolerate missing `adminId` (`adminLabel()` → "(unknown admin)"). ~10 writer sites updated; Norm does not expose `adminId`.

### 6.4 Finalize auto-pay
Finalize with `auto_advance: false` (§4 step 2). Defensively handle a PI that comes back `succeeded`/`processing` (Stripe collected during finalize despite the flag): the interactive path treats it as **paid-success** (return success, let the webhook grant); the off_session path relies on `payOpenInvoiceAsPastDueAdmin`'s existing already-paid catch. Validated by the existing admin finalize-then-pay flow.

### 6.5 Verified-safe invariants (no action, recorded)
- `invoice.voided` has **no** webhook handler case → voiding never cancels/downgrades the subscription.
- Recovered draft's `invoice.payment_succeeded` clears `pause_collection` (`resumeAfterSuccessfulRenewalPayment`) and reanchors (`reanchorAfterPastDueRecovery`) via the existing webhook — the primitive deliberately does neither.
- `renew-subscription`'s `requiresPaymentConfirmation` is confirmed **client-side** via `StripePaymentModal` → `stripe.confirmPayment({ clientSecret })`, bypassing `confirm-subscription-payment`'s metadata guard → returning a finalized-draft PI is safe.

---

## 7. Path-by-path changes

### 7.1 `pay-failed-invoice` (interactive)
After the already-paid check (route ~line 102), before the PI-extraction block: if `isOriginalInvoiceEligibleForRecovery(invoiceData.invoice).eligible` → acquire `RecoveryClaim` → `prepareRecoveredCycleInvoice(...)` → on `ok`, run the existing final guards (`isPaymentIntentClientConfirmable`) and **return the existing `requiresPaymentConfirmation` shape** with `data.invoiceId = finalizedInvoice.id` and `data.paymentIntent` = the finalized draft's PI (**guarded early return** — must not fall through into the tail's `invoices.pay()` on the now-voided original). On `no_held_draft`/failure → terminal `invoice_not_payable` + support copy. **Non-stranded path byte-identical.**

### 7.2 `force-charge-overdue` (off_session) + shared `forceChargeCurrentCycle`
`pickForceChargeTarget` gains a `kind: "stranded"` discriminator: partition open candidates via `isOriginalInvoiceEligibleForRecovery` — a *live* open stays `kind:"open"` (direct pay), a *stranded* open becomes `kind:"stranded"`, prefer a live open over a stranded one when both exist, else the existing draft branch, else null. `forceChargeCurrentCycle` handles `stranded` → acquire `RecoveryClaim` → `prepareRecoveredCycleInvoice` → **off_session pay the finalized DRAFT** via `payOpenInvoiceAsPastDueAdmin`, **re-anchoring the pay key / per-path budget / TOCTOU recheck / `result.subscriptionId` stamp on the finalized-draft id**, and keeping the **per-attempt** `buildForceChargeIdempotencyKey` (NOT the stable admin-recovery key — a stable key is replayed by Stripe for 24h and re-collects $0, the 2026-06-29 incident class). Add `no_held_draft` (+ `draft_create_failed`) to `ForceChargeResultReason` **and both routes' exhaustive `statusByReason` Records** (`no_held_draft → 409`, `draft_create_failed → 502`); `finalize_failed`/`pay_failed` already exist, and void is non-fatal so `void_failed` is never surfaced here. Admin Force-Charge on a stranded open thereby goes fail→recover (intended, documented).

### 7.3 `renew-subscription` (`retry_payment`, interactive)
When `existingSubscription.status` is `past_due`/`unpaid` and the target is stranded/paused → acquire `RecoveryClaim` → `prepareRecoveredCycleInvoice` → return the finalized draft's PI via its existing `requiresPaymentConfirmation` shape (`StripePaymentModal` confirms client-side). Non-stranded reactivate/create paths unchanged.

### 7.4 admin `recoverStrandedPastDueInvoice`
Refactor to call `prepareRecoveredCycleInvoice` (extract the void/find-draft/finalize block, now reordered to pick→finalize→void) with the admin `audit` ctx so the recovery `InvoiceChargeLog` rows are written identically. Eligibility/reload/pay/pause-resume-via-pay stay. **`RecoverStrandedResult.reason` union is frozen** (downstream exhaustive `Record`s/`switch`es depend on it). The only intended behavior deltas: void-open-stranded (§6.2), pick-before-void ordering, non-fatal void (a void failure now logs-and-proceeds instead of returning `void_failed`; the frozen union still *lists* `void_failed` for compat but the refactored path no longer produces it), `auto_advance:false`, and live-price amount (§6.1).

### 7.5 Selection layer (unchanged — Approach B)
`pickOpenInvoiceForFailedRenewal` and `selectCurrentSubscriptionChargeable` are **not** modified. Regression tests assert they still return the stranded invoice (admin `willRecover` + Norm depend on it).

---

## 8. Frontend (server-only fix)

No strictly-required client change — the existing `requiresPaymentConfirmation` path in `usePastDueResolve` (and `renew-subscription`'s `StripePaymentModal`) confirms the finalized-draft PI identically to a normal open-invoice PI. **Optional cleanup (follow-up, not required):** the now-unreachable "Pay overdue amount" band-aid (`isNoPayableInvoice` / `handlePayOverdue`) and the terminal dead-end; **keep the terminal modal as a defensive fallback** for genuinely irrecoverable states (`no_held_draft`). If cleaned, `RenewalFailedModal/index.tsx` **and** `PastDueResolvePanel.tsx` must change in lockstep (the band-aid/terminal JSX is duplicated). Verify both the modal and the higher-traffic dashboard `PaymentSheet` surface after the server fix.

---

## 9. Component touch inventory

| File | Change |
|---|---|
| `src/services/subscription/prepareRecoveredCycleInvoice.ts` | **new** — the shared primitive |
| `src/utils/payment/recovery/stranded-invoice-policy.ts` | **new (relocated)** — pure predicate + draft picker + recovery idempotency-key builders |
| `src/server/admin/recoverStrandedPastDuePolicy.ts` | remove relocated pure helpers (re-export or update imports); keep `hasRecentRecoveryAttempt` |
| `src/models/RecoveryClaim.ts` | **new** — per-subscription recovery lock (TTL index) |
| `src/models/InvoiceChargeLog.ts` | add `actor`; make `adminId` optional when `actor≠admin` |
| `src/app/api/stripe/pay-failed-invoice/route.ts` | stranded early-branch → prepare → `requiresPaymentConfirmation` |
| `src/app/api/stripe/force-charge-overdue/route.ts` | add `void_failed`/`no_held_draft` to `statusByReason` |
| `src/app/api/admin/users/[id]/force-charge/route.ts` | same `statusByReason` additions |
| `src/app/api/stripe/renew-subscription/route.ts` | `retry_payment` stranded/paused-aware via prepare |
| `src/server/admin/forceChargePastDuePolicy.ts` | `pickForceChargeTarget` gains `kind:"stranded"` |
| `src/server/admin/forceChargePastDue.ts` | handle `stranded`; re-anchor pay-key/budget/stamp on draft id; new reasons |
| `src/server/admin/recoverStrandedPastDue.ts` | call prepare; live-price amount; frozen reason union |
| `src/server/admin/chargePastDueShared.ts` | writer sites tolerate optional `adminId` + `actor` |
| `src/server/admin/chargePastDueJob.ts` | writer sites `adminId`/`actor` (behavior unchanged) |
| Consumers of relocated helpers | `chargeOrRecoverPolicy`, `recoverStrandedBulkPolicy`, `recoverStrandedBulk` — import path updates |
| `src/components/modals/RenewalFailedModal/*` + `PastDueResolvePanel.tsx` | **optional** band-aid/terminal cleanup (lockstep) |

---

## 10. Tests

- **New** `src/services/subscription/__tests__/prepareRecoveredCycleInvoice.test.ts` (+ `test:prepare-recovered-cycle` in `package.json`): pick→finalize→void ordering; `no_held_draft` returns **without** voiding; audit rows only when `audit` supplied; live-price amount source.
- `forceChargePastDuePolicy.test.ts`: stranded open → `kind:"stranded"`; live open still `kind:"open"`; live preferred over stranded; existing cases stay green.
- `recoverStrandedPastDuePolicy.test.ts` (relocated): predicate + draft picker + key builders unchanged.
- `chargePastDueSelectionPolicy.test.ts` + `failed-invoice-pause-selection.test.ts`: **regression** — the shared picker still returns the stranded invoice (Approach B guard).
- `pastDueChargeIdempotencyKeys.test.ts`: extend `testSchemesNeverCollide` if a new key is introduced.
- **New** `InvoiceChargeLog` optional-`adminId`/`actor` unit test.
- Manual tsx smokes (seed via `scripts/seed-past-due-member.ts`): member interactive + off_session recovery end-to-end; assert response carries the **finalized-draft** id + confirmable PI and `billing_reason` stays `subscription_cycle`.

---

## 11. Docs / Norm / manifest / business

- **Hook-enforced** (`docs/<domain>/`): `docs/admin/` (backend + gotchas + api), `docs/payment/` (backend + gotchas), `docs/billing-stripe/` (api + backend + gotchas).
- **Top-level:** `docs/FAILED_RENEWAL_PAY_NOW.md` (correct the blanket "never finalize an invoice" — stranded path finalizes a Stripe-created held draft; `billing_reason` stays `subscription_cycle`); `docs/CHARGE_PAST_DUE_CUSTOMERS.md`, `docs/STRIPE_COLLECTION_PAUSE_RECOVERY.md`, `docs/PAST_DUE_REANCHOR.md` (member paths now share the primitive; reanchor unchanged).
- **BUSINESS.md §9** (CLAUDE.md rule 5 judgment — not hook-blocked because no `BUSINESS_TRIGGER_GLOBS` file is touched): member Pay-Now / Force-Charge now self-recover stranded "Failed"-labeled invoices.
- **Norm:** response **shapes unchanged**; `checkRecoveryEligibility`'s `{ ok | reason | message }` untouched; member routes aren't Norm-mirrored. **No** classification/schema/manifest edit — **but run `npm run norm:smoke`** after the service refactor to confirm no `willRecover` value drift (Approach B keeps it value-stable). Add a lockstep note to `docs/internal-norm/norm-context.md` only if wording drifts.
- **Manifest:** all new files land under existing domain globs (`src/services/subscription/**`→subscription, `src/utils/payment/**`→payment, `src/models/**` per file, `src/server/admin/**`→admin). Add `src/models/RecoveryClaim.ts` to the admin (or subscription) domain `paths`.

---

## 12. Key edge cases → handling

| Case | Handling |
|---|---|
| No held draft (pause never held one / coupon-amount mismatch) | `no_held_draft` **before any void**; terminal member-safe error; never create a manual invoice |
| Concurrent member clicks | `RecoveryClaim` lock serializes void→finalize; post-finalize re-entry self-heals (picker sees non-stranded finalized draft) |
| Cross-tool (admin Charge vs Force Charge) | `RecoveryClaim` lock + `result.subscriptionId` stamp arming the 24h success lock |
| Tier change / upgrade | live-price `expectedAmountCents` matches Stripe's held-draft amount |
| Finalize auto-collected the draft | `auto_advance:false` + defensive paid-success handling |
| `unpaid` vs `past_due` | prepare imposes no `past_due`-only gate; interactive route already accepts both |
| Voiding emits `invoice.voided` | no handler case → no cancel/downgrade (verified) |
| `switch-tier-past-due` teardown racing recovery | covered by the `RecoveryClaim` lock |

---

## 13. Rollout / verification

Commits are the rollback unit (no feature flag — no production-rollout risk named). Verify on staging (this branch) against a seeded stranded past-due member across all three member paths + admin recover; confirm `npm run type-check`, `npm run lint`, the scoped `test:*` suites, and `npm run norm:smoke` are green before merge. The reporting user `boss6lthsv@gmail.com` can be recovered via the admin tool immediately (independent of this code change) if needed.

---

## 14. Independent review record

Adversarial staff-engineer review (fresh context, verified claims against the code):

- v1: **6/10** — flagged void-before-pick, byte-identical↔soften contradiction, member audit blackout, backwards layering, per-caller amount.
- v2 (this spec): **8/10** — best-practice 8, scalability 9, maintainability 8, clarity 8. All five defects resolved; load-bearing mechanics verified (debounce-exclusion survives reorder, `invoice.voided` no-op, client-side `confirmPayment` bypass, live-price source, `auto_advance:false`). Remaining points are the four details pinned in §6 (amount source location, `RecoveryClaim` concreteness, void-failure semantics, `recovery.step` tagging) — all specified here.
