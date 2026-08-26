# Klaviyo customer profile accuracy — design

**Date:** 2026-08-26
**Branch:** `feature/klaviyo-profile-accuracy` (off `main`)
**Status:** design approved, awaiting review before implementation planning

> Every number in this document was verified against the production database on
> 2026-08-26. Claims inherited from an earlier audit are marked ✅ confirmed or
> ❌ corrected. Nothing here is recalled.
>
> **Both sides are now verified.** The Klaviyo account was read directly on 2026-08-26
> (read-only; nothing was written). Both customer profiles, all 109 account metrics, 31
> flows and 50 segments were inspected. See §2.1 and §2.8.

---

## 1. In plain English

### What this is, in one line

The customer information we send to our email marketing platform is wrong — sometimes
because it never arrives, and sometimes because we calculate it from the wrong place —
and the marketing team is about to put those wrong numbers into emails.

### Who is involved

- **The customer** buys a membership, gets free entries into the monthly giveaway, and
  later receives marketing emails that talk about what they have.
- **Our website** records the purchase and the entries in our own database. This part
  works correctly.
- **Klaviyo**, our email platform, holds a separate copy of each customer's details. Our
  emails are written against Klaviyo's copy, not ours.
- **The ads team** builds the emails and the audience rules using Klaviyo's copy.

Our database is right. Klaviyo's copy of it is wrong. Everything below is about closing
that gap.

### The journey, with two real customers

On the night of 25 August, two people bought a membership twenty minutes apart.

**Ash** signed up at 10:39pm, took the $80 membership at 10:39pm, and a minute later
received 1,000 free entries into the August giveaway. At 10:44pm — four minutes after
the entries landed — Ash finished filling in their profile. That last step happens to
tell Klaviyo to refresh everything. Ash's marketing record is correct.

**Kellie** signed up at 10:57pm, took the $20 membership fourteen seconds later, and at
10:59pm received 150 free entries. Kellie never finished filling in their profile — and
so nothing ever told Klaviyo to refresh. Klaviyo still believes Kellie has **zero entries**
and has **never entered a giveaway** — confirmed by reading the account directly. The last
thing Klaviyo was told about Kellie was her sign-up, fourteen seconds before she paid.

This is not merely cosmetic. There is a live audience rule called "Top Entries" that
selects anyone with more than 549 entries in the current giveaway. Kellie has 150, so she
would not qualify today — but a Boss member in her position has 1,000 and *would*, and is
being left out of every campaign built on that rule for as long as their record stays
stale. There is another rule that treats "zero entries" as shorthand for "registered but
never paid." A paying customer whose record never refreshed looks, to our own marketing
tools, exactly like someone who never bought anything.

Our own database recorded Kellie's entries correctly and knew about them within two
seconds. Klaviyo simply was never told. If a "thanks for joining, here's what you've got"
email went out tonight, Kellie would be told she has nothing.

The only thing that separates these two people is that one of them happened to click one
extra button. That is not a system — that is luck.

### The second problem: even a perfect refresh writes a wrong number

Ash's record is correct in the ways described above, but not in every way. Both customers
also have a figure meant to show "entries you got from memberships". For Kellie it says
**15**. For Ash it says **100**. The real figures are **150** and **1,000**.

The reason is that we don't look up what the customer actually received. We look up what
the price list says a membership is worth this month and multiply by how long they've
been a member. When a promotion is running — and one was — customers receive several
times the list figure. The price list has no idea that happened.

We checked every current member. **Not one of them has this number right.** It is not a
promotion bug; it is a bug in the idea of recalculating something we already recorded.
So we will stop recalculating it and read what we actually gave people.

### The rules in ordinary words

- Our database is the truth. Klaviyo holds a copy, and the copy's job is to keep up.
- Anything that changes about a customer must reach Klaviyo without anyone having
  remembered to send it.
- We never wait on Klaviyo while taking someone's money. A slow email platform must never
  put a payment at risk.
- Numbers describing what a customer received come from the record of what we gave them,
  never from a recalculation.
- A copy that has fallen behind must be visible to us. Today nobody can tell.

### What the customer sees when it goes wrong

They receive an email that contradicts their own account page. It tells them they have no
entries when the site shows 150, or quotes a figure ten times too small. For someone who
has just paid, that reads as either being cheated or as a company that doesn't know who
they are. It is worse than sending nothing.

### What we are deliberately not fixing here

- **769 customers whose entry totals don't reconcile with the giveaways they're in.**
  About 600 of them appear to hold roughly 100 more entries on their account than are
  actually in the draw they could win from. That is a genuine problem, but it is about
  entries themselves rather than about email, and repairing it means deciding whether
  those people gain entries in the draw or lose entries from their record — a decision
  about entries customers already believe they hold. It gets its own ticket. This work
  will make it visible instead of silent.
- **Reviving the abandoned upsell tracking.** Five fields meant to describe how customers
  respond to upsell offers have been empty for every customer since launch, because the
  thing that was supposed to fill them was never switched on. We are removing them rather
  than pretending. If the ads team wants that data, switching the tracking on is separate
  work.
- **A separate Klaviyo account for development.** We are adding a lock so a developer's
  laptop can no longer alter real customers, which removes the danger. Fully separating
  the two accounts needs an account provisioned and is not needed to be safe.

---

## 2. Evidence

Verified against production (`Production`, ~56,360 users) on 2026-08-26, using the live
profile-building code rather than reading it.

> **On the exact figures.** These were measured across several probes minutes apart against
> a live database, so totals move by single digits between tables (56,360 → 56,371 users;
> 11,905 → 11,912 entrants). Each number is reported as measured rather than harmonised
> after the fact. No conclusion here turns on the difference.

### The two customers

| | Kellie `6a8e1deb…7888` | Ash `6a8e1990…c613` |
|---|---|---|
| registered | 22:57:47 | 22:39:12 |
| subscribed | 22:58:01 (Tradie $20) | 22:39:30 (Boss $80) |
| entries granted | 22:59:17 — **150** | 22:40:49 — **1000** |
| completed profile setup | never | 22:44:03 ✅ |
| `user.updatedAt` | **22:59:18.916** | 22:44:03.641 |

Running the real profile builder over both:

| property | Kellie | Ash | correct? |
|---|---|---|---|
| `accumulated_entries` | 150 | 1000 | ✅ |
| `current_draw_entries` | 150 | 1000 | ✅ |
| `member_entries` | **15** | **100** | ❌ |
| `entries_purchased` | **15** | **100** | ❌ |
| `subscription_has_pending_upgrade` | **true** | **true** | ❌ |

Kellie's `updatedAt` is **1.9 seconds after the grant**. The database knew. Only Klaviyo
didn't. This is the fact the whole delivery design rests on.

### 2.1 What Klaviyo actually holds — read directly, both sides now confirmed

Klaviyo profiles `01M0XJ9R913447BP63QZ69M37W` (Kellie) and `01M0XH7R7FKBZP712GN961GWP6` (Ash):

| property | Kellie (Klaviyo) | truth | Ash (Klaviyo) | truth |
|---|---|---|---|---|
| `accumulated_entries` | **0** ❌ | 150 | 1000 ✅ | 1000 |
| `current_draw_entries` | **0** ❌ | 150 | 1000 ✅ | 1000 |
| `giveaways_entered` | **0** ❌ | 1 | 1 ✅ | 1 |
| `member_entries` | **15** ❌ | 150 | **100** ❌ | 1000 |
| `entries_purchased` | **15** ❌ | 150 | **100** ❌ | 1000 |
| `subscription_has_pending_upgrade` | **true** ❌ | false | **true** ❌ | false |
| `profile_setup_completed` | false ✅ | false | true ✅ | true |

Every claim in the original report is confirmed. Kellie's profile also carries **no**
`state`, `profession` or `gender`, consistent with never completing setup — the sync that
would have carried her entries is the same one that would have carried those fields.

**A finding that validates the design.** Both profiles report `updated:
2026-08-26T00:29:46+00:00` — the *same second*, roughly half an hour before this was
written, despite neither having been touched by us. That is Klaviyo's own predictive-
analytics pass (both carry an `Expected Date Of Next Order` property). **Klaviyo's
`updated` timestamp therefore cannot be used to detect a stale sync** — it moves for
reasons that have nothing to do with our writes. The `klaviyoSyncedAt` field proposed in
§4.3 is not redundant with it; it is the only thing that can answer "when did *we* last
write this profile?"

### Bug A — delivery ✅ confirmed

`ensureUserProfileSynced` (`klaviyo-profile-sync.ts:341`) is declared `void` and delegates
to a fire-and-forget `.catch()`. Every `await` on it awaits `undefined`. **49 references
across the codebase, ~24 real call sites** (the brief estimated 7).

### Bug B — truth ✅ confirmed, and worse than described

`calculateEntryBreakdown` derives `memberEntries` as
`catalogue.entriesPerMonth × floor(elapsed / 30 days)`. `getPackageById` returns the base
catalogue; `applyPromoToPackage` returns a *copy*, so the multiplier is never visible here.

Comparing lifetime granted membership entries (summed from `MajorDraw.entries[].entriesBySource.membership`
across all 10 draws) against the catalogue formula, for all **4,904 active members**:

| | |
|---|---|
| exact match | **0** |
| catalogue understates | 4,900 |
| catalogue overstates | 4 |

Ratio spread: ×5, ×6, ×10, ×11, ×12, ×13.5, ×14. **This is not a promo bug.** Promo
multipliers, upgrades that reset `startDate`, and resubscribes all make the reconstruction
unknowable. Only `memberEntries` is reconstructed — one-time, upsell and mini-draw read
stored granted values and are correct.

### `subscription_has_pending_upgrade` ✅ confirmed, ❌ cause corrected

Not stale data. `pendingChange` is a Mongoose **nested object** with all-optional
sub-fields, so it materialises as `{}`, and `!!{}` is `true`.

- All **56,360** users have a `subscription` object → the property is **hardcoded `true`
  for the entire database**.
- Users with a real `subscription.pendingChange.newPackageId`: **0**.

Any segment keyed on it matches everyone and always has.

### Other blast-radius items

| claim | verdict |
|---|---|
| `customer.subscription.deleted` never re-syncs | ✅ confirmed — fires a Klaviyo *event*, never `ensureUserProfileSynced` |
| admin edits sync only when `basicInfo` is present | ✅ confirmed — `admin/users/[id]/route.ts:241` gates on `payload.basicInfo` |
| referral / milestone / redeemable grants never sync | ✅ confirmed — zero Klaviyo references on those paths |
| `undefined` cannot clear a Klaviyo property | ✅ confirmed — `cleanProperties` drops `undefined`, keeps `null`; 3 properties use `null` |
| `upsell_*` permanently zero | ✅ confirmed — **0 of 56,360** users have `totalShown > 0`; 2,290 have real upsell purchases; `UpsellManager.tsx` is imported nowhere |
| dev and prod share one Klaviyo account | ✅ confirmed — `mode` only affects `formatEventName`; profile writes unprefixed; main's `.env.local` has `KLAVIYO_ENABLED=true` + a live key |
| `lifetime_value` collapses when a membership lapses | ✅ confirmed — gated on `subscription.isActive`, and also wrong across upgrades |

### ❌ Corrections to the earlier audit

**The rollover sweep's skip is not what was described.** It includes anyone with an entry
in *any* draw (`active`, `frozen`, **or `completed`**) — not only the current one.
Coverage: **11,905 covered / 44,455 skipped (79%)**. The skipped group never entered a
single draw, i.e. never purchased. Lapsed members who ever entered **are** covered. The
stale `current_draw_*` concern is real but low-harm: those users' entries are 0 either way.

**"~80% of the database is lapsed members" is wrong.** Actual `subscription.status`:

| status | count |
|---|---|
| `incomplete` (abandoned checkout) | 46,418 |
| `active` | 4,838 |
| `canceled` | 3,937 |
| `past_due` | 1,086 |
| `trialing` | 67 |
| `incomplete_expired` | 8 |
| `paused` | 6 |

The genuine win-back population is **3,937**, not 51k.

**`klaviyofailedevents` is a dead end** — 0 documents in production, no model in the
codebase. Not usable infrastructure.

### 2.8 Klaviyo account inventory — the pre-flight, already run

**Segments (50 inspected across 5 pages; at least one page unread — see caveat).**

Properties **in active use** by segments:

| property | segments | note |
|---|---|---|
| `has_active_subscription` | ~10 | unaffected by this work |
| `subscription_tier` | 4 | unaffected |
| `total_one_time_packages`, `one_time_entries` | ~7 | already correct (stored grants) |
| **`current_draw_entries`** | **4** | **stale under Bug A** — see below |
| `current_draw_one_time_packages` | 2 | unaffected |
| `current_draw_subscription_active` | 1 | unaffected |
| `past_due_renewal_entries` | 2 | unaffected |
| **`accumulated_entries`** | **1** | used as a *not-paid* proxy |
| `mini_draw_entries` | 1 | already correct |

Properties **not referenced by any inspected segment**: `subscription_has_pending_upgrade`,
`member_entries`, `entries_purchased`, `lifetime_value`, `total_spent`, all five
`upsell_*`, `giveaways_entered`, `membership_status`.

**This substantially de-risks the change.** The properties whose *values* change most
dramatically (`member_entries`, `entries_purchased`, `lifetime_value`, `total_spent`) drive
no segment. And `subscription_has_pending_upgrade` — flagged as the most disruptive change —
has **no segment dependency at all**.

**But it raises Bug A's severity.** `current_draw_entries` drives four live segments,
including **"Top Entries"** (`current_draw_entries > 549`), a single-condition segment that
is entirely at the mercy of whether a customer's sync landed. Kellie's is `0`. Any member
whose sync silently failed is invisible to every campaign built on it. Bug A is not only a
data-quality problem — it is **actively mis-targeting live campaigns today**.

Separately, segment *"Registered Not Paid Users Nov27 - December15 2025"* uses
`accumulated_entries == 0` as shorthand for "never purchased". Its static date window
excludes Kellie specifically, so she is **not** in it — but the pattern is the hazard: a
paying customer whose sync did not land is indistinguishable from a non-buyer.

**Flows (31 total, 11 live).** None of the live flows' *names* suggest dependence on the
changed properties, but flow-level filters were not opened individually.

> **Caveat on completeness.** Segment pagination was stopped after 5 pages (50 segments)
> with at least one page unread, and flow-action filters were not inspected. The claim "no
> segment uses `subscription_has_pending_upgrade`" holds for the 50 inspected. Before P2
> ships, confirm with a single property search in the Klaviyo UI — cheap, and definitive in
> a way pagination is not.

### 2.9 Dev and production are not separated — and it is worse than profile writes

The production Klaviyo account contains **24 `[DEV]`-prefixed metrics**:

| newest `[DEV]` metrics | created |
|---|---|
| `[DEV] Removed from Cart` | **2026-08-21** |
| `[DEV] Added to Cart` | 2026-08-20 |
| `[DEV] Viewed Product` | 2026-06-24 |
| `[DEV] Viewed Giveaway`, `[DEV] Viewed Page`, `[DEV] Started Checkout` | 2026-05-28 |

…back to `[DEV] User Registered` (2025-10-01). The newest is **five days old**, so this is
ongoing, not historical.

**Four flows named `[DEV]`/`(DEV)` are `live`** — `[DEV] JNN | Subscription Cancelled`,
`(DEV) Membership Renewal`, `[DEV] Invoice`, `[DEV] Failed Membership Renewal` — all
`Metric`-triggered. So a local run emits `[DEV]`-prefixed events that live flows listen for.

#### The severity, corrected

An earlier draft of this spec claimed a local dev run "mutates real customer profiles."
**That was wrong**, and the correction matters for how much this phase is worth.

A local run reads the **dev** database (`MONGODB_URI` → the `test` DB, 933 users), not
production. Klaviyo keys profiles on **email**, so a dev run can only overwrite a real
customer's profile if a dev-DB user shares that customer's email. Measured 2026-08-26:

| | |
|---|---|
| dev-DB users | 933 |
| emails also present in production | **8** |
| of those, paying customers | **0** |

All eight are test or staff accounts — `authenticate@mail.com`, `preselected@mail.com`,
`promolink@mail.com`, `hello@toolsaustralia.com.au`, the developer's own address, and two
`incomplete`-status registrations with zero entries. **No paying customer's profile can be
corrupted by a local dev run.**

What is genuinely true, and what the guard is actually for:

1. **Account pollution.** Dev runs push ~933 test profiles and 24 `[DEV]` metrics into the
   production marketing account. Those profiles can land in broad segments (e.g. "Full
   Subscriber List", which selects on email consent alone) and skew counts.
2. **The `--prod` ops path.** A script run with `--prod` from a developer machine *does*
   write real customers. That is the sanctioned path, and the guard makes it require a
   deliberate opt-in rather than happening by accident.
3. **The `[DEV]` flows** fire for test profiles, so any resulting message goes to a test
   address — not to a customer.

So P1 stays first, but on cost rather than severity: it is ~10 lines, it stops the
pollution getting worse while the rest of this work runs, and it puts an intentional gate
on the one path that does touch real customers. It is **not** the emergency the first draft
implied.

### Newly discovered — filed separately

`user.accumulatedEntries` compared against the draw ledger for all 11,912 entrants:

| | |
|---|---|
| matches ledger (all sources) | 11,086 |
| **matches neither** | **769** (598 higher, 171 lower) |

Gaps cluster on exactly **+100**, the cancellation-upsell retention grant
(`415 vs 315`, `4130 vs 4030`, `2200 vs 2100`). So ~598 customers have entries counted on
their record that are in no draw. `accumulated_entries` — the property this spec treats as
already correct — is wrong for 6.5% of entrants, in the direction that overstates.

This is an entry-accounting bug, not a Klaviyo bug. **Out of scope; the sweep reports it.**

Related: summing `entriesBySource` across the August draw gives 2,103,775 against a stored
`totalEntries` of 2,103,610 — a **165-entry gap (0.008%)**. Immaterial, but since the ledger
is being made the source of truth, P5's verification must check this rather than assume it.

### Load-bearing assumptions, verified not assumed

| assumption | how verified |
|---|---|
| `updatedAt` bumps on raw `$inc` grants | Kellie's `updatedAt` = 22:59:18.916, 1.9s after the 22:59:17 grant. 0 of 56,360 users lack `updatedAt`. |
| `{ timestamps: false }` prevents the re-dirty loop | Executed on the dev DB (Mongoose 8.18.1): `updatedAt` **unchanged** with the flag, **bumped** without it. The trap is real. |
| `PaymentEvent` holds true granted values | Kellie `data.entries: 150, data.price: 20`; Ash `1000 / 80`. |
| Mutation volume allows a 5-min sweep | 6 users / 5 min, 90/hr, 1,281/day, 14,995/month. |

---

## 3. What Klaviyo actually recommends

A sweep is not a workaround. From Klaviyo's own
[integration guide](https://developers.klaviyo.com/en/docs/guide_to_integrating_a_platform_without_a_pre_built_klaviyo_integration):

> "Send order data to Klaviyo in one of two ways: real-time or batch. **Real-time** Make
> requests as soon as an order is placed. **Batch** Write some code that will run (for
> example) at least every 30 minutes (e.g., on a cron)…"

Our 5-minute cadence is 6× tighter than their example. Crucially, they also give the
sizing rule, which converts "is it fresh enough?" from opinion into a check:

> "you'll need to send order data at a frequency that falls within your flow time delay
> (at least)… if you have a one hour time delay… send data over at least once every hour
> to fall within that window."

Their [subscription-ecommerce guide](https://developers.klaviyo.com/en/docs/guide_to_integrating_a_subscription_ecommerce_platform)
recommends subscription state as **profile properties** (Active Subscriber, Active
Subscriptions, Next Replenishment Date, Subscription Frequency) — which validates
`has_active_subscription` / `subscription_tier` / `next_renewal_date` staying exactly where
they are. They are not misplaced; they are just not being written reliably.

**Two constraints this imposes on us:**

1. **Klaviyo computes Historic CLV natively** from `Placed Order` / `Refunded Order`
   ([CLV segmentation](https://help.klaviyo.com/hc/en-us/articles/360013201072)). We
   already send both with `$value`, `Currency`, `Order ID`. So Klaviyo holds a revenue
   truth computed from a source that cannot drift. We still fix `lifetime_value` (it is
   nearly free, riding the same aggregation), but **Klaviyo's native figure is the
   tiebreaker** if the two ever disagree, and the docs must say so.
2. **A profile property must never share a name with an event property.** Klaviyo:
   *"If a profile property has the same name as event data on your account, you will not
   be able to segment on the event data."* All 153 event property keys were diffed against
   every profile property: **no collisions today**. This becomes a standing rule for any
   property added later. (Noted: the event namespace already uses `entries_added`,
   `entries_gained` and `entries_granted` for one idea — a pre-existing vocabulary fork.)

---

## 4. Design

Two independent failures get two independent fixes. Neither depends on the other, and
either alone still leaves customers wrong.

### 4.1 Delivery — a watermark reconciliation sweep

One cron, every 5 minutes:

```
users = User.find({ updatedAt: { $gt: watermark } })     // new index on updatedAt
  → prefetch payment ledger + draw cache for the whole batch (one aggregation, not N)
  → sync each through the existing throttled path (8 concurrent / 700ms)
  → stamp klaviyoSyncedAt with { timestamps: false }     // verified: does not re-dirty
  → advance the watermark ONLY on a clean run
```

**Why this and not a per-call-site queue.** A durable queue (the `StripeWebhookQueue`
pattern) would give ≤60s freshness and per-job retry, but it still requires instrumenting
every mutation site — which is precisely the failure mode that produced this bug. Keying
on `updatedAt` means the sweep covers paths nobody remembered, including ones not yet
written. It buys structural correctness at the cost of four minutes of freshness.

**Five audit items need zero code**, because the sweep subsumes them: `subscription.deleted`,
admin PATCHes without `basicInfo`, referral grants, milestone grants, redeemable grants.

**Cost:** ~6 users per run × 2 API calls ≈ **12 calls per 5 minutes**, against a ~700/min
steady budget on the binding Get-Profiles bucket.

**Known limits, stated not hidden.**
- Eventually consistent. Sufficiency is decided by the §6 pre-flight, not by assertion.
- Purely time-derived properties (`membership_active_duration_months`) change with the
  calendar and touch no document. Covered by an **hourly full pass**: the *same* cron route
  and service invoked with `mode=full`, walking a **separate rotating cursor**
  (`KlaviyoSyncState.fullPassCursor`) that advances each run and wraps on completion.

  > **Corrected during implementation.** The first design had this restart from epoch every
  > run — verified broken: two consecutive passes both began at 1970-01-01 and covered the
  > same 50 users, so it would have re-synced page one forever and reached 0.6% of the
  > population. The rotating cursor fixes it; the cadence moved from weekly to hourly because
  > a run covers ~344 users, which at weekly would need 164 weeks per circuit. Hourly gives a
  > ~7-day circuit at 56k profiles and ~27 days at 4x, inside the monthly tick of the one
  > property it refreshes. Cost ~16.5k Klaviyo calls/day, ~1.6% of the steady budget.

**Failure handling:** a failed run does not advance the watermark, so the next run retries
the same window. Self-healing without a retry table.

### 4.2 Truth — read the ledger, stop reconstructing

`PaymentEvent` is a flat, indexed (`userId_1_timestamp_-1`) per-grant ledger holding
`data.entries` and `data.price`.

| property | today | after |
|---|---|---|
| `member_entries` | catalogue × months ❌ | `PaymentEvent` membership grants, refund-netted |
| `entries_purchased` | inherits the error ❌ | sum of the four package types, refund-netted |
| `lifetime_value` / `total_spent` | catalogue × months; collapses on lapse ❌ | `PaymentEvent.data.price`, refund-netted |
| `subscription_has_pending_upgrade` | `!!{}` → always true ❌ | reuse existing `isValidPendingUpgrade()` |
| `upsell_*` (5 properties) | permanently 0 | **retired** — explicit `null` to clear |
| `accumulated_entries`, `current_draw_entries` | correct | unchanged |
| `one_time_entries`, `upsell_entries`, `mini_draw_entries` | correct (stored grants) | unchanged |

One aggregation added to `payment-event-net-queries.ts` fixes four properties and reuses
`excludeRefundedBenefitsGrantedStages()` — refund-netting that is already written and
already trusted by the admin revenue breakdown. **No new file.**

**`entries_purchased` keeps its name**, per the decision to fix in place. It carries a
documented constraint: **internal segment key only — never a customer-facing merge tag**,
because CLAUDE.md rule 11 and BUSINESS.md §1 both hold that entries are never sold. A
duplicate rule-11-safe alias was considered and **rejected**: measured across 11,910
entrants, it would equal `accumulated_entries` for 11,196 of them, and non-package entries
are 0.30% of all entries ever granted. It would have added a number to keep true without
adding information.

**Batching convention.** `userToKlaviyoProfile` already accepts cached `targetDraw` /
`cutoffDate` for bulk operations. The ledger is threaded the same way — one prefetched map
per batch, one query for a single-user sync. No new pattern.

### 4.3 Visibility — what would have caught Kellie

- **`klaviyoSyncedAt` per user**, stamped by the sweep with `{ timestamps: false }`.
- Each run derives a **backlog count** — `countDocuments({ updatedAt: { $gt: watermarkAfter } })`,
  i.e. how many users are still waiting after this run finished. Growing run-over-run means
  the sweep is not keeping up. **Starting alert threshold: 25 users**, tuned after a week of
  real readings rather than guessed correctly first time. A breach is reported via
  **`console.error` with a greppable `[reconcile-klaviyo-profiles]` prefix** — the only log
  level that survives production builds.

  > **Deviation from the first draft, deliberate.** An earlier version routed breaches into
  > an `ErrorReport` row. The sibling crons this one is modelled on
  > (`reconcile-renewal-grants`, `reconcile-blocked-transactions`) report findings via
  > `console.error` with a greppable prefix and write no `ErrorReport`, and
  > `ErrorLoggingService`'s server path expects a `Request` a cron does not have. Matching
  > the siblings beats inventing a third pattern. If cron findings should become
  > first-class `ErrorReport` rows, that is a change worth making for *all* the
  > `reconcile-*` crons at once, not just this one.

  > **A second correction, from measuring rather than reasoning.** The first draft's gauge
  > counted users whose `updatedAt` had outrun their `klaviyoSyncedAt` — a **field-to-field**
  > comparison, which MongoDB cannot serve from any index. Explained against production it
  > examined **56,441 documents, 0 index keys, 95ms** — a full collection scan, which at a
  > 5-minute cadence is **288 collection scans per day**. That was the single real
  > performance risk in this design, and it was mine, not the cadence's.
  >
  > The backlog count above uses the same `updatedAt` index the sweep already needs, touches
  > ~41 documents (users changed in the last 30 minutes, measured), and answers the more
  > useful question anyway: *is the sweep falling behind right now?* rather than *how many
  > users were never synced at some point in history?*

#### 4.3.1 Cost and load — measured, not assumed

| question | answer |
|---|---|
| Does the cron slow the site? | No. It runs as its own serverless invocation, never in a user's request path. The only shared resource is MongoDB. |
| What does one run cost in Mongo? | With the `updatedAt` index: one index seek returning ~4–6 documents. Without it, a 56,441-document scan — **the index is not optional**, it is what makes the cadence viable. |
| Document size risk? | `users` averages **1,633 bytes**, largest **38 KB**. A full 500-document page is ~800 KB; a typical run is ~10 KB. No unprojected-`find()` footgun on this collection (unlike the `entries[]` case CLAUDE.md warns about). |
| Does cadence drive Klaviyo API cost? | **No.** Calls are driven by *mutation count*, not run count: ~1,281 users/day × 2 calls ≈ **2,560 calls/day** whether we run every 5 minutes or every 30. |
| Vercel invocations? | 288/day at 5 min vs 96/day at 15 min. For scale, `/api/cron/process-stripe-webhook-queue` already runs **every minute** (1,440/day) in this same project. |

**Conclusion: 5 minutes stays.** Cadence buys freshness and costs almost nothing; the thing
that would have hurt was the scan, now removed. An early return when a run finds zero
candidates keeps the common case to a single indexed count.
- The sweep also reports the **`accumulatedEntries`-vs-ledger divergence count**, so the
  769 customers in §2 stop being invisible while their repair is filed separately.

Under this, Kellie is caught two ways: the sweep re-syncs her within 5 minutes, and had it
failed, she would appear in the staleness count.

### 4.4 Dev / prod isolation

`mode === "development"` **refuses profile writes** unless
`KLAVIYO_ALLOW_DEV_PROFILE_WRITES=true`, registered in `.env.example` with a safe
placeholder. Events keep their `[DEV]` prefix and keep flowing — only profile mutation is
locked.

**The subtlety:** the sanctioned backfill *is* an intentional write from a developer's
machine against production. The opt-in must therefore be explicit and loud, set
deliberately for that run — never something the ops scripts quietly set for themselves.

### 4.5 Files

| path | change | justification |
|---|---|---|
| `src/utils/payment/payment-event-net-queries.ts` | extend — `aggregateNetGrantsByUser()` | existing owner of refund-netted PaymentEvent reads |
| `src/utils/integrations/klaviyo/klaviyo-helpers.ts` | extend — ledger-backed breakdown + LTV, pending-upgrade fix, retire `upsell_*` | existing profile projection |
| `src/lib/klaviyo.ts` | extend — dev write guard (~10 lines) | existing client |
| `src/models/User.ts` | extend — `klaviyoSyncedAt`, index on `updatedAt` | existing model |
| `src/services/klaviyo/KlaviyoProfileReconciliationService.ts` | **new** | real business logic (batching, watermark, prefetch, reporting); cannot live in a route handler, and `klaviyo-profile-sync.ts` is a utils module of small helpers. Sits beside the existing `klaviyoDrawResetService.ts`. |
| `src/models/KlaviyoSyncState.ts` | **new** | the watermark must survive serverless invocations; no existing singleton-state model to reuse. One collection, one document. |
| `src/app/api/cron/reconcile-klaviyo-profiles/route.ts` | **new**, thin | required by Vercel's cron model; matches existing `reconcile-*` naming |
| `vercel.json`, `package.json`, `.env.example` | extend | cron registration, test/script entries, env registry |

Three new files, each justified per CLAUDE.md rule 4. Everything else extends what exists.

**Contention:** `feature/coupon-klaviyo` touches `lib/klaviyo.ts` (+1), `types/klaviyo.ts`
(+8), `klaviyo-events.ts` (+29) — all pure insertions in the *events* half. The profile
path (`klaviyo-helpers.ts`, `klaviyo-profile-sync.ts`, `klaviyo-draw-calculator.ts`,
`klaviyo-draw-reset.ts`, `stripe-webhook-handlers/index.ts`) is **untouched**. Only the
`lib/klaviyo.ts` guard overlaps, by one line in a different region.

---

## 5. Phases

Each ships something real. Ordering is not arbitrary — the guard comes first because every
later phase runs syncs during development.

**P1 — Dev/prod write guard.** *Ships: a developer's laptop can no longer alter real
customer profiles.* Guard in the Klaviyo client, env var registered, explicit opt-in path
documented for sanctioned ops runs.

**P2 — Truth.** *Ships: correct numbers whenever a sync happens.* Ledger aggregation;
`member_entries` / `entries_purchased` / `lifetime_value` / `total_spent` re-sourced;
pending-upgrade fixed; `upsell_*` retired via explicit `null`.

**P3 — Delivery.** *Ships: syncs land, and five blast-radius gaps close with no call-site
edits.* Watermark model, reconciliation service, cron at 5 min + weekly full pass,
`klaviyoSyncedAt`, `updatedAt` index.

**P4 — Visibility.** *Ships: a stale or failed sync is detectable.* Staleness gauge,
greppable `console.error` findings lines, `accumulatedEntries` divergence reporting.

**P5 — Backfill + verification.** *Ships: all 56,371 profiles correct.* Full pass via
Bulk Import Profiles — documented **10,000 profiles/request, 10/s burst, 150/m steady**, so
6 requests. Reuses `bulk-import.ts` and `sync-klaviyo-profiles-bulk.ts`. `--dry-run`
default-safe, CSV audit log, progress with `processed/total (%) · rate/sec · ETA` on ~20
lines, 3-tier exit codes. Also adds the three **missing** npm entries found today
(`sync:klaviyo-profiles`, `sync:klaviyo-profiles-bulk`, `migrate:klaviyo-draw-properties`)
— those scripts exist but are undiscoverable. Verification rewires today's comparison
probe into a check script, including the 165-entry `entriesBySource` reconciliation.

---

## 6. Pre-flight — run these in Klaviyo before P2 ships

Most of this was executed on 2026-08-26 (§2.8). What remains:

1. **Confirm the property inventory with a UI search.** §2.8 found no segment using
   `subscription_has_pending_upgrade`, `member_entries`, `entries_purchased`,
   `lifetime_value`, `total_spent` or `upsell_*` across 50 inspected segments — but
   pagination was stopped early. One property search in the Klaviyo UI settles it. If the
   result is still nil, the **entire "segments will break" risk class disappears** and P2
   can ship without ads-team coordination.
2. **Archive or pause the four live `[DEV]` flows** (§2.9). Independent of this work, and
   worth doing regardless of what else ships.
3. **Shortest flow time delay.** For any flow reading these properties, note the shortest
   delay between trigger and send.
   - **≥ 5 minutes** → the sweep alone is provably sufficient by Klaviyo's own rule; no
     event-payload work needed.
   - **Zero-delay purchase trigger** → that flow's numbers go on the **event payload**,
     computed in-request at grant time — the pattern already established on
     `feature/coupon-klaviyo` ("stop asking the code to carry the deadline; let the trigger
     event carry it").
4. **Tell the ads team the entry figures move.** `member_entries` / `entries_purchased`
   jump by ×5–×14 and `lifetime_value` / `total_spent` stop collapsing on lapse. No segment
   depends on them (§2.8), so this is a heads-up for campaign copy and manual reporting,
   not an audience-membership risk.

**On our side:** `vercel.json` already registers **22 crons**. Confirm the plan's limit
before adding the 23rd.

---

## 7. Testing

Standalone `tsx` scripts, each with its own `package.json` entry (no test runner in this repo).

| entry | covers |
|---|---|
| `test:klaviyo-entry-ledger` | the PaymentEvent aggregation, including refund netting and the four package types |
| `test:klaviyo-profile-projection` | granted-not-catalogue numbers; **`subscription_has_pending_upgrade` is `false` for an empty nested object** |
| `test:klaviyo-reconciliation` | watermark advances only on a clean run; `{ timestamps: false }` write does not re-dirty the user |

The pending-upgrade assertion matters disproportionately: `!!{}` on a Mongoose nested
object is exactly the kind of bug that returns silently during a later refactor, and
nothing in `tsc` catches it.

---

## 8. Documentation and rule compliance

| rule | obligation |
|---|---|
| Domain Manifest | `docs/tracking/` (Klaviyo), `docs/payment/` (ledger query), `docs/subscription/` (User model), `docs/infrastructure/` (cron, scripts, env, package.json), `docs/admin/` if the admin surface changes |
| Rule 5b — CUSTOMER.md | **required**: `User` gains a field, and what we send to a third party changes |
| Rule 5 — BUSINESS.md | check the edited paths against `BUSINESS_TRIGGER_GLOBS`; no business fact is expected to flip |
| Rule 5c — Cobber | no customer-visible change; no FAQ update expected |
| Rule 10 — Norm | surfacing `klaviyoSyncedAt` in the admin user modal would change an admin read shape — **flag to the user, do not wire silently** |
| Rule 11 — copy | no customer-facing strings change. `entries_purchased` carries a documented never-in-copy constraint |
| Rule 1 — commits | nothing is committed without explicit authorization |

---

## 9. Risks

| risk | mitigation |
|---|---|
| ~~Segment breakage from `subscription_has_pending_upgrade`~~ | **Largely retired** — §2.8 found no segment referencing it across 50 inspected. Confirm with the UI search (§6.1). |
| Entry figures jumping ×5–×14 surprises the ads team mid-campaign | §6.4; no *segment* depends on them (§2.8), so the exposure is campaign copy and manual reporting, not audience membership |
| A local dev run emits `[DEV]` events into live `[DEV]` flows | **P1 ships first**; §6.2 asks the ads team to pause those four flows independently |
| Sweep re-dirty loop | `{ timestamps: false }` — **verified executed**, not assumed |
| Sweep silently stops | P4 staleness gauge + greppable `console.error` findings; a failed run does not advance the watermark |
| Dev guard blocks the sanctioned backfill | explicit, loud opt-in designed for exactly that case (§4.4) |
| `lifetime_value` disagrees with Klaviyo's native CLV | documented: **Klaviyo's native figure is the tiebreaker** |
| Vercel cron limit | §6, confirm before adding the 23rd |
| Merge conflict with `feature/coupon-klaviyo` | one line in `lib/klaviyo.ts`; the whole profile path is uncontested |

---

## 10. Out of scope — filed separately

1. **769 customers whose `accumulatedEntries` disagrees with the draw ledger** (598
   overstated, typically by the 100-entry retention grant). Entry accounting, not email.
   Repair requires a customer-facing decision about entries people already believe they
   hold. **This spec makes it visible; it does not fix it.**
2. **Reviving `upsell_*` tracking.** `UpsellManager.tsx` is mounted nowhere, so 0 of 56,360
   users have upsell funnel data despite 2,290 real upsell purchases. We retire the empty
   properties; switching the tracker on is separate work with its own value case.
3. **A separate development Klaviyo account.** The P1 guard removes the danger. Full
   separation needs an account provisioned plus env changes across every worktree.
4. **The `entries_added` / `entries_gained` / `entries_granted` vocabulary fork** in the
   event namespace — pre-existing, harmless today, worth a cleanup pass someday.
