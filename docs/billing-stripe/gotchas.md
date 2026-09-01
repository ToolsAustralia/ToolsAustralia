# Billing-Stripe — Gotchas

## `billing_cycle_anchor: "now"` and a pending `trial_end` are mutually exclusive (2026-08-24)

Stripe rejects `subscriptions.update` outright when the requested anchor lands before a trial that
has not ended: *"Trial end (…) cannot be after billing_cycle_anchor (…). Consider ending the trial
(trial_end=now)."* It is a **400 on every attempt**, not an intermittent failure.

That is exactly the collision the tier-upgrade route shipped with. Upgrades are deliberately
pay-first (`proration_behavior: "none"` + `billing_cycle_anchor: "now"`), and anchor-24 members —
25th/26th/27th joiners, plus anyone re-anchored by past-due recovery — sit on a pending `trial_end`
by design. **Result: the entire anchored cohort could not upgrade at all**, permanently.

**The fix is a three-step sequence, and each step's position is load-bearing:**

1. `trial_end: "now"` **in the same pay-first call** (only when the sub is `trialing`) so the anchor
   is legal and the full new-tier charge lands.
2. Read `latest_invoice` / `prorationAmount` and run the existing under-charge check.
3. A **second** `subscriptions.update` re-applying the member's own `trial_end` for the next cycle
   (`proration_behavior: "none"`; falls back to the shared `getNextAnchorTimestamp` only if the
   captured anchor has already lapsed; non-fatal on failure — the charge already succeeded).

**Trap 1 — step 3 before step 2 returns HTTP 500 to a correctly-charged member.** The re-apply makes
Stripe spawn its $0 "Trial period" invoice, which becomes `latest_invoice`. Read it and the route's
"charge must be ≥ half the expected amount" guard trips and returns *"Upgrade pricing error"*.

**Trap 2 — `trialing` is a success state here.** After step 3 the subscription reports
`status: "trialing"`, so both of the route's `status === "active"` success checks had to widen or the
request drops through to the generic 500. A `trialing` member is fully paid and active
([PAST_DUE_REANCHOR.md](../PAST_DUE_REANCHOR.md)); the UI already maps `trialing → "Active"`.

**Trap 3 — `trial_end` is a BILLING boundary, so the re-applied anchor needs a floor.** Stripe
charges the FULL amount at `trial_end`. Re-applying the captured anchor unconditionally would charge
an upgrading member twice within days whenever they upgrade near their anchor (full price on the
20th, full price again on the 24th), with `proration_behavior: "none"` meaning no credit. The route
keeps their anchor **day** but advances to the next **occurrence** when the nearest is under **14
days** away, via `getReanchorTrialEndTimestamp` (next same-day occurrence strictly after, short-month
safe). Any future change to that re-apply must preserve a floor — this is the same class of bug the
past-due reanchor exists to prevent.

**Trap 4 — the spawned $0 invoice must not grant.** It arrives as `subscription_update` with its own
fresh id, moments after the real paid `subscription_update` upgrade invoice — so nothing about the id
or the ordering distinguishes them. Only `isZeroAmountTrialUpdateInvoice` does, and it already
matched this shape, so **no classifier change was required**. The regression lock is **Case D** of
`npm run test:zero-trial-guard`, which dispatches the pair with distinct ids and asserts paid-grants /
$0-skipped. Read the pre-flight checklist in [PAST_DUE_REANCHOR.md](../PAST_DUE_REANCHOR.md) before
touching any of this.

**Trap 5 — the webhook's pending-upgrade gate must accept `trialing`.** An anchored upgrade's LAST
`customer.subscription.updated` carries `trialing`, because the route re-applies the anchor after
charging. `handleSubscriptionUpdated`'s activation gate was the lone `status === "active"` holdout in
that file (every sibling check already accepted `trialing`), and the re-apply widens the race by
adding a Stripe round-trip before the route's own `user.save()`. If the gate loses that race and
rejects, `pendingChange` is never cleared — and a stuck `pendingChange` makes every subsequent
`customer.subscription.updated` early-return, silently suppressing cancel / pause / past_due handling
until the next renewal. It now accepts both.

**Verified against live Stripe, not inferred.** `npm run stripe:probe-upgrade-anchor` runs the whole
sequence in test mode (10/10 green): the control reproduces the original 400 verbatim, the pay-first
call is confirmed to produce **exactly one** invoice (full price, no $0 sibling — so `latest_invoice`
is trustworthy), and the re-apply's $0 invoice is confirmed to satisfy `isZeroAmountTrialUpdateInvoice`
as a real Stripe object. Re-run it before changing either update call.

## A webhook handler returning normally is NOT proof it did its work (2026-08-24)

**A returned promise that did not reject means "no exception escaped" — nothing more.** `handleInvoicePaymentSucceeded` wrapped its entire ~1,400-line body in one `try` whose outer catch logged and returned normally, so `dispatchStripeEvent` reached its hard-coded `shouldMarkAsProcessed = true` and `processQueuedEvent` called `markSucceeded()` on the non-throwing path. A Stripe HTTP 429 mid-handler therefore produced: money captured, no entries granted, queue row `succeeded`, no retry, and no error visible to any automated check.

**Cost:** during the anchor-24 renewal burst at 2026-08-23 14:00 UTC (914 renewals in one minute), **11 members were charged $300.00 in total and received nothing.** July's baseline for the same failure was 1 of 864 (0.12%); August was 1.62% — a 13× rise.

**The second trap — acking closes the healing path.** Because `shouldMarkAsProcessed` was true, `ackProcessedStripeEventOnce` wrote a `ProcessedStripeEvent` row. That collection's `eventId` is **unique**, so replaying the event from the Stripe dashboard was rejected as already-processed. The standard "just replay it" recovery does not work on these; they need a backfill script. **When you skip a grant, never write the dedup row.**

**Fix (both halves — either alone is insufficient):**
1. `handleInvoicePaymentSucceeded` now returns `InvoiceGrantOutcome` — `{granted:true}` only when the grant landed *or* the invoice legitimately grants nothing, otherwise `{granted:false, reason}` where `reason` is required and lands in the queue row's `lastError`; and it **re-throws** when an exception killed an ungranted invoice so the real error text gets there instead.
2. `processQueuedEvent` gates `markSucceeded()` on a new `handlerFailed` flag from `dispatchStripeEvent`.

**Do not gate on `shouldMarkAsProcessed`.** It is a *different question* — "write the dedup row?" — and only **2 of the dispatcher's 27 `case` labels** set it (`payment_intent.succeeded`, `invoice.payment_succeeded`); the other 25 leave it `false` on a fully successful run. Gating `markSucceeded` on it would dead-letter almost the entire event surface. The two flags stay separate deliberately; see [STRIPE_WEBHOOK_QUEUE.md → The ACK gate](./STRIPE_WEBHOOK_QUEUE.md#the-ack-gate-added-2026-08-24-after-the-renewal-surge-incident) for the full return-contract table.

**A failure path that logs below `error` is invisible in production.** `webhookLog` early-returns for any non-`error` level outside development ([index.ts:90-93](../../src/services/stripe-webhook-handlers/index.ts)), *and* `next.config.ts` `removeConsole` strips `console.warn` at build — so a `webhookLog("warn", …)` on a path that now dead-letters leaves an operator with a dead row and nothing to read. That is why `handleInvoicePaymentSucceeded` returns `{granted:false, **reason**}` rather than a bare boolean: the reason is written to the queue row's `lastError`. Any new failure path must either log at `error` or carry a reason — preferably both.

**Un-acking is safe, but only because idempotency already existed.** `PaymentEvent._id = BenefitsGranted-invoice_<invoiceId>` is unique, so a retried `invoice.payment_succeeded` cannot double-grant. Before adding a retry path to any handler, confirm that handler has a comparable unique key — otherwise a retry storm becomes a double-grant storm.

**But "cannot double-grant" is NOT "will re-grant" — do not read the one as the other.** `processPaymentBenefits` writes the `PaymentEvent` ([payment-processing.ts:546](../../src/utils/payment/payment-processing.ts)) **before** calling `grantBenefits` (`:651`). So if `grantBenefits` throws: attempt 1 returns `{success:false}` → the ACK gate requeues → attempt 2 hits the duplicate-key branch and returns `{success:true, alreadyProcessed:true}` (`:593`) → the handler reports success → **the row ACKs with nothing granted**. The very same unique key that makes the retry safe is what makes it a no-op.

The 24 Aug incident died *upstream* of `processPaymentBenefits`, so the ACK gate does fix that case — but this ordering hole is a separate, still-live way to reach the same "charged, no entries" outcome, and no queue-level gate can see it.

**Corrected 2026-08-24 — the net for this shape is NOT the renewal-grant reconciler.** An earlier version of this note said it was. It is not: `PaymentEvent.create` has already run ([payment-processing.ts:526](../../src/utils/payment/payment-processing.ts)) before `grantBenefits` (`:650`) throws, so the row **exists** and `renewalGrantReconciler`'s anti-join finds a match and stays quiet. What that row carries is `data.entries > 0` with an **empty `data.grants.drawGrants`** (`createEmptyGrants` at `:487`) — which is exactly the candidate predicate of [`reconcileActiveMajorDrawEntries`](../../src/utils/draws/reconcile-major-draw-entries.ts) (`:108-112`, `/api/cron/reconcile-major-draw-entries`, `30 16 * * *`). **That** is the net, and it self-heals rather than only alerting.

The two reconcilers are complements, not substitutes: one starts from the paid invoice and catches a **missing** grant row, the other starts from the grant row and catches an **incomplete** one. Reordering the write is a deliberate non-goal of the ACK-gate change — treat it as its own task, with its own idempotency analysis.

**Another non-obvious `{success:false}`: the major-draw gate.** `processPaymentBenefits` closes for any membership invoice that is not a renewal while no draw is accepting entries (`payment-processing.ts:342-352`) — so `subscription_create` and upgrades, never `subscription_cycle`. One landing in a draw gap keeps failing until the next draw opens, which can outlast the ~7.5h retry budget and dead-letter. A burst of dead rows at a draw boundary, all `subscription_create`/upgrade, is this — replay them once the draw is active.

**Two branches must still ACK `true`, or you create an infinite retry loop:** the `isZeroAmountTrialUpdateInvoice` guard (Stripe's $0 trial-bookkeeping invoice, auto-created on every past-due reanchor / anchor-billing migration / join-anchor) and an unrecognised `billing_reason`. Both are legitimate "nothing to grant". Guarded by `npm run test:zero-trial-guard` and `npm run test:ack-gate` (case D).

**Related still-open gap:** `payment_intent.succeeded` has the same shape — `handlePaymentSuccess` returns `false` for metadata defects, which un-acks the dedup row but still lets the queue row go `succeeded`. Deliberately left alone here: several of those `false` returns are defects no retry can fix, so gating them would dead-letter noisily. Needs its own decision.

## The renewal-grant reconciler: what it covers, and the two things it does not (2026-08-24)

`/api/cron/reconcile-renewal-grants` is the only detector we have for a renewal whose grant row was never written ([architecture.md](./architecture.md#renewal-grant-reconciliation--the-paid-but-not-granted-detector-2026-08-24)). It is **not** a general "charged but no entries" detector, and two shapes fall outside it.

**Not covered #1 — the grant row exists but is empty.** If `grantBenefits` throws *after* `PaymentEvent.create`, the anti-join finds a match and stays quiet. That shape belongs to [`reconcileActiveMajorDrawEntries`](../../src/utils/draws/reconcile-major-draw-entries.ts) (empty `data.grants.drawGrants`), which also self-heals it. See the corrected note in the ACK-gate section above; do not confuse the two nets.

**Not covered #2 — the anchor row itself is missing.** It is anchored on `MembershipRenewalCycle`, **which is written by the same handler that can fail.**

`handleInvoicePaymentSucceeded` writes the cycle row at [index.ts:3685](../../src/services/stripe-webhook-handlers/index.ts) — **after** its first Stripe call at `:3507`. So:

| Where the renewal dies | Cycle row? | Grant row? | Reconciler sees it? |
|---|---|---|---|
| After the cycle write, before the grant | yes | no | **yes** — this is the 24 Aug shape |
| Between `:3507` and `:3685` (e.g. a 429 on `invoices.retrieve`) | **no** | no | **no** |
| Before the event is even enqueued (RC-4's HTTP 500s) | no | no | no — but Stripe redelivers, so it self-heals |

The middle row is the hole. It is narrow (one Stripe call wide) and, since the ACK gate landed, such an event now **retries** and eventually dead-letters — which the same cron reports separately as a `dead` row. So the two signals together cover it in practice: no cycle row *and* a dead `invoice.payment_succeeded` row is the tell.

**Do not "fix" this by adding a per-row Stripe call to the cron.** That is RC-3 — the API fan-out that caused the incident (182 req/s against a 100 req/s account cap). For an ad-hoc audit that must be Stripe-complete, use `scripts/backfill-missing-renewal-grants.ts`'s optional Stripe-side pass, which walks Stripe's paid `subscription_cycle` invoices directly. The right permanent fix is to move the cycle write ahead of the first Stripe call — a separate change with its own idempotency analysis.

### The window MUST be on `updatedAt` — `createdAt` is false-clean for dunning recoveries

`MembershipRenewalCycle` rows are **upserted, not inserted.** `upsertRenewalCycleFromFailedInvoice` creates the row with `status: "failed"` at **failure** time (from `invoice.payment_failed`, [index.ts:2989](../../src/services/stripe-webhook-handlers/index.ts)). A later successful retry — Stripe's dunning ladder, or `/api/cron/charge-past-due` — flips it to `"succeeded"` with `findOneAndUpdate`, which leaves `createdAt` **pinned to the original failure date**.

So: a renewal declines on the 24th, is recovered on the 29th, and its grant then fails (e.g. the subscription is `canceled` by then → the non-manageable branch at `:3789`). Money kept, no entries — and under a `createdAt` window that row sits five days outside every window the cron will ever run. **Permanently invisible, for exactly the past-due-recovery population this spec exists to protect.** It shipped that way in `879b9b9d` and was corrected in the follow-up.

Mongoose's `timestamps: true` bumps `updatedAt` on **both** the fresh insert and the failed→succeeded flip, so it is the single field covering both directions. `succeededAt` alone would miss the opposite case — a webhook Stripe delivers days late. Timestamps only ever move *forward*, so an `updatedAt` window has no false-clean direction: a row touched after `until` is picked up by a later run, never dropped. Pinned by `npm run test:renewal-grant-reconciler`, which drives the real upserts and asserts `createdAt` stays at the failure date while `updatedAt` moves.

**Do not switch the window to `dueAt` to get an index.** `dueAt` is the invoice's `period_end`, not when the money moved — a renewal's `dueAt` sits a month away from its charge, so the window would select the wrong invoices entirely.

**Neither `updatedAt` nor `createdAt` is index-backed** (`membershiprenewalcycles` indexes `stripeInvoiceId`, `userId`, `stripeSubscriptionId`, `status`, `dueAt`, `{dueAt,billingReason,status}`, `{userId,dueAt}`). At current volume the daily scan is cheap; past a few hundred thousand rows add `{ status: 1, updatedAt: -1 }` rather than widening the window. A bulk backfill that touches old rows will drag them into the window — that surfaces *old real gaps*, never a false clean, so it is noise at worst.

## One renewal cost 10 Stripe API calls — three were pure waste (2026-08-24)

Every successful membership renewal fans out across three webhook events. Stripe's published caps
([rate-limits](https://docs.stripe.com/rate-limits)) are **100 req/sec globally per account** (reads
and writes share the bucket) and **25 req/sec for any single endpoint**. At the 18 renewals/sec
measured during the 23 Aug burst, `/v1/subscriptions` alone ran at ~73/sec — **2.9× over its own
cap**, versus 1.8× over the global one. *That* is the bucket that broke first, and the 429s it
returned are what killed 11 renewals mid-handler.

**Calls per successful renewal, by endpoint:**

| Event | Call | Endpoint | Before | After |
|---|---|---|---|---|
| `invoice.created` | `subscriptions.retrieve` — read `metadata.packageName` | `/v1/subscriptions` | 1 | **0** |
| `invoice.created` | `invoices.update` — stamp "<Package> Renewal" | `/v1/invoices` | 1 | 1 |
| `invoice.payment_succeeded` | `invoices.retrieve` (expanded) | `/v1/invoices` | 1 | 1 |
| `invoice.payment_succeeded` | `subscriptions.retrieve` — the sub the invoice already carries | `/v1/subscriptions` | 1 | **0** |
| `invoice.payment_succeeded` | `paymentIntents.retrieve` | `/v1/payment_intents` | 1 | 1 |
| `invoice.payment_succeeded` | `paymentIntents.update` — relabel | `/v1/payment_intents` | 1 | 1 |
| `invoice.payment_succeeded` | `charges.update` — relabel | `/v1/charges` | 1 | 1 |
| `invoice.payment_succeeded` | `subscriptions.update` — `pause_collection: ""` | `/v1/subscriptions` | 1 | **0** |
| `invoice.payment_succeeded` | `subscriptions.retrieve` — `endDate` sync | `/v1/subscriptions` | 1 | 1 |
| `payment_intent.succeeded` | `paymentIntents.retrieve` — result discarded | `/v1/payment_intents` | 1 | 1 |
| **Total** | | | **10** | **7** |
| **of which `/v1/subscriptions`** | | | **4** | **1** |

**At 18 renewals/sec:**

| Bucket | Before | After | Stripe cap | Verdict |
|---|---|---|---|---|
| All Stripe calls | ~182/sec | ~127/sec | 100/sec | **still over — needs the limiter** |
| `/v1/subscriptions` | ~73/sec | ~18/sec | 25/sec | under |

**Why each of the three was free to delete:**

1. **`handleInvoiceCreated`'s retrieve bought one metadata field.** Stripe snapshots the
   subscription's metadata onto the invoice at creation — `parent.subscription_details.metadata`
   **and** every line item's `metadata`. Checked against 190 production `subscription_cycle`
   `invoice.created` payloads (`stripewebhookqueue.payload`, the verbatim event): 190/190 are
   `status: "draft"` and 190/190 carry `packageName` on **both** paths. `packageNameFromInvoicePayload`
   reads it with no call. (Stripe's SDK types say the snapshot is taken at *finalization* and
   `invoice.created` fires before that — the production data says otherwise, which is why this was
   settled by measurement, not by reading the types.)
2. **The "fewer round trips" shortcut never fired.** It tested the **pre-Basil top-level
   `invoice.subscription`**, which stripe@18.5.0 does not declare and Basil invoices do not return —
   so the `else` branch ran on *every* renewal, retrieving a subscription the handler had already
   expanded. `resolveExpandedInvoiceSubscription` now reads
   `parent.subscription_details.subscription` (the handler already passes that `expand`; verified on
   live invoice `in_1U7b0KJ3N9Ka6RJMcLvhPOHe` — it comes back as the full object, `status`,
   `metadata`, `pause_collection` and all). The retrieve stays as the fallback for the paths where
   the id came from the user's pending/canonical subscription instead of from this invoice.
3. **`pause_collection: ""` was written for members who were never paused.** `billing_reason:
   "subscription_cycle"` satisfied the old `decideClearPause` disjunction on its own, so every
   renewal spent a `/v1/subscriptions` **write** clearing a pause that did not exist. It now
   requires `pause_collection != null`. Paused members are still resumed on the same code path,
   before benefits (rule R3).

   **`null` is an answer; a missing field is not.** The predicate reads `pause_collection` off the
   subscription **expanded inside `invoices.retrieve`**, so `readPauseCollection` splits three
   states: an explicit `null` is trusted ("not paused", skip the write — the common case, and where
   the saving comes from), a pause object clears, and an **absent** field triggers a
   `subscriptions.retrieve` before deciding. Do not collapse those last two: for a genuinely paused
   member who has just PAID, this webhook is the only automatic clearer — `pay-failed-invoice` does
   not resume and `prepareRecoveredCycleInvoice` explicitly never resumes — so a wrong "not paused"
   guess strands them with every later cycle held as a draft. Live invoices do return the field
   (as `null`), and a scan of ~1,200 live subscriptions found **zero** currently paused, so the
   cohort cannot be observed today; the fallback is what makes that unobservability safe rather than
   load-bearing. It costs one retrieve on a paused member's renewal and nothing otherwise.

   **Bonus, unclaimed at first:** dropping the write also drops one inbound
   `customer.subscription.updated` webhook delivery per renewal — roughly **900 fewer queue rows**
   in the 14:00 minute, on top of the outbound saving.

**The general rule this leaves behind:** you were handed a payload — read it. A `retrieve` for an
object the event already contains costs a full slot in a shared, low, per-endpoint bucket, and the
cost only shows up on the one night of the month when 900 of them land in the same minute. When you
add a Stripe call to a webhook handler, count what that handler already costs per event first.

**Still open after this change:** the global bucket. 7 calls/renewal is ~127/sec at burst — over
100/sec with no headroom — so a shared client-side token bucket was still required, and
`maxNetworkRetries: 2` is **not** cover for it: `_shouldRetry`
(`node_modules/stripe/cjs/RequestSender.js:138`) has no branch on status 429 (it retries
connection errors, 409 and ≥500). It *does* honour a `stripe-should-retry: true` response header,
which Stripe may send on a rate-limit response — but that is Stripe's choice, not ours, so it
cannot be relied on. **This call-count reduction, not the limiter, is what carries account-level
compliance** — see [architecture: what the limiter does and does not meter](./architecture.md#what-it-meters--and-what-it-does-not).
That limiter now exists —
[`src/lib/stripe-rate-limiter.ts`](../../src/lib/stripe-rate-limiter.ts), see
[architecture.md](./architecture.md#client-side-rate-limiter).

## Don't wrap the Stripe singleton in a `Proxy` — it breaks `for await` and `constructEvent` (2026-08-24)

Adding the client-side rate limiter meant putting *something* in front of
`src/lib/stripe.ts`'s singleton, which every payment in the app runs through (~83 importers).
The obvious move — a recursive `Proxy` whose `get` trap returns
`async (...args) => { await acquire(); return fn.apply(target, args); }` — **looks** transparent
and is not. Measured against stripe@18.5.0:

| Probe | Proxy result |
|---|---|
| `list[Symbol.asyncIterator]` | `undefined` |
| `list.autoPagingEach` | `undefined` |
| `for await (const c of stripe.customers.list(…))` | **TypeError: not async iterable** |
| `stripe.webhooks.constructEvent(…)` | returns a **Promise**, not an event |

Two separate ways to break production:

1. **`.list()` / `.search()` return an `ApiListPromise`** — a promise that is *also* an async
   iterator, carrying `autoPagingEach` / `autoPagingToArray`. An `async` wrapper function returns
   a plain `Promise`, so all of that is stripped. **Three** call sites drive these with `for await`
   *on the singleton* — [`cron/reconcile-blocked-transactions/route.ts:62,83`](../../src/app/api/cron/reconcile-blocked-transactions/route.ts),
   [`scripts/backfill-blocked-transactions.ts:117,164`](../../scripts/backfill-blocked-transactions.ts),
   [`scripts/investigate-blocked-transactions.ts:52,78`](../../scripts/investigate-blocked-transactions.ts)
   (all three via `await import("@/lib/stripe")`). Three more — `audit-receipts-refund-accuracy.ts`,
   `backfill-missing-refund-events.ts`, `find-stranded-mini-draw-payments.ts` — build their own
   `new Stripe(...)`, so a Proxy would not have broken them, and the limiter does not meter them
   either (see [architecture](./architecture.md#coverage-what-is-not-behind-the-limiter)).
2. **`stripe.webhooks.constructEvent` is synchronous.**
   [`webhook/route.ts:36`](../../src/app/api/stripe/webhook/route.ts) does
   `event = stripe.webhooks.constructEvent(...)`. Through the proxy that assigns a *Promise*, so
   `event.type` is `undefined` and **every webhook silently falls through the dispatcher** — and
   a signature failure becomes an unhandled rejection instead of a caught 400.

A proxy also **misses** calls it should meter: auto-pagination's follow-up page requests and the
SDK's own network retries don't go back through the public resource method.

**Do it at the HTTP layer instead.** `new Stripe(key, { httpClient })` takes a client the SDK
calls exactly twice — `getClientName()` and `makeRequest()`
(`RequestSender.js:366`, `stripe.core.js:283`) — and `makeRequest` is already awaited internally,
so awaiting a token inside it is invisible to everything above. Return shapes, nested namespaces,
per-call options, error classes and sync helpers are untouched *because you never touch them*.

## Confirm-time card declines are THROWN by the SDK, not returned (2026-07-16)

With `confirm: true`, `stripe.paymentIntents.create` — and likewise `stripe.invoices.pay` and `stripe.subscriptions.update(payment_behavior: "error_if_incomplete")` — **reject with a `StripeCardError`** on an issuer decline instead of resolving with a failed intent. A branch that inspects `paymentIntent.last_payment_error` after `create()` resolves (both one-time-purchase routes have one) **never sees these declines** — they land in the catch block. Previously the generic catch-alls turned them into HTTP 500 with a generic message; production bug: `decline_code: invalid_account` → 500 "Failed to create one-time purchase".

**Fix:** the catch blocks in `create-one-time-purchase`, `create-one-time-purchase-existing-user`, `upgrade-subscription-payment`, and `renew-subscription` (inner `invoices.pay` catch, before the final `throw paymentError`) now detect card errors via [`isStripeCardError()`](../../src/utils/payment/stripe/payment-error-detection.ts) (matches the SDK class name `type === "StripeCardError"` or raw API `rawType === "card_error"`) and return the sibling 400 `Payment failed` shape used by `create-subscription-existing-user` — exact bodies per route in [api.md → Thrown card declines](./api.md#thrown-card-declines--400-payment-failed). Non-card Stripe errors (e.g. `StripeInvalidRequestError`) and non-Stripe errors keep their 500 behavior; `ErrorReport` auto-logging is unchanged (declines still logged, severity `medium` via the expected-decline classifier).

## Tier change on a scheduled-to-cancel sub MUST clear `cancel_at_period_end` (2026-07-06)

A member who is `cancel_at_period_end` (autoRenew off, still active) can still upgrade/downgrade. **Stripe API >
2018-02-28 does NOT auto-clear a pending cancellation when you swap items / change the anchor** — you must send
`cancel_at_period_end: false` explicitly. Both routes previously omitted it:

- **Upgrade** ([upgrade-subscription-payment/route.ts](../../src/app/api/stripe/upgrade-subscription-payment/route.ts)) — the DB (webhook pending-upgrade branch) set `autoRenew=true`, but Stripe still held `cancel_at_period_end=true`, so DB and Stripe diverged and a later `subscription.updated` flipped the DB back to cancelled.
- **Downgrade** ([downgrade-subscription/route.ts](../../src/app/api/stripe/downgrade-subscription/route.ts)) — worse: at period end Stripe fired `customer.subscription.deleted` **before** the downgraded price ever renewed, so the member was **dropped entirely** instead of continuing on the lower tier. This route has no dedicated webhook reconciliation, so it also sets `autoRenew=true` + clears `cancelledAt` in its own DB write.

**Fix:** both `stripe.subscriptions.update` calls now send `cancel_at_period_end: false`. Charge-safe — per Stripe's proration docs, `cancel_at_period_end` is not a proration-triggering param, so it spawns no invoice (distinct from the `trial_end`/anchor footgun in [PAST_DUE_REANCHOR](../PAST_DUE_REANCHOR.md)). The no-tier-change "just resume" path uses `PATCH /api/stripe/update-auto-renew {autoRenew:true}`.

## One-time purchase: gate the new-vs-existing branch on the LOWERCASED user lookup (2026-06-19)

`create-one-time-purchase` does two email lookups: `registeredUser` (line ~167, **lowercased** — `findOne({ email: userEmail.toLowerCase() })`) used everywhere in the route, and previously a redundant case-sensitive `existingUser` (`findOne({ email: userEmail })`). The new-vs-existing branch was gated on the **case-sensitive** one. Because emails are stored **lowercase** (`User` schema `lowercase: true`), a new user who typed their email with **any uppercase** missed that lookup → fell into the `accountCreationPending` (webhook-creates-the-account) branch → the client's one-time success handler (which only acts when `data.user` is present) did nothing → **user logged out / not redirected after a successful payment**, plus a duplicate-account risk.

**Fix:** gate on `registeredUser` (lowercased) and delete the redundant `existingUser` lookup. Safe by construction — `registeredUser` matches in every case the case-sensitive lookup did, plus the mixed-case cases it wrongly missed, so it can only convert a wrong "deferred" into the correct "existing-user + auto-login" path. The standard MembershipModal flow registers the user in step 1 (with `stripeCustomerId`), so once recognized it returns `user + autoLogin + paymentIntentId` and the client auto-logs-in. (The webhook account-creation path `account-manager.ts` remains the fallback for any genuinely-new email and is idempotent on the lowercased email.)

**Incident (found June 2026):** the SDK is pinned to `apiVersion: "2025-08-27.basil"` ([`src/lib/stripe.ts`](../../src/lib/stripe.ts)). Under [Basil](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end), `current_period_start`/`current_period_end` were **removed from the Subscription object and moved onto each Subscription Item** (`subscription.items.data[i].current_period_*`). Reading the root field returns `undefined` — **no throw, HTTP 200** — so `tsc` can't catch it (the routes even declared type-lie interfaces like `interface StripeSubscriptionWithPeriodEnd extends Stripe.Subscription { current_period_end: number }` that asserted the field exists).

Three routes were reading the dead root field:
- [`downgrade-subscription`](../../src/app/api/stripe/downgrade-subscription/route.ts) — **the harmful one.** `current_period_end` is persisted as `previousSubscription.endDate` (the "keep old benefits until" window). With `undefined` it fell back to `startDate + 30 days`. For anyone who downgraded **later than ~30 days into their cycle**, that date landed in the **past** → their benefit-preservation window was void and they lost the remainder of their paid higher-tier benefits. Prod audit (`scripts/audit-downgrade-period-end.ts`): **21/21 downgrades corrupted, 10 materially harmed.**
- [`update-auto-renew`](../../src/app/api/stripe/update-auto-renew/route.ts) and [`upgrade-subscription-payment`](../../src/app/api/stripe/upgrade-subscription-payment/route.ts) — display-only (`currentPeriodEnd`/`currentBillingDate`/`nextBillingDate` in the response). `new Date(undefined * 1000)` → `Invalid Date`. Not persisted, so cosmetic.

**Rule:** to get "when does this period start/end?", call [`getSubscriptionPeriodStart` / `getSubscriptionPeriodEnd`](../../src/utils/payment/stripe/subscription-period.ts) — they read the item-level value (earliest across items) and still support legacy shapes — and keep a fallback only for `undefined`. Never read `subscription.current_period_*` directly, and don't reintroduce a `…WithPeriod*` casting interface. Most siblings (`CancelSubscriptionService`, webhook handlers, `renew-subscription`, `create-subscription*`) already use the helper. Caveat: the item-level fallback needs `items.data` present — `retrieve`/`update` include the first page by default; `list` may need `expand`.

## No debug-agent `fetch` beacons in webhook / payment handlers

`handleInvoicePaymentFailed` ([`src/services/stripe-webhook-handlers/index.ts`](../../src/services/stripe-webhook-handlers/index.ts)) and `confirm-subscription-payment` ([route](../../src/app/api/stripe/confirm-subscription-payment/route.ts)) previously carried leftover automated-debugging artifacts: `// #region agent log` blocks doing `fetch('http://127.0.0.1:7242/ingest/…')` with `user.email` / `user._id` / invoice ids in the body. In prod the localhost target is unreachable (the call fails silently), but it is a needless per-event network call in the most sensitive handlers and leaks PII to anyone running that local ingest server. Removed. When removing such a block, watch for **real** code interleaved inside the region markers — the `confirm-subscription-payment` failure block declared `errorMessage` / `errorCode` / `errorType` / `declineCode` *inside* `#region agent log`, and those are load-bearing (used by the 3DS `requires_action` branch), so only the markers + the `fetch` were stripped, not the declarations.

## Expected payment-decline logs are `warn`, not `error`

`handlePaymentIntentFailed` ("Payment failed: …") and `handleInvoicePaymentFailed` ("Invoice payment failed: …") log the **receipt** of a decline event at `webhookLog("warn", …)`, not `"error"`. In prod, `webhookLog` only emits `level: "error"` (others early-return at `src/services/stripe-webhook-handlers/index.ts:90`), so these expected business events (customer card declines / renewal failures — high volume) stay out of the production error log, where they were drowning real handler exceptions. Genuine exceptions while *handling* a failure (the `catch` blocks — "Error handling invoice payment failed", "Error retrieving subscription") remain `error`. Don't downgrade those.

> **Before any change that mutates subscription billing timing** (`trial_end`, `billing_cycle_anchor`, `proration_behavior`, item swap, `pause_collection`) on an EXISTING subscription: Stripe can auto-spawn an extra `invoice.payment_succeeded` your webhook will try to grant on, and **idempotency-by-id will not stop it** (the spawned invoice has its own id). Classify intent before granting. Read the **pre-flight checklist** in `docs/PAST_DUE_REANCHOR.md` ("Billing-timing footgun — read this BEFORE any anchor / trial / proration change"). The only classifier today is `isZeroAmountTrialUpdateInvoice` (`subscription_update`/$0 only).

## Stripe's $0 "Trial period" invoice double-grants entries — guard it

Setting `trial_end` on an **existing** subscription (the past-due reanchor, the `migrate-anchor-billing-24` migration, join-anchoring 25/26/27→24) makes Stripe **auto-create a separate $0 invoice** with `billing_reason="subscription_update"` and a "Trial period for X" line, and mark it **paid** (it's $0). That fires a second `invoice.payment_succeeded`.

`handleInvoicePaymentSucceeded` normalizes `subscription_update` to a renewal for entry math, so it was **granting membership entries again** for this $0 invoice — double-counting the real `subscription_cycle` renewal — and logging a spurious "Subscribed to X Membership Package" admin-activity row (the recent-activities feed labels any non-`subscription_cycle` membership grant as "Subscribed"). 

Guard: `isZeroAmountTrialUpdateInvoice()` (`src/utils/billing/trial-invoice.ts`) — the webhook early-returns for these. It is narrow: a 100%-off renewal is `subscription_cycle` (still grants); a real upgrade proration is `subscription_update` with `total > 0` (still grants).

> **The guard is the SOLE line of defense.** Every idempotency layer (`PaymentEvent {paymentIntentId,eventType}` unique index, `processedPayments`, `ProcessedStripeEvent`) keys on the per-invoice / per-event id, and the $0 trial invoice carries its OWN distinct id + event — so nothing else catches this double-grant if the guard regresses. Two tests defend it: `test:trial-invoice` (the pure predicate) and `test:zero-trial-guard` (webhook-level — proves `handleInvoicePaymentSucceeded` actually honors the guard; the predicate test can't detect a handler that stops calling it). Keep BOTH green. Audit: `npm run find:duplicate-trial-entry-grants`. Remediate already-granted dups: `npm run reverse:duplicate-trial-entry-grants:dry` (dry-run; add `--apply` to write) — reverses only **clean** dups (scoped `removeMajorDrawEntries` + `accumulatedEntries −data.entries` + `lastMonthAccumulatedEntries` SET to the real sibling renewal's value when latest-cycle), writes a `BenefitsReversed` marker first as an atomic idempotency claim, and FLAGS anomalous/standalone grants for manual review. See `docs/PAST_DUE_REANCHOR.md`.

## Reactivation is SAME-TIER ONLY (no proration tier-swap)

`POST /api/stripe/renew-subscription` resolves `renewalStrategy: "reactivate"` for a cancelled-but-in-grace member (`cancel_at_period_end`/`canceled`, within a 30-day window). That branch **only clears `cancel_at_period_end`** — no charge, no proration. It used to do a `proration_behavior:"create_prorations"` item-swap when a *different* `packageId` was sent; that auto-charges a positive proration whose `subscription_update` (`total>0`) invoice the webhook then grants a **full renewal-sized entry batch** for (off the *old* package metadata), even though the route returns `grantEntryRewardToast:false`. Removed. A differing `packageId` on reactivate is now rejected (`REACTIVATE_TIER_CHANGE_NOT_ALLOWED`, 400).

**Model:** a cancelled member changes tier by **reactivating first, then** using the normal flows — **upgrade** (`/api/stripe/upgrade-subscription-payment`: immediate, full new-tier price, `proration_behavior:"none"` + `billing_cycle_anchor:"now"`, staged via `pendingChange`) or **downgrade** (`/api/stripe/downgrade-subscription`: `proration_behavior:"none"` + `billing_cycle_anchor:"unchanged"`, takes effect at period end via `previousSubscription`). The reactivate UI only ever sends the member's *current* `packageId`, so this was latent, not a live production bug. See `docs/PAST_DUE_REANCHOR.md`.

> The Reactivate button's *visibility* is gated on the DB heuristic `!autoRenew && isActive` (not live Stripe `cancel_at_period_end`), so it's looser than backend reactivate eligibility — a known edge (admin-set `autoRenew=false` / flag drift can show it for a non-scheduled-cancellation member and click → `create_new` full charge). See `docs/subscription/gotchas.md` → "Reactivate button gating is looser than backend reactivate eligibility".

## Charge past-due — runbook

(Migrated from former `docs/CHARGE_PAST_DUE_CUSTOMERS.md`.)

### Multi-layer protection on the bulk endpoint

`POST /api/admin/invoices/charge-past-due`:

1. Admin-only (`role === "admin"`)
2. Per-admin rate limit: 1 / 5 minutes (disabled in dev)
3. Global rate limit: 1 / 24 hours (prevents Stripe Radar spikes; disabled in dev)
4. Confirmation: must POST `{ "confirmation": "CHARGE" }` exactly
5. Optional global mutex: `ChargeJobLock` (auto-expiry 30 minutes)
6. Time-based DB idempotency: 24h since last `InvoiceChargeLog.attemptedAt` on the invoice — enforced inside [`payOpenInvoiceAsPastDueAdmin`](../../src/server/admin/chargePastDueShared.ts) so both the bulk and per-user (`POST /api/admin/users/[id]/charge-past-due`) routes inherit it. Skipped attempts write a `skipped` log row with `skipReason: "recently_attempted"`.
7. Stripe idempotency keys: `admin-charge-${invoiceId}` — passed as the third arg to `stripe.invoices.pay`. Stripe caches the response for 24h, which matches the DB window: by the time a legitimate next-day retry runs, both have cleared.
8. DB status verification: only invoices whose user has `subscription.status === "past_due"`

### Invoice filter — only charge if ALL true

- Stripe invoice status `"open"` OR `"past_due"`
- Collection method `"charge_automatically"`
- `amount_remaining > 0`
- `default_payment_method` set
- `finalized_at` exists
- Not already paid/uncollectible/void
- User's DB subscription status is `"past_due"`
- Not charged in last 24 hours

### Race condition — DB says past_due, Stripe says paid

Mark as `status: "skipped"`, `skipReason: "already_paid"`. **Don't** treat as failure. This is just DB/Stripe desync that the next webhook will reconcile.

### Permanent-failure error codes (set 24h `canRetryAt`)

- `authentication_required` (3DS)
- `card_declined`
- `expired_card`
- `generic_decline`

`insufficient_funds` is treated as a *temporary* skip — bulk retry skips it, but user-driven retry can still attempt.

### Batch processing tuning

- 15 invoices per batch
- 500ms delay between batches
- `Promise.allSettled()` so individual failures don't kill the batch
- Max 100 invoices per request (Stripe list limit)

### Run audit — drill-in UI

`/admin/past-due-history` shows every bulk run with its triggering admin, lifecycle status, and attempt totals. Clicking a run opens a drawer with per-invoice `InvoiceChargeLog` rows for that run. The **Manual Retries** tab alongside it lists all `InvoiceChargeLog` rows where `chargeRunId === null` (per-user retries). Data is backed by the `ChargeJobRun` collection (see [admin/models.md](../admin/models.md#chargejobrun)) and served by `src/services/admin/chargePastDueHistory.ts`.

### Late re-check — `no_longer_past_due`

`payOpenInvoiceAsPastDueAdmin` re-fetches `subscription.status` from the DB immediately before calling `stripe.invoices.pay`. If the status has flipped from `past_due` to `active` between list-time and charge-time (e.g. a concurrent Stripe webhook already settled the invoice), the attempt is skipped with `skipReason: "no_longer_past_due"` — avoiding a spurious Stripe call and a double-charge attempt. This skip is counted in `ChargeJobRun.totals.skippedBreakdown.noLongerPastDue`.

### Logs

`InvoiceChargeLog` has the full audit trail. Fields:
- ids: `invoiceId`, `customerId`, `userId`, `adminId`
- status: `success | failed | skipped`
- timing: `attemptedAt`, `canRetryAt`, `nextPaymentAttempt`
- payload: `result` (sanitised — no PAN, no full PM objects)

- linkage: `chargeRunId` (ObjectId, nullable) — set to the `ChargeJobRun._id` when the row was produced by a bulk run; `null` for per-user manual retries. Used by the audit UI's "Manual Retries" filter (`chargeRunId: null`).

Indexes: compound unique on `(invoiceId, attemptedAt-day)`; lookups by customer / admin / status / canRetryAt; sparse compound `(chargeRunId, attemptedAt-desc)` for run drill-in.

## Stranded past-due invoices — "this invoice can no longer be paid"

When Stripe's smart retries on a past-due invoice exhaust, the invoice transitions into one of three "open-but-dead" terminal states from the renewal pipeline's perspective:

- `status: "uncollectible"` (Stripe explicitly gave up), or
- `status: "void"` (manually voided, e.g. by a prior failed recovery), or
- `status: "open"` with `attempt_count >= 1 && next_payment_attempt == null` (no scheduled retry left).

In any of these states `stripe.invoices.pay()` rejects with "This invoice can no longer be paid." The only way forward is to void the dead invoice and finalize a fresh held draft on the same subscription (one is generated per missed cycle while `pause_collection: keep_as_draft` is in effect), then pay that.

The admin per-user "Charge past due" button auto-detects this state and routes through the void + re-bill flow. See [docs/admin/backend.md](../admin/backend.md#auto-recovery-wrapper-chargeorrecover) for the `chargeOrRecover` wrapper. The bulk cron job does NOT auto-recover (kept conservative to limit blast radius); admins drain the backlog from the Past-Due Charge History page's run-detail drawer (multi-select stranded rows → Recover Selected) after Phase 3 ships.

## Payment Element migration / confirmation method

(Migrated stub — _TODO: read `docs/PAYMENT_ELEMENT_CONFIRMATION_METHOD_FIX.md` and `docs/SUBSCRIPTION_PAYMENT_ELEMENT_MIGRATION.md` and merge their content here in a refresh pass._)

Brief: the project migrated subscription checkout from confirmCardPayment-style flows to Stripe's Payment Element (single integration that handles cards + Apple Pay + Google Pay etc.). The migration affected `confirm-subscription-payment` and several create-subscription routes. Known fix: confirmation method must be set explicitly on the PI.

## Failed renewal — pay now flow

(Migrated stub — _TODO: read `docs/FAILED_RENEWAL_PAY_NOW.md` and merge here._)

Brief: `/api/stripe/renew-subscription` lets a user retry a failed renewal invoice. On success, `resumeAfterSuccessfulRenewalPayment()` runs — same code path as the webhook's success handler.

## Pause-collection orphans

See [subscription/gotchas.md](../subscription/gotchas.md#pause-collection-orphans) for the full failure modes. Summary: if a renewal succeeds but `resume` doesn't run, the sub stays paused, future cycles stay draft, no billing happens.

Audit: `npx tsx scripts/list-active-paused-subscriptions.ts --limit=200` (CSV to stdout, dry-run by default).

### Retention pause keeps Stripe `active` while the app owns `paused`

The 30-day `pause_30d` retention offer (`RetentionPauseService`) applies `pause_collection: { behavior: "void", resumes_at }` + `metadata.pauseReason: "retention"`. **Stripe leaves the subscription's own `status` as `"active"` throughout a `pause_collection`** — it never emits a `"paused"` status on the object. So the app owns a **DB-only** `paused` state (`User.subscription.status = "paused"` + `isActive = false` across `[pausedFrom, pausedUntil)`), and the webhook must be careful not to let Stripe's still-`active` payload overwrite it:

- **`handleSubscriptionUpdated`** sets `paused` only for a retention pause whose freeze window has begun (`now >= pausedFrom`) — via the pure `decidePauseTransition(...)` in `pauseCollectionPolicy.ts`, **shared with the retention cron** so the two can't drift (unit-tested: `npm run test:pause-transition`) — and its else-branch active-restore is guarded **`prevSubStatus !== "paused"`** so a routine `customer.subscription.updated` (which still says `status:"active"`) cannot un-freeze the member mid-window.
- **`handleInvoicePaymentSucceeded`** restores `paused → active` and clears `pausedFrom`/`pausedUntil` when a paid invoice arrives while the DB status is `paused` — this is the resume charge (at `pausedUntil`, or an early `resumeRetentionPause`). Because the void pause discards every other invoice, a paid invoice in the paused state can only be the resume, so benefits come back only after a successful payment; a failed resume stays `past_due`.
- **Do NOT** trust `subscription.status` to tell you a member is paused — check `metadata.pauseReason === "retention"` + the DB pause window. Full flow + the flip/backstop split: [subscription/backend.md → RetentionPauseService](../subscription/backend.md#retention-pause-the-paused-membership-state) and [subscription/gotchas.md](../subscription/gotchas.md#retention-pause--the-app-owns-the-paused-state-stripe-stays-active).

### Paid-invoice clear-pause decision is now centralized

The webhook handler's `shouldClearPauseForCollection` decision (in
`src/services/stripe-webhook-handlers/index.ts`, the paid-invoice path that runs
`resumeAfterSuccessfulRenewalPayment` before `processPaymentBenefits`) no longer
inlines the legacy `||` chain. It delegates the **entire** decision to
`decideClearPause(...)` from `@/services/subscription/pauseCollectionPolicy`
(single source of truth). `shouldClearPauseCollectionAfterPaidInvoice` is no
longer imported here directly — it is still invoked, but only via
`decideClearPause`.

Behavioral impact:

- **A pause must actually exist (added 2026-08-24).** `decideClearPause` now
  short-circuits to `false` when `pauseCollectionPresent` is false, so the decision
  is exactly `pauseCollectionPresent && pauseReason !== "retention"`. Every disjunct
  of the old
  `shouldClearPauseCollectionAfterPaidInvoice(...) || recordMembershipRecurringAffiliate || subscription.pause_collection != null`
  chain was ORed with that same non-null clause, so the only outcome that changed is
  the one where nothing was paused — and `pause_collection: ""` on an unpaused
  subscription is a Stripe no-op. What it is **not** is free: it was one
  `/v1/subscriptions` write per renewal on the endpoint that broke on 23 Aug. See
  "One renewal cost 10 Stripe API calls" above.
- **Recovery pauses: unchanged.** A past-due/unpaid recovery or a
  `subscription_cycle`/`_threshold`/`_update` renewal on a subscription that **is**
  paused still clears the pause and resumes collection, on the same code path, before
  benefits. Recovery channels that lift the pause themselves before the webhook lands
  (`chargePastDueShared`, `renew-subscription`) simply no longer trigger a second,
  redundant clear.
- **Retention pauses: never cleared by a paid invoice.** If
  `subscription.metadata.pauseReason === "retention"`, `decideClearPause`
  short-circuits to `false` before any legacy condition runs, so a retention
  `pause_30d` survives an incoming paid invoice instead of being silently
  resumed. See [subscription/cancellation-flow.md](../subscription/cancellation-flow.md#pause-collision-phase-3).

## Stripe metadata 500-char cap

Each Stripe metadata value is capped at 500 chars. Exceeding that on **any** key rejects the entire `subscriptions.create` / `paymentIntents.create` / `customers.update` call with `Metadata values can have up to 500 characters`, which surfaces to the user as a generic payment error and blocks checkout.

The most frequent offender is `capi_event_source_url` — Facebook ad referer URLs (long UTMs + `fbclid` + `_aem_` + `brid`) routinely run 500+ chars. All routes building Stripe metadata must run a referer through [`safeEventSourceUrl`](../../src/utils/tracking/event-source-url.ts) before storing it. See [tracking/gotchas.md](../tracking/gotchas.md#stripe-metadata-500-char-cap-on-capi_event_source_url).

If you add a new metadata key that holds user-supplied or URL-derived content, length-check or truncate at the boundary — don't trust upstream values.

## Don't `expand: ['latest_payment_intent']`

On Stripe API `2025-05-28.basil`, this returns:

> `This property cannot be expanded (latest_payment_intent)`

Use `expand: ['payment_intent']` instead.

## Disputes

`charge.dispute.closed` with `status: "lost"` reverses benefits as a full refund — same path as `charge.refunded`. `charge.dispute.funds_withdrawn` reverses provisionally; if the dispute is later won, no automatic re-grant — admin must replay manually via `POST /api/admin/users/[id]/payment-events/[eventId]/...` _TODO: verify exact admin endpoint_.

## Webhook retries

Stripe retries failed deliveries with exponential backoff. The dedupe via `ProcessedStripeEvent` is what makes retries safe. If the dedupe row gets stuck (e.g. crash *between* writing the row and finishing work), the next retry will see the row and skip — manual intervention needed to actually replay. _TODO: document the recovery procedure for that case._

## `incorrect_number` vs `invalid_number` — the permanent-issue set was missing the real one

Stripe defines **both** `incorrect_number` and `invalid_number` as decline codes, and `PERMANENT_ISSUE_DECLINE_CODES` originally listed only the latter. Measured against production `InvoiceChargeLog` on 2026-07-31: **`incorrect_number` = 4,202 rows all-time, `invalid_number` = 0.** So the filter was carrying a string this account never emits while missing the one that fires constantly — `incorrect_number` was the single largest dead-card decline in the 28–31 Jul window (300 of 999), and every one of those cards was being auto-allowlisted, which cannot help (a mistyped or reissued number keeps declining regardless of Radar).

Both are now in the set. **When adding a decline code anywhere, check the string against real `InvoiceChargeLog` rows rather than the Stripe docs list** — the docs enumerate codes the account may never produce, and a wrong string fails open and silently.

## A failed re-bill must write `past_due` back to Mongo

`invoice.payment_failed` fires the dunning notification on `isRenewal || isRebill`, but the **status write** was gated on `isRenewal` alone. A stranded-member re-bill (`mintCurrentCycleInvoice`) fails as `billing_reason: "subscription_update"` → `isRebill`, not `isRenewal` — so a failed re-bill emailed the member while leaving Mongo saying `active`. Combined with `unpauseAndAnchorNow` emitting a `customer.subscription.updated` carrying status `active` (which the handler mirrors), that is how an account ends up `active` while delinquent for weeks. Two production accounts had drifted this way by 2026-07-31.

There is now a dedicated `else if (isRebill && !isRenewal)` branch that writes `past_due` + `isActive: false` (stamping `pastDueAt` only on first transition). It is deliberately **separate** from the `isRenewal` branch rather than folded into its condition, because that branch also triggers `pauseAfterRenewalFailure` — and a re-bill must NOT re-pause a member the recovery flow just unpaused.

**Residual, not fixed:** if the `customer.subscription.updated`(active) event is processed *before* the `invoice.payment_failed`, `prevSubStatus` is already `active`, so `isRebill` computes false and neither the notification nor the status write fires. `npm run reconcile:stale-active:dry` detects that shape by comparing Mongo against live Stripe.

## Stripe issuer-directed auto-block + allowlist override

**The mechanism.** When the issuing bank declines a card with certain hard codes (`lost_card`, `stolen_card`, `pickup_card`, etc.), Stripe **auto-blocks future attempts** on that card — globally, across the entire Stripe account — to prevent decline-fee waste. The Stripe dashboard's activity log surfaces this as *"directed Stripe to block future attempts."* No further attempts on that card will reach the issuer; they fail at Stripe.

**The override.** Adding the card fingerprint to Stripe's built-in `card_fingerprint_allowlist` Radar value list bypasses **both** Radar fraud rules **and** the issuer-directed auto-block. The dashboard's "Add to allow list" button uses this same API (`radar.valueListItems.create`). This is the only programmatic escape hatch. Aliases on built-in Radar lists follow Stripe's `<entity>_<field>_<allowlist|blocklist>` convention; verify per-account with `npm run find:radar-lists`.

**Webhook signal.** A blocked PI surfaces as `payment_intent.payment_failed` whose `charge.outcome.type === "blocked"` **or** `charge.outcome.network_status === "declined_by_network"`. This signal is what distinguishes "Stripe is blocking future attempts on this card" from a normal one-off decline. The `payment_intent.payment_failed` branch in the webhook examines `outcome` to decide whether to call `AllowlistService.evaluateAndApply()`.

**Best-effort branch.** The auto-allowlist call in our webhook is wrapped in `try/catch` and swallows errors via `webhookLog("error", ...)`. This is intentional: if we re-threw, Stripe would retry the entire `payment_intent.payment_failed` event and re-run the (already-completed) `handlePaymentFailure` handler — re-pausing the sub, re-firing analytics, re-sending Klaviyo events. The trade-off is that allowlist-call failures need to be recovered through the admin bulk page (`/admin/blocked-transactions`), which lists all blocked candidates regardless of whether the webhook attempt succeeded.

**Filter rules.** We **never** auto-allowlist cards whose decline_code is `lost_card`, `stolen_card`, `pickup_card`, or `fraudulent` (real fraud signals — allowlisting would expose us to chargebacks). We also skip permanent-issue codes — `expired_card`, `incorrect_cvc`, `invalid_account`, **`incorrect_number`**, `invalid_number`, `invalid_expiry_year`, `invalid_expiry_month` — because allowlisting them is pointless without customer action (the issuer will keep declining; Account Updater doesn't help most of these). We **only** allowlist if the user has at least one prior succeeded `PaymentEvent` (i.e. is a paying member, not a fraudster). Skipped decisions still write an `AllowlistAction` row with `reason: "filter_fraud_signal"`, `"filter_permanent_issue"`, or `"filter_not_member"` for audit. Admin can override any filter via the **"Allowlist with override"** button on `/admin/blocked-transactions`, which calls `/api/admin/allowlist/apply` with `allowOverride: true` and records `reason: "manual_admin_override"`.

**Capture coverage (2026-05-07).** The webhook now listens to **both** `payment_intent.payment_failed` and `charge.failed`. The latter is the universal "any failed charge" event and catches issuer-blocked subscription renewals where the PI event sometimes does not fire. Only `payment_intent.payment_failed` triggers `AllowlistService.apply()` — the `charge.failed` branch is write-side-only — so we never double-record `AllowlistAction` rows. The reconcile cron is now self-healing (upserts missing rows on every run, 48h window) and `npm run investigate:blocked` is a read-only diagnostic that compares Stripe and Mongo for a date window. **Deployment requirement**: `charge.failed` must be enabled on the Stripe dashboard webhook subscription.

## Past-due bulk charge hitting blocked-card failures (Phase B.5 sweep)

The webhook auto-allowlist handler runs only on **new** `payment_intent.payment_failed` events. Cards that were Stripe-auto-blocked **before** the webhook was wired live have a `BlockedTransaction` row (after the Phase B backfill) but **no** corresponding `AllowlistAction` — and therefore are not in Stripe's `card_fingerprint_allowlist` list. Historically, "Charge Past Due Customers" ran against those cards and hit a wall of blocked-failure decline fees.

**This is now automated.** [`src/services/allowlist/reconcileAllowlistFromBlocked.ts`](../../src/services/allowlist/reconcileAllowlistFromBlocked.ts) is the reusable sweep both the manual script and the charge job now share. It aggregates `BlockedTransaction` for a scope down to one `EvalInput` per unique card fingerprint (freshest block wins) and calls `AllowlistService.apply(input, "admin_bulk", performedByUserId, false)` per fingerprint — same eligibility gate as always (paying member, no fraud-signal, no permanent-issue decline code), `allowOverride: false`. It's idempotent: `isAllowlisted()` short-circuits already-allowlisted fingerprints before any Stripe/Mongo write. Scope is either `{ kind: "customers", stripeCustomerIds }` (used by the charge job — see below) or `{ kind: "window", since?, limit? }` (used by the standalone script). Returns a `ReconcileSummary = { evaluated, added, alreadyAllowlisted, skipped: { fraud, permanent, notMember }, errored }`.

`startChargePastDueJob` (`src/server/admin/chargePastDueJob.ts`) now runs this sweep as **Phase 0** — scoped to `{ kind: "customers", stripeCustomerIds }` for exactly the run's own worklist customers — right after the worklist snapshot and before any chunk charges. It's best-effort (its own try/catch, `console.error` on failure, never aborts the run or touches the `ChargeJobLock`) and returns the `ReconcileSummary` as `allowlist` on the `start` response; `ChargePastDueModal` surfaces it ("Allowlisted N previously-blocked cards before charging"). See [docs/admin/backend.md](../admin/backend.md) for the charge-job side. **No cron was added** — Phase 0 only fires when an admin kicks off a bulk charge run.

[scripts/sync-allowlist-from-blocked-transactions.ts](../../scripts/sync-allowlist-from-blocked-transactions.ts) now delegates to the same `reconcileAllowlistFromBlocked({ kind: "window", ... })` — its own behavior is unchanged (verified: prod dry-run eligibility buckets identical pre/post-refactor). It remains the **one-time, full-history catch-up** tool for deep backlog (e.g. after a `backfill-blocked-transactions` run), independent of any charge run — Phase 0 only ever sweeps the customers in the run's own worklist, not the full collection.

Idempotent on the *added* path: pre-checks `AllowlistAction`/Stripe (`isAllowlisted`) for an active `added` row per fingerprint and short-circuits if found. Re-runs against already-allowlisted cards make zero Stripe calls and zero Mongo inserts. **Re-runs against previously-*skipped* fingerprints will re-evaluate** (which is intentional — a customer who wasn't a paying member at first-skip time may have since paid, flipping them eligible) and insert a fresh `skipped` row each time. Acceptable for occasional re-runs; don't loop the script.

```
npm run sync:allowlist-from-blocked:dry                    # eyeball the eligibility breakdown
npm run sync:allowlist-from-blocked                        # live: writes to Stripe Radar + Mongo
npm run sync:allowlist-from-blocked -- --no-limit          # if your account exceeds 1000 unique blocked fingerprints
```

Once the script (or Phase 0) runs, the live webhook handles all subsequent blocks. Phase D's reconciliation cron is the recurring safety net (see below).

`maxNetworkRetries: 2` on the global Stripe client (`src/lib/stripe.ts`) handles transient blips and 429s during the script's pagination automatically.

**Phase A (write side) is in place.** The Stripe webhook now persists every blocked PI to the [BlockedTransaction](./models.md#blockedtransaction) collection (best-effort, in its own try/catch so a Mongo write failure does not block the allowlist call that follows). All new blocked PIs are captured automatically.

**Phase B (backfill) is in place.** [scripts/backfill-blocked-transactions.ts](../../scripts/backfill-blocked-transactions.ts) imports historical data from Stripe using the Search API (`status:"failed"` query). Idempotent on PI id. Run once with a wide window (e.g. 90 days) and verify Mongo count vs. Stripe count for the same window. Always dry-run first:

```
npm run backfill:blocked-transactions:dry -- --from=2026-02-01 --to=2026-05-01 --limit=2000
npm run backfill:blocked-transactions     -- --from=2026-02-01 --to=2026-05-01
```

**Phase C (read flip) is in place.** [`AllowlistService.listBlocked(filter, opts)`](./architecture.md#listblocked-mongo-backed-read-path) is the Mongo-backed read path: cursor-paged over `BlockedTransaction`, with eligibility joins batched into a serial `User.find` followed by parallel `AllowlistAction.find` + `PaymentEvent.distinct`. The verdict logic was extracted to a pure `computeEligibility(doc, maps)` helper for testability.

The route at `GET /api/admin/allowlist/blocked-cards` returns `{rows, nextCursor, total}` — see [api.md](./api.md#get-apiadminallowlistblocked-cards). The admin UI (`useBlockedCards` hook → `BlockedTransactionsManagement`) renders "Showing X of Y" + a Load-more button.

**Phase D (reconciliation cron) is in place.** [src/app/api/cron/reconcile-blocked-transactions/route.ts](../../src/app/api/cron/reconcile-blocked-transactions/route.ts) runs daily at 03:15 UTC and compares yesterday's `BlockedTransaction` row count against `stripe.charges.search` for `status:"failed"` charges with `outcome.type === "blocked"` in the same UTC window. Drift > 5% (via the exported `computeDriftRatio` helper) emits a `console.error` with the structured summary; OK runs emit a `console.log`. This is the ongoing safety net: if a future webhook regression silently drops blocked rows, the next day's reconcile alert flags it. Architecture detail: [architecture.md → Reconciliation cron — Phase D](./architecture.md#reconciliation-cron--phase-d).

**Phase E (legacy code removal) is complete.** The legacy `listBlockedFromStripe` code path, its `MAX_PAYMENT_INTENTS_SCANNED` cap, the route's `?source=` query param, and the route's `maxDuration: 60` setting have all been removed — `listBlocked` is now the only read path. Rollback if needed is via `git revert` of the Phase E commit (re-introducing the Stripe-pagination escape hatch is no longer a query-string flip).

## Resubscribe retires the stale pending incomplete sub

Before creating a new subscription, both `create-subscription` routes (`src/app/api/stripe/create-subscription/route.ts` and `create-subscription-existing-user/route.ts`) call `cancelIncompleteSubscriptionAndVoidInvoice(user.subscription.pendingStripeSubscriptionId)` after the resubscribe guard (non-fatal, skipped when the id matches `cancelPreviousSubscriptionId`). This cancels any stale `incomplete` checkout and voids its unpaid initial invoice so abandoned subs don't accumulate in Stripe or generate dunning emails later. The helper is idempotent and never throws — a failure is logged but does not block the new checkout. See [subscription/gotchas.md](../subscription/gotchas.md#list-status-trialing-leaks-incomplete-subs--false-existing-subscription-block) for the root-cause history and the `cleanup-abandoned-incomplete-subscriptions` backfill script for sweeping subs that pre-date this fix.

## Metadata drift locks customers out of checkout for 24h

Subscription create routes accept a client-supplied `subscriptionRequestId` UUID and use it as the Stripe idempotency key. The same call attaches request-derived metadata (`capi_client_ip`, `capi_user_agent`, `capi_fbc`, `capi_fbp`, `capi_ttclid`, `capi_ttp`, `capi_event_source_url`, `attr_*`) which is rebuilt server-side on every call. If the customer retries with the same UUID and **any** of those values has drifted (mobile IP change, fbc rebuilt with different `Date.now()`, different referer), Stripe rejects with `StripeIdempotencyError` and locks the customer out of that key for 24h.

Mitigated by:
- [P10. One-shot idempotency-retry](./patterns.md#p10-one-shot-idempotency-retry-on-key-collisions) — catches the error, cancels the orphan, retries with a fresh key.
- `extractFBCFromRequest` reading `_fbc` cookie first ([docs/tracking/gotchas.md](../tracking/gotchas.md)) — eliminates the most common drift cause.
- The TikTok keys (`capi_ttclid` / `capi_ttp`, added 2026-07-29) are cookie-reads, not per-call constructions, so they are stable across a retry the way `capi_fbc` is. The one drift window is `_ttp`: the pixel SDK sets that cookie asynchronously, so a very early first attempt can lack it while the retry has it. P10 covers that case; do not add per-call-derived values (anything using `Date.now()`, a random id, or a header that varies) to this metadata block.

## 2026-05-15 504 storm — index DDL + self-call in the webhook path

**Root cause.** The async-queue cutover (commit `8031be29`) made the receiver
"thin" on paper but left `connectDB()` + `ensureIndexesOnce()` in the
*synchronous, pre-ack* path of `/api/stripe/webhook`. `ensureIndexesOnce()` was a
per-lambda-instance singleton wrapping `ensureCriticalIndexes()` — ~25–30
serialized Atlas admin/DDL operations (drop-redundant + create-unique +
ensure-index sweeps). On a warm instance it was a cached no-op, but the wrapper
re-ran the full DDL on every *cold* instance. A bulk-charge burst spun up many
cold lambdas at once, all racing the same Atlas admin commands; command latency
blew past the 60s `maxDuration`, so the receiver itself started returning **504**.
The 504s starved/saturated the deployment, and the receiver→worker HTTP
self-call (already patched once in `6bc91a0d` for the Vercel-challenge issue)
then `429`/`ECONNRESET`'d against the saturated deployment — so even enqueued
events never got processed.

**Fix (Tasks 1–6).** Index DDL moved entirely off the request path into the
`migrate:ensure-core-indexes` migration (`scripts/migrate-ensure-core-indexes.ts`,
must run before deploying receiver changes — it owns the dedup-layer-4 unique
index). `ensureIndexesOnce()` deleted. The `/api/stripe/process-event` worker
route and the HTTP self-call were deleted; processing now runs in-process via
`processQueuedEvent` (receiver `after()` / sweeper / admin Replay). Receiver is
now genuinely thin: `connectDB → verify → enqueue → after() → 200`. See
[STRIPE_WEBHOOK_QUEUE.md](./STRIPE_WEBHOOK_QUEUE.md).

## Error visibility in create-subscription routes

Both `POST /api/stripe/create-subscription` (guest/registration) and
`POST /api/stripe/create-subscription-existing-user` (session-authenticated) now
capture non-thrown early returns via `rejectAndLog` from
`@/utils/error-reporting/reject-and-log`.

**What is captured:**
- `409 EXISTING_SUBSCRIPTION` — the live-subscription gate (both routes; the primary motivating case)
- `409` from `checkCanCreateSubscription` when its body carries `code: EXISTING_SUBSCRIPTION`
- `500` "Stripe configuration missing" (missing `stripePriceId`)
- `503` "Payment setup is still in progress" (no `confirmation_secret` on `latest_invoice`)
- `400` "Payment failed" inside the `invoices.pay` try/catch when a Stripe error code is present (existing-user route only; the body uses `...(errorCode && { code: errorCode })`)
- `400` "Payment method setup failed" in the guest route's customer-attach branch, when `code: errorCode` is set — captured only when the code is present (codeless variant is skipped by the classifier)

**What is intentionally NOT captured:**
- `401 / 403 / 404 / 429` returns — routine auth/rate-limit signals, not actionable errors
- Genuinely codeless `4xx` returns (e.g. "Payment method not properly set up", "Invalid or inactive package") — no `code` field, so `classifyHttpRejection` skips them. (Note: returns that conditionally set `code` ARE wrapped — the classifier still skips them at runtime when the code is absent.)
- The `403` major-draw gate (`enforceMajorDrawOpenForNewPurchasesOr403`) — not a business error
- The entire top-level `catch` block in each route — thrown errors already auto-log via `ErrorLoggingService` / `autoLogPaymentErrorServer`; wrapping those would double-log

**No double-logging risk:** `rejectAndLog` is only on non-thrown paths; the `catch` blocks are untouched.

## A/B-test attribution on subscription invoices is initial-only

In `services/stripe-webhook-handlers/index.ts`, the `invoice.payment_succeeded`
path used to read `experimentId` / `variantId` from `subscription.metadata` for
every invoice. Because subscription metadata persists for the lifetime of the
subscription, every monthly renewal credited the original variant — inflating
the original experiment's "revenue" indefinitely, even months after it ended.

The fix gates the metadata pickup on
`expandedInvoice.billing_reason === "subscription_create"` (the initial
sign-up invoice). Renewals (`subscription_cycle`) and tier changes
(`subscription_update`) skip the A/B attribution but still grant benefits and
fire tracking normally. Same gate is applied when falling back to
`paymentIntent.metadata` in METHOD 2.

If you ever want LTV-by-variant analysis, do it as a separate query joining
the variant assignment to the user's whole subscription history — don't restore
the renewal-attribution path.

## `handleInvoicePaymentFailed` stamps `dunning_recovery` for channel-independent reanchor detection

When a `subscription_cycle` invoice fails (the `isRenewal` branch in `handleInvoicePaymentFailed`, `src/services/stripe-webhook-handlers/index.ts`), the handler stamps `metadata.dunning_recovery = '1'` on the Stripe invoice object. This marker persists on the invoice regardless of what happens next — DB status flips, `pause_collection` clears, or the user retries via any channel.

`handleInvoicePaymentSucceeded` reads this marker in `shouldReanchorAfterRecovery` (`src/services/subscription/pauseCollectionPolicy.ts`) as one of the OR-signals for dunning detection. It is the **only** signal that survives the `renew-subscription` retry channel, which pre-flips the DB status to `active` AND clears `pause_collection` before the success webhook fires — making the other two signals (`previousSubscriptionDbStatus ∈ {past_due, unpaid}` and `pauseCollectionPresentAtPayment`) both false at webhook time.

Key facts verified by live Stripe test-mode probe:
- A single-failure manual recovery under `pause_collection` has `attempt_count === 1` (Stripe does not auto-retry while paused, so the counter never increments). `attempt_count > 1` is therefore a weak/secondary signal only.
- The `dunning_recovery` marker is set on the invoice at failure time and is not altered by subsequent payment success, subscription update, or pause-resume calls.

See `docs/PAST_DUE_REANCHOR.md` for the full trigger-gate logic and recovery-channel analysis.

## Stranded-member re-bill failure fires "Renewal Failed", not "Payment Failed" (Klaviyo)

A stranded-member RE-BILL — the mint (`mintCurrentCycleInvoice`, `billing_cycle_anchor: 'now'`) that re-charges a past-due/unpaid member — fails with `billing_reason: "subscription_update"`, **not** `subscription_cycle`. Left unclassified it drops into the generic `else` and fires the wrong Klaviyo event ("Subscription Payment Failed") instead of the dunning "Subscription Renewal Failed". `handleInvoicePaymentFailed` (`src/services/stripe-webhook-handlers/index.ts`) classifies it:

```ts
const isRebill =
  billingReason === "subscription_update" &&
  (prevSubStatus === "past_due" || prevSubStatus === "unpaid");
```

The Klaviyo branch reads `if (isRenewal || isRebill)`, so a re-bill lands in the same **"Subscription Renewal Failed"** (dunning) flow as a true `subscription_cycle` renewal.

**Why the signal is reliable:** a member upgrade is also `subscription_update`, but upgrades are **blocked while past_due** — so a `subscription_update` failure from a `past_due`/`unpaid` member is a re-bill, never an upgrade.

**`isRebill` deliberately does NOT set `isRenewal`.** It only redirects the Klaviyo event; it never enters the `else if (isRenewal)` DB-status branch, so it neither calls `pauseAfterRenewalFailure` nor stamps `dunning_recovery` (both gated on `isRenewal` alone). The member stays **unpaused / in dunning** — intentional per the past-due notification design (the admin / recovery / bulk / member-resolve paths all converge on this same event).

## Stranded-member re-bill SUCCESS is normalized to a renewal (labels, revenue/ROAS, tracking)

The same mint re-bill **SUCCEEDS** with `billing_reason: "subscription_update"` too — the identical shape a tier UPGRADE gets. But a re-bill is a **RENEWAL** (recovering a missed cycle), not a new purchase. Left raw, every consumer of `billing_reason` mislabeled it: the admin activity feed ("Subscribed to X Membership Package"), the user-detail Subscription History ("Subscription update"), the dashboard activity slice, **and** the new-vs-renewal **revenue/ROAS** analytics (a recovered renewal counted as new ad-driven acquisition), plus the Meta/Klaviyo conversion gate.

Fix (2026-07-21): `handleInvoicePaymentSucceeded` computes `isRebill` via [`isRebillPayment`](../../src/utils/billing/rebill-classification.ts) — `subscription_update` **&&** `!isUpgrade` **&&** (subscription `metadata.billing_anchor_rule === "rebill_current_cycle"` OR the member was `past_due`/`unpaid`) — then passes `effectiveBillingReasonForRebill(billing_reason, isRebill)` (→ `"subscription_cycle"` for a re-bill) as the `billingReason` **arg** to `processPaymentBenefits`. That single normalization makes the stored `data.billingReason`, the `isRenewal` field, every admin label, the revenue/ROAS split, and conversion tracking treat the re-bill as a renewal. **Upgrades are excluded** (`!isUpgrade`), so a genuine tier change stays `subscription_update`. Entry counts are unaffected (they use the separate `billingReasonForEntries`); the only entry-adjacent effect is that a re-bill now correctly **skips the new-purchase major-draw freeze gate** (`isSubscriptionRenewal`), which is correct — a renewal shouldn't be freeze-blocked. Unit-tested: `npm run test:rebill-classification`. Historical events are corrected by `scripts/backfill-rebill-payment-events.ts` (Stripe-confirms each candidate is a re-bill; dry-run by default).

## Re-bill on the 25th/26th/27th is clamped to the anchor-24 renewal day

The held-draft recovery path (`subscription_cycle`) reanchors a 25/26/27 recovery to the **24th** via [`shouldReanchorAfterRecovery`](../../src/services/subscription/pauseCollectionPolicy.ts) → `reanchorAfterPastDueRecovery` — the ≥3-day buffer before the 27th major draw (see [PAST_DUE_REANCHOR.md](../PAST_DUE_REANCHOR.md) and `anchor-billing.ts`). A **mint re-bill** is `subscription_update`, so it **skips** that gate; its own `billing_cycle_anchor:'now'` moves the renewal ~1 month out but does **not** clamp — a re-bill collected on the 25/26/27 would otherwise renew on that very day (0–2 days before the draw).

Fix (2026-07-22): after `isRebill` is computed, `handleInvoicePaymentSucceeded` calls [`shouldReanchorRebillToAnchor24`](../../src/services/subscription/pauseCollectionPolicy.ts) — `isRebill` **&&** paid **&&** the recovery day is in the 25/26/27 window (`isJoinDateAnchoredTo24`) **&&** not cancelling / `autoRenew !== false` **&&** not already reanchored — and, when true, re-applies the SAME `reanchorAfterPastDueRecovery` (→ `trial_end` to the next 24th, member → `trialing`). **Gated to 25/26/27 only** because on any other day the mint's anchor already lands the renewal a clean ~1 month out, so a reanchor would only add a needless $0 trial invoice + trialing flip. Safe by construction: the $0 trial invoice it spawns is skipped at the top of the handler ([`isZeroAmountTrialUpdateInvoice`](#stripes-0-trial-period-invoice-double-grants-entries--guard-it)) so it never re-enters this path, `reanchorAfterPastDueRecovery` is idempotent (`lastReanchoredInvoiceId`) and overwrites the marker to `past_due_reanchor`, and the block runs **after** `isRebill` is read (so the renewal grant still sees the live `rebill_current_cycle` marker) and **before** `processPaymentBenefits` — exactly like the held-draft reanchor block. Only affects FUTURE re-bills collected on the 25/26/27 (no backfill — the anchor is a forward-looking date). Unit-tested: `npm run test:reanchor-gate` (`shouldReanchorRebillToAnchor24` cases).

## `handleInvoiceCreated` is dormant until `invoice.created` is enabled on the Stripe endpoint

The renewal draft-stamp handler `handleInvoiceCreated` (`src/services/stripe-webhook-handlers/index.ts`) is wired into the dispatch switch (`case "invoice.created"`, right before `invoice.finalized`), but **the Stripe webhook endpoint is not currently subscribed to the `invoice.created` event** in the Stripe Dashboard. Until that event is added to the endpoint's enabled-events list, the handler never runs and **failed** renewals keep showing the bare join-time label (e.g. `"Tradie"`) in the Stripe payments list; successful renewals are still relabeled by the `handleInvoicePaymentSucceeded` fallback.

To activate: add `invoice.created` to the webhook endpoint's events in the Stripe Dashboard (and to your Stripe CLI `--events` list when testing locally). No code change is needed — the handler is already deployed.

The handler is **non-blocking** by design (a `stripe.invoices.update` failure is logged via `webhookLog`, never thrown — the description is purely cosmetic) and **idempotent** across redeliveries (writes only when the existing description differs). It is **strictly gated to `billing_reason === "subscription_cycle"`**, so even once enabled it never touches the join charge (`subscription_create`), upgrade/downgrade invoices (`subscription_update`), or the $0 trial-update invoice (see the [trial-invoice gotcha](#stripes-0-trial-period-invoice-double-grants-entries--guard-it) above).

## Multi-experiment attribution collision in `create-one-time-purchase`

Both `create-one-time-purchase` and `create-one-time-purchase-existing-user`
fall back to reading `ta_ab_assignment_<expId>` cookies when no DB assignment
is found. The cookie loop iterates active experiments and breaks on first
match — historically with no priority rule, so a site-wide cosmetic experiment
(e.g. `__membership-theme__`) could claim purchase credit before a real
page-targeted promo experiment.

Both routes now sort experiments by `attributionRank` (exported from
`src/utils/ab-testing/get-user-experiment-assignment.ts`): page-targeted beats
wildcard `*`, and the membership-theme sentinel is excluded outright. Match
the priority rule there if you ever add another attribution code path.

## Terminology: `isAdditional` (was `isMemberOnly`) — 2026-07-01

The package flag `isMemberOnly` was renamed to **`isAdditional`** across the codebase. It marks packages that require *additional-package access* — an **active subscription OR current major-draw entries** (see `hasAdditionalPackageAccess`), which is broader than subscribers; it was never truly "member-only". The internal `-member` UI id-suffix (a row disambiguator) is intentionally unchanged. Full rationale: [subscription/gotchas.md](../subscription/gotchas.md).

## `GET /api/stripe/payment-methods` treats a dangling `stripeCustomerId` as "no saved methods", not a 500 (2026-07-22)

`stripe.paymentMethods.list({ customer: user.stripeCustomerId })` throws a `resource_missing` `StripeInvalidRequestError` when `stripeCustomerId` points at a Stripe customer that doesn't exist — a fake/seeded id (e2e fixtures use `cus_e2e_seeded_readonly`), or a real customer deleted out-of-band in the Stripe dashboard. The route's `try/catch` classifies this with `isStripeCustomerMissing()` (same `resource_missing`/`resource_missing_deleted`/404 check as `RetentionDiscountService`/`SubscriptionReferenceService`) and short-circuits to the normal success shape — `{ success: true, paymentMethods: [], subscriptionDefaultPaymentMethodId: null }` — instead of a 500. A dangling customer genuinely has no saved methods; that's the truthful empty state, not a server error. Every other Stripe failure (rate limit, network, auth) still falls through to the route's outer catch and 500s as before.

## Stripe.js loads via `@stripe/stripe-js/pure` only (2026-07-19)

`src/lib/stripe-client.ts` imports `loadStripe` from the `/pure` entry — the DEFAULT `@stripe/stripe-js` entry injects https://js.stripe.com on mere import, which shipped Stripe to 100 % of guests when the modal chunk evaluated. Import `loadStripe` nowhere else (lint: `internal-norm/no-eager-stripe`); call `getStripePromise()` lazily inside components/handlers. Note: with `/pure`, Stripe's fraud-signal collection starts at first `getStripePromise()` call (payment-surface mount) instead of page load — intended.

## A shop payment now reaches `processPaymentBenefits` (2026-08-17)

`stripe-webhook-handlers/index.ts` previously documented the opposite — *"Shop orders grant NO
entries and deliberately do not touch processPaymentBenefits"*. That is no longer true: the shop
branch resolves the one-time promo multiplier and passes it to `finalizeShopOrder`, which grants
the order's free entries after fulfilment.

The consequence worth knowing when reading this file: **once a shop grant succeeds it writes a
`BenefitsGranted-{pi}` PaymentEvent, so every later redelivery of that `payment_intent.succeeded`
short-circuits at `isPaymentProcessed()` before reaching the shop branch at all.** That is why
the grant is sequenced last inside `finalizeShopOrder` and why its `already_processed` path
retries the grant instead of returning early — see
[cart-shop-products/backend.md](../cart-shop-products/backend.md).

Shop PaymentIntent metadata now also carries `userEmail`. It was the only payment type without
it, and the webhook's user-resolution fallback needs it; without it an unmatched
`stripeCustomerId` lost the order silently.
## Adaptive Acceptance blocks are NOT overridable by the Radar allow list

**Confirmed by Stripe support, 2026-08-17.** `outcome.type === "blocked"` covers several
mechanisms and the `card_fingerprint_allowlist` value list only overrides *some* of them:

| `outcome.reason` | Mechanism | Allow list fixes it? |
|---|---|---|
| `rule`, `highest_risk_level`, `blocklist` | Radar | ✅ yes |
| `previously_declined_do_not_retry` | **Stripe Adaptive Acceptance** | ❌ **no** |

Stripe's wording: the allow list "only affects Radar rules", Adaptive Acceptance "operates
independently of Radar rules… regardless of Radar allow lists or custom rules", and there is
**no account-level setting** to disable it (it is automatic on IC+ pricing).

**Measured on production 2026-08-17:** of 72 blocked charges in one day, **69** were
`previously_declined_do_not_retry`, and **70 of the 72 were on cards already present on the live
Radar list**, added 2–3 months earlier. Across the full `blockedtransactions` record,
**835 of 1,024 (82%)** carry this reason — i.e. most of the blocked population was never
allowlist-fixable.

**It is self-inflicted.** Stripe blocks "based on prior network decline or advice codes" and
explicitly to help merchants "avoid excessive retry penalties". A second support reply named the
cause directly: *"too many payment attempts were made in a short time window"*, with two
recommendations — **wait 2–3 days between retries of the same transaction**, and **spread batch
processing over a longer window rather than submitting all at once**. A daily bulk run that fires
its whole worklist in one burst (792 charges in 210s, measured) manufactures the blocks it then
fails against.

**It decays.** 118 of 701 blocked cards (17%) produced a successful charge after their first
block, some 3+ months later — so the cohort must be slowed down, **not dropped**.

**Both halves are now implemented — and the reactive one alone was never enough.** The cooldown
below only engages once a `BlockedTransaction` row already exists for the card, so by construction
it cannot prevent a **first** block, and it fails open. The **proactive** half is
`shouldSkipForBulkAttemptSpacing` (`BULK_ATTEMPT_SPACING_DAYS = 3`) in
[past-due-charge-idempotency.ts](../../src/server/admin/past-due-charge-idempotency.ts): the
automated run refuses to submit the same invoice more than once every 3 days, reading only that
invoice's own `success`/`failed` history. Measured 2026-08-24, before it existed: individual
invoices reached **24 submissions in 30 days** (100 at 17, 76 at 18) — every one invisible to the
reactive cooldown. It also answers the second recommendation: a ~1,157-invoice day becomes ~386
real submissions, cutting per-invoice velocity from 24 to **10** per 30 days. See
[docs/admin/backend.md](../admin/backend.md#per-invoice-attempt-cap-proactive).

Implementation: `isStripeExcessiveRetryReason` / `STRIPE_EXCESSIVE_RETRY_OUTCOME_REASON` in
[stripe-excessive-retry.ts](../../src/utils/payment/stripe/stripe-excessive-retry.ts) is the single
source of truth for the reason string (do **not** coin a parallel "adaptive acceptance" vocabulary);
the cooldown policy is `shouldCooldownForExcessiveRetry` in
[chargeOrRecoverPolicy.ts](../../src/server/admin/chargeOrRecoverPolicy.ts). See
[docs/admin/backend.md](../admin/backend.md#excessive-retry-cooldown).

---

## `type: "mini-draw"` without `miniDrawId` is a money-in / nothing-out shape (fixed 2026-08-20)

**The shape.** `handleMiniDrawWebhook` grants entries *against a specific draw*, read from `paymentIntent.metadata.miniDrawId`. A PaymentIntent stamped `type: "mini-draw"` **without** that key can never be granted — there is no draw to grant into. Stripe has already captured the money (nothing sets `capture_method`, so capture is automatic).

**How it happened.** Both `create-one-time-purchase` and `…-existing-user` resolved package ids against the *mini-draw* catalogue as a fallback, synthesised a one-time package from the match, and stamped `type/packageType: "mini-draw"` — but neither route has a draw in scope and neither Zod schema even accepted a `miniDrawId`. `grep miniDrawId src/app/api/stripe/**` returned zero matches. The webhook then bailed at `if (!miniDrawId)`, logged to `console`, and returned.

**Two things made it invisible rather than merely broken:**

1. `webhookLog` is `console`-based, and production builds strip `console.log/info/debug/warn` (`next.config.ts` `compiler.removeConsole`). No durable trace anywhere a human looks.
2. **It poisoned idempotency.** The dispatch did a bare `await handleMiniDrawWebhook(...)`, ignoring the return. `dispatchStripeEvent` computes `shouldMarkAsProcessed = paymentProcessed !== false`, so a bailed grant still ACKed the event — a Stripe retry or an admin replay would be **skipped**. The one-time branch eight lines below already did `return false`; the mini branch simply never matched it.

**The two controls now in place:**

- **Boundary (the seal).** `isMiniDrawPackageId` in [`src/data/miniDrawPackages.ts`](../../src/data/miniDrawPackages.ts) — a **catalogue** membership test, not a string-shape test, because the ids are two unrelated families (`mini-pack-1..8` and `additional-*-pack-mini`) and either a prefix or a suffix rule would miss one. Both one-time routes reject a match with **400 `MINI_DRAW_PACKAGE_WRONG_ENDPOINT`** before any Stripe call, and the fake-package fallback branches are deleted. Verified against `membershipPackages`: **zero id collisions**, so it cannot 400 a legitimate purchase — pinned by `npm run test:mini-draw-package-id`.
- **Webhook (the net).** `handleMiniDrawWebhook` now returns `Promise<boolean>` — `false` on both metadata guards plus a durable `ErrorReport` via `reportStrandedMiniDrawPayment`, and `return result.success` at the end. The dispatch honours it. A non-ACKed event stays **replayable**, so a repaired PaymentIntent can be re-driven.

⚠️ **`return result.success` is a deliberate behaviour change**: a genuine *processing* failure now also un-ACKs, where before it was ACKed and lost. That is the correct outcome — a retry can fix a transient failure, unlike a metadata defect. It does mean mini-draw processing failures will now be retried by Stripe.

⚠️ **The success path MUST return a boolean.** If `handleMiniDrawWebhook` ever falls through to an implicit `undefined`, `if (!granted) return false` treats every *successful* grant as a failure and Stripe retries the event forever.

**No auto-refund, deliberately.** There is no `refunds.create` anywhere in `src/`. Firing one on "metadata looks wrong" would refund a legitimate purchase whose metadata was merely truncated, and would bypass the refund-reversal ledger ([REFUND_REVERSAL.md](../REFUND_REVERSAL.md)). Grant-vs-refund is a human call.

**Historical check:** `npm run find:stranded-mini-draw-payments` — read-only, scans Stripe for captured mini-draw PaymentIntents with no `miniDrawId` and cross-checks `PaymentEvent{BenefitsGranted}` + `users.miniDrawPackages.stripePaymentIntentId` to prove whether anything was granted. Expected result is zero: no live UI ever posted a mini id to those routes.

**Still latent, watch it:** `MembershipModal` carries seven live `activePlan.id.startsWith("mini-pack-")` branches that feed these routes. Nothing sets such an `activePlan.id` today, and the server guard now neutralises them — but they are why this was worth sealing rather than documenting.

## A swallowed Stripe error still acks the event — charged, marked succeeded, granted nothing (2026-08-23)

The 24 Aug anchor-24 renewal burst (~914 renewals in one minute) rate-limited our Stripe fan-out. **11 members were charged $300.00 in total and got no entries.**

**The hole.** `handleInvoicePaymentSucceeded` ([`stripe-webhook-handlers/index.ts`](../../src/services/stripe-webhook-handlers/index.ts)) wraps its entire body in a single `try`. An inner catch rethrows, but the **outer catch swallows and returns normally**. The dispatcher then sets `shouldMarkAsProcessed = true`; [`processQueuedEvent`](../../src/services/stripe-webhook-queue/processQueuedEvent.ts) writes `ProcessedStripeEvent` and calls `markSucceeded`. `markFailed` never runs, so the queue's retry machinery — which would have fixed this by itself — is never engaged.

There is a second way in: the `if (result.success)` branch around the `processPaymentBenefits` call **does** have an else, but it only `webhookLog("error", …)`s — it neither rethrows nor signals failure upward, so a `{success: false}` return is acked exactly like a swallowed throw. (A logged failure is not a handled one.) The `payment_intent` path gets this right — it returns `result.success` so the event is not acked. Compare the two before touching either.

**Consequences that make it hard to spot:**
- `stripewebhookqueue` shows `succeeded`. `ProcessedStripeEvent` holds the id, so a replay is refused as a duplicate.
- `MembershipRenewalCycle` shows `status: "succeeded"` — the money is real.
- **No `PaymentEvent` is written**, so every ledger-anchored reconciler is blind (see [draws/gotchas.md](../draws/gotchas.md)).

**Auditing for it.** Anchor on the charge record, not the ledger:

```bash
npm run backfill:missing-renewal-grants:prod:dry     # read-only; exit 2 means gaps exist
```

`scripts/backfill-missing-renewal-grants.ts` left-joins `MembershipRenewalCycle{succeeded, subscription_cycle}` against `PaymentEvent._id = BenefitsGranted-invoice_<invoiceId>` and reports the absences. `--apply` grants through the normal `processPaymentBenefits` path (so the `PaymentEvent`, accumulators and draw credit are created exactly as the webhook would have), passing the **original** `succeededAt` so draw routing lands the right month, then sets `subscription.lastMonthAccumulatedEntries` the way the handler does after a successful grant — omit that and the *next* renewal accumulates from a stale baseline and under-grants. `--expect=N` refuses to write unless the derived gap set is exactly N rows.

**Not covered by the backfill:** the affiliate *recurring* commission is a separate webhook step; use `backfill:affiliate-recurring-commissions:all:dry` for those invoices.

**When editing this handler:** an error inside it must reach `markFailed`. Bounded queue attempts plus dead-lettering already exist — letting the error through is what turns a lost grant into a retried one.

**Three things that backfill must do that a naive replay would not:**

1. **Refuse to resurrect a cancellation.** `grantBenefits` → `handleSubscriptionPackage` unconditionally `$set`s `subscription.isActive: true` / `status: "active"` and `$unset`s `cancelledAt`. Correct at charge time; destructive days later — a member who cancelled *because* they paid and got nothing would have that decision erased in Mongo while Stripe still holds `cancel_at_period_end`. The script prints every target's lifecycle state and refuses to apply if any is cancelled/paused/inactive (override: `--allow-lifecycle-change`).
2. **Read Stripe as well as Mongo.** The `MembershipRenewalCycle` row is written by the same handler that failed, *after* its first Stripe call (`index.ts:3474` → `:3614`), and `upsertRenewalCycleFromPaidInvoice` returns early unless `billing_reason === "subscription_cycle"` (`membershipAnalyticsPersistence.ts:43`). So a 429 on that first call, or a lost grant on a `subscription_create`/`subscription_update` invoice, leaves **no trace in Mongo at all**. A second pass lists paid Stripe invoices in the window and checks each against `PaymentEvent`. On the 23 Aug window it independently returned the same 11 and zero Mongo-invisible extras — that agreement is what makes "exactly 11" trustworthy rather than merely repeatable.
3. **Treat a per-row failure as unresolved forever.** `processPaymentBenefits` writes the `PaymentEvent` **before** `grantBenefits` and does not remove it if the grant throws. A row that dies inside `addToMajorDraw` is left with entries `$inc`ed, a `BenefitsGranted` row present, possibly no draw entries, and `lastMonthAccumulatedEntries` stale — and the next dry run reports it **healthy**. After any apply, grep the CSV for `,error,` and inspect those members by hand; a clean re-run is not evidence.

**What actually fires on this path** (checked, because "grant through the normal path" sounds louder than it is): for `billingReason === "subscription_cycle"` the Meta CAPI Purchase is explicitly skipped (`payment-processing.ts:1462-1466`), the Klaviyo membership event is a `break` (`:1720-1726`), "Invoice Generated" is skipped, and there is no TikTok call. What does fire: Klaviyo "Placed Order" (`isRenewal: true`), Klaviyo profile sync, the milestone check, and the partner-discount queue update.

## The webhook's FRESH retrieves are load-bearing — never read the frozen event payload

`handleInvoicePaymentSucceeded` re-retrieves the invoice from Stripe (`stripe.invoices.retrieve(invoiceId, { expand: [...] })`) and `handlePaymentSuccess` re-retrieves the PaymentIntent (`stripe.paymentIntents.retrieve(paymentIntent.id, { expand: [...] })`) instead of using `event.data.object`. Both look like an easy "one fewer API call" saving. **They are not.**

Since 2026-08-27 the customer's bonus-entry `campaignCode` is written onto the checkout object at the PURCHASE click — after the coupon box has been filled, immediately before `confirmPayment` (`src/utils/payment/attach-typed-code.ts`). It **cannot** be written any earlier: the coupon box lives on the same modal step whose mount already pre-warmed the subscription / PaymentIntent, so at pre-warm time the code does not exist yet.

That stamp lands before the confirm, so a fresh retrieve always sees it. Switching either handler to the event payload — or to `parent.subscription_details.metadata`, which is a snapshot of the same thing — reintroduces the exact production defect that fix closed: **the customer sees APPLIED, is charged, and receives nothing, with no error logged anywhere.**

If you are optimizing these calls, the invariant to preserve is "read the object's metadata as of the moment the grant runs", not "avoid a retrieve". Regression cover: `npm run e2e:bonus-code` (all three legs) plus `npm run test:attach-typed-code`. See [payment/gotchas.md](../payment/gotchas.md#the-applied-discount-code-was-thrown-away-at-checkout-fixed-2026-08-27).
## `isValidPendingUpgrade` now delegates to a shared predicate (2026-08-26)

`stripe-webhook-handlers/index.ts` used to own a private `isValidPendingUpgrade` type guard.
The same check is needed by the Klaviyo profile projection, and `utils/` may not import from
`services/`, so the logic moved to
[`src/utils/subscription/pending-upgrade.ts`](src/utils/subscription/pending-upgrade.ts).

The handler keeps a **thin typed wrapper** of the same name that delegates to it — purely to
preserve the `change is PendingUpgradeChange` narrowing its four call sites rely on. No
behaviour changed, and no call site was edited.

Why it matters beyond DRY: `subscription.pendingChange` is a Mongoose **nested object**, so it
materialises as `{}` and a truthiness check is permanently `true`. That bug had already shipped
to Klaviyo (`subscription_has_pending_upgrade` was `true` on all 56,360 profiles). One shared
implementation means it can only be fixed once. Pinned by `npm run test:pending-upgrade`.
## The webhook's FRESH retrieves are load-bearing — never read the frozen event payload

`handleInvoicePaymentSucceeded` re-retrieves the invoice from Stripe (`stripe.invoices.retrieve(invoiceId, { expand: [...] })`) and `handlePaymentSuccess` re-retrieves the PaymentIntent (`stripe.paymentIntents.retrieve(paymentIntent.id, { expand: [...] })`) instead of using `event.data.object`. Both look like an easy "one fewer API call" saving. **They are not.**

Since 2026-08-27 the customer's bonus-entry `campaignCode` is written onto the checkout object at the PURCHASE click — after the coupon box has been filled, immediately before `confirmPayment` (`src/utils/payment/campaign-code-checkout.ts`). It **cannot** be written any earlier: the coupon box lives on the same modal step whose mount already pre-warmed the subscription / PaymentIntent, so at pre-warm time the code does not exist yet.

That stamp lands before the confirm, so a fresh retrieve always sees it. Switching either handler to the event payload — or to `parent.subscription_details.metadata`, which is a snapshot of the same thing — reintroduces the exact production defect that fix closed: **the customer sees APPLIED, is charged, and receives nothing, with no error logged anywhere.**

If you are optimizing these calls, the invariant to preserve is "read the object's metadata as of the moment the grant runs", not "avoid a retrieve". Regression cover: `npm run e2e:bonus-code` (all three legs) plus `npm run test:campaign-code-checkout`. See [payment/gotchas.md](../payment/gotchas.md#the-applied-discount-code-was-thrown-away-at-checkout-fixed-2026-08-27).

## The two guest purchase routes must resolve identity through one helper (2026-08-28)

`create-payment-intent` and `create-one-time-purchase` both accept a caller-supplied `userEmail`
without requiring a session. Both used to resolve it with a bare `User.findOne({ email })`, which
was an account takeover — see
[payment/gotchas.md](../payment/gotchas.md#account-takeover-an-unauthenticated-caller-could-bind-any-members-stripe-customer-fixed-2026-08-28).

Both now call `resolvePurchaseIdentity` from
[`src/utils/payment/checkout-identity.ts`](../../src/utils/payment/checkout-identity.ts) and must
handle its `must_authenticate` outcome by returning **403 `ACCOUNT_EXISTS_LOGIN_REQUIRED`**.

**If you add another route that takes an email and creates a Stripe customer or PaymentIntent, it
must go through the same helper.** Two routes shared this hole; a third would reopen it. Do not
reintroduce an email lookup for identity anywhere in this domain — `create-subscription`,
`create-one-time-purchase-existing-user` and the shop checkout all require a session and must keep
doing so.

## Card declines log at `warn`; real Stripe faults still log at `error` (2026-09-01)

The purchase routes catch every failure from one `try` block, so an issuer decline and a
genuine Stripe fault used to produce the same `console.error`. A decline is a business
outcome — the customer needs a different card, not an engineer — and it is already captured
in full by `ErrorLoggingService` in the `ErrorReport` collection, correctly graded `medium`.

Affected call sites now branch on
`isExpectedPaymentDeclineError(error)` from
`src/utils/error-reporting/error-severity-classifier.ts`:

- `stripe/create-one-time-purchase-existing-user`
- `stripe/pay-failed-invoice`
- `mini-draw/purchase`, `upsell/purchase` (same helper, their own domains)

**Use the helper — do not match on message text at the call site.** It wraps the existing,
tested `isExpectedPaymentDecline` (decline_code → known card-error codes → message hints),
covered by `npm run test:payment-decline-severity`. A false positive here silences a real
Stripe fault, which is why the test asserts the negative cases (`No such customer`,
`api_connection_error`, `rate_limit`) as hard as the positive ones.

`pay-failed-invoice` additionally treats `invoice_already_paid` and "this invoice can no
longer be paid" as expected: **the branches immediately below that catch turn both into a
200 success response**, so logging them as errors was reporting a failure the endpoint had
already decided was fine.
