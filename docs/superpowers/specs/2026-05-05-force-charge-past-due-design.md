# Force-Charge Past-Due Subscriptions — Design

**Status:** Draft for review
**Date:** 2026-05-05
**Scope:** New "Force Charge" admin tool + extended user-facing renewal-failed flow + diagnostic + test script. Includes a small patch to the existing stranded recovery flow.

## Problem

Users in `subscription.status === "past_due"` whose **current Stripe subscription has no chargeable invoice** cannot be settled by any existing tool:

- **Bulk past-due charger** filters `status: "open"` — skips them silently
- **Per-user admin charger** returns "Eligible to charge: 0" (after the 5a fix scoped charging to the current subscription's invoice)
- **Stranded recovery flow** requires an `originalInvoiceId` that's `uncollectible`/`void` — these users have no such invoice
- **User-facing `pay-failed-invoice` flow** returns "This bill can't be paid here" — same root cause

The pattern (observed in production via Tyler Johnson's account):
1. User has had a renewal failure
2. `pause_collection: keep_as_draft` was set on the subscription, OR the user has cancelled-and-resubscribed multiple times leaving orphan invoices on expired subs
3. The current subscription's cycle invoices are held as **drafts** (because of pause), or the user has no `open`/`uncollectible` invoice on the current sub at all
4. Customer cannot self-serve. Admin cannot manually charge. The user is silently stuck.

The diagnostic suspicion: **a non-trivial fraction of past-due users are in this state**. We need a tool to count them and a path to settle them.

## Goal

Three deliverables sharing one server-side primitive:

1. **Admin "Force Charge"** — admin button on the per-user charge modal that fires when the existing flow returns "0 eligible" but the user is still `past_due` in DB. Finalizes a held draft (or pays an existing open invoice) on the current subscription.
2. **User-facing self-serve** — extends `RenewalFailedModal` and the `pay-failed-invoice` route. When no payable invoice exists but a draft does, finalize and pay it.
3. **Diagnostic script** — read-only audit that finds users in the stuck-paused state, counts the population, optionally lists orphan invoices on cancelled subs.
4. **Test script** — CLI tool that accepts a user email or `stripeCustomerId`, runs the eligibility check + dry-run plan, and optionally executes Force Charge live with explicit `--live` flag.

## Non-goals

- **Creating brand-new manual invoices** — explicitly excluded (see "Why no manual invoices" below).
- **Cleaning up orphan invoices on cancelled/expired subscriptions** — out of scope; diagnostic script flags them, admin handles via Stripe Dashboard.
- **Email-triggered payment links** — separate channel, not in this scope.
- **Webhook patches to support `billing_reason: "manual"`** — V2 follow-up if the diagnostic shows users without held drafts.

## Why no manual invoices (critical safety property)

Investigation confirmed that the webhook's `invoice.payment_succeeded` dispatch ladder at [stripe/webhook/route.ts:3598-3618](../../src/app/api/stripe/webhook/route.ts#L3598-L3618) has an `else { return; }` for any unknown `billing_reason`, including `"manual"`. Multiple downstream effects also gate on `billing_reason === "subscription_cycle"` or `recordMembershipRecurringAffiliate` (which excludes `"manual"`).

A manually-created invoice (`stripe.invoices.create({ ... })` without an existing cycle context) would:
- Charge the customer ✅
- NOT flip `subscription.status` from `past_due → active` ❌
- NOT accumulate entries ❌
- NOT advance `endDate` ❌
- NOT fire Klaviyo "Renewed" event ❌
- NOT credit affiliate commission ❌

This violates the "behaves like normal charging" requirement. Customer would pay but their account state wouldn't update. **This is the property the design protects against.**

By contrast, a held draft created by Stripe under `pause_collection: keep_as_draft` retains `billing_reason: "subscription_cycle"`. Finalizing such a draft preserves the billing reason; paying it triggers the full renewal pipeline normally.

**Therefore: Force Charge only ever finalizes/pays invoices that already exist on the subscription. It never creates new ones.**

## Approach

### Shared server-side primitive

```typescript
// src/server/admin/forceChargePastDue.ts
export type ForceChargeResult =
  | { ok: true; row: PastDueChargeResultRow; chargedInvoiceId: string }
  | {
      ok: false;
      reason:
        | "user_not_found"
        | "subscription_inactive"
        | "not_past_due"
        | "package_not_found"
        | "recent_charge_attempt"      // DB 24h lock
        | "period_already_paid"        // Stripe paid-period check
        | "no_chargeable_invoice"      // No draft, no open on current sub
        | "finalize_failed"
        | "pay_failed";
      message: string;
    };

export async function forceChargeCurrentCycle(params: {
  userId: string;
  triggeredBy: "admin" | "user";
  adminId?: string;  // required when triggeredBy === "admin"
}): Promise<ForceChargeResult>;
```

### Sequence

```
1. Load user. Verify subscription.status === "past_due" and stripeSubscriptionId present.
2. Resolve expected cycle amount from MembershipPackage by user.subscription.packageId.
3. DB 24h lock check:
   - Query InvoiceChargeLog for user.userId with status: "success" in last 24h
   - If found → BLOCK with "recent_charge_attempt"
4. Stripe paid-period check:
   - Retrieve subscription, get current_period_start and current_period_end
   - List paid invoices on this subscription (limit 5, recent first)
   - If any paid invoice's period overlaps with current_period → BLOCK with "period_already_paid"
5. Find target invoice on current sub:
   - List open invoices on subscription (status: "open")
   - List draft invoices on subscription (status: "draft")
   - Pick: newest open chargeable invoice (collection_method=charge_automatically, amount_remaining>0)
   - If no open: pick newest draft with amount_due === expectedAmountCents
   - If neither found → BLOCK with "no_chargeable_invoice"
6. If draft, finalize it (idempotency key: force-finalize-${invoiceId})
7. Pay via existing payOpenInvoiceAsPastDueAdmin:
   - Reuses InvoiceChargeLog write, idempotency key, sanitization
   - Triggers Stripe webhook with billing_reason: "subscription_cycle" (preserved from draft)
   - Webhook runs full renewal pipeline (status flip, entries, endDate, Klaviyo, etc.)
8. Return result
```

### Three callers

#### A. Admin endpoint

`POST /api/admin/users/[id]/force-charge`

```typescript
// Body schema (Zod)
{ confirmation: z.literal("FORCE CHARGE") }

// Response (success)
{ success: true, chargedInvoiceId, row: PastDueChargeResultRow }

// Response (error)
{ success: false, reason, message }
```

Auth: `getServerSession` + `role === "admin"`. Status mapping similar to recovery endpoint.

#### B. User self-serve endpoint

`POST /api/stripe/force-charge-overdue` (sibling to existing `pay-failed-invoice`)

```typescript
// Body
{}  // no confirmation needed; auth already gates by user session

// Response
{ success: true, paidInvoiceId, amount } | { success: false, reason, message }
```

Auth: `getServerSession`, must be the user themselves (no impersonation). Calls `forceChargeCurrentCycle({ userId: session.user.id, triggeredBy: "user" })`.

#### C. Diagnostic + test scripts

```bash
# Read-only audit — find users in stuck-paused state
npx tsx scripts/find-stuck-paused-users.ts [--limit=N] [--include-orphans]

# Test script — input email or customerId, dry-run by default
npx tsx scripts/test-force-charge.ts --email=user@example.com
npx tsx scripts/test-force-charge.ts --customer=cus_xxx
npx tsx scripts/test-force-charge.ts --email=user@example.com --live  # actually execute
```

The test script:
- Resolves user by email (Mongo) or customerId (Stripe → Mongo lookup)
- Prints user's subscription state, current_period, list of invoices on current sub by status, computed eligibility result
- In dry-run, stops there with a clear "would do X" plan
- With `--live`, calls `forceChargeCurrentCycle({ userId, triggeredBy: "admin", adminId: <env-supplied or first-admin-found> })` and prints the full result

### Idempotency model

Stable Stripe idempotency keys keyed on subscription + period (NOT per-caller):

```
force-finalize-${invoiceId}   → for finalizeInvoice
admin-charge-${invoiceId}     → for invoices.pay (existing key from chargePastDueShared)
```

If admin and user fire concurrently, both paths target the same draft. Stripe dedupes both API calls. Net result: one finalized invoice, one charge.

DB-side: `InvoiceChargeLog` 24h success-status lock prevents repeated attempts within the window.

### UI changes

#### Admin: extend `ChargePastDueUserModal.tsx`

When the preview returns `eligibleCount: 0` and the user IS `past_due` in the DB:
- Show an info panel: "No chargeable invoice on the current subscription. The user may have a held draft from `pause_collection` that needs finalizing."
- Replace the existing "Confirm charge (0)" button with a "Force Charge" button (disabled state if input doesn't match)
- Confirmation input changes from `CHARGE` to `FORCE CHARGE`
- Button calls `POST /api/admin/users/[id]/force-charge` instead of the existing per-user charge endpoint

#### User: extend `RenewalFailedModal.tsx`

Currently the modal calls `pay-failed-invoice`. Add a fallback:
- If `pay-failed-invoice` returns the "this bill can't be paid here" / "no payable invoice" error, swap CTA to "Pay overdue amount"
- That CTA calls `POST /api/stripe/force-charge-overdue`
- On success, modal shows the standard renewal-success state (existing UX)

### Patch to existing recovery flow

Modify `src/server/admin/recoverStrandedPastDue.ts`:
- Remove the "create new draft if none found" branch in step 5 (find-or-create)
- Replace with: if no matching draft exists → return `{ ok: false, reason: "no_held_draft", message: "..." }`
- Add `"no_held_draft"` to the `RecoverStrandedResult` reason union
- Update the API route's `statusByReason` map to map `"no_held_draft" → 409`
- Update `docs/admin/api.md` and `docs/admin/backend.md` accordingly

This removes the silent-corruption foot-gun. Stranded users without held drafts now get a clear error instead of a partially-recovered state.

## Confidence

| Component | Confidence | Why |
|---|---|---|
| Finalize+pay an existing draft | 99% | Production code already does this — `pay-failed-invoice/route.ts:150` and `invoice-payment-intent.ts:163` |
| Webhook pipeline runs on `subscription_cycle` paid invoice | 99% | Verified by codebase-investigator agent — full pipeline at line 3598-3618 dispatch ladder |
| Pause cleared after force charge | 99% | Confirmed: `pauseCollectionPolicy.ts:13-15` `prev === "past_due"` fallback works |
| DB 24h lock prevents double-charge | 99% | Same pattern as existing recovery |
| Stripe paid-period check prevents double-charge | 95% | One Stripe API call per check, simple comparison |
| Test script | 95% | Read-only by default, `--live` flag for explicit execution |
| **Won't make worse** | 99% | All branches idempotent, blocked cases never write to Stripe |
| **Won't double-charge** | 99% | Two-layer guard (DB + Stripe) + Stripe idempotency keys |

## Files affected

| Path | Type | Responsibility |
|---|---|---|
| `src/server/admin/forceChargePastDue.ts` | Create | Pure orchestrator (signature above) |
| `src/server/admin/__tests__/forceChargePastDue.test.ts` | Create | Pure helper tests (eligibility checks, period overlap math) |
| `src/app/api/admin/users/[id]/force-charge/route.ts` | Create | Admin endpoint |
| `src/app/api/stripe/force-charge-overdue/route.ts` | Create | User self-serve endpoint |
| `src/components/admin/ChargePastDueUserModal.tsx` | Modify | Show Force Charge fallback when 0 eligible + user past_due |
| `src/components/modals/RenewalFailedModal.tsx` | Modify | Swap CTA on "no payable invoice" error |
| `src/app/api/stripe/pay-failed-invoice/route.ts` | Read-only | Confirm error format consumers can detect |
| `src/server/admin/recoverStrandedPastDue.ts` | Modify | Remove create-new fallback; add `no_held_draft` reason |
| `src/app/api/admin/users/[id]/recover-past-due-invoice/route.ts` | Modify | Add `no_held_draft` to status map |
| `scripts/find-stuck-paused-users.ts` | Create | Diagnostic script |
| `scripts/test-force-charge.ts` | Create | Test/dry-run/live CLI |
| `package.json` | Modify | Add npm scripts: `find:stuck-paused-users`, `test:force-charge:dry`, `test:force-charge` |
| `docs/admin/api.md`, `backend.md`, `frontend.md` | Modify | Document new endpoints, primitive, UI |

## Rollout plan

1. **Sandbox**: run `npx tsx scripts/test-force-charge.ts --email=test+evan@example.com` in dry-run mode against a Stripe test customer in stuck-paused state. Verify the plan output is accurate.
2. **Sandbox live**: run with `--live` flag. Verify Stripe Dashboard shows: original draft finalized, payment succeeded, webhook fired, customer state updated.
3. **Production diagnostic**: `npx tsx scripts/find-stuck-paused-users.ts --limit=200` to count actual affected users. Pipe to CSV for review.
4. **Production: test on Tyler Johnson first** (single user from the screenshot). Run via `--live`. Verify:
   - DB: `user.subscription.status === "active"`
   - Stripe: invoice paid, `pause_collection` cleared
   - Klaviyo: renewal event arrived
   - Entries: counter incremented
5. **Wait 24 hours**, watch for anomalies.
6. **Roll out to remaining stuck-paused users** via admin UI one-by-one OR a small batch script.
7. **Enable user-facing self-serve** in `RenewalFailedModal` after admin path is verified.

## Webhook audit (implementation task)

Before shipping, the implementation plan must include an explicit task to grep `src/app/api/stripe/webhook/route.ts` for every `billing_reason ===` and `billing_reason !==` check, and verify that finalizing a held draft (which preserves `billing_reason: "subscription_cycle"`) correctly triggers each branch.

If any branch is gated on a different field that may not match (e.g., `recordMembershipRecurringAffiliate` returns `false` for first-paid invoices on `subscription_create`), the audit identifies it and either:
- Adds a `previousSubscriptionDbStatus === "past_due"` fallback, OR
- Documents the divergence as known and acceptable.

The audit ships as part of the implementation plan, NOT as a separate ticket.

## Open questions for review

1. **`adminId` for the user-facing endpoint**: when a user fires Force Charge themselves, the InvoiceChargeLog row needs an `adminId`. Use a system-user ObjectId (constant), or make `adminId` optional in the schema? Decide during implementation — leaning toward a designated "system" admin user with a stable Mongo ObjectId for traceability.
2. **`current_period` window**: Stripe defines this on the subscription. We rely on it being correct after pause. Verify with the test script that paused subs still expose accurate `current_period_start/end`.
3. **Test script `adminId` resolution**: `--live` needs an admin to log against. Use the first user with `role: admin` from the DB, or accept `--admin-email=...` flag. Pick during implementation.
