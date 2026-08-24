# Renewal Surge Hardening — Design

**Date:** 2026-08-24
**Branch:** `feature/renewal-surge`
**Incident:** 2026-08-23 14:00 UTC (= 00:00 AEST 24 Aug), anchor-24 renewal burst
**Status:** Awaiting review

---

## 1. Why this exists

At 00:00 AEST on 24 Aug, ~914 anchor-24 memberships renewed inside the same minute. The
system survived, but **11 members were charged $300.00 in total and received no entries**, and
the failure was invisible to every automated check we have.

Investigating that surfaced four further defects, one of which — a charge-cron abort loop — is
actively costing recovery revenue every day and is the direct cause of the Adaptive Acceptance
card blocks documented in `docs/billing-stripe/gotchas.md`.

Every number below was measured against production (Vercel logs, live Stripe account
`acct_1S23INJ3N9Ka6RJM`, production MongoDB `Production`), not inferred.

### Verified incident facts

| Measure | Value |
|---|---|
| Webhook events enqueued in the 14:00 minute | 1,615 |
| Peak hour (payment wave, one hour after invoice creation) | 15:00Z — 3,551 events |
| Webhook function invocations, 14:00:35–14:00:57 | 1,286 (~56/sec) |
| Renewals attempted | 914 — 677 succeeded, 237 failed |
| Members anchored to this day | 1,098 (next busiest day: 376) |
| Error-level webhook log lines | 592 (~562 inside the 14:00 minute) |
| HTTP 500s | 174 total, 172 on `/api/stripe/webhook` |
| **Paid renewals with no entries granted** | **11 ($300.00)** |
| July baseline for the same failure | 1 of 864 (0.12%) → Aug 1.62%, a 13× rise |

---

## 2. Root causes

Five distinct defects. They are independent — fixing one does not fix another.

### RC-1 — A renewal can be marked permanently complete with nothing granted

`handleInvoicePaymentSucceeded` (`src/services/stripe-webhook-handlers/index.ts:3459`) wraps its
whole body in one `try`. An inner catch at `:3698-3701` rethrows, but the outer catch at
`:4849-4851` swallows it and **returns normally**. The dispatcher then reaches
`shouldMarkAsProcessed = true` at `:5527`, and `processQueuedEvent.ts:52-57` acks
`ProcessedStripeEvent` and calls `markSucceeded`. `markFailed` at `:58-61` never runs.

The same hole exists a second way: `index.ts:4369` is `if (result.success)`, and its `else` at
`:4765` **only logs** — `webhookLog("error", \`Failed to process subscription benefits: ${result.error}\`)`
— then falls through. So a `processPaymentBenefits` returning `{success: false}` produces a log
line and an acked event, granting nothing. Contrast `index.ts:1511-1522` on the payment_intent
path, which correctly returns `result.success` so the event is not acked.

*(Corrected 2026-08-24: an earlier draft of this spec said "no else branch". The branch exists;
it is non-propagating. The consequence is unchanged, the fix is not — the else must make the
handler report failure, not merely log it.)*

This is verbatim the outcome the comment at `:5519-5525` says must never happen.

**Trigger:** any Stripe error inside the handler. On 24 Aug that was HTTP 429.

### RC-2 — No reconciler can detect RC-1

`reconcile-major-draw-entries` starts from
`PaymentEvent.find({eventType: "BenefitsGranted", ...})` and heals only rows whose
`data.grants.drawGrants` is empty (`reconcile-major-draw-entries.ts:96-113`). A renewal that
died before `processPaymentBenefits` (`index.ts:4300`) has **no PaymentEvent at all**, so it is
not a candidate and is not counted.

`scripts/fix-major-draw-renewal-entries.ts:12-21` and `scripts/verify-major-draw-entries.ts:8-13`
share the same anchor by design. **No job in the repo reads Stripe to close the loop.**

### RC-3 — Stripe API fan-out exceeds two published rate limits

Stripe's documented limits (docs.stripe.com/rate-limits): **100 requests/sec globally per
account** (reads and writes together — not separate buckets) and **25 requests/sec for any
individual endpoint**.

One successful renewal costs a verified **10 Stripe API calls**:

| Event | Calls |
|---|---|
| `invoice.created` | `subscriptions.retrieve` (`index.ts:172`), `invoices.update` (`:179`) |
| `invoice.payment_succeeded` | `invoices.retrieve` (`:3474`), `subscriptions.retrieve` (`:3657`), `paymentIntents.retrieve` (`:3671`), `paymentIntents.update` (`:3674`), `charges.update` (`:3687`), `subscriptions.update` (`:3761`), `subscriptions.retrieve` (`:4834`) |
| `payment_intent.succeeded` | `paymentIntents.retrieve` (`:381`) — result then discarded |

At the observed 18 renewals/sec:

| Bucket | Rate | Limit | Over by |
|---|---|---|---|
| All Stripe calls | 182/sec | 100/sec | 1.8× |
| **of which `/v1/subscriptions`** | **73/sec** | **25/sec** | **2.9×** |

**The per-endpoint cap broke first.** Four of the ten calls hit `/v1/subscriptions`.

`maxNetworkRetries: 2` (`src/lib/stripe.ts:10-11`) is not cover — the SDK's retry logic
(`node_modules/stripe/cjs/RequestSender.js:138-172`) has **no 429 branch**.

### RC-4 — Cold-start connection storm, not connection exhaustion

`src/lib/mongodb.ts` sets `minPoolSize: 0` (`:190`), `maxIdleTimeMS: 30000` (`:195`),
`maxPoolSize: 5` (`:59-67`), `maxConnecting: 3` (`:191`). Any instance idle ≥30s enters a burst
holding **zero sockets** and must complete a full `mongodb+srv` handshake three at a time.

The happy path calls `connectDB()` **five times per event** (`route.ts:21`, `enqueue.ts:14`,
`claim.ts:12`, `markResult.ts:6`, `handlers/index.ts:3514`), and every cached hit runs
`conn.db.admin().ping()` (`:163-167`).

**Capacity was never the constraint.** M10 allows 1,500 connections/node across 3 nodes; at ~56
concurrent invocations × 5 we peaked near 280 — **19% of one node**. Upgrading the cluster tier
would not have prevented this.

A genuine code bug compounds it: after `cached.promise` resolves, `connectDB` returns at
`:248-257` **without re-checking `readyState`**. Mongoose's `openUri` early-returns without
awaiting initial connection (`node_modules/mongoose/lib/connection.js:1044-1048`), so we can
hand back a connection whose `conn.db` is still `null`. With `bufferCommands: false` (`:187`)
the next model call throws in 2–4ms with zero I/O.

Also: `route.ts:21` calls `connectDB()` **before** signature verification at `:36`.

### RC-5 — The charge cron is killed mid-flight every single day

`ORPHAN_RUN_THRESHOLD_MS = 35 * 60 * 1000` (`src/server/admin/charge-past-due-totals.ts:11`),
and `sweepOrphanRuns` (`chargePastDueJob.ts:187-209`) selects orphans by
`startedAt: { $lt: cutoff }` — **elapsed time since start, not since last activity**.

The lock *is* renewed each chunk (`renewLock`, `:215`), so a correct liveness signal already
exists. The sweep does not use it.

Measured across four consecutive production runs:

| Run (AEST) | Duration | Eligible | Attempted | Succeeded | Recovered |
|---|---|---|---|---|---|
| 23/8 07:03 | 36.5 min | 868 | 420 (48%) | 15 | $320 |
| 22/8 07:02 | 38.1 min | 864 | 427 (49%) | 20 | $620 |
| 21/8 07:02 | 38.2 min | 846 | 419 (50%) | 25 | $880 |
| 20/8 07:01 | 39.0 min | 813 | 425 (52%) | 11 | $420 |

Every run overruns 35 minutes and is aborted by the next 5-minute tick **while actively
working**. Once marked `aborted`, the resume path (`ChargeJobRun.findOne({status:"running"})`)
no longer finds it, and the per-local-day guard prevents a fresh start. The day's collection
permanently stops at ~48%.

Two consequences, both measured:

- **94% of each day's attempts are the same users as the previous day** (362 of 387 overlap).
  Individual invoices reach 17–18 attempts in 30 days, max 24.
- **229 of 1,157 past-due members have never been attempted once in 30 days.**

This is the mechanism behind `docs/billing-stripe/gotchas.md`'s finding that **835 of 1,024
blocked transactions (82%)** carry Stripe's Adaptive Acceptance block, whose cause Stripe support
named as *"too many payment attempts were made in a short time window."*

**RC-5 therefore causes both the starved tail and the card blocks.** It is one fix.

### Also confirmed, not a root cause

- **Manual retries do not consume Stripe's schedule.** Stripe's Invoice reference: *"Any payment
  attempt counts as the first attempt, and subsequently only automatic retries increment the
  attempt count. In other words, manual payment attempts after the first attempt do not affect
  the retry schedule."* Our cron adds attempts alongside Stripe's ladder; it does not displace it.
- **Duplicate protection is intact.** `stripewebhookqueue.eventId`, `processedstripeevents.eventId`,
  `paymentevents.{paymentIntentId,eventType}`, `membershiprenewalcycles.stripeInvoiceId` — all
  present and UNIQUE in production.
- **Entries freeze at 8:00pm AEST on the 27th** (draw 8:30pm), consistent across four draws. So
  anchor-24 buys 3 days 20 hours, and **70 of 84 first retries (83%) land in time**.

---

## 3. Design decisions

### D-1 — Fail loud + reconcile, not restructure

Three options for RC-1:

| | Approach | Assessment |
|---|---|---|
| A | Gate the ack on grant success; let errors reach `markFailed` | Small diff, reuses existing retry machinery. Does not help if the queue exhausts attempts. |
| B | Split "record payment" from "grant benefits" into two queue stages | Most robust; restructures the busiest handler in the codebase immediately before the highest-traffic night of the month. |
| C | Leave the handler; add a Stripe-anchored reconciler | Catches everything including unanticipated modes; member waits for the next run. |

**Chosen: A + C. Explicitly not B.** A stops the loss at source; C is the net for what A does not
anticipate. B is the speculative restructure CLAUDE.md rule 4 warns against — if A+C prove
insufficient, B becomes a later, evidence-led decision rather than a guess made under deadline.

### D-2 — Fix RC-5 at the liveness signal, not by raising the threshold

Raising `ORPHAN_RUN_THRESHOLD_MS` is the band-aid: it moves the cliff without removing it, and
breaks again the moment the past-due population grows past the new threshold.

**Chosen:** sweep on **last progress**, not on `startedAt`. A run that is actively writing
`InvoiceChargeLog` rows and renewing its lock is alive by definition. This is correct at any
worklist size and needs no retuning as the member base grows.

### D-3 — Both a call reduction *and* a rate limiter for RC-3

Removing the three avoidable `/v1/subscriptions` calls takes that endpoint from 73/sec to
**18/sec — under the 25/sec cap that actually broke**. But global drops only to ~109/sec against
100/sec — **still over, with zero headroom**.

**Chosen:** do both. Call removal fixes the bucket that fired; the shared token bucket is what
keeps the system correct at 2,000 renewals as well as 900.

*(Corrected 2026-08-24, during Task 6's review.) The second half of that sentence claimed more
than the limiter delivers, and the correction matters for how much risk this phase actually
retires.* The limiter is **per-lambda-instance**, and the inbound receiver
(`/api/stripe/webhook`) handles **one event per invocation** via `after()`. At ~900 events across
~56 concurrent instances, each instance issues on the order of 2 Stripe calls/sec — two orders of
magnitude below an 80/sec bucket. **So the limiter will essentially never engage on the path that
caused this incident.** What it genuinely meters is the queue-**drain** path
(`process-stripe-webhook-queue`, `SWEEP_BATCH_SIZE = 20` fanned out via `Promise.allSettled`,
~140 requests at once from a single instance).

The honest framing: **the limiter reduces the depth of a 429 storm's retry backlog; it does not
prevent the storm.** Account-level rate-limit compliance rests on D-3's *first* half — Task 5's
call-count reduction (10 → 7 per renewal, `/v1/subscriptions` 73 → 18/sec). Do not let Task 6
retire the account-cap risk in anyone's mental model. A genuinely global governor needs shared
state (Redis or a Mongo token bucket) and is deliberately not in this spec's scope.

### D-4 — Preserve anchor-24 through the trial upgrade

The upgrade route is deliberately **pay-first**: `proration_behavior: "none"`,
`billing_cycle_anchor: "now"`, `payment_behavior: "error_if_incomplete"`
(`upgrade-subscription-payment/route.ts:227-269`) — *"charge full price now and reset billing
cycle."*

Members joining the 25th–27th are intentionally placed on a trial so billing re-anchors to the
24th (`billing_anchor_rule: "join_25_27_to_24"`, verified in live invoice metadata). The upgrade's
`billing_cycle_anchor: "now"` contradicts the pending `trial_end`, and Stripe rejects it every
time.

**Chosen:** end trial → charge now → **re-apply the anchor-24 trial for the next cycle**. This
keeps pay-first upgrade semantics *and* the anchor design. Simply clearing the trial would
silently discard anchor-24 for that member.

---

## 4. Phases

Each phase ships an independently valuable, verifiable win.

### Phase 0 — Credit the 11 members (own branch, **deadline 8:00pm AEST 27 Aug**)

Ships first and separately. If this slips past the freeze, the members roll to September having
paid for a draw they never entered.

**Why the existing tools cannot do this:** replaying the Stripe webhook fails because the event
was already acked (`ProcessedStripeEvent.eventId` is unique — that *is* RC-1's signature).
`fix-major-draw-renewal-entries.ts` fails because it starts from `BenefitsGranted` rows and these
11 have none (RC-2).

**Build:** `scripts/backfill-missing-renewal-grants.ts`, following `writing-ops-script`
conventions — `--dry-run` default, CSV audit log, progress lines, 3-tier exit codes.

- Input: the 11 invoice ids (list held in the incident artifact), or derived by the RC-2 join.
- Calls the normal grant path so the `PaymentEvent` is created properly.
- Passes the **original charge timestamp** (`2026-08-23T14:00Z`), not `now` — draw routing keys
  off `paymentMetadata.created` (`payment-processing.ts:2226-2229`), so this credits the **August**
  draw and passes `wasPaymentBeforeFreeze`.
- Naturally idempotent: `PaymentEvent._id` is `BenefitsGranted-invoice_<invoiceId>`.

**Acceptance:** `verify-major-draw-entries.ts` shows all 11 present; re-running the script is a
no-op; the RC-2 join returns zero rows for 23 Aug.

### Phase 1 — Never charge without granting

**Changes**
1. `handleInvoicePaymentSucceeded`: let errors propagate so `processQueuedEvent`'s `markFailed`
   runs. Gate `shouldMarkAsProcessed` (`index.ts:5527`) on the grant having succeeded.
2. `index.ts:4369`: add the missing else-branch so `{success: false}` un-acks, matching
   `:1511-1522`.
3. New reconciler: paid `subscription_cycle` invoices in a window, left-joined against
   `PaymentEvent._id = BenefitsGranted-invoice_<id>`. Scheduled; **alerts** on any gap.

**Acceptance:** a forced Stripe error inside the handler leaves the event `queued`, not
`succeeded`; the reconciler reports the 11 as a gap when run against pre-Phase-0 data and zero
after; alert fires on a seeded gap. New tsx test per `writing-tsx-test`.

### Phase 2 — Get under Stripe's rate limits

**Changes**
1. Remove `index.ts:172` `subscriptions.retrieve` — `packageName` is already on the invoice
   payload at `parent.subscription_details.metadata` (confirmed on live finalized invoices) and
   on line-item metadata. **Gated on a verification step** (below).
2. Remove `:3657` — its "fewer round trips" shortcut at `:3585-3586` tests the pre-Basil
   top-level `invoice.subscription`, which stripe@18.5.0 does not declare, so the retrieve runs
   on every renewal.
3. Remove `:3761` — an unconditional `pause_collection: ""` write for members never paused.
4. Add a shared client-side token bucket in `src/lib/stripe.ts`, sized under both the 100/sec
   global and 25/sec per-endpoint caps.

**Verification step (blocking, do first):** log
`invoice.parent.subscription_details.metadata` and `invoice.lines.data[0].metadata` on one live
`invoice.created`. Stripe's SDK types note the metadata snapshot is taken at *finalization*, and
`invoice.created` fires before that. If absent on drafts, move the stamping to `invoice.finalized`
instead of removing the retrieve.

**Acceptance:** measured calls per renewal ≤ 6, `/v1/subscriptions` ≤ 1; limiter proven by a load
test at 40 renewals/sec producing zero 429s.

### Phase 3 — Clear the renewal hour

**Changes**
1. Move `dashboard-stats-daily-snapshot` and `membership-daily-snapshot` off `0 14` **and**
   `0 15` in `vercel.json`. 15:00Z is the true peak (3,551 events).
2. Add a written-once guard to `membership-daily-snapshot` — both scheduled runs resolve to the
   same date key (`route.ts:28-31`) with no existence or `computedAt` check (`:41-59`), so the
   15:00 run silently overwrites the 14:00 row with post-burst numbers.

**Acceptance:** no cron scheduled in 14:00Z or 15:00Z; a second same-day invocation is a no-op;
a snapshot row taken during a burst matches a live count.

### Phase 4 — Make the charge cron finish

**Changes**
1. Sweep on last progress, not `startedAt` (D-2). Add a `lastProgressAt` to `ChargeJobRun`
   updated per chunk, and key `sweepOrphanRuns` off it.
2. Confirm and, if needed, fix worklist ordering so the tail cannot starve. Ordering currently
   derives from `previewChargePastDueInvoices()` → Stripe list order (newest-first).
   **229 members have never been attempted in 30 days** — ordering must rotate or prefer
   least-recently-attempted.
3. Alert on `status: "aborted"` and on success rate below a threshold (currently ~2.9%).

**Acceptance:** a run exceeding 35 minutes completes rather than aborting; eligible = attempted +
skipped, with no silent remainder; the never-attempted count trends to zero; alert fires on a
seeded abort.

**Do not** raise throughput or concurrency — more attempts per card is what manufactures the
blocks. Completion, not speed, is the goal.

### Phase 5 — Unblock trial upgrades

**Changes**
Per D-4: end trial → charge now → re-apply the anchor-24 trial for the next cycle.

**Mandatory pre-flight:** this sets `trial_end` and `billing_cycle_anchor` on an *existing*
subscription — the class CLAUDE.md flags as able to make Stripe auto-spawn an extra
`invoice.payment_succeeded`. Work the checklist in `docs/PAST_DUE_REANCHOR.md`, confirm coverage
by `isZeroAmountTrialUpdateInvoice` (`src/utils/billing/trial-invoice.ts:18-27`), and run
`npm run test:zero-trial-guard`.

**Acceptance:** a `trialing` anchor-24 member upgrades successfully; charged the new tier
immediately; entries granted from that payment; next renewal still lands on the 24th; no spurious
$0-invoice grant.

---

## 5. Out of scope

- **Re-anchoring members to spread the burst.** Would flatten the spike, but it is a mass
  billing-date migration on live customers — materially riskier than the outage it prevents.
  Revisit only if Phases 2–4 prove insufficient.
- **Raising charge-cron throughput.** More attempts is the cause of the blocks, not the cure.
- **RC-4's connection-layer cleanup** — five `connectDB()` calls per event, the admin ping on
  every cached hit, `minPoolSize: 0`, and the missing post-await `readyState` guard. **Deferred by
  explicit scope decision**, not because it is unimportant: the `readyState` guard is the cheapest
  single fix in this document, and RC-4 produced all 172 HTTP 500s.

  It is deferrable *only* because those 500s cost no money or entries — the event is not yet
  enqueued when they fire, so Stripe redelivers and the unique-index dedup makes the eventual
  grant safe and single. **Schedule it as the next spec after this one.** If Phase 2's Stripe
  work lands and 500s persist on the September run, promote it immediately.

- **The `stripewebhookqueue` TTL index** (live `processedAt_1` at 30 days vs the declared 24
  hours; 171,909 rows / 689 MB). Real, but did not cause this incident.
- **Freeze-aware `awaiting_retry` skip.** Real — the skip does not check `freezeEntriesAt`, so on
  the 26th/27th it can hand a member's last in-time chance to a retry that lands after entries
  close. Incidence is low but **not** zero and varies by run: `awaitingRetry: 0` on the 20 Aug
  run, **32 of 868 (3.7%)** on 23 Aug, 1,334 occurrences across 30 days. Deferred only because
  Phase 4's completion fix is the larger win on the same job; **revisit immediately after Phase 4**
  and before the October draw.
- **Unsubscribing unused webhook events.** 21 enabled; several do no work. Needs a dispatcher
  audit first.
- **Splitting the grant handler (option B in D-1).**

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Phase 1 un-acking causes retry storms on a genuinely poisoned event | Queue already has bounded attempts + dead-lettering; add the `dead` alert in the same phase |
| Phase 2 removes a call whose data is absent on draft invoices | Blocking verification step before removal; fall back to stamping at `invoice.finalized` |
| Phase 5 spawns a $0 invoice that grants entries | `isZeroAmountTrialUpdateInvoice` guard + `test:zero-trial-guard` + PAST_DUE_REANCHOR checklist |
| Phase 4 ordering change re-hammers the same cards | Pair the ordering fix with a per-invoice attempt cap; measure attempts-per-invoice before/after |
| Fixes land untested before 24 Sept | Phases are independent and individually shippable; land in priority order 1 → 2 → 4 → 3 → 5 |

---

## 7. Verification

```bash
npm run type-check
npm run lint
npm run test:anchor-billing
npm run test:zero-trial-guard          # Phase 5
npm run test:<new>                     # per writing-tsx-test, Phases 1 and 4
```

Docs to update in the same tasks (per CLAUDE.md rules 2, 5, 5b, 5c):
`docs/billing-stripe/`, `docs/subscription/`, `docs/draws/`, `docs/admin/`,
`docs/infrastructure/`, plus `BUSINESS.md` / `CUSTOMER.md` where Phase 5 changes the documented
upgrade journey.

---

## 8. Open questions — non-blocking

1. **Which Stripe limit fired.** Arithmetic strongly implicates the per-endpoint bucket; only a
   live `Stripe-Rate-Limited-Reason` header proves it. Capture on the next 429.
2. **Is `parent.subscription_details.metadata` populated on draft invoices?** Gates Phase 2
   change 1. One log line answers it.
3. **Does a *failed* out-of-band `invoices.pay()` leave `next_payment_attempt` untouched?**
   Stripe's docs say manual attempts do not affect the retry schedule; a test-clock probe would
   confirm end-to-end. `scripts/stripe-probe-reanchor.ts` already reaches the precondition state.

---

## Appendix A — The 11 affected invoices

Phase 0's input. Derive these at run time with the RC-2 join rather than hard-coding them — the
join is authoritative and will catch any the manual pass missed — but they are recorded here so
the spec stands alone and the backfill is auditable after the fact.

```
MembershipRenewalCycle { createdAt: >= 2026-08-23T13:00:00Z, status: "succeeded",
                         billingReason: "subscription_cycle" }
  LEFT JOIN PaymentEvent on _id == "BenefitsGranted-invoice_" + stripeInvoiceId
  WHERE the PaymentEvent is absent
```

| Invoice | Amount | Charged (UTC) |
|---|---|---|
| `in_1U7b0KJ3N9Ka6RJMcLvhPOHe` | $80.00 | 14:00:52 |
| `in_1U7b0XJ3N9Ka6RJMoAPTWgCu` | $20.00 | 14:00:58 |
| `in_1U7b0XJ3N9Ka6RJMxCyq3iks` | $20.00 | 14:00:58 |
| `in_1U7b0tJ3N9Ka6RJM1mv990t5` | $20.00 | 14:00:58 |
| `in_1U7b0VJ3N9Ka6RJMLLl4lvzY` | $20.00 | 14:00:59 |
| `in_1U7b0hJ3N9Ka6RJMFm4QidP0` | $20.00 | 14:00:59 |
| `in_1U7b0hJ3N9Ka6RJMrRU1Elct` | $20.00 | 14:00:59 |
| `in_1U7b0VJ3N9Ka6RJMnaWbOXom` | $20.00 | 14:00:59 |
| `in_1U7b0JJ3N9Ka6RJMOQrkw7Bz` | $20.00 | 14:00:59 |
| `in_1U7b0JJ3N9Ka6RJMkGiYkqnz` | $20.00 | 14:00:59 |
| `in_1U7b0KJ3N9Ka6RJMSo9ywPpF` | $40.00 | 14:00:59 |

**Total: $300.00.** All within a 7-second window, all with `BenefitsGranted` records for June and
July — established members whose August grant alone never landed.

---

## Appendix B — Reproducing the evidence

Every figure in §1, §2 and §4 came from these sources. Recorded so a reviewer can re-derive them
rather than trust the table.

- **Vercel**: project `tools-australia`, team `Tools Australia's projects` (Pro). Error counts by
  route and status; the 1,286-invocation count is `get_runtime_logs` grouped by `requestPath`
  over `14:00:35Z–14:00:58Z`.
- **Stripe**: live `acct_1S23INJ3N9Ka6RJM`. Invoice listing by `created` window and `status`;
  retry gaps from `next_payment_attempt − created`; endpoint config from
  `GET /v1/webhook_endpoints` (21 events enabled).
- **MongoDB**: production cluster, database `Production` (55,312 users). Read-only aggregations
  over `stripewebhookqueue`, `membershiprenewalcycles`, `paymentevents`, `invoicechargelogs`,
  `chargejobruns`, `majordraws`, `users`.
- **Code audit**: 13-agent pass with adversarial verification; claims that failed verification
  were dropped or corrected. Two of the author's own early conclusions were reversed by it —
  the "negative retry buffer" (wrong: 83% land in time) and "connection exhaustion" (wrong:
  19% of the limit; the failure was handshake rate).
