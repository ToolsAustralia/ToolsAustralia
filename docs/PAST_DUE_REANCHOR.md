# Past-Due Reanchor

## Summary

When a `past_due`/`unpaid` membership recovers (any channel), we reanchor the member's future renewals to the **recovery-payment date** (AEST), clamping days **25/26/27 → 24**. Previously the original anchor day was retained. This stops re-billing a recovered member ~2 weeks later on the old anchor — their next charge becomes ~1 month from when they caught up.

> A past-due member has **no** benefits (`isActive=false`); reanchor changes only the next *charge date*, not access.

## ⚠️ Billing-timing footgun — read this BEFORE any anchor / trial / proration change

This whole feature exists because of one non-obvious Stripe behavior that already caused a production double-grant. Internalize the principle before touching any code that mutates subscription billing timing.

**Principle.** *Mutating a Stripe subscription's billing timing can silently spawn an extra invoice — and therefore an extra `invoice.payment_succeeded` your webhook will try to grant on.* Setting `trial_end`, `billing_cycle_anchor`, `proration_behavior`, swapping item price/quantity, or toggling `pause_collection` on an **existing** subscription may cause Stripe to auto-create *and auto-finalize* an invoice (a $0 "Trial period" line, a proration line, or a fresh cycle) that you never explicitly created. The grant path must **classify the invoice's intent — real payment vs. bookkeeping/proration — before granting**, using `billing_reason` + `total` + `amount_paid`, not just "an invoice got paid." **Idempotency-by-id does *not* save you here:** the spawned invoice has its *own* unique id, so an `invoice_<id>` dedup key sees a brand-new, never-processed payment and grants. The only defense is an explicit classifier at the top of the grant handler (today: `isZeroAmountTrialUpdateInvoice`, `src/utils/billing/trial-invoice.ts`) **plus a regression test** that it's honored (`npm run test:zero-trial-guard`).

**Pre-flight checklist — before you set `trial_end` / `billing_cycle_anchor` / `proration_behavior`, swap items, or toggle `pause_collection` on an EXISTING sub:**

1. **New (`.create`) or existing (`.update`)?** `trial_end` on `.create` just defines the first period (no extra invoice). `trial_end` on `.update` **auto-spawns a separate $0 `subscription_update` invoice** that fires `invoice.payment_succeeded`. This asymmetry *is* the footgun.
2. **Will the mutation spawn an invoice?** `trial_end` → yes ($0). `billing_cycle_anchor:"now"` or any item price/qty change → yes (cycle/proration). `proration_behavior:"create_prorations"` → yes if net ≠ 0. Metadata-only, `default_payment_method`-only, `cancel_at_period_end` toggle, `pause_collection` → **no** new paid invoice.
3. **What `billing_reason` + `total` will it carry?** Write it down: `subscription_update`/$0 (trial bookkeeping — skip), `subscription_update`/>0 (real proration — grants today), `subscription_cycle`/>0 (real renewal — grants), `subscription_create`/>0 (first charge — grants).
4. **Will the webhook grant for it?** Trace `handleInvoicePaymentSucceeded` (`src/services/stripe-webhook-handlers/index.ts`). The ONLY billing-timing skip today is `isZeroAmountTrialUpdateInvoice` (`subscription_update` + total 0 + amount_paid 0). Anything else with `total>0` **grants**. If your spawned invoice should NOT grant, the guard does not cover you.
5. **Does the spawned invoice re-enter the SAME handler?** `reanchorAfterPastDueRecovery` is invoked *from inside* the `invoice.payment_succeeded` recovery path, so its $0 invoice re-enters `handleInvoicePaymentSucceeded`. Confirm your guard runs *before* any grant or recursion.
6. **Set `proration_behavior` explicitly** — never rely on Stripe's default (`create_prorations`). State `none` or `create_prorations` deliberately and note the resulting total.
7. **Idempotency-by-id is not enough** (see Principle). You need a *classifier*, not just an `invoice_<id>` dedup key.
8. **Guard AND test.** A new mutation that can spawn a non-granting invoice needs the classifier extended *and* a regression case (mirror `src/services/stripe-webhook-handlers/__tests__/zero-trial-invoice-guard.test.ts`) asserting the spawned invoice is skipped while real `subscription_cycle` / `subscription_update`>0 still grant.

**Open decision (not the $0 class, flagged during the footgun audit):** the reactivate-with-package-change branch in `src/app/api/stripe/renew-subscription/route.ts:354-373` sets `proration_behavior:"create_prorations"`. A **positive-net** proration there fires `invoice.payment_succeeded` (`subscription_update`, total>0) which the webhook **would grant**, even though the route returns `grantEntryRewardToast:false` (intends no grant). Narrow reachability (canceled-but-in-grace sub + a *different* packageId on reactivate). Decide whether that grant is wanted; if not, gate the webhook for that case. Tracked here so it's a conscious choice, not a surprise.

## The rule

- New renewal day = the day the recovery payment landed (AEST, from `invoice.status_transitions.paid_at`), clamped: **25/26/27 → 24** (the major-draw period is the 28th–27th, so the 24th gives ≥3 days before a draw).
- **One clamp, two cohorts.** This reuses the *exact same constants* as the initial-signup rule — `ANCHOR_JOIN_DAYS = [25, 26, 27]` → `ANCHOR_DAY_OF_MONTH = 24` in `anchor-billing.ts`. So a member who **joins** on the 25/26/27 (`getSubscriptionCreateParamsForAnchor`) **and** a past-due member who **recovers** on the 25/26/27 both land on the 24th — by construction, the two paths cannot drift apart. Recoveries on any other day keep that day (no clamp).
- **Short months:** a kept day of 29/30/31 in a shorter month → the **last day** of that month.
- **Mechanism:** `stripe.subscriptions.update(id, { trial_end, proration_behavior: 'none', metadata: { billing_anchor_rule: 'past_due_reanchor' } })`. See *Why `trial_end`* below. `trial_end` is **future-floored**: Stripe does NOT reject a past `trial_end` (it ends the trial immediately and charges), so a non-future computed value aborts the reanchor non-fatally.

## Why `trial_end` (not `billing_cycle_anchor`)

The clamp is what forces this choice. On an **existing** subscription, `subscriptions.update` only offers two ways to move the billing day:

- `billing_cycle_anchor: 'now' | 'unchanged'` — cannot target a future date, so it **can't hit the clamped 24th**, and `'now'` risks an immediate proration.
- `trial_end: <future ts>` + `proration_behavior: 'none'` — any future date, **no charge**.

Only `trial_end` can land the clamped 24th without charging — which is also why the migration script (`migrate-anchor-billing-24`) and the join-anchor rule use the same trick. The live probe (below) confirmed it: no new charge, and `current_period_end == trial_end`. **Do not "optimize" this to `billing_cycle_anchor`** — it cannot honor the clamp.

## Member-facing status (`trialing` shows as "Active")

Setting `trial_end` puts the Stripe subscription into `status = 'trialing'` until the new anchor date. **This is cosmetic.** A `trialing` member is a fully paid, **active** member (`isActive = true`, benefits intact) — we never sell a real free trial. The member UI therefore maps `trialing → "Active"` (`getSubscriptionStatusText`; see `docs/client-state/gotchas.md`). Do not surface "Trial" to members. Stripe's own dashboard/MRR views show `trialing` until the next bill; our DB-based analytics are unaffected.

## Stripe native analytics are inflated by anchoring (not real trials)

Because anchoring uses `trial_end`, Stripe classifies **every** anchored member as a "trial." So the **Billing → Trials** tab ("New trials", "Active trials", "Converted trials", "Trial conversion rate") and any trial-segmented MRR are populated by 25-27 joiners, the anchor-billing migration batch, and reanchored recoveries — **we do not sell a free trial**, so these figures are an anchoring artifact, not a real funnel. They have **no functional impact**: our own DB-based analytics (admin dashboards, my-account, `MembershipAnalyticsService`) count these members correctly as active subscribers. **Do not use Stripe's Trials tab or trial-segmented MRR for business numbers** — use Stripe's Subscribers/Revenue tabs or the app's own dashboards.

## Where it lives

| Concern | Location |
|---|---|
| Pure date math | `src/utils/billing/anchor-billing.ts` — `clampReanchorDay`, `daysInMonthUTC`, `getReanchorTrialEndTimestamp`, `BILLING_ANCHOR_RULE_VERSION` |
| Trigger predicate | `shouldReanchorAfterRecovery` in `src/services/subscription/pauseCollectionPolicy.ts` |
| Orchestrator | `reanchorAfterPastDueRecovery` in `src/services/subscription/SubscriptionCollectionPauseService.ts` |
| Single hook | `handleInvoicePaymentSucceeded` in `src/services/stripe-webhook-handlers/index.ts` |
| Idempotency marker | `User.subscription.lastReanchoredInvoiceId` |

All five recovery channels (Stripe auto-retry, admin charge, user retry, Pay-Now, force-charge) pay the existing `subscription_cycle` invoice, so each emits one `invoice.payment_succeeded` caught by the single hook — no inline-route edits.

## Trigger gate

Fires only when: `billing_reason === 'subscription_cycle'` AND invoice paid AND **dunning detected** AND NOT `cancel_at_period_end` AND `autoRenew !== false` AND `pauseReason !== 'retention'` AND not already reanchored for this invoice.

**Dunning detected** = ANY of these durable signals (an OR — no single one survives every channel):

- `previousSubscriptionDbStatus ∈ {past_due, unpaid}` — catches Stripe auto-retry, admin charge, Pay-Now, force-charge (none pre-flip the DB status).
- `pause_collection` present at payment (captured *before* the resume clears it).
- **`invoice.metadata.dunning_recovery === '1'`** — a durable marker stamped on the invoice when the renewal first FAILED (`handleInvoicePaymentFailed`, the `isRenewal` branch). This is the **only** signal that survives the `renew-subscription` retry channel, which pre-flips DB status to `active` AND clears `pause_collection` before the webhook fires.
- `invoice.attempt_count > 1` — a **weak/secondary** signal only: because our app sets `pause_collection` on failure, Stripe does **not** auto-retry, so a manual recovery's `attempt_count` stays `1`. Kept as belt-and-suspenders for the no-pause edge.

> Why the metadata marker: a live Stripe test-mode probe (`scripts/stripe-probe-reanchor.ts --full`) confirmed a single-failure manual recovery has `attempt_count === 1` under `pause_collection`. Stamping the failed invoice with `dunning_recovery='1'` is the durable, channel-independent dunning signal that closes the renew-subscription gap.

## Idempotency & failure semantics

Atomic claim: `User.findOneAndUpdate({ _id, 'subscription.lastReanchoredInvoiceId': { $ne: invoiceId } }, { $set: { ... } })`. Only the first delivery for an invoice proceeds. Stripe dashboard resends carry fresh `event.id`s and bypass the event-id idempotency layers, so the marker keys on `invoiceId` (the audit row dedupes on it too).

Fully **non-fatal** (recovery already succeeded). On a Stripe-update failure the claim is intentionally **NOT released**: the member self-heals on the next cycle's recovery invoice (new `invoiceId` → fresh claim). We accept a one-cycle anchor miss to preserve single-writer concurrency safety.

## endDate

The orchestrator writes `endDate` from the **same computed `trial_end`** (`new Date(trialEndSeconds * 1000)`) immediately after the Stripe update. Note that the existing renewal-endDate sync later in the *same* `handleInvoicePaymentSucceeded` invocation re-reads the subscription from Stripe and writes `endDate` from `current_period_end`; for the now-`trialing` sub `current_period_end == trial_end` (confirmed by the pre-ship probe, item 2 below), so it lands the same value. In effect the late sync is authoritative and the orchestrator's immediate write is belt-and-suspenders. The emitted `trialing` `customer.subscription.updated` is a further backstop. (If the probe ever showed `current_period_end != trial_end`, this late sync — not the orchestrator — would determine `endDate`, so the probe is what guarantees correctness here.)

## Downstream propagation

Every surface that shows the renewal date reads `endDate` **live** per request (my-account, SubscriptionManagementModal, admin upcoming-renewals / projected-income) → auto-corrects on next fetch. The one external copy that does **not** is the **Klaviyo profile** (`next_renewal_date`, `subscription_end_date`, `past_due_renewal_entries` are pushed snapshots) — the orchestrator re-pushes via `ensureUserProfileSynced` after writing `endDate`, and a defense-in-depth push was added to the active/trialing recovery branch of `handleSubscriptionUpdated`. Historical/point-in-time records (Klaviyo events, the renewal email's date row, `MembershipRenewalCycle.dueAt`, daily snapshots) are correct as-is.

## Audit

- Stripe metadata tag `billing_anchor_rule: 'past_due_reanchor'` (parallels the join rule's `'join_25_27_to_24'`).
- `BILLING_ANCHOR_RULE_VERSION` bumped to 2 (documentation only — nothing branches on it).
- `MembershipStatusHistory` row (`source: 'webhook_past_due_reanchor'`, `dedupeKey: past_due_reanchor_<userId>_<invoiceId>`) capturing old→new anchor day, recovery day, clamped day, and old/new `endDate`.

## Tests

- `npm run test:anchor-billing` — date math (clamp, short months, DST boundaries, year rollover, same-day roll, future-floor, invalid input).
- `npm run test:reanchor-gate` — the trigger predicate (signal isolation + all exclusions).

## Pre-ship verification

**Stripe mechanism — VERIFIED.** `scripts/stripe-probe-reanchor.ts` (`npm run stripe:probe-reanchor`; `--full` adds the Test-Clock dunning lifecycle) ran **13/13 green** against live Stripe test mode, confirming:
1. Future `trial_end` + `proration_behavior:'none'` on a just-paid sub creates no new invoice and leaves the paid invoice paid.
2. The sub reports `status='trialing'` and `current_period_end == trial_end`.
3. The `pause_collection` → `trial_end` ordering works.

It also empirically showed `attempt_count` stays `1` under `pause_collection` — the finding that drove the `dunning_recovery` marker.

**App-level QA — remaining before merge.** Drive a real recovery through the app for each channel. `scripts/seed-past-due-member.ts` (`npm run seed:past-due-member -- --email=<addr>`) creates a ready-to-recover `past_due` member (test-clock sub + loginable user), so this is a few clicks. With `stripe listen` forwarding webhooks, confirm each recovery reanchors `endDate`, sets `lastReanchoredInvoiceId`, writes the `MembershipStatusHistory` row, and refreshes Klaviyo `next_renewal_date`.

## Operations / deploy checklist

- **Stripe Dashboard → Settings → Subscriptions and emails:** ensure **"Send emails about expiring trials" is OFF** — otherwise Stripe emails recovered members about a "trial ending." (The app itself does not handle `customer.subscription.trial_will_end`.)
- **No UI shows "trialing"/"Trial"** for these members — every member- and admin-facing status renders as "Active" (see *Member-facing status*).
- The behavior flip is a single commit; commits are the rollback unit.

## Gotcha: Stripe's $0 "Trial period" invoice (do NOT grant benefits for it)

Setting `trial_end` makes Stripe auto-create a **separate $0 invoice** (`billing_reason="subscription_update"`, line "Trial period for X") and mark it paid. That fires a second `invoice.payment_succeeded`. It is **not** a real payment. The webhook **must skip it** — otherwise it double-grants renewal entries (the real renewal is the `subscription_cycle` invoice) and logs a spurious "Subscribed to X" admin activity row. Guarded by `isZeroAmountTrialUpdateInvoice()` (`src/utils/billing/trial-invoice.ts`); the webhook early-returns. This affected every `trial_end` flow (reanchor + the `migrate-anchor-billing-24` migration + join-anchoring) — **audit** via `npm run find:duplicate-trial-entry-grants`, **remediate** via `npm run reverse:duplicate-trial-entry-grants:dry` (dry-run; add `--apply` to write). No double *charge* (the invoice is $0).

The remediation script only auto-reverses **clean** duplicates — ones where the dup's scoped `data.grants.drawGrants` fully account for its `data.entries` (so `draw == realSibling + dup`). For each it: scope-decrements the draw via `removeMajorDrawEntries` (drawId from the ledger), `$inc accumulatedEntries −data.entries`, and SETs `lastMonthAccumulatedEntries` to the **real sibling renewal's `data.entries`** when the dup is the latest cycle. That last step matters because `lastMonthAccumulatedEntries` is an absolute `$set` baseline read back at every future renewal: decrement-by-`lastMonthDelta` is wrong in the concurrent-write case (both invoices computed the same value, so the dup's net effect was 0), whereas setting it to the real renewal's value is correct in every ordering. The `BenefitsReversed` marker is written **first** as an atomic idempotency claim. **Anomalous** dups (`data.entries` > scoped `drawGrants`, e.g. an empty ledger from a swallowed draw credit) and **standalone** `subscription_update` grants are FLAGGED for manual review, never auto-reversed.

## Related

- `docs/BILLING_ANCHOR_24.md` (join-anchor rule; reanchor is the second anchor-move trigger)
- `docs/STRIPE_COLLECTION_PAUSE_RECOVERY.md`, `docs/CHARGE_PAST_DUE_CUSTOMERS.md`, `docs/FAILED_RENEWAL_PAY_NOW.md`
- Design spec: `docs/superpowers/specs/2026-06-01-past-due-reanchor-design.md`
