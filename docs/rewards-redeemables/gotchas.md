# Rewards-Redeemables — Gotchas

## Per-customer anchored expiry — six traps (2026-08-25)

1. **`status: "expired"` is a DEAD ENUM. No predicate may key off it.** The value exists on
   `RedeemableIssuance.status`, but **no code path in this repo ever writes it** — there is no expiry sweep
   and no revoke machinery. A query like `{ status: "expired" }` therefore matches **zero documents,
   forever, silently**. Liveness is decided by the **date**: `expiresAt > now`. (`RedemptionService.redeem`
   still carries a belt-and-braces `|| issuance.status === "expired"` read-side check; that is harmless
   because it is OR'd with the date test — do not copy the pattern into a *filter*.)

2. **`issuedAt` and `expiresAt` must derive from ONE captured `Date`.** Never two `new Date()` calls. This
   was severe under the old calendar-day model — the helper it used snapped to a Sydney calendar day,
   so two instants milliseconds apart across local midnight produced expiry dates a **full calendar day**
   apart. **Since 2026-08-26** `resolveIssuanceExpiry` calls `expiryAfterHours` instead, an
   exact epoch-millisecond offset with no midnight cliff — a few milliseconds' drift in `issuedAt` now
   produces the same few milliseconds' drift in `expiresAt`, nothing more. The rule itself still stands
   (never derive the two from separate `new Date()` calls) and the batch hoisting in `issueCampaignToUsers`
   is unchanged and still correct — it has just stopped being load-bearing for this specific failure mode.

3. **The trigger gate is the leak defence — do not "simplify" it away.**
   `ensureActiveCampaignIssuancesForUser` runs on **every rewards-wallet read**, and the
   `"all-active-subscribers"` targeting branch returns a bare `hasActiveSubscription`. Without
   `if (personalWindowGoverns(campaign) && !options?.trigger) return false;` at the top of
   `isUserEligibleForCampaign`, every active member who opens `/my-account` self-enrols into a trigger
   campaign and burns their one-per-lifetime grant **without ever seeing an email**. The sweep must never
   pass a `trigger`; only `ensureCampaignIssuanceForUser` does.

4. **`already_active` returns the STORED `expiresAt`, never a recomputed one.** Note it does **not**
   email — `already_active` is a silent no-op, so there is no "re-send" anywhere in this system. The
   stored date is returned so that a later **re-arm** cannot hand back a recomputed one, and so a
   caller inspecting the outcome sees the deadline the redemption gate will actually enforce. This is
   also why the mint returns a `StampedIssuance` instead of a boolean. (Corrected 2026-08-26: this
   used to say "a later re-arm **email**" and "the deadline the customer was actually **told**". No
   email prints the deadline — see launch step 4 below.)
   **The reason changed on 2026-08-26 but the rule did not.** Under the calendar-day model the danger
   was a 150ms gap across Sydney midnight printing a deadline a full **calendar day** off what
   redemption enforces. `expiryAfterHours` has no midnight cliff, so the same gap now costs 150ms —
   which is why nobody should downgrade this to "recompute, it's close enough". The stored value is
   still the only one that is *the same instant* every rendered copy derives from and the redemption
   gate compares against (`expiresAt: { $gt: now }`, strictly exclusive), and a re-arm legitimately moves
   it, so a recomputed value on an `already_active` outcome would be a different deadline entirely,
   not a rounding difference.

5. **E11000 is discriminated by `keyPattern`, and neither case is an error.** Two unique indexes live on
   `RedeemableIssuance`: `{campaignId, userId}` and `{campaignId, code}`. A `userId` collision means a
   concurrent trigger won the race ⇒ return `already_active` (re-read for the stamp), **never** rethrow —
   the old non-atomic `findOne` + `create` threw out of the caller after Stripe had already cancelled, so a
   double-clicked Cancel showed "cancel failed" on a cancelled subscription. A `code` collision is the
   pre-existing regenerate-and-retry loop and must be preserved.

6b. **`issueCampaignToUsers` is a SECOND mass-mint path and the trigger gate is not on it.**
   The leak defence (trap 3) lives inside `isUserEligibleForCampaign`, which `issueCampaignToUsers` never
   calls. `getActiveCampaigns()` matches any active campaign whose `endsAt` is still ahead — and a
   `validForHours` campaign always has one, because `endsAt` is its *minting backstop*. So a single POST to
   `/api/cron/monthly-redeemables-issuance` while a trigger campaign is live would mint for the entire
   active-subscriber base: expiry stamped, no trigger, no email, every one-per-lifetime grant burned. The
   guard at the top of `issueCampaignToUsers` refuses when `issuedBy === "cron"` and
   `personalWindowGoverns(campaign)`, returning `{ issuedCount: 0, skippedCount: userIds.length }` and a
   `console.error`. If a deliberate admin bulk-issue path is ever added for personal-window campaigns, it
   must pass its own `issuedBy` — do not relax this guard to cover it.

6. **`redeemedEverAt` is written with `$min` and NEVER unset.** The refund path restores `status: "active"`
   and `$unset`s `redeemedAt`, which makes a refunded row byte-identical to a never-redeemed one — so
   `redeemedEverAt` is the only thing stopping buy → redeem → refund → re-trigger from re-granting a
   one-per-lifetime code. `$min` writes it when absent and preserves the first value when present. Do **not**
   widen the redemption claim's filter to mention it: the filter is already race-safe. And the schema field
   must **never** be given `default: null` — `$min` compares against a BSON null and keeps it (null sorts
   below any date), `decideRearm`'s truthiness check stays falsy, and the buy → redeem → refund → re-trigger
   farm silently reopens on every row.

## FIXED — the `requiresEmailVerified` default never flipped for trigger campaigns (found + fixed 2026-08-25)

**Status: fixed.** Kept in full because the *class* of mistake is the valuable part — see the
generalised rule at the end of this section.

`CampaignService.isUserEligibleForCampaign` used to resolve the flag as:

```ts
const requiresEmailVerified = config?.requiresEmailVerified ?? !triggerIsTargeting;   // DEAD CODE
```

The intent (per the comment beside it) is that a **trigger** campaign defaults to *not* requiring
verification, because `checkout-start` fires seconds after registration — before any verification
email could possibly be actioned — so defaulting it on would exclude that trigger's entire
population.

The fallback is **unreachable**. `MonthlyEntryCampaign` declares
`segmentConfig.requiresEmailVerified` with `default: true`, and Mongoose persists that nested
default even when the admin supplies no `segmentConfig` at all. So `config?.requiresEmailVerified`
is always `true`, the `??` never fires, and the flag reads as if the admin had explicitly demanded
verification.

**Blast radius is narrow but real.** `all-active-subscribers`, `manual-users` and `csv-users` all
return before this line, so today's likely configurations are unaffected. Only
**`dynamic-segment`** reaches it — and a `dynamic-segment` trigger campaign silently refuses every
unverified customer, which for `checkout-start` is close to the whole audience. The failure is
invisible: the outcome is `not_applicable`, the same value the feature returns when it is simply
inert.

### The fix

The requirement is now **waived outright** for a trigger campaign rather than defaulted away, so a
persisted value cannot resurrect it:

```ts
if (!triggerIsTargeting) {
  const requiresEmailVerified = config?.requiresEmailVerified ?? true;
  if (requiresEmailVerified && !user.isEmailVerified) return false;
}
```

Written as a guarded block, not a ternary, so the no-trigger path is visibly the ORIGINAL two lines
— the wallet sweep and every pre-existing campaign are byte-identical. Rationale for waiving even an
*explicitly* set `true`: verification is a proxy for "is this a real, engaged customer?", and the
trigger answers that question directly and better. Pinned from both sides by
`npm run test:trigger-eligibility` (pure) and `npm run test:campaign-enrolment` § 2 (against persisted data).

**Re-pointed 2026-08-25 (round 2).** `npm run test:campaign-enrolment` section 2 (then named `test:bonus-code-trigger`) previously
characterised the pre-fix behaviour and now asserts the rule itself, from both sides: a trigger
waives the requirement whether it was stored by the schema default (2a) or set deliberately by an
admin (2b); a legacy campaign still gates even WITH a trigger (2c); and the wallet sweep still
gates with no trigger at all (2d).

**A pure test cannot cover this alone — do not let one stand in for the other.**
`test:trigger-eligibility` builds campaign objects by hand, so `segmentConfig` is genuinely
`undefined` there and the old `??` fallback *did* fire: the buggy code PASSED that suite for the
schema-default case, and reverting the fix today still fails only its one explicit-`true`
assertion. What exposes the defect is the value Mongoose actually persists, which is why
`test:campaign-enrolment` § 2a reads the campaign back from Mongo and asserts the row really
carries `requiresEmailVerified: true` BEFORE asserting the waiver. Any future change here needs
coverage on both sides of that line.

### The generalised rule this belongs to

> **A `??` fallback on a field that carries a schema `default` is dead code.** Mongoose persists the
> default, so the left side is never nullish and the fallback never runs.

It is a nasty class because it fails *silently and in source-plausible fashion*: the relaxation is
right there in the file, reviewed and approved, and never executes. Worse, it defeats itself
precisely when the default and the fallback DISAGREE — which is the only situation anyone writes one
for. Contrast the harmless siblings in the same function: `config?.includeUserIds || []`,
`excludeUserIds`, `states` and `membershipTiers` are all equally unreachable (Mongoose defaults an
array path to `[]`), but the fallback value *equals* the default, so the outcome is identical either
way. Audited 2026-08-25: `requiresEmailVerified` was the only live instance in this function;
`minInactiveDays`, `maxInactiveDays` and `topEntriesPercent` carry no schema default and are guarded
by `typeof === "number"`, which is correct.

When you need "did the admin actually choose this?", a schema default destroys the information. Either
drop the default, or — as here — decide the behaviour from something other than the field's presence.

## Membership Streak auto-grant path (P2, 2026-07-07)

- **Auto-grant is two-step, crash-safe by sweep, and COMPENSATES on delivery failure (2026-07-15)**: `checkAndIssueMilestones` creates the issuance `active`, then `RedemptionService.autoRedeemMilestoneIssuance` flips it `redeemed` atomically (the concurrency gate) and grants via `DrawGrantService(…, "streak", { skipMilestoneCheck: true })`. `grantMonthlyCouponEntries` returns a `DrawGrantOutcome` and never throws (three states, since 2026-08-27 — see F2 below). On **`not_written`** autoRedeem reverts the wallet `$inc` + history row, re-opens the issuance (`redeemed → active`), and the next check (payment webhook or nightly cron) retries delivery. The issuance is re-opened ONLY if the wallet revert succeeded (otherwise a retry would double-count); on that double-fault it stays `redeemed` with a loud `console.error`. On **`unconfirmed`** it reverts **nothing** and does **not** re-open — a sweep retry over entries that may already be in the draw would grant a second time — returning `grant_unconfirmed_not_reverted` for a human to reconcile. Never delete the sweep branch or the compensation ordering.
- **New streak issuances are PAYMENT-COUPLED (2026-07-15)**: `checkAndIssueMilestones` only creates `streak-months` issuances when called with `{ allowStreakIssuance: true }` — passed ONLY by the paid-payment path (`payment-processing.ts`). The cron/mass evaluator and post-grant re-checks run with the default false: they can still SWEEP (re-deliver) existing active streak issuances but never newly issue from a possibly-stale `streakMonths` (lapsed member's counter, rung activated after the fact). This replaces the spec's cron circuit-breaker for the streak vector.
- **Legacy issuance rows must be generation-stamped before the index swap**: pre-streak `MilestoneIssuance` rows have no `streakGeneration`; Mongo's `{streakGeneration: 1}` query does NOT match missing fields, so unstamped rows are invisible to the dedupe query AND the generation-scoped unique index — every pre-launch issuance would re-issue (double-grant). `seed:streak-rewards` stage 1 stamps `streakGeneration: 1` onto them before `syncIndexes()`.
- **E11000 in the rung loop = "already issued", continue.** Three callers race (payment webhook, nightly cron, post-grant re-check); the generation-scoped unique index is the guarantee. An uncaught duplicate-key throw would abort the user's remaining rungs.
- **`skipMilestoneCheck` prevents re-entrancy** (grant → check → grant …) and streak-granted entries are **excluded from the `entries-gained` metric** in `MilestoneEvaluator` (free entries never compound into more free entries).
- **`totalEntriesGranted` semantics changed (P2):** it now sums **redeemed** issuances only (was: all rows, which would have counted zero-granted `backfilled` markers and unclaimed/expired issuances as "granted"). `issuedCount` excludes `backfilled`.
- **The claim wallet excludes `backfilled`** (`RedeemablesWalletService` filters `status ≠ backfilled`) — markers belong on the milestone ladder, not the claim list.
- **Streak reversal targets the `streak` bucket**: `unredeemMilestoneRedemption` picks the draw source by `milestoneType` — do not hardcode `bonus-entry-promo` back in.
- **Launch order is load-bearing (updated 2026-07-15)**: 1) `npx tsx scripts/backfill-membership-streaks.ts --live --roundup-incomplete` (P1 counters; round-up flag is LAUNCH-ONLY) → 2) `seed:streak-rewards` (generation stamp + index swap + rungs `isActive:false` + markers) → 3) `seed --live --activate` → 4) flip `DASHBOARD_FEATURES.loyaltyStreak`/`milestoneProgress` to true and deploy (the UI ships DARK so it never promises grants that aren't active). Activating before markers exist mass-grants historical rungs; showing the UI before activating stiffs members whose rung lands in the dark window (markers stamp it as pre-launch).

## Per-customer bonus codes: launch order is load-bearing too — and it INVERTED on 2026-08-26

There is no feature flag here — **creating the campaign row IS the switch-on**, and it happens in the
admin UI with no further review step.

**The order below is the reverse of what this page said until 2026-08-26.** It used to say "build the
Klaviyo flow FIRST". Under the webhook model that ships a live flow emailing a hardcoded code into a
void: with no active campaign carrying the code, `ensureCampaignIssuanceForUser` returns
`not_applicable`, the endpoint answers `200`, and every customer in the cohort receives a code that
fails at checkout with "Invalid campaign code". The flow is now the LAST thing published.

1. **Deploy the endpoint to production** with `BONUS_CODE_WEBHOOK_SECRET` set — scoped to Vercel's
   **Production** environment only, so a preview deploy cannot mint into the production database
   even if someone points one at it.
2. **Create the campaign(s)** in Admin → Monthly Coupons. Under **"How this coupon ends"** pick
   **"Each customer gets their own countdown"** — that is the `personal-window` shape, and picking it is
   what sets `validForHours` (the mass-mint defence marker, see trap 6b). Then:
   - **Hours each customer gets: `72`** (prefilled).
   - **Leave "Stop issuing new codes on a date" UNTICKED.** The form then stores `endsAt` =
     `NEVER_EXPIRES_ISSUANCE_DATE` with `neverExpires: false`, which means "no minting backstop — issues
     until an admin hits Disable on the campaign card". Do **not** tick "No deadline at all" (that is
     `neverExpires: true` and makes the *coupons* immortal — the opposite of the 72 hours) and do not
     hand-type a far-future date. The panel shows this shape as
     `72-hour window per customer · issuing until switched off`.
   - `code` must match [`BONUS_CODE_BY_TRIGGER`](../../src/config/bonusCodes.ts) exactly — the form warns
     (non-blocking) when it does not. `entriesAmount`, `purchaseRequirement`, targeting as before;
     cancel-click must be `purchaseRequirement: "none"`, there is no purchase to qualify on.

   **If you set the hours to anything other than 72, update Cobber FAQ id 86 in the same change** — it
   tells customers "a fixed 72 hours", and `test:chat-faqs` asserts that wording against the copy, not
   against any campaign row, so a mismatch ships green and Cobber states a deadline the server does not
   enforce. The form shows an inline caution for exactly this.

   `scripts/seed-bonus-code-campaigns.ts` creates the same three rows in the same shape (dry-run by
   default) if you would rather script it — it reads the codes straight out of the config module so they
   cannot drift, at the cost of the StaffActivity audit trail the admin UI gives you.
3. **Smoke-test the endpoint in production, against the REAL campaign.** The production gate sits
   ahead of the MINT, deliberately (see P7 rule 3b), so this path **cannot** be rehearsed on a
   preview deploy or locally — this smoke test is the first genuine execution the code ever gets.

   **There is no such thing as a disposable campaign here, and you cannot make one.** The endpoint
   accepts only the three `trigger` values, each of which resolves to one fixed code via
   [`BONUS_CODE_BY_TRIGGER`](../../src/config/bonusCodes.ts), and `code` is **uniquely indexed**
   (`MonthlyEntryCampaign.ts:148`) — so a second campaign carrying the same code cannot be created,
   and a campaign carrying any other code is unreachable by any trigger. (This step said "using a
   disposable campaign" until 2026-08-26; that was never possible.)

   Do it in this order:

   a. **Pick an account you control** and are willing to spend — one grant per person is for life,
      and if you redeem during the test that account's grant is gone permanently. A staff account is
      the right choice; a real customer's is not.

   b. **Fire one call** with the Production secret. Nothing else can trigger this — the three in-app
      call sites were deleted on 2026-08-26:

      ```bash
      curl -sS -i https://toolsaustralia.com.au/api/bonus-codes/v1/issue \
        -H 'Content-Type: application/json' \
        -H "X-Bonus-Code-Secret: $BONUS_CODE_WEBHOOK_SECRET" \
        -d '{"email":"you@toolsaustralia.com.au","trigger":"cancel-click"}'
      ```

      Expect `200 {"ok":true}`. **A `200` alone proves nothing** — it is also what "no campaign
      carries that code" returns. That is the whole reason steps (c) and (d) exist.

   c. **Confirm the `RedeemableIssuance` row** in Mongo: one row for `(campaignId, userId)`, `status:
      "active"`, and `expiresAt` exactly 72 hours after `issuedAt` — not the end of any Sydney day.

   d. **Confirm the `Bonus Code Issued` event** on that profile in Klaviyo (Profiles → the account →
      Activity feed) and that `expires_at` / `expires_at_label` name the **same instant** as the row.
      **Do not check the delivered email for a deadline** — it cannot carry one, for the reason in
      step 4. (Until 2026-08-26 this step said to confirm the row, the event and the email "all name
      the same deadline". That check could only ever have passed under the pre-reversal design, where
      the flow was built on our own metric.)

   e. **Clean up: delete that `RedeemableIssuance` row.** It is the only artefact the smoke test
      leaves, and deleting it restores the test account's one-per-lifetime grant *and* clears the
      30-day re-arm cooldown, because `redeemedEverAt` and `firstIssuedAt` both live on that row.
      **This only works while the grant is unredeemed** — once `redeemedEverAt` is stamped, deleting
      the row does not give the grant back, by design (that is the refund-abuse gate). Leaving the
      row is not harmful; it just means that account is used up.

   Run this **before** step 4. The mint emits `Bonus Code Issued`, so once a flow is listening on
   that metric your smoke test becomes a live send.

3b. **A Klaviyo metric does not exist until the first event of that name arrives — and one of the
   three triggers is BRAND NEW.** `Subscription Cancellation Requested` ships with this branch and
   has **never been sent to Klaviyo**, so it is not in the account's metric list and marketing
   **cannot select it as a flow trigger yet**. The dropdown only offers metrics Klaviyo has already
   received. So the cancel-click / BACKIN200 flow has an extra prerequisite the other two do not:
   after deploy, one member-initiated cancellation has to actually fire (the staff-account smoke
   test in step 3 is the cheapest way — cancel a staff membership through `/my-account`, not through
   the admin route, which deliberately does NOT emit it). Confirm the metric appears in Klaviyo
   before telling marketing to build that flow, or they will report the trigger as missing and the
   launch stalls on a question nobody can answer from the Klaviyo UI.

   The other two triggers already exist in the account: `Started Checkout` and
   `One-Time Package Purchased` have been emitting for months. **`Subscription Cancelled` is NOT the
   cancel-click trigger** — it fires from `customer.subscription.deleted`, which for a
   cancel-at-period-end arrives at period END, up to a month after the member decided to leave. See
   [docs/tracking/KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md) "Subscription
   Cancellation Requested".

4. **Only then does marketing publish the flows.** Each flow calls
   `POST /api/bonus-codes/v1/issue` one step above its discount email. **The email carries the code
   string hardcoded in the template, and nothing else comes back** — Klaviyo webhooks are one-way
   ([api.md](./api.md)); the call is what makes that hardcoded string work for that person.

   **The discount email cannot print the deadline. Do not put `{{ event.expires_at_label }}` in it.**
   `expires_at_label` is a property of the `Bonus Code Issued` metric **our server** emits, and a
   flow email renders against its **own trigger metric** — for these three sequences that is
   cancel-click / checkout-abandon / one-time-purchase, not ours. The merge tag renders **empty**,
   and the sequence ships with a blank deadline line that nobody notices until a customer asks.

   So, today: **no email prints the deadline, and no page shows it either** (see
   [frontend.md](./frontend.md), "Known gap"). The only place a customer is ever shown the exact
   instant is the checkout refusal *after* it has already lapsed; before that, support has to read it
   off the issuance row. Cobber id 86 says exactly this — keep them in step.

   If marketing does want a customer-facing deadline, that is a **separate flow triggered on the
   `Bonus Code Issued` metric**, which is the one place `expires_at_label` actually resolves. It is
   **not** part of this launch and nothing above depends on it. If you build it: render
   `expires_at_label` verbatim, never re-format `expires_at` (the label is the stored instant
   formatted in Sydney time, and any other formatting can print a time that contradicts what
   redemption enforces), and **update Cobber FAQ id 86 in the same change** — it currently tells
   customers the date is not printed anywhere they can reach.

**A 72-hour window is a duration, not a wall-clock time — and it shifts across a DST transition.**
`expiryAfterHours` is exact epoch-millisecond arithmetic, so a code issued Friday 2:00pm AEST expires
Monday **3:00pm AEDT**, not 2:00pm. The elapsed time is always exactly 72 hours; the *displayed* hour
moves. That is deliberate — do not "fix" it, and do not write customer copy that promises a
particular time of day.

Also: **a global daily cap now bounds webhook issuance** (`BONUS_CODE_DAILY_MINT_CAP`, default 500) —
see the fail-closed section below. There is still **no per-campaign budget and no max-issuances field**,
and the cap does not bound `entriesAmount` × the population reached within a single day. Watch the
issuance count after switch-on.

## The bonus-code webhook guards fail CLOSED — all three of them (2026-08-26)

These are the three facts a future engineer is most likely to get wrong, because in each case the
"obvious" behaviour is the opposite one. All three live in
[src/lib/bonus-code-webhook/](../../src/lib/bonus-code-webhook/); the signatures are in
[backend.md](./backend.md).

**1. An unset secret refuses every call. It does not let them through.**
`BONUS_CODE_WEBHOOK_SECRET` unset (or with no comma-entry of at least 16 characters) →
`{ ok: false, status: 500, reason: "misconfigured" }`, every time, plus a `console.error`.
The tempting nearest neighbour is `src/app/api/cron/monthly-redeemables-issuance/route.ts:9-14` —
`if (!cronSecret) return true`, which **fails open** and compares with `===`. On a cron that is
sloppy; on a **mint** endpoint it is the entire product given away by a var nobody set. Copy
`verifyNormRequest` (`src/lib/internal-norm/auth.ts:87-95`) instead. Middleware will not save you —
its matcher excludes `/api`, so this route owns 100% of its own authorization.
Corollary: **rotate by comma list, never by swap.** Add the new secret alongside the old, let
marketing update the three flows, then remove the old one. Replacing the value in one step means
every in-flight flow call is refused until the flows are re-saved.

**2. A database outage BLOCKS minting. It does not wave calls through.**
`assertBonusCodeMintBudget` wraps everything and its catch returns
`{ ok: false, status: 500, reason: "error" }`. If you ever "fix" that catch to return `ok: true` so
that "an outage doesn't break the flows", you have built a cap that uncaps itself at exactly the
moment things are going wrong — and this is the **only** control that survives a leaked secret,
because there is deliberately no rate limiter on the route. The trade is real and accepted: during a
Mongo outage the Klaviyo flow still sends its discount email (we cannot stop it from our side) and
the customer's code will not be on their account. `500` is chosen precisely so Klaviyo retries and
the grant is recovered.

**3. A failed audit write must NOT fail the request.**
`writeBonusCodeWebhookCall` catches everything and resolves anyway. The asymmetry is deliberate:
guards fail closed (refuse), the audit fails open (proceed without the row). Losing a customer's
grant because a log write hiccuped would be strictly worse than losing the log line — the discount
email has already gone. The cost is stated in `budget.ts`: **an unwritten row is an uncounted mint**,
which loosens the daily cap slightly. It never tightens it wrongly, and it is the correct direction
for this trade.

Two smaller traps in the same area:

- **Refusals do not consume budget.** Only `minted` and `rearmed` count. If you add a "count every
  call" shortcut, an enumeration sweep against a leaked secret would starve the legitimate flows —
  a denial of service handed to the attacker for free.
- **The budget's day is a UTC day**, resetting at 10/11am Sydney, matching the repo's existing
  `utcDayKey`. It is an abuse backstop, not a business metric; it only needs a well-defined
  boundary. Do not "fix" it to a Sydney day without also moving `dayKey` on every existing
  `BonusCodeWebhookCall` row, or the cap will read a window that no longer matches what was written.

## Purchase gate: every leg is an EVENT check, never a state check (2026-07-07)

`hasQualifyingPurchase`'s `membership` leg used to be `subscription.isActive === true` — a STATE check. For
any campaign targeting `all-active-subscribers` with requirement `membership` or `any`, the gate was
tautological: every recipient could claim instantly with zero purchase (found via the owner's `testpurchase`
coupon — `purchaseRequirement: "any"`, redeemed 3 seconds after issuance). Now `membership` requires the
subscription to have been **purchased inside the campaign window** (`subscription.startDate` ∈
`[startsAt, endsAt|now]` — startDate is set on join/resubscribe, both charged). The intended flow for
EXISTING members is carrying the code **on** a purchase (one-time pack for `one-time`/`any`) — the webhook
redeems via this same predicate right after the purchase persists. Lockstep holds: `RedemptionService` (burn)
passes the full user doc; `RedeemablesWalletService` (isRedeemableNow) selects the full `subscription`
subdoc, so `startDate` flows to both. Known caveats (accepted, documented): a **downgrade** also resets
`startDate` without a charge (member-initiated, rare); a `membership`-required campaign targeted at existing
members is a config smell — they can't buy a second membership, so it's effectively a join-campaign
requirement. Regression-tested: `npm run test:redeemables-purchase-gate` (19 assertions incl. the
existing-member cases).

## Campaign audience: pins are authoritative; empty pin list = NOBODY (2026-07-06)

The audience predicate exists **twice** — cron path (`TargetingService.resolveTargetUserIds` → `resolveManualUsers`)
and lazy wallet-fetch path (`CampaignService.isUserEligibleForCampaign`, called via
`ensureActiveCampaignIssuancesForUser` on every wallet read; **the lazy path is the dominant gate in practice**).
Any semantics change must be applied to BOTH. Two divergences were found + fixed (2026-07-06):

1. **Empty-pin fallback (critical):** `manual-users`/`csv-users` with an empty `segmentConfig.includeUserIds`
   lazily issued to the **entire active-subscriber base** (`return hasActiveSubscription` fallback), while the
   cron issued to nobody. Now: empty pins ⇒ eligible for **no one**, and both the create route (zod
   `superRefine`) and `CampaignService.updateCampaign` (merged-state guard — PUT is partial, so it validates
   `payload ?? existing`) reject a manual/csv campaign without pins.
2. **Pinned non-subscribers were silently dropped:** the cron required `subscription.isActive` on manual
   resolution and the lazy path required `hasActiveSubscription` even for pinned users — yet the admin picker
   explicitly offers `subscriptionStatus: "inactive" | "any"`, and dynamic-segment pins already bypassed the
   check. Now **pins work regardless of subscription status in both paths** (deactivated accounts,
   `isActive: false`, stay excluded).

Known-but-unbuilt (flagged, not fixed): campaign edits don't propagate to issued coupons (`expiresAt` copied at
issue time; no revoke machinery — nothing ever sets issuance `status: "cancelled"`); the
`requiresRecentPurchaseDays` knob exists in the model/zod but is evaluated nowhere; `/api/redeemables/status`
returns every active campaign's shared code to any authed user regardless of targeting (not redeemable without
an issuance, but leaks existence); redeem-by-code never auto-issues (in-audience user gets `campaign_not_found`
until a wallet fetch materializes their issuance).

## Pause behaviour

(Migrated from `docs/rewards-pause.md`.)

> _TODO: read root file and merge._

Brief: when a user is "rewards-paused" (abuse handling), `rewardsGuard.ts` blocks new issuance and redemption but leaves existing wallet contents intact. Admin can revoke individually if needed.

## Prize catalog

(Migrated from `docs/prize-catalog.md`.)

> _TODO: read root file and merge._

## Already-redeemed reversal

When refunding a payment that issued redeemables, redeemed issuances do **not** survive: `MilestoneService.revokeIssuancesFromPaymentEvent` un-redeems a redeemed issuance first (clawing back its granted entries and draw entries via `RedemptionService.unredeemMilestoneRedemption`) and then sets `status: "revoked"`. A monthly coupon redeemed on the refunded purchase is auto-un-redeemed back to `active`. `RefundProcessed.data.reversalIssues[]` holds only the reversal steps that **failed** — those are what an admin must manually adjudicate; it is not a list of surviving redeemed grants.

## Lifetime `accumulatedEntries` is NOT a purchase proxy (fixed money-path bug)

Purchase-gated coupons (`purchaseRequirement` other than `"none"`) must be unlocked only by a **real qualifying purchase inside the campaign window** — checked via `hasQualifyingPurchase(...)` in [purchase-eligibility.ts](../../src/utils/redeemables/purchase-eligibility.ts).

Previously `RedemptionService.redeem()` used lifetime `user.accumulatedEntries === 0` (plus any active subscription) as a "has purchased" proxy. That granted "buy to unlock" coupons **for free** to any past purchaser, and to any active subscriber even when the requirement was `"one-time"`. Fixed: redeem now selects `oneTimePackages` and calls `hasQualifyingPurchase(...)`; the wallet's `isRedeemableNow` mirrors it exactly.

Two things to keep true:
- The qualifying-purchase floor is the campaign `startsAt` (a purchase made *during* the campaign), never lifetime history. Window bounds are inclusive of both `startsAt` and `endsAt`; a `neverExpires` campaign uses `now` as the ceiling.
- `redeem()` and `isRedeemableNow` must use the **same** predicate. If they drift, the "Claim" button and the endpoint disagree — a claimable-looking coupon 500s/`ineligible`s on submit, or a hidden coupon is still redeemable via the API.

**Wallet view buckets** (`getUserWallet` status filter, consumed by `RewardsClaimables`): a purchase-locked coupon is still `active` and unexpired, so `status: "claimable"` returns it (rendered as a disabled **"Purchase to unlock" / "Members only"** row — the Claim button gates on `isRedeemableNow`), and `status: "past"` is **terminal-only** (`status !== "active"` OR past expiry). Do NOT define "past" as `!isRedeemableNow` — that would mislabel a locked-but-active coupon as "recently claimed". The home rewards-count badge counts only `isRedeemableNow` items so it never overstates what can be claimed now.

## Top-percentile timing

`topMajorDrawPercentile.ts` queries draw participation. If run too early in the cycle (e.g. during `active` status), the percentile is incomplete. Best to run after `frozen` transitions. _TODO: verify whether the campaign scheduler enforces this._

## Cancellation upsell eligibility

`cancellation-upsell-eligibility.ts` decides who sees the cancel-upsell offer based on:
- Recent redeemable issuance history
- Subscription state
- _TODO: enumerate the full eligibility rules_

Wrong eligibility → user sees offer they don't qualify for, or doesn't see one they should — both have CS implications.

## CSV import scale

CSV bulk import is admin-triggered. For very large lists (>10k users), consider chunked processing. _TODO: confirm whether chunking is implemented or if the route times out at scale._

## `DrawGrantService` writes a `shop: 0` it can never grant — 2026-08-17

The fresh-row `entriesBySource` literal in
[`DrawGrantService.ts`](../../src/services/redeemables/DrawGrantService.ts) includes `shop: 0`, but
`DrawGrantSourceKey` is still `"bonus-entry-promo" | "streak"` — **deliberately not widened**. This
service never grants merchandise entries; the zero exists only so a brand-new participant row
carries every bucket, otherwise the first reader of that row hits a missing key.

Do not "tidy" the apparent inconsistency by adding `"shop"` to `DrawGrantSourceKey`. That would let
a caller pass `"shop"` into `grantMonthlyCouponEntries`, which is not how merchandise entries are
meant to be issued. Nothing produces a `shop` entry anywhere today — the grant is a later task
gated on a trade-promotion permit variation.

The mirror-image list of buckets also lives in `MajorDrawService.zeroEntriesBySource()` (admin) and
`EntriesBySourceSchema` (Norm); a new bucket needs all three, plus the `oneTimeEntries` sums in
`major-draw-queries.ts`.

## Terminology: `isAdditional` (was `isMemberOnly`) — 2026-07-01

The package flag `isMemberOnly` was renamed to **`isAdditional`** across the codebase. It marks packages that require *additional-package access* — an **active subscription OR current major-draw entries** (see `hasAdditionalPackageAccess`), which is broader than subscribers; it was never truly "member-only". The internal `-member` UI id-suffix (a row disambiguator) is intentionally unchanged. Full rationale: [subscription/gotchas.md](../subscription/gotchas.md).

## `DrawGrantService` now covers the retention offer (2026-08-26)

`DrawGrantSourceKey` gained `"cancellation-upsell"`, so the 100-entry retention offer at
`/api/cancellation-upsell/redeem` grants through the canonical path instead of a bespoke
helper that looked the draw up with the legacy `isActive` boolean and failed silently. That
helper cost 373 members 37,300 promised entries between 2025-12 and 2026-06 — see
`docs/upsell/gotchas.md`.

The lesson the service's docblock already carried is worth restating: **`grantMonthlyCouponEntries`
reports whether the entries landed in a draw.** Any caller granting an entitlement must treat
anything but `landed` as "not delivered" — never record it on the member, never tell the member it
worked, and never burn a one-time offer on it. (It returned a boolean until 2026-08-27; see F2
below for why that was not enough, and why only `not_written` may be *reversed*.)

## A claim used to report success while granting nothing — fixed 2026-08-27 (F1)

`RedemptionService.redeem()` had the bug the section above warns about, in the two places it
matters most. On BOTH claim paths — the monthly-coupon claim and the manual milestone claim — it
flipped the issuance to `redeemed`, stamped the permanent `redeemedEverAt` marker, `$inc`'d
`accumulatedEntries`, then called `DrawGrantService.grantMonthlyCouponEntries(...)` and **threw
away its boolean**, returning `{ success: true, entriesGranted }` unconditionally.

When that boolean was `false` (no target draw — `getTargetMajorDraw()` throws in a freeze window
with nothing queued, or a gap with no queued draw) the customer was told **"200 free entries added
to your account"**, their one-per-lifetime grant was spent for good, and no draw received anything.
The only trace was `DrawGrantService`'s own `console.warn`, which `compiler.removeConsole` strips
from production builds — which is precisely why it stayed invisible. It is the same shape as the
retention-offer incident that cost 373 members 37,300 entries.

**The fix is compensation, not reordering.** `RedemptionService.landEntriesOrCompensate()` runs the
grant, and on `false` (or a throw) reverses the whole claim: wallet `$inc` and `redemptionHistory`
row `$pull`ed first, then the issuance re-opened `redeemed → active`. `redeem()` returns
`{ success: false, reason: "grant_unavailable" }`.

Why not grant-first / burn-second, which is what `/api/cancellation-upsell/redeem` does? That route
has no atomicity to lose — its "already redeemed?" check is a plain read. A claim here does: the
`findOneAndUpdate(status: "active" → "redeemed")` is the **only** thing between two concurrent POSTs
and a DOUBLE grant of a money-equivalent code. Trading a rare phantom success for a rare double
grant is strictly worse, because entries already in a draw decide who wins and cannot be quietly
withdrawn. The gate stays first; compensation cleans up behind it. Same shape as
`autoRedeemMilestoneIssuance`, fixed this way in 2026-07 for the same failure mode.

Two details that are load-bearing:

- **`redeemedEverAt` is only unset when THIS call wrote it.** `$min` preserves the first value, so a
  refunded *legacy* coupon (restored to `active` while keeping the marker) comes back carrying an
  older date this call did not write. Unsetting that would erase real audit history and hand back a
  grant that was genuinely spent. The test is exact-timestamp equality with the call's own `now`.
  This is the one narrow exception to "`redeemedEverAt` is NEVER unset" — a marker written by a
  claim that then failed to deliver was never true in the first place.
- **Revert the wallet BEFORE re-opening the issuance,** and re-open only if the revert succeeded —
  re-opening while the counter still holds the `$inc` would let the next claim double-count it. On
  that double-fault the issuance stays `redeemed` and a `console.error` says so. Every failure log
  on this path is `console.error`, never `warn`.

Regression suite: `npm run test:claim-grant-compensation`.

## …and then compensation itself became a double-grant door — fixed 2026-08-27 (F2)

The fix above reversed on `granted === false` **and** on `catch (e)`, in one branch. Those are not
the same fact.

- `false` came only from `getTargetMajorDraw()` throwing inside `grantMonthlyCouponEntries`'s own
  try/catch — **before** anything was pushed. Nothing written; reversing is right.
- A throw could only come from `await activeMajorDraw.save()`, which runs **after**
  `existingEntry.totalEntries += entries` and `entries.push({...})`.

A mongoose `VersionError` is safe (a received answer: the `__v`-filtered update matched zero rows).
A **lost acknowledgement** on a `save()` the server actually applied is not: 200 entries sit in the
live draw, the wallet `$inc` is reversed, `redeemedEverAt` is unset, the issuance returns to
`active` — the customer retries and a second 200 lands. **400 entries against one 200-entry code**,
in a draw that decides who wins a real prize, with the wallet counter reading 200.

**The fix: three states, not two.** `grantMonthlyCouponEntries` now returns a `DrawGrantOutcome`
and **never throws**:

| status | meaning | caller must |
|---|---|---|
| `landed` | the entries are in the draw | keep the spend |
| `not_written` | verified nothing reached the draw | reverse |
| `unconfirmed` | a write was attempted, unprovable either way | **NOT** reverse |

How it decides after a failed `save()`: a `VersionError` is `not_written` outright; otherwise it
re-reads the draw and compares this user's `entriesBySource[sourceKey]` against a **pre-mutation
baseline + amount**. The baseline is why the check lives in `DrawGrantService` and nowhere else —
a caller re-reading later cannot tell 200 already-held entries from 200 just written. The
comparison is `>=`, not `===`: a concurrent grant into the same bucket would inflate the number, and
being wrong in *that* direction leaves a claim spent (an admin can fix it) instead of granting twice
(nobody can). A failed re-read is `unconfirmed`.

`landEntriesOrCompensate()` returns `"landed" | "reversed" | "unresolved"` and reverses **only**
`not_written`. `redeem()` maps `unresolved` to the new **`grant_unresolved`** reason (HTTP **500**,
not the retry-inviting 503) — distinct from `grant_unavailable` precisely because that reason
promises the code is still held, and here it is not. A half-done compensation (wallet reverted,
issuance re-open failed) also returns `unresolved` rather than borrowing the reassuring answer.

The same three-state rule now governs `autoRedeemMilestoneIssuance`'s Step B (an `unconfirmed`
write is **not** reverted and the issuance is **not** re-opened — a sweep retry would grant a second
time) and `/api/cancellation-upsell/redeem` (which must not answer "your offer is still available"
over a write that may have landed).

## A thrown wallet write burned the grant and delivered nothing — fixed 2026-08-27 (F1b)

`redeem()` had **no try/catch anywhere**. Both claim paths ran the atomic
`findOneAndUpdate(active → redeemed)` stamping `$min: { redeemedEverAt: now }`, then a **bare**
`await User.findByIdAndUpdate({ $inc: accumulatedEntries, $push: redemptionHistory })`.

If that middle write threw — write-concern failure, dropped connection — the exception escaped, the
route answered 500, and the issuance was left `redeemed` with `redeemedEverAt` set. For a
personal-window campaign (all three live trigger codes) that marker is terminal in **two** places:
the pre-check and the atomic filter's `redeemedEverAt: { $exists: false }`. Grant spent for life,
zero entries, no compensation, admin-only recovery — the same outcome as F1, through a different
door. The correct pattern was already ~130 lines below in `autoRedeemMilestoneIssuance`'s "Step A";
only its second half had been copied up.

Now the `reopenIssuance` closure is **hoisted above** the wallet write on both paths (the coupon one
still carries the `wroteRedeemedEverAt`-conditional `$unset`), the write is wrapped, and
`reopenAfterWalletFailure()` hands the grant back. It asks `User.exists({ _id, "redemptionHistory.redemptionId" })`
first: a throw is not proof the write did not apply, and re-opening while the counter still holds the
`$inc` is how the next claim double-counts it. When that check cannot answer, it re-opens anyway —
nothing has reached a draw at this point, so the worst case is a counter an admin can correct, never
entries in a draw that cannot be withdrawn. It returns whether the issuance is actually back to
`active`, and `redeem()` answers `grant_unavailable` only when it is; otherwise `grant_unresolved`.

**The invariant to check every new branch against:** for every way this can fail, the customer is
left with either their entries or their code — never neither, never both.
returns `false` when the entries did not land in a draw.** Any caller granting an entitlement
must treat `false` as "not delivered" — never record it on the member, never tell the member it
worked, and never burn a one-time offer on it.

## The unredeem methods double-reversed entries on a refund (fixed 2026-08-28)

`RedemptionService.unredeemMonthlyCouponRedemption` and `unredeemMilestoneRedemption` each did two
things: restore the redemption record (issuance status + pull the `redemptionHistory` row) **and**
reverse the entries (`$inc accumulatedEntries: -n` plus `removeMajorDrawEntries`).

That second responsibility was wrong for their only production caller. The refund path
([`refund-ledger-reversal.ts`](../../src/utils/payment/refund-ledger-reversal.ts)) had **already**
reversed those entries two steps earlier — `legacyTotalEntries()` counts `grants.campaignEntries`,
and the `drawEntries` step removes them from the ledger's own draw, scoped by `drawId`. So a
100-entry code took 200 entries back, and the service's own `removeMajorDrawEntries` call — made
with **no drawId** — could strip entries from a different, unrefunded draw.

Both methods now accept `entriesAlreadyReversed`. When true they restore the redemption record and
nothing else; the entry arithmetic belongs to whoever counted it. **The record restoration is not
optional and still runs either way** — skipping the whole method would have left the issuance stuck
`redeemed` and unusable.

Read the full write-up, including what was deliberately left alone, in
[payment/gotchas.md](../payment/gotchas.md#a-refunded-bonus-code-purchase-reversed-its-entries-twice-fixed-2026-08-28).

**If you add a third caller**, decide the flag deliberately: pass `true` only when your own path has
already reversed both the counter and the draw entries. Passing it wrongly in either direction is
silent — `true` when nothing reversed leaves a member holding refunded entries; `false` when the
ledger already did takes them twice.

## 188 members were shown a Claim button the server refused — the wallet had its own copy of the rule (2026-09-01)

**Symptom.** 188 members held an `ANZACDAY25` coupon for 25 free entries that rendered with an
**enabled Claim button**. Tapping it failed. `RedemptionService.redeem` answered
`campaign_not_active` every time.

**Cause — a partial copy, not a missing check.** `RedeemablesWalletService` computed
`isRedeemableNow` from its own hand-written campaign test:

```ts
campaign != null && campaign.isActive !== false   // the old wallet
```

while the redeem path called the shared predicate:

```ts
isCampaignRedeemable(campaign, now)               // isActive && startsAt <= now && (neverExpires || personalWindow || endsAt >= now)
```

The wallet had **one third** of it. `endsAt` never entered the wallet's answer, so a campaign that had
ended but was still flagged active looked live to the wallet and dead to the server. The comment
sitting above the expression said it required `isActive` "too" *in order to mirror*
`isCampaignRedeemable` — the drift was documented as if it were the mirror.

**The production state that made it bite.** Campaign **ANZAC DAY 25** (`ANZACDAY25`):
`startsAt` 2026-04-24, `endsAt` **2026-04-27T10:00Z**, `neverExpires: false`, no `validForHours`,
`isActive: **true**` (never switched off after the promo). 452 of its issuances had been minted with
the far-future sentinel `expiresAt` `9999-12-31T23:59:59.999Z` — stamped before an expiry was
configured on the campaign, which was edited mid-run (`updatedAt` 2026-04-27T08:51). Of those 452,
**264 were already redeemed and 188 were still `status: "active"`**. So for those 188 rows *every*
condition the wallet checked passed: active status, an expiry in the year 9999, no purchase
requirement, a campaign that existed and was `isActive`.

Three independent mistakes had to line up, which is why it survived four months: (1) a campaign left
active past its end date, (2) issuances stamped with a sentinel expiry, (3) a wallet that did not ask
the shared predicate. Only the third is a code defect, and fixing it alone stops the bad button
regardless of what the other two do next.

**The fix.** `isRedeemableNow` now calls `isCampaignRedeemable(campaign, now)` — the same function,
the same arguments, the same answer as the redeem path. The issuance-level conditions stay in the
wallet because they have no equivalent inside that predicate (row status, this customer's own
`expiresAt`, the purchase gate, the refund gate). Rule:
[rules.md R12](./rules.md#r12-the-wallet-must-not-re-implement-redeemability--it-must-call-the-same-predicate-the-redeem-path-calls-2026-09-01).

**The generalised lesson.** A read surface that decides whether to *offer* an action, and a write
surface that decides whether to *allow* it, must consult one predicate — not two implementations of
one idea. Copying "just the bit we need" from a shared rule is how a UI starts lying: the copy is
correct on the day it is written, and every later amendment to the real rule silently skips it.
A comment claiming a hand-rolled expression "mirrors" a shared function is not evidence that it does;
either call the function or explain, per condition, why this site legitimately differs.

**The data was a separate defect.** The 452 sentinel `expiresAt` values are simply wrong and are
repaired by `scripts/fix-redeemable-issuance-expiry.ts` (dry-run by default). That script does not fix
the button — the code change does — but until it runs, support tooling and admin exports show a
year-9999 deadline on a coupon that died in April, and 312 rows sit at `status: "active"` with a past
expiry. See
[docs/infrastructure/backend.md](../infrastructure/backend.md#fixredeemable-issuance-expiry-2026-09-01).
