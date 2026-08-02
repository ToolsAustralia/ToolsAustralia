# Past-due recovery — findings to fix on this branch

**Branch:** `feature/past-due-recovery-fixes` · **Worktree:** `.worktrees/past-due-recovery-fixes` (PORT 3033)
**Source:** production read-only analysis of the Draw 9 opening week (28–31 Jul 2026 AEST), done 31 Jul 2026.
**Status (updated 2026-08-03):** all findings investigated and resolved. Fixes landed on this
branch; see the resolution table below. The original analysis is preserved unedited beneath it —
including the parts later measurement **corrected**, which are called out explicitly.

Read this file first. It is the starting context for this branch — everything below was
measured, not assumed. Where something is *not* yet verified it says so explicitly.

---

## Resolution summary (2026-08-03)

Validated against production data for **1–2 August**, which the original analysis never saw.

| # | Verdict | What shipped |
|---|---|---|
| **F1** | **Root cause confirmed — candidate 2**, plus a twist that invalidated the suggested fix | In-run reroute to recovery |
| **F5** | Confirmed; a cleaner discriminator than string-parsing existed | One shared classifier + synthetic codes |
| **F2** | **Premise corrected** — a real but *different* bug found | `incorrect_number` added to the permanent-issue set |
| **F4** | Confirmed NOT a defect | Stale comment corrected; anchor trade documented |
| **F6** | Confirmed NOT our bug; the suggested retry gate would do net harm | No gate — measured and documented |
| **F7** | **Scope corrected** (2 accounts, not 1); root cause found | Webhook fix + `reconcile:stale-active` script |
| **F8** | **Premise corrected** — not a sync bug | No code change (TikTok-side attribution) |
| — | **New:** live Norm 500 found by `norm:smoke` | `normalizeRunTotals` at the read boundary |

### F1 — confirmed, and the suggested fix would not have worked

Candidates 1 and 3 are **eliminated**: `payments` *is* expanded (17/17) and the invoices *are*
recovery-eligible (17/17). Candidate 2 is real — a stale `invoice_payment` reading `status: "open"`
holds the invoice on the pay branch.

The twist: **our own call creates the state it then fails on.** The Stripe request id that returns
our 400 is the same request that emits `payment_intent.canceled` (17/17). So the PaymentIntent is
*live* at classify time — meaning "make the classifier consider PaymentIntent status" (suggested
above) **cannot** work. The fix is post-hoc: `deferUnpayableToCaller` → recover in the same run.

Because our call flips the last `open` payment to `canceled`, the *next* day's run always picked the
cohort up. Measured across four consecutive days, exactly 1:1 — **5→5, 209→209, 14→14, and
17→17 on 1 Aug (unseen data, predicted in advance).** Cost was one wasted member-day each, and a
"failed charge" chip that was never a card problem. Still occurring: 7 on 1 Aug, 5 on 2 Aug.

### F2 — the premise did not survive measurement

"999 dead-card declines retried daily with no possible outcome" overstates it: only **39 members
all-time** decline *exclusively* on dead-card codes (415 attempts). Most members with a dead-card
decline also produce soft declines, so their card is not uniformly dead.

Suppressing those retries would also be **net harmful**: the `Subscription Renewal Failed` dunning
notification fires *only* from a real Stripe attempt (`invoice.payment_failed`) and there is no
dunning cron — a skip contacts nobody. That is the design goal stated in BUSINESS.md §9e. **No
retry gate was added.**

A real bug did surface: `PERMANENT_ISSUE_DECLINE_CODES` contained `invalid_number` (**0 rows
all-time**) but not `incorrect_number` (**4,202 rows**; 189 on 1–2 Aug alone, the second-largest
code). Those cards were being auto-allowlisted, which cannot help. Fixed.

### F6 — real, but the proposed policy has the same flaw as F2

`processing_error` repeats are genuine (two invoices hit it 16 times). But promoting to a
hard-decline cohort cuts the same notification path for a small population. Measured and
documented; **no gate added.**

### F7 — scope corrected twice, root cause found

A first pass suggested 202 stale accounts. **That was wrong** — it counted recovery *step-audit*
rows (which carry `status: "success"`/`"failed"` but are machinery, not payments) and ignored that
ordinary renewals never write to `InvoiceChargeLog` at all. Against the real `PaymentEvent` ledger
the answer is **2**: `attardweston885@gmail.com` and `fl4no@hotmail.com` (both still stale as of
2 Aug; neither self-heals).

Root cause: `invoice.payment_failed` fires the dunning notification on `isRenewal || isRebill`, but
wrote `past_due` on `isRenewal` **alone**. A minted re-bill is `billing_reason:
"subscription_update"` → `isRebill`, so a failed re-bill emailed the member while leaving Mongo
`active`. Combined with `unpauseAndAnchorNow` emitting a `customer.subscription.updated` carrying
status `active` (which we mirror), that is the drift. Fixed with a dedicated `isRebill` branch —
deliberately separate from `isRenewal` so it cannot trigger `pauseAfterRenewalFailure` and re-pause
a member recovery just unpaused.

### F8 — not a sync bug

`complete_payment` itself went **14 → 0** on 28 Jul and stayed zero for six days (28 Jul–2 Aug,
~$944 spend), spanning both TikTok tracking fixes (29 and 31 Jul). The pipeline is provably healthy
— the same metric returned real numbers the four days prior. **Confirmed with the owner that
ads.tiktok.com itself reports no attributed conversions**, so our sync faithfully mirrors TikTok.
This is a TikTok-side attribution/matching question, not a code defect. **No code change.**

### New finding — a live Norm 500, invisible to tsc and the tests

`GET /v1/charge-past-due/runs` returned **500 `response_schema_invalid`** for any page containing a
run finalized before 2026-07-20, because `SkippedBreakdownSchema` requires `noHeldDraft` /
`awaitingRetry` and legacy runs have neither. Found by `npm run norm:smoke`. Fixed by
`normalizeRunTotals` at the read boundary rather than migrating immutable history.

### Not addressed (out of scope, flagged)

- [`src/app/api/stripe/cancel-payment-intent/route.ts`](../../src/app/api/stripe/cancel-payment-intent/route.ts)
  has **no session, permission, or ownership check** — it cancels any PaymentIntent id posted to it.
- The past-due population is **growing** (775 → 804; worklist 744 → 750 → 752 across 31 Jul–2 Aug)
  while three runs recovered $1,400. Recovery works but is not keeping pace with inflow — a
  separate problem from all eight findings.

---

---

## Context: why this branch exists

Over 28–31 Jul 2026 the daily bulk past-due charge job made **2,703 attempts** and recovered
**69 members / $2,360** — a **2.6% success rate**. There are **775 members past due**, about
14% of the 5,540-member paying base, representing roughly **$25,200/month** of stalled
recurring revenue (775 × the observed $32.52 average renewal). Recovery has not improved
cycle over cycle (prior cycle, same four days: 73 successes / $2,460).

The window holds **2,639 failed `InvoiceChargeLog` rows**. Five of them are pure duplicates
(recovery summary rows that mirror a coded row on the new invoice), leaving **2,634 distinct
failure events** — which reconciles exactly with the run-level failed totals (735 + 713 + 716 + 470).

| Group | Count | Share | Retry-able? |
|---|---:|---:|---|
| Card dead or replaced (`incorrect_number` 300, `invalid_account` 222, `lost_card` 220, `stolen_card` 199, `expired_card` 33, `pickup_card` 25) | 999 | 37.9% | **No** — needs the member to update the card |
| `insufficient_funds` | 597 | 22.7% | Yes — timing-sensitive |
| Issuer block / other (`transaction_not_allowed` 247, `generic_decline` 121, `do_not_honor` 75, `processing_error` 51, `try_again_later` 47, +15 others) | 556 | 21.1% | Sometimes |
| **`payment_intent_unexpected_state`** | **245** | **9.3%** | **Not a card decline at all** — see Finding 1 |
| **Re-bill declined after recovery** (uncoded; "Minted cycle invoice did not settle") | **237** | **9.0%** | Real card decline — see Finding 4 |

⚠ **Neither admin view reports this table correctly today — see Finding 5.** The run drawer
labels the last group `unknown`; the server-side decline summary hides it entirely.

---

## Finding 1 — `payment_intent_unexpected_state`: charges that never reach the issuer

### What it is

**All 245 rows in the window carry a byte-identical Stripe error:**

```
This PaymentIntent's payment_method could not be updated because it has a status of
canceled. You may only update the payment_method of a PaymentIntent with one of the
following statuses: requires_payment_method, requires_confirmation, requires_action.
```

- Stripe type `StripeInvalidRequestError`, code `payment_intent_unexpected_state`, HTTP **400**
- Response header **`stripe-should-retry: false`**
- The card is never touched. This is our call being rejected on state, not a bank declining.

### Where it is thrown

[`src/server/admin/chargePastDueShared.ts:469`](../../src/server/admin/chargePastDueShared.ts#L469),
inside `payOpenInvoiceAsPastDueAdmin`:

```ts
const paidInvoiceResponse = await stripe.invoices.pay(
  invoiceId,
  { payment_method: paymentMethodId, off_session: true },
  { idempotencyKey }
);
```

When the invoice's existing PaymentIntent is already `canceled`, Stripe refuses to attach a
new `payment_method` to it. The invoice is not payable through this path at all.

### Where it is visible in the app

Admin → **Past-Due Charges** tab (`past-due-history`, gated on `settings.view`):
- `src/app/admin/component/PastDueChargeHistory.tsx` — run list + decline summary
- `src/app/admin/component/PastDueChargeHistoryDrawer.tsx` — per-run row drill-in

Backing endpoints: `/api/admin/charge-past-due/decline-summary`, `/runs`, `/runs/[runId]`.
The decline summary buckets by `declineCode ?? errorCode ?? "unknown"`, so this surfaces
inside the same top-5 list as real card declines — which is exactly why it reads as a card
problem when it is not one.

### It does NOT self-heal — this was checked

| Check | Result |
|---|---|
| Distinct invoices affected in the window | 245 (one per user) |
| Of those invoices, how many ever have a `success` row, all-time | **9** |
| Current subscription status of the 245 users | **238 `past_due`**, 7 `active` |

So ~97% of the affected members were still stuck at the time of measurement. Treating this
as transient noise would be wrong.

### It is not new, and it is spiky

All-time **1,950** occurrences, first on **2026-03-24**. Recent AEST days:

```
2026-07-31  17      2026-07-22  27      2026-07-07  34
2026-07-30  14      2026-07-16  55      2026-07-03 194
2026-07-29 209      2026-07-15  46      2026-07-02  60
2026-07-28   5      2026-07-13  18      2026-07-01 128
2026-07-27   3      2026-07-12  32      2026-06-30 112
```

Note the shape: **209 of the window's 245 landed on 29 July alone**, and there are comparable
spikes on 1–3 July and 16 July. It is bursty, not a steady drip — which suggests a cohort
entering the canceled-PI state together (plausibly tied to a preceding run or a Stripe
retry-exhaustion boundary), rather than random per-invoice failure. **That correlation is a
hypothesis, not verified — confirm it before designing the fix.**

### Why the existing recovery path did not catch them

The codebase already has a stranded-invoice recovery flow (void the dead invoice → finalize
a held draft → pay), selected by
[`decideBulkChargeAction`](../../src/server/admin/chargeOrRecoverPolicy.ts#L50):

```ts
const payments = (invoice as InvoiceWithPayments).payments?.data;
if (payments == null) return { kind: "pay" };          // not expanded — legacy fallback
const hasPayableInvoicePayment = payments.some((p) => p?.status === "open");
return hasPayableInvoicePayment ? { kind: "pay" } : { kind: "recover" };
```

Its doc comment says recovery is for when `invoices.pay()` rejects with *"This invoice can no
longer be paid"* — which Stripe returns when **every** `invoice_payment`'s PI is canceled.

Our 245 rows are a **different rejection** (`payment_intent_unexpected_state` on
`payment_method`). So there is a state the policy does not classify: the invoice looks payable
by the current predicate, but its PaymentIntent is canceled and cannot accept a payment method.

**Candidate causes — all unverified, investigate before fixing:**
1. `payments` was not expanded on these invoices, hitting the `return { kind: "pay" }` legacy
   fallback. Check that the bulk worklist retrieves with `expand: ["payments"]` on every path.
2. An `invoice_payment` reports `status: "open"` while its underlying PaymentIntent is
   `canceled` — the predicate reads the payment, never the PI status.
3. `isOriginalInvoiceEligibleForRecovery` rejects these invoices upstream, so recovery is never
   even considered.

### Suggested direction (not prescriptive)

- Establish which of the three causes is real, using the reproduction queries below.
- Make the classifier consider PaymentIntent status, not only `invoice_payment.status`.
- Treat `payment_intent_unexpected_state` as a **routing signal to recovery**, not a terminal
  failure — today it burns one attempt per member per day, forever.
- Separate it from card declines in the decline summary so the admin view stops implying
  these members have a card problem.
- Add a regression test alongside `src/server/admin/__tests__/chargeOrRecoverPolicy.test.ts`.

---

## Finding 2 — 999 dead-card declines are retried daily with no possible outcome

41.7% of declines are `incorrect_number` / `invalid_account` / `lost_card` / `stolen_card` /
`expired_card` / `pickup_card`. None of these can succeed without the member supplying a new
card, yet the bulk job re-attempts them every day.

Costs of the status quo: wasted Stripe attempts, a permanently depressed headline success
rate that hides real movement, and elevated retry pressure on issuers.

Worth considering on this branch (scope it with the user first — this is a product change,
not just a bug fix):
- Classify dead-card declines into their own cohort and stop the daily blind retry.
- Route them to a card-update path instead — there is existing member-facing recovery
  machinery (`actor: "member"` rows exist in `InvoiceChargeLog`, and `RecoveryClaim` /
  `src/server/admin/recoverStrandedPastDue.ts` are in place). **Check what already exists
  before building anything new.**

---

## Finding 4 — "Minted cycle invoice did not settle (status=open)" — NOT a bug, but it has a cost

### What the message means

Full string as seen in the admin drawer:

```
Recovery finalize_failed: Re-bill failed (charge_failed):
Minted cycle invoice did not settle (status=open)
```

It is emitted by
[`src/services/subscription/mintCurrentCycleInvoice.ts:181`](../../src/services/subscription/mintCurrentCycleInvoice.ts#L181).
The sequence is:

1. Member is **stranded** — Stripe has given up on their original invoice.
2. Recovery runs. There is **no held draft** to finalize, so the `mintCurrentCycleIfNoDraft`
   path engages ([`chargePastDueJob.ts:427`](../../src/server/admin/chargePastDueJob.ts#L427)).
3. `unpauseAndAnchorNow(subscriptionId)` clears `pause_collection` and sets
   `billing_cycle_anchor: "now"`, which makes Stripe **immediately mint and auto-charge a
   fresh current-cycle invoice**.
4. The old dead invoice is voided (best-effort).
5. If the new invoice comes back `paid` → success. **Anything else means the card declined.**
   `status=open` is the decline case, returned as `reason: "charge_failed"`.

The source comment states the intent plainly: *"'paid' = auto-charged successfully on
unpause+anchor. Anything else = the card didn't settle; the member is effectively past_due
again on a fresh cycle (a later run can retry)."*

**So: it is a genuine card decline, correctly detected and correctly recorded.** Not a bug.

### What actually happens to the member — verified

| Check | Result |
|---|---|
| Rows in the window | 237 |
| Distinct members | 237 |
| Times any single member hit this in 4 days | **exactly once each** — not a daily loop |
| Concentration | **206 of 237 on 30 July**; 4 / 4 / 27 on the other days |
| Current status of those 237 | **235 `past_due`**, 2 `active` |
| Invoice value involved | $8,440.00 |

It is self-limiting: once a member is minted they have a fresh open invoice, so the next run
routes them to the ordinary pay branch rather than minting again.

### The cost that IS worth a decision

`unpauseAndAnchorNow` moves the member's **billing anchor to "now"** — and it does so *before*
knowing whether the card will settle. So for these 237 members the anchor moved even though
no money was collected, and the cycles they never paid for (in some cases months) are
**permanently forgone**. That is a deliberate trade — collect going forward rather than
dead-end — and the `chargeOrRecover.ts` comment acknowledges it ("their renewal resets ~1
month out"). **Surface it to the business owner as a policy choice, not a defect.**

⚠ **Stale comment to fix while here:** [`chargeOrRecover.ts:68-69`](../../src/server/admin/chargeOrRecover.ts#L68)
claims *"The bulk run does NOT enable this (it holds a claim + would reset hundreds of anchors
unattended)"* — but `chargePastDueJob.ts:427` **does** enable `mintCurrentCycleIfNoDraft` in the
bulk run. The comment describes behaviour that was later changed. It is actively misleading.

---

## Finding 5 — the admin decline views disagree with each other, and both are wrong

This is the real bug behind the **`unknown 206`** chip the owner spotted on the 30 July run.

### Two views, two different (wrong) answers

The bulk job writes, for each recovered worklist item, a **run-tagged summary row** against the
*original* invoice id carrying `result.recovery.bulk` and **no `declineCode`/`errorCode`**. The
real coded decline (when there is one) lands on a *separate* row against the **new** invoice id.

- **Run drawer chips** — [`PastDueChargeHistoryDrawer.tsx:124`](../../src/app/admin/component/PastDueChargeHistoryDrawer.tsx#L124):
  ```ts
  const declineCodeOf = (r) => r.declineCode ?? r.errorCode ?? "unknown";
  ```
  Its comment claims *"same precedence as … the server's `summariseDeclineCodes`"* — but it
  omits that function's two exclusions. So every codeless recovery-summary row is bucketed as
  **`unknown`**. On 30 July that is **206 rows**, making `unknown` the single largest "decline
  reason" on the screen. It also cannot filter them out even if it wanted to:
  `getChargeRunDetail` does not project `result.recovery` at all.

- **Server decline summary** — [`chargePastDueHistory.ts:115-119`](../../src/services/admin/chargePastDueHistory.ts#L115)
  excludes both `result.recovery.step` and `result.recovery.bulk`. Verified against production:
  **0** of the 242 codeless rows pass that filter. That correctly drops the 5 true duplicates —
  but it also **silently hides the 237 real re-bill declines**, which have no coded twin anywhere.

**Net effect:** the drawer says "206 unknown", the summary card says nothing at all, and neither
tells the operator that 237 members had a freshly minted invoice decline. The information is
sitting in `errorMessage` and is simply never aggregated.

### Suggested direction

- Give the re-bill decline its own bucket rather than letting it fall through to `unknown` —
  e.g. classify uncoded `result.recovery.bulk` rows by parsing their `errorMessage` prefix, or
  (better) **persist a real code on the row at write time** in `summarizeBulkRecoveryOutcome`
  so neither view has to infer anything.
- Make the drawer and the server summary share one classifier. Two implementations of the same
  precedence rule already drifted once.
- Project `result.recovery` in `getChargeRunDetail` so the drawer can distinguish summary rows
  from real attempts.
- Verify the totals reconcile after the change: coded (2,397) + re-bill declines (237) must equal
  the run-level failed count (2,634), with the 5 duplicate rows excluded.

---

## Finding 6 — `processing_error` is NOT our bug, but the retry policy around it is wrong

The owner asked specifically whether `processing_error` rows are caused by us charging members
who are not really past due. **Checked — they are not.**

| Check | Result |
|---|---|
| `processing_error` rows in window | 51 |
| Distinct members | 29 |
| Current status of those members | **28 `past_due`**, 1 `active` |

`processing_error` is Stripe's own decline code for a transient issuer/network fault ("An error
occurred while processing your card. Try again in a little bit."). It arrives as a genuine card
decline on our `invoices.pay()` call. Nothing on our side manufactures it.

**But "transient" is doing a lot of work.** `attardweston885@gmail.com` (the account in the
owner's screenshot) received `processing_error` on **12 July, 13, 15, 23, 25, 26, 27, 28 and 30
July** — nine times across three weeks on the same card, interleaved with `insufficient_funds`
and `generic_decline`. A genuinely transient error does not repeat nine times. Treating it as
retryable forever is the wrong policy; consider promoting it to a hard-decline cohort after N
consecutive occurrences on the same invoice.

---

## Finding 7 — `attardweston885@gmail.com`: status genuinely wrong, but it is a single case

The owner flagged this account as an **active member, renewing 5 August, appearing in the
past-due bulk run**. Investigated in full.

### He is not a healthy member

| Fact | Value |
|---|---|
| `subscription.status` in Mongo | **`active`** |
| Last successful payment event | **5 June 2026** — nothing since |
| Failed charges | daily since at least 10 July, $80 Boss, invoice `in_1TpU77…` |
| Fields on his subscription doc | only `status`, `packageId`, `autoRenew`, `startDate` — **no `currentPeriodEnd`, no `renewalDate`, no `nextBillingDate`** |

So the worklist was **right** to include him; the `active` status is what is wrong. He has been
delinquent for nearly two months. Note he is *not* counted in the 775 `past_due` figure, so true
exposure is slightly larger than that number suggests.

His 30 July sequence shows the recovery path working exactly as designed, then losing on the card:

```
17:31 create    skipped  Using held draft in_1THZ0g…
17:31 finalize  skipped  Finalized; status=open
17:31 void      success  Voided stranded original invoice
17:31 pay       failed   in_1THZ0g… → processing_error
17:31 summary   failed   Recovery pay failed on in_1THZ0g… (codeless → shows as "unknown")
```

That single event is what produces **both** a `processing_error` chip **and** an `unknown` chip
for the same underlying failure — a concrete instance of Finding 5's double-count.

### The wider worry does not hold up — this is important

"Active members are being swept into the past-due run" was the natural read. It is **not** what
is happening:

| Check | Result |
|---|---|
| Distinct users touched by bulk runs in the window | 808 |
| Currently `past_due` | 727 |
| Currently `active` | 78 |
| Of those 78 — **genuinely recovered** (successful payment *after* their last failure) | **69** |
| Of those 78 — no failed charge on record at all, recent payment | 8 |
| Of those 78 — **genuinely stale status** | **1** (`attardweston885`) |

So **77 of 78** "active" members in the worklist are active *because the run collected from
them* — the system working, not a targeting bug. Only one account has a status that
contradicts its payment history.

**Suggested scope:** fix the one account's status, then find out how it got there (most likely a
missed or out-of-order webhook). Do **not** build a reconciliation sweep for a population of one
without checking first whether the pattern is bigger outside this 4-day window — that query is
cheap and is the right first step.

---

## Finding 8 — TikTok reports zero revenue for every synced day (needs verification)

Lowest priority, and outside the past-due domain — flagged only because it silently zeroes a
metric the owner reads. Do this last, or split it onto its own branch.

- `TikTokAdInsightsDaily.revenueCents` is **0 for all four days** of the window, on
  $615.34 of spend. Consequently `tiktokAdChannelProvider` in
  `src/services/admin/dashboard-stats/adChannelProviders.ts` computes `roas = 0` every day.
- First-party attribution independently found only **$99.99 / 3 conversions** from TikTok, so
  near-zero return is plausibly real — but *exactly* zero platform-reported revenue across
  four days points at conversion reporting not reaching TikTok rather than genuinely no sales.
- Relevant recent work: commit `1eae8c93 fix(tracking): repair TikTok Events API match quality`.
- The `tiktoksyncruns` collection holds one run, `outcome: "error"`,
  `errorMessage: "The operation was aborted due to timeout"` (31 Jul 02:45 AEST). Rows did
  re-sync later the same day, so the timeout is not currently losing data — but an errored
  sync leaving no successful run record is itself worth a look.
- Separately (not a code bug): a live campaign is still named `C_DRAW 8_PROSPECTING_JUL26`
  while Draw 9 is running. That is an ops fix in TikTok Ads Manager.

---

## Reproducing the analysis (read-only)

**`.env.production` is already present in this worktree** (gitignored by `.gitignore:49` `.env*`,
verified — it cannot be committed). Connection was smoke-tested from here: it reaches
`db: Production`, and `STRIPE_SECRET_KEY`, `FACEBOOK_MARKETING_ACCESS_TOKEN` and
`TIKTOK_MARKETING_ACCESS_TOKEN` are all populated, so Stripe and the ad APIs are reachable too.

### Rules for using it

- **Reads only. Never run a charge, void, finalize, refund or subscription mutation against
  production.** Every finding below was reproduced without a single write.
- Use **raw collection handles** (`connection.collection("…")`), *not* Mongoose models —
  importing a model can trigger an index build against prod. A raw handle used for `find` /
  `aggregate` / `countDocuments` physically cannot write.
- For Stripe, restrict yourself to `retrieve` / `list`. `stripe.invoices.pay()`,
  `.voidInvoice()`, `.finalizeInvoice()` and `subscriptions.update()` are all real money.
- Put scratch scripts somewhere gitignored or delete them after; don't leave probes in the tree.

```ts
import { config as loadEnv } from "dotenv";
import mongoose from "mongoose";
loadEnv({ path: ".env.production", override: true });
await mongoose.connect(process.env.MONGODB_URI!, { maxPoolSize: 2 });
const db = mongoose.connection.db!;
// db.collection("invoicechargelogs").find(...)  ← raw handle, read-only by construction
```

Run with `npx tsx <file>` from the worktree root.

Window: AEST days, `fromZonedTime("2026-07-28T00:00:00", "Australia/Sydney")` to
`fromZonedTime("2026-08-01T00:00:00", ...)` exclusive.

```js
// 1. the 245 rows
db.invoicechargelogs.find({
  attemptedAt: { $gte: START, $lt: END }, status: "failed",
  $or: [{ declineCode: "payment_intent_unexpected_state" },
        { errorCode:   "payment_intent_unexpected_state" }]
})

// 2. do those invoices ever get paid?
db.invoicechargelogs.countDocuments({ invoiceId: { $in: invIds }, status: "success" })

// 3. are those members still stuck?
db.users.aggregate([{ $match: { _id: { $in: userObjectIds } } },
                    { $group: { _id: "$subscription.status", n: { $sum: 1 } } }])

// 4. per-day history of the error
db.invoicechargelogs.aggregate([
  { $match: { $or: [{ declineCode: "payment_intent_unexpected_state" },
                    { errorCode:   "payment_intent_unexpected_state" }] } },
  { $group: { _id: { $dateToString: { date: "$attemptedAt", format: "%Y-%m-%d",
                                      timezone: "Australia/Sydney" } }, n: { $sum: 1 } } },
  { $sort: { _id: -1 } }
])
```

---

## Ground rules for this branch

- **Read `docs/PAST_DUE_REANCHOR.md` and `docs/billing-stripe/` before touching charge code.**
  The pre-flight checklist there is mandatory — mutations that set `trial_end` /
  `billing_cycle_anchor` / `proration_behavior` can make Stripe auto-spawn an extra
  `invoice.payment_succeeded` and double-grant benefits.
- **Do not commit without explicit authorization** (repo rule 1 in `CLAUDE.md`).
- Editing `src/**` obliges a matching `docs/<domain>/` update — past-due charge code maps to
  the **admin** domain (`docs/admin/`), Stripe primitives to **billing-stripe**. A `Stop` hook
  enforces this.
- Changes to the charge path or the admin decline view may also need README.md / BUSINESS.md
  (rule 5 — past-due recovery flow is business-material) and may need mirroring to Norm
  (rule 10 — `/api/admin/charge-past-due/**` is already mirrored under
  `/api/internal/norm/v1/charge-past-due/**`; keep them in lockstep).
- Verify against production with **read-only** queries; never run a charge to test.
