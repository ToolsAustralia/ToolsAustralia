# Past-Due Reanchor — Design Spec (Hardened)

- **Date:** 2026-06-01
- **Branch:** `feature/past-due-reanchor`
- **Status:** Approved design, hardened by a 4-round adversarial review — ready for implementation plan
- **Domains touched:** `subscription`, `billing-stripe`, `tracking` (Klaviyo) for doc-sync; plus root `BUSINESS.md` / `README.md`
- **Confidence:** ship-with-must-fixes **after** a one-hour Stripe test-mode probe (see §9)

> This spec was reviewed across four workflow rounds (initial architecture, downstream
> propagation, a 12-lens adversarial deep review, and a focused gap-closing round). Every
> non-obvious claim below is code- or doc-verified; the few that can only be settled live are
> listed as a pre-ship gate in §9. Inline tags: ✅ verified · 🔬 needs test-mode probe.

---

## 1. Problem / current behavior (verified)

When a membership renewal fails, the subscription goes `past_due` (then possibly `unpaid`),
`subscription.isActive` is set to `false` → the member **loses benefits**. On recovery (any
channel), they return to `active`/`trialing` (`isActive = true`) and the **original renewal day is
retained**. Re-billing a recovered member ~2 weeks after they caught up is the problem.

### Where it lives today (file:line, ✅ verified)

- Anchor is **not stored** in Mongo — it lives in Stripe's billing cycle, mirrored into
  `User.subscription.endDate`. Fixed once at creation via `trial_end` + `proration_behavior:'none'`,
  only for join-days 25/26/27 ([anchor-billing.ts:87-96](../../../src/utils/billing/anchor-billing.ts#L87-L96)).
- `billing_cycle_anchor` is **never** used for anchoring (only upgrade/downgrade).
- Failure → `past_due`: `isActive=false`, `pastDueAt` set
  ([index.ts:2067-2083](../../../src/services/stripe-webhook-handlers/index.ts#L2067-L2083)); `unpaid` is parallel
  ([index.ts:2097-2118](../../../src/services/stripe-webhook-handlers/index.ts#L2097-L2118)).
- All recovery channels pay the existing `subscription_cycle` invoice and converge on **one**
  handler — `handleInvoicePaymentSucceeded` ([index.ts:3199](../../../src/services/stripe-webhook-handlers/index.ts#L3199)),
  which snapshots `previousSubscriptionDbStatus` ([index.ts:3260](../../../src/services/stripe-webhook-handlers/index.ts#L3260))
  and clears `pause_collection` via `resumeAfterSuccessfulRenewalPayment` ([index.ts:3438-3448](../../../src/services/stripe-webhook-handlers/index.ts#L3438-L3448)).
  It **never touches the anchor**.

---

## 2. Goal / new behavior

On successful recovery of a `past_due`/`unpaid` renewal, **re-anchor future renewals to the day the
recovery payment landed** (AEST), clamped: **25/26/27 → 24**. Next charge is then ~1 month out
instead of falling back on the old anchor.

Example — member anchored to the 24th: card fails Mar 24 → `past_due` (no access). Catches up
**Apr 2** → renewal day becomes the **2nd**, next charge **May 2** (vs today's Apr 24).

> A past-due member has **no** access (`isActive=false`), so this grants **no bonus access** — it
> changes only the **next charge date**.

---

## 3. Scope decisions (locked with product owner)

1. **Who reanchors:** *all* recoveries, including members previously anchored to the 24th.
2. **Cadence:** next charge = recovery day-of-month, one cycle out (~1 month). No double-charge.
3. **Trigger scope:** `past_due` **and** `unpaid`, across all **five** channels (Stripe auto-retry,
   admin charge, user retry, Pay-Now, force-charge).
4. **Short months:** kept day 29/30/31 in a shorter month → **last day** of that month.
5. **Engineering defaults:** anchor off `invoice.status_transitions.paid_at` (AEST); add Stripe
   metadata tag + bump `BILLING_ANCHOR_RULE_VERSION` + `MembershipStatusHistory` audit row; **leave
   `pastDueAt` untouched** on recovery.

---

## 4. Design

### 4.1 Single source of truth ✅

Reanchor lives **only** in `handleInvoicePaymentSucceeded`. ✅ Verified: all five channels pay the
*existing* open `subscription_cycle` invoice (admin [chargePastDueShared.ts:459](../../../src/server/admin/chargePastDueShared.ts#L459),
force-charge [forceChargePastDue.ts](../../../src/server/admin/forceChargePastDue.ts), [pay-failed-invoice](../../../src/app/api/stripe/pay-failed-invoice/route.ts),
[renew-subscription:237](../../../src/app/api/stripe/renew-subscription/route.ts#L237), Stripe auto-retry) — never a new/manual
invoice — so each emits `invoice.payment_succeeded` with `billing_reason==='subscription_cycle'`,
caught by the single hook. **No inline-route edits for the reanchor itself** (would double-anchor).

### 4.2 Trigger gate (race-safe — REVISED after gap-closing)

Fire reanchor only when **all** hold:

1. `expandedInvoice.billing_reason === 'subscription_cycle'`
2. invoice is paid (reuse `invoiceIsPaid`, [index.ts:3429](../../../src/services/stripe-webhook-handlers/index.ts#L3429))
3. **Dunning detected** — true if **ANY** durable signal holds (an OR, because no single signal
   survives every channel):
   - `previousSubscriptionDbStatus ∈ {past_due, unpaid}` (catches auto-retry, admin charge,
     Pay-Now, force-charge — none pre-flip the DB), **OR**
   - `pause_collection` present at payment time — **captured at [index.ts:~3434](../../../src/services/stripe-webhook-handlers/index.ts#L3434)
     BEFORE `resumeAfterSuccessfulRenewalPayment` clears it** ✅ (the local `subscription` object,
     retrieved ~3339, is *not* mutated by resume — but the ~4369 block re-retrieves a fresh sub that
     reads cleared pause, so capture pre-resume and thread the boolean down), **OR**
   - `expandedInvoice.attempt_count > 1` — the durable Stripe-side fact that the cycle invoice
     already failed at least once. **This is the arm that catches the `renew-subscription` retry
     channel**, which pre-flips DB status to `active` ([route.ts:259-264](../../../src/app/api/stripe/renew-subscription/route.ts#L259-L264))
     **and** clears pause ([route.ts:243](../../../src/app/api/stripe/renew-subscription/route.ts#L243)) synchronously before the
     webhook — defeating the first two arms. 🔬 attempt_count semantics to be confirmed on the probe;
     fallback is to tag `dunning_recovery:1` on the invoice/PI metadata in the inline routes.
4. **Exclusions (must-fix from review):**
   - `subscription.cancel_at_period_end !== true` **AND** `user.subscription.autoRenew !== false` —
     never reanchor a member who set cancel-at-period-end then recovered a failed final-cycle invoice
     (reanchor's `trial_end` would slip their cancellation ~1 month and bill an extra cycle). ✅ the
     trialing update lands in [index.ts:2148-2160](../../../src/services/stripe-webhook-handlers/index.ts#L2148-L2160) and moves endDate out.
   - pause reason `!== 'retention'` (inherit the `decideClearPause` guard, [pauseCollectionPolicy.ts:49](../../../src/services/subscription/pauseCollectionPolicy.ts#L49)).
5. **Idempotency claim wins** (§4.5).

Implement the gate as a pure predicate `shouldReanchorAfterRecovery(input)` in
`pauseCollectionPolicy.ts` (mirroring `decideClearPause`); the webhook just calls it. Unit-test the
negative gates.

### 4.3 Mechanism ✅ (doc-verified) + future-floor (must-fix)

```
stripe.subscriptions.update(subscriptionId, {
  trial_end: <clamped, future-floored unix seconds, AEST midnight>,
  proration_behavior: 'none',
  metadata: { billing_anchor_rule: 'past_due_reanchor' },
})
```

- ✅ **Stripe Basil docs confirm:** `trial_end` updates `billing_cycle_anchor` to the trial_end
  value; `proration_behavior:'none'` yields no immediate proration charge/credit. `billing_cycle_anchor:'now'`
  is correctly rejected (would force an immediate second charge).
- 🔴 **Future-floor is a HARD requirement.** ✅ Verified from docs: Stripe does **not** reject a
  past/now `trial_end` — it **ends the trial immediately and charges**. So the computed timestamp
  must be floored to `>= now + buffer`; if the next-occurrence ever computes `<= now` (DST edge,
  clock skew, recovery landing on the target day), **abort the reanchor non-fatally** rather than
  charge immediately.
- ✅ Setting `trial_end` flips the sub to `trialing`; the emitted `customer.subscription.updated`
  reaches [index.ts:2148-2160](../../../src/services/stripe-webhook-handlers/index.ts#L2148-L2160) (matched-id case → `isActive=true`, syncs
  endDate) or the [2048 fast-path](../../../src/services/stripe-webhook-handlers/index.ts#L2048) if the recovery flipped DB to active
  first ([2063-2065](../../../src/services/stripe-webhook-handlers/index.ts#L2063-L2065)). **Both orderings preserve benefits** — no guard
  short-circuits it (Boss-package / sub-id-ownership guards only fire on id *mismatch*). 🔬 the exact
  `status='trialing'` transition to be confirmed on the probe.

### 4.4 Date math — full algorithm (must-fix #1, #2, #3 baked in)

```ts
/** Clamp a recovery-landing day to the anchor window: AEST 25/26/27 -> 24, else the day itself. */
export function clampReanchorDay(date: Date): number {
  const day = getCalendarDayInAEST(date);
  return (ANCHOR_JOIN_DAYS as readonly number[]).includes(day) ? ANCHOR_DAY_OF_MONTH : day;
}

/** Leap-safe last day of a 1-12 month (UTC). One canonical helper — do NOT add a 4th ad-hoc impl. */
export function daysInMonthUTC(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/**
 * Unix seconds (trial_end) for the clamped recovery day at midnight AEST, the NEXT occurrence
 * strictly AFTER recoveryDate (instant comparison, not day-integer). Short months -> last day.
 * createAESTDateAsUTC does NOT clamp overflow days (returns Invalid Date on date-fns-tz@3.2.0),
 * so the Math.min(clampedDay, lastDay) step is mandatory. Throws on invalid input; caller aborts
 * the reanchor non-fatally.
 */
export function getReanchorTrialEndTimestamp(recoveryDate: Date): number {
  if (!Number.isFinite(recoveryDate.getTime()) || recoveryDate.getTime() <= 0) {
    throw new Error("getReanchorTrialEndTimestamp: invalid recoveryDate");
  }
  const recoveryUnix = Math.floor(recoveryDate.getTime() / 1000);
  const clampedDay = clampReanchorDay(recoveryDate);
  let y = Number(formatInTimeZone(recoveryDate, AEST_TIMEZONE, "yyyy"));
  let m = Number(formatInTimeZone(recoveryDate, AEST_TIMEZONE, "M")); // 1-12
  const build = (yy: number, mm: number) => {
    const billDay = Math.min(clampedDay, daysInMonthUTC(yy, mm));
    const dt = createAESTDateAsUTC(yy, mm, billDay, 0, 0);
    if (Number.isNaN(dt.getTime())) throw new Error(`reanchor invalid date ${yy}-${mm}-${billDay}`);
    return dt;
  };
  let candidate = build(y, m);
  while (Math.floor(candidate.getTime() / 1000) <= recoveryUnix) { // instant comparison + future roll
    m += 1; if (m > 12) { m = 1; y += 1; }
    candidate = build(y, m);
  }
  return Math.floor(candidate.getTime() / 1000);
}
```

- **`recoveryDate` construction (caller):** `new Date((expandedInvoice.status_transitions?.paid_at ?? expandedInvoice.created) * 1000)`
  — `paid_at` is **unix seconds**; the `* 1000` and the `?? created` fallback are mandatory. On a
  non-finite/epoch-0 value, skip reanchor and `console.error`.
- Reuses `ANCHOR_DAY_OF_MONTH`, `ANCHOR_JOIN_DAYS`, `getCalendarDayInAEST`, `createAESTDateAsUTC`,
  `formatInTimeZone`. **Does NOT reuse `getNextAnchorTimestamp`** (hard-coded to the 24th). Bump
  `BILLING_ANCHOR_RULE_VERSION`. Only the first timestamp is self-computed; Stripe handles short
  months for subsequent cycles.

### 4.5 Idempotency — atomic claim (REVISED)

`User.subscription.lastReanchoredInvoiceId` is set via an **atomic conditional claim**, not a
read-modify-write (a dashboard resend mints a fresh `event.id` and bypasses *both* event.id-keyed
idempotency layers — ✅ verified [processQueuedEvent.ts:40-49](../../../src/services/stripe-webhook-queue/__tests__), [ProcessedStripeEvent.ts:5](../../../src/models/ProcessedStripeEvent.ts#L5)):

```ts
const claimed = await User.findOneAndUpdate(
  { _id, "subscription.lastReanchoredInvoiceId": { $ne: invoiceId } },
  { $set: { "subscription.lastReanchoredInvoiceId": invoiceId } },
  { new: true }
);
if (!claimed) return; // another delivery already reanchored this invoice
// ...only now call stripe.subscriptions.update(...)
```

The Stripe update is deterministic off the fixed `paid_at`, so even an at-least-once retry that wins
the claim recomputes the same target. The audit row (§4.8) is also invoice-keyed for exactly-once.

### 4.6 endDate sync — write from the computed `trial_end` (REVISED must-fix)

Write `subscription.endDate = new Date(trialEndSeconds * 1000)` — the **same** clamped `trial_end`
the code just passed to Stripe. **Do NOT** derive it from `getSubscriptionPeriodEnd` here: ✅ that
helper reads only `current_period_end` ([subscription-period.ts:25-36](../../../src/utils/payment/stripe/subscription-period.ts#L25-L36)) and a
fast read-back can lag `trial_end`, stamping the *old* anchor. The emitted `customer.subscription.updated`
([2151-2156](../../../src/services/stripe-webhook-handlers/index.ts#L2151-L2156)/[2063-2065](../../../src/services/stripe-webhook-handlers/index.ts#L2063-L2065))
remains the natural backstop and correctly *advances* endDate. Do not rely on the affiliate-gated
resync at [index.ts:4372-4388](../../../src/services/stripe-webhook-handlers/index.ts#L4372-L4388) (skips non-affiliate members).

### 4.7 Failure handling

Recovery already succeeded; a reanchor failure must **not** throw. `console.error` (prod strips
`console.log`). Order: win the atomic claim → compute trial_end (abort non-fatally if not future) →
`stripe.subscriptions.update` → write endDate → re-push Klaviyo (§4.9) → audit row. The next
`subscription.updated` is a backstop for endDate.

### 4.8 Audit — invoice-keyed dedupe

Write via `appendMembershipStatusHistory({ …, dedupeKey: \`past_due_reanchor_${userId}_${invoiceId}\` })`
from the service/helper layer (its `dedupeKey` is a sparse-unique index, [MembershipStatusHistory.ts:47](../../../src/models/MembershipStatusHistory.ts#L47),
so a resend cannot duplicate the row). Capture old anchor day → new anchor day + invoice id. **Do
NOT** inline `MembershipStatusHistory.create` in the webhook. Stripe metadata tag
`billing_anchor_rule:'past_due_reanchor'`; `BILLING_ANCHOR_RULE_VERSION` bump is documentation-only
(✅ no reader branches on it).

### 4.9 Klaviyo re-push (propagation — the one external MUST-RESYNC)

After the endDate write, re-read the user and re-push the profile so the pushed snapshot properties
refresh: `next_renewal_date` ([klaviyo-helpers.ts:352-355](../../../src/utils/integrations/klaviyo/klaviyo-helpers.ts#L352-L355)),
`subscription_end_date` ([:273](../../../src/utils/integrations/klaviyo/klaviyo-helpers.ts#L273)), and
`past_due_renewal_entries` ([:278](../../../src/utils/integrations/klaviyo/klaviyo-helpers.ts#L278), flips to `null` once active).

```ts
const fresh = await User.findById(user._id);
ensureUserProfileSynced(fresh); // klaviyo-profile-sync.ts:318 (fire-and-forget, webhook path)
```

✅ One call refreshes all three; `getRenewalEntriesPreviewForProfile` returns `null` post-recovery
and `upsertProfile` preserves `null` ([klaviyo.ts:458-474](../../../src/lib/klaviyo.ts#L458-L474)). Also close the pre-existing
gap: the active/trialing recovery branch ([index.ts:2151-2160](../../../src/services/stripe-webhook-handlers/index.ts#L2151-L2160)) syncs endDate but omits the
Klaviyo re-push the past_due/unpaid branch has ([2199-2204](../../../src/services/stripe-webhook-handlers/index.ts#L2199-L2204)) — add `ensureUserProfileSynced` there
as defense-in-depth.

### 4.10 Where the helper lives

`reanchorAfterPastDueRecovery(subscriptionId, recoveryDate)` as a **guarded, opt-in sibling** of
`resumeAfterSuccessfulRenewalPayment` in [SubscriptionCollectionPauseService.ts](../../../src/services/subscription/SubscriptionCollectionPauseService.ts) (✅ ARCH-confirmed:
respects layering, no new file justified). Pure date math stays in `anchor-billing.ts` (zero Stripe
imports). **Must NOT** be folded into the bare `resumeAfterSuccessfulRenewalPayment` (shared by the
retention-resume cron and cancellation flows that must keep their anchor).

---

## 5. Downstream propagation (verified)

Everything except Klaviyo **auto-corrects** — every member-facing surface (my-account,
SubscriptionManagementModal, settings, `/api/subscription/benefits`) and admin view
(upcoming-renewals, projected-income) reads `endDate` **live** per request (only a ~2-min React Query
cache lag on an open tab). SendGrid/Meta/GTM/TikTok/Snapchat carry no renewal date. Klaviyo profile
properties are the sole MUST-RESYNC (§4.9). **Historical-OK (don't touch):** all Klaviyo *events*,
the renewal email's date row (= payment date), `MembershipRenewalCycle.dueAt`, and the daily
snapshots. The `'recovered'` enum on `MembershipRenewalCycle` is declared but never written — leave
it unwritten (writing it would pull in `find-renewal-rate.ts:419-422` analytics).

---

## 6. Blast radius (verified)

- 🟢 **Draw entries — safe.** Renewal entries are period-length-independent, granted once per invoice
  via the `PaymentEvent` unique key; draws route by *payment date*, not anchor day. No extra/partial
  cycle.
- 🟡 **Income projection windowing** — a reanchored member can move out of the "renewing by 27th"
  window ([projected-income/route.ts:87-90](../../../src/app/api/admin/dashboard/projected-income/route.ts#L87-L90)); it's a *shift*, not a double-count
  (headline total counts all active auto-renew subs). No code change; flag the label to product.
- 🟢 **billing_anchor_rule / version consumers** — ✅ no reader misclassifies a reanchored sub.

---

## 7. Test plan

Create `src/utils/billing/__tests__/anchor-billing.test.ts` — **referenced by `package.json`
`test`/`test:anchor-billing` but missing, so `npm test` is currently RED.** Phase 1 authors it
(standalone, behavior-free, green before the behavior flip).

**Unit (pin EXACT UTC ISO, never just day-of-month):**
- `clampReanchorDay`: 25/26/27→24; 1–23 & 28–31→exact (via `getCalendarDayInAEST`).
- `getReanchorTrialEndTimestamp`: returns strictly-future; same-day recovery (Nth at `>00:00` **and**
  exactly `00:00:00` AEST) → next month; clamp 24/25/26/27 → next month's 24th; **short-month overflow**
  kept 31 → Feb 28 / Feb 29 (leap 2028) / Apr 30, **assert never NaN**; Dec 26 → Jan 24 (+1yr),
  Dec 31 → Jan 31 (+1yr); DST switches 2026-04-05 & 2026-10-04 midnight-AEST; `paid_at`-null→`created`
  fallback; seconds-not-ms construction; `trial_end <= now` edge → future-floor / abort.
- `shouldReanchorAfterRecovery` negative gates: retention pause, first-charge/incomplete,
  on-time renewal, **cancel_at_period_end-during-dunning**, `autoRenew===false`.
- Dashboard-resend (fresh `event.id`, same invoice): exactly one `subscriptions.update`, one audit row.

**Manual QA (blocking checklist):** force a `past_due` sub, recover via **each** of the 5 channels →
confirm exactly **one** reanchor fires with `billing_reason==='subscription_cycle'`; pay special
attention to the **renew-subscription** channel (post-pre-flip/post-resume — must still fire via the
`attempt_count>1` arm). Confirm `endDate` correct for a **non-affiliate** member, and Klaviyo
`next_renewal_date` updated + `past_due_renewal_entries===null`.

---

## 8. Documentation impact

| Doc | Change |
|---|---|
| `docs/PAST_DUE_REANCHOR.md` (**new**) | Canonical rule, gate, mechanism, idempotency, propagation, audit, the two metadata values. |
| `docs/subscription/rules.md`, `architecture.md` | Re-scope join-anchor rule; add recovery-reanchor rule + lifecycle step. |
| `docs/billing-stripe/architecture.md`, `backend.md` | Cross-link reanchor; `trial_end` mechanism; future-floor. |
| `docs/STRIPE_COLLECTION_PAUSE_RECOVERY.md` | "On recovery: clear pause **and** reanchor"; note the active/trialing Klaviyo-push gap. |
| `docs/CHARGE_PAST_DUE_CUSTOMERS.md`, `docs/FAILED_RENEWAL_PAY_NOW.md` | Recovery reanchors (clamped). |
| `docs/BILLING_ANCHOR_24.md` | Note the second anchor-move trigger. |
| `docs/tracking/KLAVIYO_INTEGRATION.md` | Reanchor must re-push the profile; these are static pushed properties. |
| `BUSINESS.md` (§9, per CLAUDE.md §5) | Past-due recovery flow now reanchors; add new doc to §9 list. |
| `README.md` | Reword anchor-24 / Past-Due Recovery bullets (anchor no longer permanently static). |
| `src/app/(site)/terms/page.tsx` (§4) | **Flag for legal/product** — not an eng doc. |

Manifest already covers the changing files (`subscription` / `billing-stripe` / `tracking`).

---

## 9. Pre-ship gate — Stripe test-mode probe (🔬 required before the behavior flip)

A one-hour test-mode probe must settle the three doc-unverifiable behaviors:
1. Future `trial_end` + `proration_behavior:'none'` on an active, **just-paid** sub generates **no
   new invoice** and leaves the recovery invoice **paid** (docs strongly imply; no verbatim sentence).
2. The sub reports `status='trialing'` after the update.
3. `pause_collection` + `trial_end` ordering — clear pause and set `trial_end` in the same update (or
   clear first); confirm reanchor takes effect on a previously-paused sub (pause doc 404'd).
4. (Corroborate) `invoice.attempt_count > 1` for a recovered renewal across all 5 channels, and Force
   Charge's re-finalize preserves `billing_reason='subscription_cycle'`.

This is a **gate before merge**, not a blocker to writing the implementation plan.

---

## 10. Implementation phases

1. **Date math + tests** — `clampReanchorDay`, `daysInMonthUTC`, `getReanchorTrialEndTimestamp`
   (with NaN-clamp, instant comparison, future-floor, `paid_at` seconds guard), version bump; author
   the missing `anchor-billing.test.ts` (fixes `npm test`). Pure, no behavior change. **Green before Phase 3.**
2. **Model + service** — `User.subscription.lastReanchoredInvoiceId` (IUser interface **and** schema);
   `shouldReanchorAfterRecovery` predicate; `reanchorAfterPastDueRecovery()` (atomic claim → Stripe
   update → endDate write → Klaviyo re-push → audit).
3. **Webhook wiring (behavior flip)** — capture `pause_collection` pre-resve, thread it; call the
   gate + reanchor in `handleInvoicePaymentSucceeded`; close the active/trialing Klaviyo-push gap.
   **Gated on the §9 probe.**
4. **Docs + DoD** — new doc + domain/BUSINESS/README edits; lint, type-check, `test:anchor-billing`,
   manifest + doc-sync green; manual-QA matrix.

---

## 11. Out of scope

- `renew-subscription` `create_new`/`reactivate` strategies (fresh subs, not `subscription_cycle`) — unaffected.
- Clearing `pastDueAt` on recovery — intentionally retained.
- Writing `MembershipRenewalCycle` status `'recovered'` — leave unwritten.
- Relabeling the admin "27th renewal window" — flagged to product.
