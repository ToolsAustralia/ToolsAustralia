# Charge Lock Rate-Limit Tuning — Design

**Status:** Draft for review
**Date:** 2026-05-06
**Scope:** Loosen the existing 24h-per-invoice charge lock to a 6h window with per-path attempt budgets. Adds a 30-second debounce. Applies to admin past-due tools and the user self-serve overdue path.

## Problem

The current invoice-level lock in [`payOpenInvoiceAsPastDueAdmin`](../../src/server/admin/chargePastDueShared.ts) blocks any attempt within 24h of the most recent attempt. This is over-protective in two real scenarios:

1. **Customer just updated their card and admin/user wants to verify recovery** — has to wait 24h before the system will even attempt a charge.
2. **Network glitch or intermittent failure** — a single failed attempt locks out legitimate retries until tomorrow.

Tyler Johnson's recent live test surfaced this: the orchestrator was blocked by the 24h lock from a prior run, despite there being a real reason to retry within the same day.

## Goal

Replace the current 1-per-24h lock with a window-based budget model that:
- Allows quick retries when humans actively engage (admin Force Charge or user self-serve)
- Preserves conservative-by-default protection for batch operations (bulk past-due charger, regular per-user admin retry)
- Caps per-window retries to bounded, real-world recovery scenarios
- Adds spam-click protection (30-second debounce)
- Never silently lies about charging — every "real attempt" results in an actual Stripe call

## Non-goals

- Removing the lock entirely.
- Daily caps. The 6h-window budget self-limits worst-case attempts to 4× per day per path, which is bounded enough.
- Decline-result short-circuit (V2 candidate — block further attempts in window if the last 2 had the same `errorCode`). Skipping for V1.
- Touching the user-facing dashboard's attempt limits (the modal already gates by user click, so the back-end limit is sufficient).

## Approach

### Window + attempt budget per path

| Path | Window | Max attempts per window | Idempotency key strategy |
|---|---|---|---|
| Bulk past-due charger | 6h | 1 | Static: `admin-charge-${invoiceId}` (same as today) |
| Per-user admin retry (regular `ChargePastDueUserModal` Confirm Charge) | 6h | 1 | Static: `admin-charge-${invoiceId}` |
| Admin Force Charge | 6h | 3 | Per-attempt: `admin-charge-${invoiceId}-fc-admin-${attemptN}` |
| User self-serve (Pay overdue amount in `RenewalFailedModal`) | 6h | 3 | Per-attempt: `admin-charge-${invoiceId}-fc-user-${attemptN}` |

### Lock semantics

Three distinct count queries on `InvoiceChargeLog`, all bounded by `attemptedAt: { $gte: cutoff(6h) }`:

1. **For bulk/regular per-user admin retry**: block if **ANY** attempt within 6h.
   `findOne({ invoiceId, attemptedAt: { $gte: cutoff } })`

2. **For admin Force Charge**: block if **3+ admin Force Charge attempts** within 6h.
   `countDocuments({ invoiceId, attemptedAt: { $gte: cutoff }, "result.forceCharge.triggeredBy": "admin" }) >= 3`

3. **For user self-serve**: block if **3+ user-triggered attempts** within 6h.
   `countDocuments({ invoiceId, attemptedAt: { $gte: cutoff }, "result.forceCharge.triggeredBy": "user" }) >= 3`

The asymmetry is intentional: bulk and regular admin retry are batch operations where mass-charging is the intent — they should yield to *any* recent activity. Force Charge and user self-serve are explicit human-driven recovery actions where multiple attempts make sense.

### Cross-path interactions

- Bulk runs at 10am (1 attempt) → user wants to self-serve at 11am: ✅ user proceeds (their count is 0)
- User self-serves 3× by 1pm → bulk runs at 2pm: ❌ bulk blocked (any-attempt rule fires)
- User self-serves 3× → admin Force Charges at 3pm: ✅ admin proceeds (admin's count is 0, separate budget)
- Admin Force Charges 3× → user self-serves: ✅ user proceeds (user's count is 0, separate budget)

Worst case across all paths in a single 6h window: 1 (bulk) + 3 (admin FC) + 3 (user) = **7 fresh decline attempts per invoice**. Across 4 windows per day: 28 max. Real-world expected: <2/day per invoice.

### 30-second debounce (spam-click protection)

Independent of attempt budget. Apply uniformly across all paths.

Before checking the budget lock, query `InvoiceChargeLog` for the **most recent** attempt on this invoice. If `attemptedAt` is within the last 30 seconds, block immediately with `reason: "too_soon"`.

Rationale: a user spam-clicking "Pay overdue" or an admin double-clicking Force Charge shouldn't burn 2-3 of their 3-budget in 5 seconds. The debounce is fast (single index lookup) and cheap.

### Idempotency key strategy

The current single-key approach causes Stripe to return the cached first response for any retry within 24h — so a "retry" that the user sees actually does nothing on Stripe's side. To make the 3-attempt budget mean *real* retries, the per-attempt key must change.

For Force Charge paths:
1. Compute attempt number for current call: `count(prior attempts in window for this path) + 1`.
2. Build key: `admin-charge-${invoiceId}-fc-${triggeredBy}-${attemptNumber}` (e.g. `admin-charge-in_xxx-fc-admin-2`).
3. Each attempt within the window has a unique key → Stripe attempts a fresh charge each time.

For bulk/regular admin retry: keep the existing static key. They're "1 per window" so the cached behavior is fine — and importantly, admins can't accidentally trigger 3 charges by misclicking the bulk button.

### Constants

In `src/server/admin/past-due-charge-idempotency.ts`:

```typescript
/** Window for any attempt-counting on InvoiceChargeLog. */
export const RECENT_ATTEMPT_WINDOW_HOURS = 6; // was 24

/** Max attempts per 6h window for Force Charge paths (admin or user). */
export const MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW = 3;

/** Minimum seconds between any two attempts on the same invoice (spam debounce). */
export const MIN_SECONDS_BETWEEN_ATTEMPTS = 30;
```

### New helpers

In `src/server/admin/past-due-charge-idempotency.ts`:

```typescript
/** Earliest `attemptedAt` that still counts as "recent" for the 6h window. */
export function cutoffForRecentAttempt(now: Date = new Date()): Date {
  return new Date(now.getTime() - RECENT_ATTEMPT_WINDOW_HOURS * 60 * 60 * 1000);
}

/** Earliest `attemptedAt` that still counts as "too soon" (debounce). */
export function cutoffForDebounce(now: Date = new Date()): Date {
  return new Date(now.getTime() - MIN_SECONDS_BETWEEN_ATTEMPTS * 1000);
}

/**
 * Build a Force Charge idempotency key. Per-attempt within the 6h window,
 * separate counters for admin vs user paths so each gets its own 3-attempt budget.
 */
export function buildForceChargeIdempotencyKey(
  invoiceId: string,
  triggeredBy: "admin" | "user",
  attemptNumber: number
): string {
  return `admin-charge-${invoiceId}-fc-${triggeredBy}-${attemptNumber}`;
}
```

The existing `buildAdminChargeIdempotencyKey(invoiceId)` stays for bulk/regular admin retry.

### Updates to `payOpenInvoiceAsPastDueAdmin`

Add two optional parameters with backward-compatible defaults:

```typescript
export async function payOpenInvoiceAsPastDueAdmin(params: {
  invoice: Stripe.Invoice;
  paymentMethodId: string;
  customerId: string;
  user: LeanPastDueUser;
  adminId: string;
  chargeRunId?: mongoose.Types.ObjectId | null;
  /** Override the default `admin-charge-${invoiceId}` key. Used by Force Charge paths for per-attempt keys. */
  idempotencyKey?: string;
  /** Override the default 1-per-window lock. Used by Force Charge paths to allow up to 3 attempts. */
  attemptBudgetCheck?: () => Promise<{ allowed: true } | { allowed: false; reason: string; message: string }>;
}): Promise<PastDueChargeResultRow>;
```

When `attemptBudgetCheck` is omitted: use the existing 1-per-window check (any attempt blocks).
When provided: defer to the caller's check (Force Charge paths supply their own counting logic).

When `idempotencyKey` is omitted: use `buildAdminChargeIdempotencyKey(invoiceId)`.
When provided: pass through to Stripe.

The 30-second debounce check runs **before** the attempt-budget check, regardless of caller.

### Force Charge orchestrator changes

In `src/server/admin/forceChargePastDue.ts`, before calling `payOpenInvoiceAsPastDueAdmin`:

1. Query `InvoiceChargeLog` for prior force-charge attempts in the window with the matching `triggeredBy`.
2. If count >= 3, return `{ ok: false, reason: "recent_charge_attempt", message: "..." }`.
3. Otherwise, compute `attemptNumber = count + 1`.
4. Build `idempotencyKey = buildForceChargeIdempotencyKey(invoiceId, triggeredBy, attemptNumber)`.
5. Build `attemptBudgetCheck` closure that re-validates count < 3 right before the Stripe call (TOCTOU defense).
6. Pass both to `payOpenInvoiceAsPastDueAdmin`.

### `recent_charge_attempt` reason semantics

The existing reason name stays. Its meaning expands slightly:

- For bulk/regular admin retry: "An attempt was made on this invoice in the last 6h."
- For Force Charge admin/user: "3 force-charge attempts were made on this invoice via this path in the last 6h."

The error message string distinguishes them.

## Files affected

| Path | Type | Change |
|---|---|---|
| `src/server/admin/past-due-charge-idempotency.ts` | Modify | New constants + new key/cutoff helpers, downgraded window from 24 to 6 |
| `src/server/admin/__tests__/chargePastDueShared.test.ts` | Modify | Update assertions for new constant value (24 → 6) |
| `src/server/admin/__tests__/forceChargePastDuePolicy.test.ts` | Modify | Update window-related test expectations |
| `src/server/admin/chargePastDueShared.ts` | Modify | Add `idempotencyKey` and `attemptBudgetCheck` params to `payOpenInvoiceAsPastDueAdmin`; add 30s debounce check |
| `src/server/admin/forceChargePastDue.ts` | Modify | Compute attempt number, supply key + budget check to pay primitive |
| `src/server/admin/__tests__/chargeLockRateLimitPolicy.test.ts` | Create | New test file: budget counting, debounce predicate, per-attempt key shape |
| `docs/admin/api.md`, `backend.md` | Modify | Document new lock semantics + reason expansion |

No new files in `src/app/api/**`. The existing endpoints continue to call the orchestrator/primitive — the change is internal.

## Confidence

| Component | Confidence | Why |
|---|---|---|
| Constant value change (24→6) | 99% | Trivial config |
| Per-attempt idempotency key | 95% | Standard Stripe pattern; Stripe cache is per-key with 24h TTL |
| Budget counting via `countDocuments` | 95% | Mongo standard query; index on `invoiceId+attemptedAt` exists |
| Debounce check | 99% | Same query as budget, just narrower cutoff |
| Cross-path semantics (1 for bulk, 3 for FC, separate counts) | 90% | Logic is clear but worth a unit test that simulates real timing |
| **Won't double-charge** | 99% | Stripe idempotency per key + DB check pair; no path generates two Stripe calls with the same key |
| **Won't escalate decline fees beyond bounded worst case** | 95% | Math worked out: max 28 attempts per invoice per day across all paths combined |

## Rollout

1. **Sandbox test** — synthetic past-due user with bad card. Run admin Force Charge 3× in quick succession (debounce should block #2 if too fast, otherwise budget should allow 3 then block #4). Verify each Stripe API call has a different key.
2. **Production: Tyler again** — assuming his 24h window has cleared by now, run Force Charge once. Note attempt number and key in the resulting `InvoiceChargeLog`. If it succeeds, perfect. If it fails, run again (within 6h, attempt #2). Verify you can do that without hitting the lock.
3. **Don't enable bulk runs** until after step 2 succeeds — bulk run with new 6h window means up to 4 sweeps per day vs 1 today.
4. **Monitor `InvoiceChargeLog` decline counts** for the first 24h after rollout. If decline-fee accumulation looks unbounded, dial back to 2 per window or add the V2 decline-result short-circuit.

## Open questions

1. Should `recent_charge_attempt` (current code) split into `recent_charge_attempt` (bulk/admin) vs `force_charge_budget_exhausted` (FC paths) for clearer admin UX? **Recommendation: keep one reason, distinguish via message text. Less churn, same info to the admin who reads the message.**
2. Should the user-self-serve endpoint show how many attempts remain in the window? E.g. "2 attempts remaining today before lock." **Recommendation: yes — visible in the modal helps users not waste budget.** Defer to plan.
3. Is the 30-second debounce too short for real network glitches? **Recommendation: 30s is fine. Most network failures resolve in <5s; 30s catches double-clicks. Increase to 60s if support tickets surface "I waited and tried again but got blocked."**
