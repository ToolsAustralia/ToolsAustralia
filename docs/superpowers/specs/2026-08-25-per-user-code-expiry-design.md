# Per-customer bonus-code expiry — implementation design

**Scope:** the expiry mechanism only. Not the code values, not the email copy, not which campaigns exist.

**Verified against the working tree** at `c:/Codes/ToolsAustralia/.worktrees/coupon-klaviyo` (branch `feature/coupon-klaviyo`). Every line number below was opened and read. The expiry helper in §3 was executed against the repo's own `node_modules/date-fns-tz` on an `Asia/Manila` host — output is quoted.

---

## The system in plain English

*No code, no file names. If you only read one section, read this one.*

### In one line

**The server hands each customer their own dated coupon the moment they qualify, and tells Klaviyo that date — so the email and the server can never disagree.**

### The cast

| Who | What they do |
|---|---|
| **Admin** | Sets the coupon up once: what it's called, how many free entries it includes, and how many days each person gets. |
| **Our server** | Watches for the moment a customer qualifies. Writes that person their own coupon, with their own deadline. |
| **Klaviyo** | Decides who to email and when. Prints the deadline our server gave it. |
| **The customer** | Types the code at checkout. |

### The journey, start to finish

Take Dave.

1. **Once, ever** — an admin creates the win-back coupon: code `BACKIN200`, includes 200 free entries, **14 days per person**.
2. **Monday 9am** — Dave cancels his membership.
3. **Monday 9am, same instant** — the server writes Dave his own coupon: *200 free entries, expires Monday 15 September, 11:59pm.* That deadline belongs to Dave and nobody else.
4. The server tells Klaviyo Dave qualified, **and includes Dave's deadline in the message**.
5. **Klaviyo decides when to email him** — immediately, or after a two-day wait, or only if he hasn't come back. That's the ads team's call, and they can change it whenever they like without asking us.
6. **Wednesday** — Dave's email arrives showing *Monday 15 September*. That's the date the server wrote down. Not a date Klaviyo worked out. Not 14 days from when the admin set the coupon up.
7. **Saturday** — Dave comes back, picks Boss, types `BACKIN200` at the payment step.
8. The server checks **Dave's own coupon**: does he have one, is it still in date, has he used it? All three yes → **200 free entries land in the draw**.
9. **Any time after** — Dave tries it again, on any purchase. Politely refused. One per person.

### The rules, in plain words

- **Everyone shares the code word. Nobody shares the deadline.** `BACKIN200` is the same string for every customer; the clock is personal.
- **The clock starts when they qualify** — not when the admin created the coupon. That's the whole point.
- **One free grant per person, for life.** A refund does not give it back.
- **Qualify again after it expired unused?** They get a fresh one.
- **Qualify again while it's still live?** Nothing changes. We don't reset the clock — otherwise someone could keep abandoning checkouts to farm an endless window.
- **Someone who finds the code without ever qualifying gets nothing.** They have no coupon, so there's nothing to redeem.

### What the customer sees when it doesn't work

- **Expired** — *"This code expired on Monday 15 September."* Naming the date, not a blank "invalid code."
- **Already used** — told plainly that it's been used on their account.
- **Never qualified** — the code simply isn't theirs.

Today the system says "invalid" for all three, which is why people email support instead of understanding what happened.

### Where the customer actually uses it

**Today:** the coupon box on the payment step at checkout. A link in the email can also fill it in for them automatically.

**Does the customer only learn the code from the email?** Not quite, today. A signed-in customer can read every active campaign's code from the redeemables status endpoint, with no eligibility check. **This does not break the design** — knowing the code buys nothing, because without their own coupon the server refuses them. It is a discovery leak, not an exploit. Worth closing anyway: a code people can screenshot but not use makes the offer look cheap.

**Should the coupon also appear in their account?** The machinery exists and it would be **three things in sequence**, not just history:

| When | What they'd see |
|---|---|
| Never qualified | Nothing — no coupon exists for them |
| Qualified, hasn't bought yet | The coupon, its entry count, and **their** deadline — as a **reminder**, not a claim button |
| At checkout | They type the code — redemption happens there |
| After redeeming | The row stays, marked redeemed with the date — **history** |

It is never the place they redeem, because these coupons require the purchase that earns them; the wallet's claim button correctly refuses until that purchase exists.

The screen is currently switched off behind the rewards pause. A coupon sitting visibly in someone's account is far more likely to be used than one living in an email they may have deleted — but this is a product call, not a technical blocker.

### What this design deliberately does not cover

The code names, how many entries each is worth, the email wording, and the Klaviyo flows themselves. Those are the ads team's; this is only the machinery that makes the deadline real.

---

## 0. Blockers — fix these or the mechanism cannot work

These are not "nice to have". Each one, left alone, defeats the stated goal.

| # | Blocker | Evidence | Why it blocks |
|---|---|---|---|
| B1 | **The write cannot tell the emit what it stored.** `createIssuanceForUser` returns `Promise<boolean>` (`CampaignService.ts:388-392`, `return true` at `:426`); `ensureActiveCampaignIssuancesForUser` returns `{ issuedCount }` (`:442`, `:469`). The stamped `expiresAt` (local at `:401`, written at `:420`) never leaves the function. | read | Step 4 ("emit that exact stored instant") is **unimplementable**. Any call-site emit must recompute from a second `new Date()`. A 150 ms gap across Sydney midnight = a full calendar day of divergence. Widen both signatures **first**; everything else is downstream. |
| B2 | **The mint is not atomic and misdiagnoses its own duplicate key.** `findOne(...).select("_id")` at `:393-398` → `if (existingIssuance) return false;` at `:399` → `RedeemableIssuance.create(...)` at `:411`. The retry loop at `:404-437` regenerates only `uniqueCode` (`:405-408`) — which is `undefined` for `campaignMode: "global"` — and **rethrows** at `:433`. Colliding index: `RedeemableIssuance.ts:92`. | read | A double-clicked Cancel throws E11000 out of `cancelSubscription` **after** `await user.save()` (`CancelSubscriptionService.ts:151`) and after Stripe has cancelled. Customer sees "cancel failed" on a cancelled subscription. |
| B3 | **`status: "expired"` is never written by anything.** Only writers of this collection: `CampaignService.ts:245` (`$setOnInsert`), `:411` (`create`, status `"active"`), `RedemptionService.ts:199` (→`redeemed`), `:274` (→`active`). `docs/rewards-redeemables/gotchas.md:50-51` says the same. | read + grep | A re-arm predicate written as `{ status: "expired" }` matches **zero documents, forever, silently**. It would pass a hand-made test and be inert in production. |
| B4 | **A refunded row is byte-identical to a never-redeemed one.** `unredeemMonthlyCouponRedemption` does `$set: { status: "active" }, $unset: { redeemedAt: 1 }` (`RedemptionService.ts:274-280`) and the model has no other redemption marker (`RedeemableIssuance.ts:5-23`). | read | "One grant per person, **ever**" becomes "one grant per refund cycle": buy → redeem → refund → wait for expiry → re-trigger → repeat. Needs a permanent marker (§1, rule 6). |
| B5 | **No environment gate on the Klaviyo emit.** `getKlaviyoConfig` derives mode from `NODE_ENV` only (`klaviyo.ts:33-48`); `formatEventName` prefixes `[DEV]` only when `mode === "development"` (`:152-165`). `CLAUDE.md:292` states Vercel previews **are** production builds. Zero `VERCEL_ENV` references in the Klaviyo layer; `facebook-env.ts:8-11` does it correctly for Meta. | read + grep | A preview build of this branch sends a **real** BACKIN200 email to a **real** customer and permanently burns their one-per-lifetime grant (unique index `RedeemableIssuance.ts:92`). |
| B6 | **Dev hot-reload will silently drop the new field.** `MonthlyEntryCampaign.ts:163-177` clears the cached model only when `code` / `neverExpires` / `purchaseRequirement` paths are missing. Schema options are `{ timestamps: true }` only (`:129-132`) → mongoose `strict` is on → undeclared paths are dropped **with no error**. `RedeemableIssuance.ts:97-99` has **no** clearing block at all. | read | `validForDays` (and the new issuance fields) appear to "not persist" locally, with no error, and the bug does not reproduce on Vercel (cold start = fresh model). Reads as a phantom. |

---

## 1. Final mechanism

1. **One new campaign field.** `MonthlyEntryCampaign.validForDays?: number` (`min: 1`), optional. Unset ⇒ **byte-identical** behaviour to today (copy `campaign.endsAt`). Set ⇒ the campaign is "personal-window governed".

2. **`validForDays` wins the precedence chain, and the conflict is rejected at the boundary.** Both stamp sites become:
   ```
   validForDays ? endOfDayAESTAfterDays(issuedAt, validForDays)
   : neverExpires ? NEVER_EXPIRES_ISSUANCE_DATE
   : campaign.endsAt
   ```
   and both zod schemas reject `neverExpires === true && validForDays != null`. Today `neverExpires` short-circuits first at `CampaignService.ts:260` and `:401`, so the pair would silently produce three different answers at once: year-9999 enforced, a 14-day date emailed, "No expiry" in the wallet (`RedeemablesWallet.tsx:171` reads `neverExpires` from the **campaign** while `expiresAt` comes from the **issuance**).

3. **One captured instant.** `issuedAt` and `expiresAt` are derived from the same `Date` object, never two `new Date()` calls. `issueCampaignToUsers` currently calls `new Date()` inline at `:259` **inside** a `for` loop (`:233`) — hoist it above the loop, or one admin click straddling Sydney midnight hands two users different expiry days.

4. **The write returns the stamped row.** `createIssuanceForUser` returns a `StampedIssuance` object; `ensureCampaignIssuanceForUser` (new, single-campaign) returns it to the trigger. The Klaviyo event builder takes the **persisted `expiresAt` Date as a parameter** and never computes one. Do **not** copy `createStartedCheckoutEvent`'s inline `started_at: new Date().toISOString()` (`klaviyo-events.ts:957`) — correct for `started_at`, fatal for `expires_at`.

5. **The claim is already correct — do not touch it.** `RedemptionService.ts:199-213` filters on exactly `{ _id, userId, status: "active", expiresAt: { $gt: now } }`, index-covered by `{userId, status, expiresAt}` (`RedeemableIssuance.ts:94`). Step 5 of the proposal is implemented verbatim.

6. **Re-arm is gated three ways** (decision table in §4): a permanent `redeemedEverAt` marker (never unset), a live-window check keyed on `expiresAt` not `status`, and an explicit `trigger` parameter that **only the three trigger call-sites pass**. `RedeemablesWalletService.ts:51` calls the enrolment path on **every wallet read** — without the third gate, refreshing `/my-account` rewards silently resets the clock, unbounded.

7. **The campaign window stops truncating the personal window — at all four sites, in one commit.** `isActive` and `startsAt <= now` stay unconditional everywhere (`isActive` is both the admin kill switch and the soft-delete flag — `CampaignService.ts:207-211`). Only the `endsAt` leg relaxes, and only for `validForDays` campaigns. Nothing becomes unbounded: the per-user ceiling is still `expiresAt: { $gt: now }` inside the atomic claim.

8. **`campaign.endsAt` keeps exactly one job: "no NEW eligibility after this date."** It stays model-required (`MonthlyEntryCampaign.ts:80-85`, pre-save `:144-146`) and stays in the minting filter (`CampaignService.ts:454-458`). That is what stops the personal window becoming an infinite issuance faucet. Operational rule to document: **`endsAt` must stay ahead of the Klaviyo flow's life.**

9. **The cron never touches a trigger campaign.** `monthly-redeemables-issuance/route.ts:25` filters by `monthKey`; `monthKey` is required on both models, so a September-created trigger campaign would be bulk-issued to its whole resolved audience with **no email**, consuming lifetime grants silently.

10. **One label, one source.** The stored instant, the emailed label, and the wallet label are all produced by the same two functions in `src/utils/common/timezone.ts`. The client stops formatting the instant itself.

---

## 2. The expiry computation (DST-safe) — exact code

Add to `src/utils/common/timezone.ts`, immediately after `createAESTDateAsUTC` (ends `:286`). Do **not** coin a new module — CLAUDE.md naming rule.

```ts
/**
 * End of day (23:59:59.999) in Australia/Sydney, `days` calendar days after the
 * Sydney date of `from`. Returns the UTC instant to store.
 *
 * Days are added to the Sydney CALENDAR TRIPLE in UTC (where no DST exists),
 * never to the instant. Adding to the instant — the pattern already at :247,
 * :329, :364 and :380 of this file, via date-fns `addDays`, which is
 * `_date.setDate(_date.getDate() + amount)` i.e. host-local +n*24h — yields a
 * 15-day window for an eligibility of Sun 20 Sep 2026 23:30 AEST and a 13-day
 * window for Wed 25 Mar 2026 00:30 AEDT. Verified, not assumed.
 *
 * The `.setUTCSeconds(59, 999)` is required: createAESTDateAsUTC hardcodes
 * seconds to ":00" (:283), and the redemption gate is strictly exclusive
 * (`expiresAt: { $gt: now }`, RedemptionService.ts:204) — so a 23:59:00.000
 * bound kills the coupon 60 seconds before the emailed "11:59pm". Sydney
 * offsets are whole hours, so UTC seconds == Sydney seconds.
 * Same idiom already at DailyUserMetricsService.ts:120, dashboardDateRange.ts:56.
 */
export function endOfDayAESTAfterDays(from: Date, days: number): Date {
  const year = parseInt(formatInTimeZone(from, AEST_TIMEZONE, "yyyy"), 10);
  const month = parseInt(formatInTimeZone(from, AEST_TIMEZONE, "M"), 10);
  const day = parseInt(formatInTimeZone(from, AEST_TIMEZONE, "d"), 10);

  // Calendar arithmetic in UTC: no DST, no host-timezone dependency.
  const calendar = new Date(Date.UTC(year, month - 1, day));
  calendar.setUTCDate(calendar.getUTCDate() + days);

  const endOfDay = createAESTDateAsUTC(
    calendar.getUTCFullYear(),
    calendar.getUTCMonth() + 1, // createAESTDateAsUTC takes 1-indexed months
    calendar.getUTCDate(),
    23,
    59
  );
  endOfDay.setUTCSeconds(59, 999);
  return endOfDay;
}

/** AEST vs AEDT abbreviation for an instant. Same Intl technique as :85-88 and :160-166. */
export function getAESTAbbreviation(utcDate: Date): string {
  return (
    new Intl.DateTimeFormat("en-AU", { timeZone: AEST_TIMEZONE, timeZoneName: "short" })
      .formatToParts(utcDate)
      .find((p) => p.type === "timeZoneName")?.value ?? "AEST"
  );
}

/**
 * The ONE customer-facing expiry string. The Klaviyo email, the wallet and the
 * rewards widget all render this exact value.
 *
 * Never hardcode " AEST": the 14-day expiry for a 20 Sep 2026 eligibility is
 * 4 Oct 2026, which is AEDT. date-fns `zzz` is not a substitute — it emits
 * "GMT+11". Never use formatDateForKlaviyo (klaviyo-helpers.ts:759): it is
 * toLocaleDateString("en-US") with no timeZone option.
 *
 * Example: "Sunday 4 October 2026, 11:59PM AEDT"
 */
export function formatExpiryLabelAEST(utcDate: Date): string {
  return `${formatInTimeZone(utcDate, AEST_TIMEZONE, "EEEE d MMMM yyyy, h:mma")} ${getAESTAbbreviation(utcDate)}`;
}
```

**Executed output** (`node`, host `Asia/Manila`, repo's own `date-fns-tz`, `days = 14`):

```
spring-forward eve       from 2026-09-20 23:30 AEST => 2026-10-04T12:59:59.999Z | Sydney 2026-10-04 23:59:59.999 AEDT | span 14 | Sunday 4 October 2026, 11:59PM AEDT
fall-back run            from 2026-03-25 00:30 AEDT => 2026-04-08T13:59:59.999Z | Sydney 2026-04-08 23:59:59.999 AEST | span 14 | Wednesday 8 April 2026, 11:59PM AEST
ambiguous repeated hr    from 2026-04-05 02:30 AEDT => 2026-04-19T13:59:59.999Z | Sydney 2026-04-19 23:59:59.999 AEST | span 14 | Sunday 19 April 2026, 11:59PM AEST
year rollover            from 2026-12-31 23:30 AEDT => 2027-01-14T12:59:59.999Z | Sydney 2027-01-14 23:59:59.999 AEDT | span 14 | Thursday 14 January 2027, 11:59PM AEDT
leap day                 from 2028-02-15 16:00 AEDT => 2028-02-29T12:59:59.999Z | Sydney 2028-02-29 23:59:59.999 AEDT | span 14 | Tuesday 29 February 2028, 11:59PM AEDT
plain winter 23:59:59.9  from 2026-06-10 23:59 AEST => 2026-06-24T13:59:59.999Z | Sydney 2026-06-24 23:59:59.999 AEST | span 14 | Wednesday 24 June 2026, 11:59PM AEST
```

Span is exactly 14 in every case, on a non-UTC, non-Sydney host.

**Never** route this through `convertAESTToUTC` (`timezone.ts:57-59`): it passes a `Date` to `fromZonedTime`, taking the host-local-getter branch (`node_modules/date-fns-tz/dist/esm/fromZonedTime/index.js:31-33`). There is no `process.env.TZ` pin anywhere in this repo.

---

## 3. Re-arm decision table

Input: an existing `RedeemableIssuance` for `{ campaignId, userId }` (a second row is impossible — unique index `RedeemableIssuance.ts:92`), plus `now` and whether the caller passed an explicit `trigger`.

| Row state (as stored) | Caller passed `trigger`? | Action | Emit? | Returned to caller |
|---|---|---|---|---|
| **No row** | either | Upsert a fresh row: `issuedAt = now`, `expiresAt = f(now)` | **Yes** | `{ outcome: "minted", issuance }` |
| `redeemedEverAt` exists (redeemed now, or redeemed-then-refunded) | either | **Nothing.** One grant per person, ever. | No | `{ outcome: "spent", issuance }` |
| `status: "active"` **and** `expiresAt > now` | either | **Nothing.** Do not reset a live clock. | No | `{ outcome: "already_active", issuance }` — caller emits **the existing stored `expiresAt`** if it needs to re-send |
| `status: "active"` **and** `expiresAt <= now` **and** no `redeemedEverAt` | **no** (wallet load / cron) | **Nothing.** | No | `{ outcome: "expired_no_rearm", issuance }` |
| `status: "active"` **and** `expiresAt <= now` **and** no `redeemedEverAt` | **yes** | **Re-arm:** `$set { issuedAt: now, expiresAt: f(now) }`, `$setOnInsert`-preserved `firstIssuedAt` untouched | **Yes** | `{ outcome: "rearmed", issuance }` |
| `status: "cancelled"` | either | **Nothing.** (No writer produces this today — treat as terminal.) | No | `{ outcome: "spent", issuance }` |

Three notes that are load-bearing:

- **The predicate keys off `expiresAt`, never `status: "expired"`** (blocker B3). The re-arm write is a single-document atomic update:
  ```ts
  RedeemableIssuance.findOneAndUpdate(
    { campaignId, userId, status: "active", expiresAt: { $lte: now }, redeemedEverAt: { $exists: false } },
    { $set: { issuedAt: now, expiresAt, notifiedAt: null, notifyError: null } },
    { new: true }
  )
  ```
  covered by `{userId, status, expiresAt}` (`RedeemableIssuance.ts:94`). `status: "active"` in the filter means it can never resurrect a redeemed row even if `redeemedEverAt` were somehow absent.
- **Unique-code campaigns keep their existing `code` on re-arm.** The code string may already sit in an old email; regenerating it would strand that email. `generateUniqueCode` is only called on insert.
- **`firstIssuedAt` preserves the audit.** Re-arm overwrites `issuedAt` in place (the unique index forbids a second row) and the model has no history array and no TTL, so first qualification would otherwise be unrecoverable.

---

## 4. Ordered change list

### Phase A — schema (do first; B6 lives here)

| # | File:line | Change | Why |
|---|---|---|---|
| A1 | `src/models/MonthlyEntryCampaign.ts:16` | Add `validForDays?: number;` to `IMonthlyEntryCampaign` right after `neverExpires`, before `isActive` | Keeps the three expiry knobs adjacent |
| A2 | `src/models/MonthlyEntryCampaign.ts:86-89` | After the `neverExpires` path add `validForDays: { type: Number, min: [1, "validForDays must be at least 1"] },` — **optional, no `required`** | Unset ⇒ today's behaviour, unchanged |
| A3 | `src/models/MonthlyEntryCampaign.ts:163-177` | Add `const validForDaysPathExists = Boolean(existingMonthlyEntryCampaignModel.schema.path("validForDays"));` beside the other probes **and** `|| !validForDaysPathExists` to the `if (...)` disjunction | **B6.** The probe alone does nothing — both edits are mandatory |
| A4 | `src/models/MonthlyEntryCampaign.ts:139-157` | In `pre("save")`, after the `code` check: `if (this.neverExpires && typeof this.validForDays === "number") return next(new Error("neverExpires and validForDays are mutually exclusive"));` | Create-path guard. **Not sufficient alone** — `updateCampaign` uses `findByIdAndUpdate(..., { runValidators: true })` (`CampaignService.ts:164-167`), which does **not** run `pre("save")`. Zod (C1/C4) is the real gate |
| A5 | `src/models/RedeemableIssuance.ts:20` | Add to `IRedeemableIssuance`, after `expiresAt`: `redeemedEverAt?: Date; firstIssuedAt?: Date; notifiedAt?: Date \| null; notifyError?: string \| null;` | **B4** + emit observability. Do **not** try to hang these off `metadata` — it is a closed three-`String` subdoc (`:13-17`, `:68-72`) under strict mode and they would be dropped |
| A6 | `src/models/RedeemableIssuance.ts:85` | Add the matching schema paths after `expiresAt`: `redeemedEverAt: { type: Date }, firstIssuedAt: { type: Date }, notifiedAt: { type: Date, default: null }, notifyError: { type: String, default: null },` | strict mode drops undeclared paths silently |
| A7 | `src/models/RedeemableIssuance.ts:97` | Add a hot-reload staleness block mirroring `MonthlyEntryCampaign.ts:163-177`, probing `redeemedEverAt` | This model has **none** today (B6) |

### Phase B — the expiry computation

| # | File:line | Change |
|---|---|---|
| B1 | `src/utils/common/timezone.ts:286` | Add `endOfDayAESTAfterDays`, `getAESTAbbreviation`, `formatExpiryLabelAEST` exactly as in §2 |
| B2 | `src/utils/common/timezone.ts:85-88`, `:160-166` | *(optional, zero-behaviour-change)* point `formatMajorDrawChipUtc` and `formatDateReadable`'s abbreviation lookup at `getAESTAbbreviation` |

### Phase C — admin write path (four edits that all silently drop the field if missed)

| # | File:line | Change | Failure if missed |
|---|---|---|---|
| C1 | `src/app/api/admin/monthly-coupon/campaign/route.ts:22` | Add `validForDays: z.number().int().min(1).optional(),` after `neverExpires`; extend the existing `.superRefine` (`:34-47`) to reject `neverExpires === true && validForDays != null` | zod strips it before the service sees it |
| C2 | `src/services/redeemables/CampaignService.ts:53` | Add `validForDays?: number;` to the `createCampaign` input type | `...input` at `:69` then carries it; the type is the gate |
| C3 | `src/app/api/admin/monthly-coupon/campaign/route.ts:116-132` | Add `validForDays: payload.validForDays,` to the explicit field mapping | **Easiest edit to miss** — the POST maps each field by name, no spread |
| C4 | `src/app/api/admin/monthly-coupon/campaign/[id]/route.ts:17` | Add `validForDays: z.number().int().min(1).nullable().optional(),` + the same mutual-exclusion refine | `.nullable()` is the clearing sentinel (see C6) |
| C5 | `src/services/redeemables/CampaignService.ts:96` | Add `validForDays: number \| null;` to the `updateCampaign` updates type | |
| C6 | `src/services/redeemables/CampaignService.ts:110-112` | After the strip loop, add: `if (updates.validForDays === null) { delete normalizedUpdates.validForDays; (updateOperation as { $unset?: Record<string, 1> }).$unset = { validForDays: 1 }; }` | Two independent `undefined`-strip layers (`campaign/[id]/route.ts:45-47` **and** here) mean the field could otherwise **never be cleared** — the same class of bug `displayLabel` needed a bespoke escape hatch for at `:127-131` |
| C7 | `src/services/redeemables/CampaignService.ts:201-215` | In `deleteCampaign`, drop the hard-delete branch — always `$set: { isActive: false }` | The count-then-delete at `:207`/`:213` is non-atomic; for a lazily-minted trigger campaign `issuanceCount === 0` is the **normal** state, so a delete racing a trigger orphans a live issuance. An orphan renders as *more* claimable than a real coupon, because the campaign lookup misses and `purchaseRequirement` collapses to `"none"` (`RedeemablesWalletService.ts:76-84`) |

### Phase D — admin read path + Norm (lockstep, one commit)

| # | File:line | Change |
|---|---|---|
| D1 | `src/services/redeemables/MonthlyCouponQueryService.ts:51` | Add `validForDays?: number;` to `MonthlyCampaignListRow` |
| D2 | `src/services/redeemables/MonthlyCouponQueryService.ts:75-77` | Add `validForDays` to the `.select()` string. **Miss this and the field type-checks everywhere and is `undefined` at runtime in both the admin list and Norm — invisible to `tsc`** |
| D3 | `src/services/redeemables/MonthlyCouponQueryService.ts:104` | Add `validForDays: c.validForDays,` to the row mapping |
| D4 | `src/app/api/admin/monthly-coupon/campaign/route.ts:72` | Add `validForDays: row.validForDays,` to the GET response mapping |
| D5 | `src/lib/internal-norm/schemas/monthly-coupon.ts:49` | Add `validForDays: z.number().int().positive().optional(),` to `MonthlyCampaignRowSchema` |
| D6 | `src/app/api/internal/norm/v1/monthly-coupon/campaign/route.ts:36` | Add `validForDays: row.validForDays,` to the projection. **Direction matters:** `withNorm.ts:207-220` `safeParse`s the response and 500s on failure, but zod strips unknown keys — so *emitting extra* is safe, *declaring required and not emitting* is a 500 on the whole endpoint. `.optional()` + both edits in the same commit |
| D7 | `docs/internal-norm/norm-context.md:3521-3560` | Add the `validForDays` line: *"per-customer window in days; when set, each issuance expires validForDays after THAT user's eligibility, not at campaign end."* CLAUDE.md rule 10 |
| D8 | `src/components/admin/MonthlyRedeemablesCampaignPanel.tsx:18`, `:266`, `:379`, `:392` | Add `validForDays?: number` to `MonthlyCampaignListItem` and render it at the three expiry display sites, e.g. `End: {neverExpires ? "Never Expires" : validForDays ? \`${validForDays}-day window per customer (backstop ${formatDateTime(endsAt)})\` : formatDateTime(endsAt)}` — otherwise an operator cannot tell a fixed-end campaign from a rolling one |
| D9 | `src/components/modals/AdminMonthlyRedeemablesModal.tsx:40-55, :108-120, :127, :167-169, :243-244, :292-294, :439-455` | Thread `validForDays` through all seven sites; disable the `validForDays` input when `neverExpires` is checked; label `endsAt` as "Backstop — no new customers qualify after this date" when `validForDays` is set |
| D10 | `src/components/modals/AdminMonthlyRedeemablesModal.tsx` (submit path) | Warn on setting `validForDays` on a campaign that already has issuances: existing rows are **not** re-stamped (both writers skip existing rows), so they keep the old `endsAt` deadline while the flow promises a rolling window |

### Phase E — the two stamp sites + the mint API (the core)

| # | File:line | Change |
|---|---|---|
| E1 | `src/services/redeemables/CampaignService.ts:388-439` | **Rewrite `createIssuanceForUser`.** New signature (B1 + B2): <br>`private static async createIssuanceForUser(userId, campaign, now, options?: { trigger?: BonusCodeTrigger }): Promise<StampedIssuanceResult>` where `StampedIssuanceResult = { outcome: "minted" \| "rearmed" \| "already_active" \| "spent" \| "expired_no_rearm" \| "not_applicable"; issuance?: { id: string; campaignId: string; campaignCode: string; code?: string; entriesAmount: number; issuedAt: Date; expiresAt: Date } }`.<br>Body: `const issuedAt = now;` → `const expiresAt = campaign.validForDays ? endOfDayAESTAfterDays(issuedAt, campaign.validForDays) : campaign.neverExpires ? NEVER_EXPIRES_ISSUANCE_DATE : campaign.endsAt;` → `if (!expiresAt) return { outcome: "not_applicable" };` (keep the `:402` guard for the unset path) → **atomic upsert** replacing the `findOne`+`create`: `findOneAndUpdate({ campaignId, userId }, { $setOnInsert: { …, issuedAt, expiresAt, firstIssuedAt: issuedAt, status: "active" } }, { upsert: true, new: true, setDefaultsOnInsert: true, includeResultMetadata: true })`, reading `lastErrorObject.updatedExisting` to distinguish `"minted"` from an existing row → then apply the §3 decision table to the existing row. On a surviving E11000 **on `{campaignId,userId}`** (inspect `keyPattern`, not just `code === 11000`) return `{ outcome: "already_active" }` — someone else won the race, that is not an error. Keep the code-regeneration retry **only** for a `{campaignId, code}` collision |
| E2 | `src/services/redeemables/CampaignService.ts:250-266` | In `issueCampaignToUsers`, hoist `const issuedAt = new Date();` **above** the `for` loop at `:233`, replace `issuedAt: new Date()` (`:259`) with `issuedAt`, and replace `:260` with the same three-way ternary as E1 |
| E3 | `src/services/redeemables/CampaignService.ts:442-470` | Keep `ensureActiveCampaignIssuancesForUser(userId)` as-is externally (sweeps all live campaigns, **never** passes `trigger`) but have it call the new `createIssuanceForUser` and count `outcome === "minted"`. Return `{ issuedCount, issued: StampedIssuance[] }` — additive, so `RedeemablesWalletService.ts:51` needs no change |
| E4 | `src/services/redeemables/CampaignService.ts` (new, after `:470`) | **`static async ensureCampaignIssuanceForUser(params: { userId: string; campaignCode: string; trigger: BonusCodeTrigger }): Promise<StampedIssuanceResult>`** — the single entry point for all three triggers. Loads the user with the same projection as `:449`, resolves **one** campaign by `{ code, isActive: true, startsAt: { $lte: now }, $or: [{ neverExpires: true }, { endsAt: { $gte: now } }] }` (`endsAt` stays here — mechanism rule 8), runs `isUserEligibleForCampaign`, then `createIssuanceForUser(..., { trigger })`. Never throws: wrap and return `{ outcome: "not_applicable" }` on error after a `console.error` |
| E5 | `src/services/redeemables/CampaignService.ts:307-386` | In `isUserEligibleForCampaign`, first line of the body: `if (typeof campaign.validForDays === "number" && !options?.trigger) return false;` (thread an `options` param through from `:462`). **This is the leak defence.** `"all-active-subscribers"` returns a bare `hasActiveSubscription` (`:337-339`), so without it every active member who opens their rewards wallet self-enrols into the trigger campaign and burns their lifetime grant |
| E6 | `src/services/redeemables/RedemptionService.ts:206-211` | Add `$min: { redeemedEverAt: now }` alongside the existing `$set` in the atomic claim. `$min` writes a missing field and preserves the **first** value on an existing one — exactly the audit semantics wanted. **Do not** widen the filter |
| E7 | `src/services/redeemables/RedemptionService.ts:278` | Add a comment on the `$unset: { redeemedAt: 1 }` line: *"NEVER add redeemedEverAt here — it is the permanent 'this grant is spent' marker that stops a refund resetting a one-per-lifetime code."* No code change; `redeemedEverAt` already survives by construction |

### Phase F — the four truncation sites (mechanism rule 7)

Define once, wherever the campaign is in scope:
```ts
const personalWindowGoverns = typeof campaign.validForDays === "number" && campaign.validForDays >= 1;
```

| # | File:line | Change |
|---|---|---|
| F1 | `src/services/redeemables/RedemptionService.ts:174-177` | `campaign.isActive && campaign.startsAt <= now && (campaign.neverExpires \|\| personalWindowGoverns \|\| (campaign.endsAt ? campaign.endsAt >= now : false))`. `isActive` and `startsAt` stay unconditional |
| F2 | `src/services/redeemables/RedemptionService.ts:71-76` | The by-code campaign resolve is a **Mongo query**, so add the leg to the `$or`: `$or: [{ neverExpires: true }, { endsAt: { $gte: now } }, { validForDays: { $gte: 1 } }]`. Without this, a **global**-mode issuance (no `code` on the row — `CampaignService.ts:239-242`) is unreachable once `endsAt` passes, and the customer is told `invalid_code` (`:79`), i.e. *"we never gave you this"*, not *"you missed the window"* |
| F3 | `src/services/redeemables/RedemptionService.ts:187` | `hasQualifyingPurchase(user, personalWindowGoverns ? { startsAt: campaign.startsAt, endsAt: null } : campaign, purchaseReq, now)`. `endsAt: null` makes the util's ceiling `now` (`purchase-eligibility.ts:52`). **Do not widen it for non-`validForDays` campaigns** — that leg was hardened deliberately (comment at `RedemptionService.ts:182-185`). Mirror the identical call at `RedeemablesWalletService.ts:84` |
| F4 | `src/app/api/codes/validate/route.ts:103-110` | Add `{ validForDays: { $gte: 1 } }` to the `$or`; add `startsAt endsAt neverExpires validForDays` to the `.select()` at `:109`; and when `personalWindowGoverns && params.userId`, look up the caller's own row and return `{ valid: false, message: "This code expired on <formatExpiryLabelAEST(expiresAt)>." }` when `expiresAt <= now`. **This gate fires first, at checkout** — fixing only F1 yields a coupon the server would honour but checkout calls "Invalid campaign code". With no `userId` (guest checkout — `inviteeUserId` is optional, `:11`), fall back to the campaign window: this route is an unauthenticated **preview**; redemption stays authoritative |

### Phase G — the Klaviyo emit

| # | File:line | Change |
|---|---|---|
| G1 | `src/utils/integrations/klaviyo/klaviyo-events.ts:960` (after `createStartedCheckoutEvent`) | New builder, following the POST-2026-05 canonical conventions block at `:816-831`: <br>`export function createBonusCodeIssuedEvent(user: IUser, data: { code: string; entriesAmount: number; issuedAt: Date; expiresAt: Date; trigger: BonusCodeTrigger }): KlaviyoEvent` returning `{ event: "Bonus Code Issued", customer_properties: getCustomerProperties(user), properties: { user_id, code, entries_granted: data.entriesAmount, issued_at: data.issuedAt.toISOString(), expires_at: data.expiresAt.toISOString(), expires_at_label: formatExpiryLabelAEST(data.expiresAt), trigger: data.trigger } }`. **`expiresAt` is a parameter. The builder must never call `new Date()` for it.** |
| G2 | `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts:28-63` | Add `"code"`, `"expires_at_label"`, `"trigger"` to `CANONICAL_KEYS`, and add an `assertCanonicalShape("Bonus Code Issued", sample.properties)` case. `expires_at` / `issued_at` pass via the `_at` pattern (`isCanonicalKey`, `:70-74`); `expires_at_label` does **not** and would fail `npm run test:klaviyo-canonical` |
| G3 | `docs/tracking/KLAVIYO_INTEGRATION.md:233-282` | Add the `Bonus Code Issued` property table beside `Viewed Giveaway` / `Started Checkout`, and the three new keys to the canonical table at `:200-213`. The test file's own instruction (`:10-12`) requires this in the same PR |
| G4 | `src/types/klaviyo.ts:160-170` | Add `unique_id?: string;` to `KlaviyoEvent` |
| G5 | `src/lib/klaviyo.ts:1779-1802` | Pass `...(formattedEvent.unique_id ? { unique_id: formattedEvent.unique_id } : {})` into the event `attributes`. The payload has **no** idempotency key today, and `"timeout"` is explicitly retryable (`:570`) with `MAX_RETRIES` 5 — so an accepted-but-slow POST is delivered up to five times |
| G6 | new, `src/services/redeemables/BonusCodeNotifier.ts` (or a private method on `CampaignService`) | The emit wrapper. **Awaited**, not fire-and-forget: <br>`const res = await klaviyo.trackEvent(createBonusCodeIssuedEvent(user, { … issuance }), { retryOnFailure: false });` — `trackEvent` cannot throw (its own catch returns `{ success: false }` at `klaviyo.ts:1836-1842`, which is why `trackEventBackground`'s entire error handler at `:1845-1878` is **dead code**), so the await is bounded by one request timeout. Then persist: `RedeemableIssuance.updateOne({ _id }, { $set: res.success ? { notifiedAt: new Date(), notifyError: null } : { notifiedAt: null, notifyError: res.error ?? "unknown" } })`. On failure also `console.error` (never `console.warn` — stripped in production by `next.config.ts` `compiler.removeConsole`). `unique_id: \`${issuanceId}:${expiresAt.toISOString()}\`` — same issuance + same deadline collapses to one event; a re-armed deadline is legitimately a new one. There is no job queue to lean on: `src/lib/jobs/job-runner.ts` exports `runJob` with **zero callers** in `src/` |
| G7 | same file | **Environment gate (B5).** `if (process.env.VERCEL_ENV !== "production") { console.error("[bonus-code] skipped mint+emit outside production", { userId, campaignCode, vercelEnv: process.env.VERCEL_ENV }); return; }` at the top of the trigger helper, mirroring `facebook-env.ts:8-11`. Scoped to this feature only — see §7 for the repo-wide fix |

### Phase H — trigger call sites

All three do the same three things: call `CampaignService.ensureCampaignIssuanceForUser`, and on `outcome === "minted" | "rearmed"` call the notifier with the **returned** `issuance.expiresAt`. All three are wrapped in `try/catch` that logs with `console.error` and continues.

| # | File:line | Change |
|---|---|---|
| H1 | `src/services/subscription/CancelSubscriptionService.ts:162` | Insert between `await user.save()` (`:151`) and the existing Klaviyo profile-sync `try` (`:163-167`), inside its own `try/catch` matching that shape. `user._id` is in scope. **Do not** name the event `"Subscription Cancelled"` — the comment at `:160-161` exists precisely to prevent API+webhook duplication |
| H2 | `src/services/subscription/switchTierPastDue.ts:127` + `src/app/api/admin/users/[id]/cancel-subscription/route.ts:62` | Both reach `cancelSubscription` and must be **excluded**: a past-due tier switch is not churn, and an admin-initiated cancel should not silently mint. Add `mintBonusCode?: boolean` to `CancelSubscriptionOptions` (`CancelSubscriptionService.ts:26-33`), default `false`, and set it `true` only on the member-initiated route |
| H3 | `src/app/api/auth/register/route.ts:130-167` | The guest checkout-start leg. Add the mint+emit inside `fireKlaviyoStartedCheckoutForGuestRegistration` (called at `:533`, `:672`, `:774`, `:938` — all four with a persisted user doc). The re-registration path is deliberate ("guest re-registers with a different package", comment `:531-534`) — the decision table's `"already_active"` branch handles it, returning the **stored** `expiresAt` so a re-send carries the original date, never a recomputed one |
| H4 | `src/utils/payment/payment-processing.ts:1394` | The one-time leg. Put it in the existing campaign block, gated on `packageData.packageType === "one-time"` and no active subscription, copying the surrounding non-blocking `try/catch` shape (`:1437-1443`). **Verified ordering:** the one-time and membership branches at `:1146-1149` are mutually exclusive and `handleOneTimePackage` never touches `user.subscription`, so `user.subscription.isActive` here is still the value loaded before `grantBenefits` — the membership-only ordering hazard does not apply |
| H5 | *(no server hook exists)* | The **authed** checkout-start emitters are client-only: `useMembershipCardCta.ts:171-201` and `MembershipSection.tsx:380`. Components cannot reach Mongo (layering rule). Either land the server-side move of Started Checkout first, or have the hook POST a small server endpoint. **Do not attempt enrolment from the client.** Flagged, not designed here |
| H6 | `src/app/api/cron/monthly-redeemables-issuance/route.ts:25` | `.filter((campaign) => campaign.monthKey === monthKey && !campaign.validForDays)` — mechanism rule 9 |
| H7 | `src/services/stripe-webhook-handlers/index.ts:4340-4343` | Gate `campaignCode` on `isInitialSubscriptionInvoice`, the way the adjacent A/B fields already are at `:4324` (comment `:4321-4323` explains exactly why). `campaignCode` is written to **subscription** metadata (`create-subscription/route.ts:486`, `:507`), so it persists for the subscription's life. Harmless today (row is `redeemed` → `already_redeemed`); under re-arm a renewal invoice months later would silently auto-redeem a freshly re-armed grant with no customer action |

### Phase I — customer-facing surfaces (so the last mile agrees)

| # | File:line | Change |
|---|---|---|
| I1 | `src/services/redeemables/RedeemablesWalletService.ts:9-27, :95` | Add `expiresAtLabel: string` to `RedeemableWalletItem` and populate it with `formatExpiryLabelAEST(issuance.expiresAt)` — the **same function** the email uses |
| I2 | `src/services/redeemables/RedeemablesWalletService.ts:65, :99, :101-102` | Add `isActive validForDays` to the campaign `.select()`; make `neverExpires` render fall back to the issuance value when `validForDays` is set; `&& Boolean(campaign) && (campaign.isActive !== false)` in `isRedeemableNow` so a deactivated or orphaned campaign cannot show an enabled Claim button that the server then refuses |
| I3 | `src/components/features/RedeemablesWallet.tsx:171` and `src/components/features/RewardsFloatingWidget.tsx:517-521` | Replace `new Date(item.expiresAt).toLocaleDateString()` with `item.expiresAtLabel`. Today this renders in the **viewer's** locale and timezone: the same instant reads `04/10/2026` (en-AU), `10/4/2026` (en-US — an en-US viewer reads *10 April*, six months wrong and in the **past**), `4.10.2026` (de-DE). Two copies exist; both must change or they disagree with each other as well as the email |
| I4 | `src/hooks/queries/useRedeemablesQueries.ts:16-20` | Add `expiresAtLabel?: string` to the client `RedeemableWalletItem` type |
| I5 | `src/app/api/redeemables/status/route.ts:38-68` | Add `validForDays` to the `activeCampaigns` / `activeCampaign` projections and `expiresAtLabel` to `latestIssuance`. Note in the code that `activeCampaigns.endsAt` is **not** the customer's deadline once `validForDays` is set — the UI must not render it as one |
| I6 | `src/app/api/redeemables/redeem/route.ts:44-47` | Map `result.reason` to human copy. `campaign_not_active` is the raw string a personal-window customer sees today; after F1 that case disappears for `validForDays` campaigns, and `expired` should name the date |

### Phase J — docs (hook-enforced)

| # | File | Change |
|---|---|---|
| J1 | `docs/rewards-redeemables/models.md:12` | Fix `expiresAt?` → required (`RedeemableIssuance.ts:81-85` says `required: [true, …]`); document `validForDays`, `redeemedEverAt`, `firstIssuedAt`, `notifiedAt` |
| J2 | `docs/rewards-redeemables/gotchas.md:50-53` | Update *"expiresAt copied at issue time"*; add: the re-arm decision table, the `status: "expired"` dead-enum trap, the `endsAt`-must-outlive-the-flow operational rule, and that a deactivated campaign does **not** pause a live personal clock |
| J3 | `docs/tracking/KLAVIYO_INTEGRATION.md` | G3 |
| J4 | `docs/internal-norm/norm-context.md` | D7 |
| J5 | `CUSTOMER.md` | Rule 5b triggers: what customer data goes to Klaviyo changed, and a perk's expiry semantics changed |
| J6 | `BUSINESS.md` | Rule 5 triggers (hook-enforced via `BUSINESS_TRIGGER_GLOBS`): the promo/upsell-adjacent bonus-entry model gained a per-customer window |
| J7 | `src/data/supportChatFaqs.ts` + `npm run build:chat-knowledge-pack` + `npm run test:chat-faqs` | Rule 5c: "how long do I have to use my code?" is now a customer-visible mechanic Cobber must answer correctly. Bump the count assertion in `src/data/__tests__/faqs.test.ts` deliberately. Rule 11: *free entries included with the pack*, never "buy entries", never "odds/chances" |

---

## 5. Test list (repo convention: standalone `tsx` script + its own `package.json` entry)

There is **zero** existing coverage for any of this. `src/services/redeemables/__tests__/redeemables.test.ts` is 34 lines and never imports `RedemptionService`. Do not change a money-adjacent window conditional without these.

| Script | File | Asserts |
|---|---|---|
| `test:bonus-code-expiry` | `src/utils/common/__tests__/expiry-window.test.ts` | `endOfDayAESTAfterDays(from, 14)` returns exactly a 14-calendar-day Sydney span for: **2026-09-20 23:30 AEST → 4 Oct** (spring-forward; the naive-instant version gives 15), **2026-03-25 00:30 AEDT → 8 Apr** (fall-back; naive gives 13), the ambiguous repeated hour **2026-04-05 02:30**, year rollover **2026-12-31 23:30 → 2027-01-14**, leap day **2028-02-15 → 2028-02-29**. Stored value ends `:59.999`. `formatExpiryLabelAEST` returns **AEDT** for `2026-10-04T12:59:59.999Z` and **AEST** for `2026-04-08T13:59:59.999Z`. Fixtures are ready-made — the §2 probe output is the expected table |
| `test:bonus-code-rearm` | `src/services/redeemables/__tests__/rearm-policy.test.ts` | The §3 decision table as a **pure** function extracted from `createIssuanceForUser` (`decideRearm(row, now, hasTrigger)`), so it runs with no DB. Every row of the table, plus: a row with `redeemedEverAt` and `status: "active"` (the refunded case) resolves to `spent`; `status: "expired"` is never used as an input |
| `test:bonus-code-window` | `src/services/redeemables/__tests__/campaign-window.test.ts` | The four F-site predicates as pure functions: `validForDays` unset ⇒ **byte-identical** verdicts to today at every site; `validForDays` set ⇒ `endsAt` in the past no longer vetoes, while `isActive: false` and `startsAt > now` still do |
| `test:redeemables-purchase-gate` (existing, `package.json:114`) | `src/utils/redeemables/__tests__/purchase-eligibility.test.ts` | Extend: `{ startsAt, endsAt: null }` ceiling is `now`, so a qualifying purchase made after `campaign.endsAt` passes for a personal-window campaign and still fails for a fixed-end one |
| `test:klaviyo-canonical` (existing, `package.json:285`) | `.../canonical-events-shape.test.ts` | Add the `Bonus Code Issued` case (G2). Also assert the builder emits the **passed** `expiresAt`, not a fresh one: call it twice with the same `expiresAt` a tick apart and assert identical `expires_at` and `expires_at_label` |
| manual, pre-merge | — | Preview deploy: trigger a mint and confirm the console line from G7 fires and **no** Klaviyo event is emitted |

---

## 6. Explicitly out of scope

| Item | Why |
|---|---|
| Which moment is "cancel-click" (retention-flow start, `cancellation-flow/route.ts:105-118`, vs. the cancellation commit, `CancelSubscriptionService.ts:125-126`) | A product decision — the two select different populations (a member saved by a retention offer hits the first, never the second). The mechanism is identical either way; H1/H2 give the contract. **Needs an answer before H1 lands.** |
| The code values, entry amounts, campaign copy, email design | Named out of scope in the brief |
| `getMonthKey` deriving months from **UTC** (`CampaignService.ts:10-14`) | Real bug — the cron is blind for the first ~10 h of every Sydney month and mislabels New Year's Day — but it is a separate concern that changes the meaning of every stored `monthKey`. H6 removes trigger campaigns from the cron, so it cannot affect this feature. **File it.** |
| The refund double-reversal: `campaignEntries` is inside `legacyTotalEntries` (`refund-ledger-reversal.ts:~24-32` → step `accumulatedEntriesAndRewardsPoints`) **and** `unredeemMonthlyCouponRedemption` `$inc`s `-entriesAmount` again (`RedemptionService.ts:285`) plus an **unscoped** `removeMajorDrawEntries` (`:291`) — the exact path the file's own comment at `:98-101` says "over-removed entries from prior months' draws and silently corrupted historical totals" | Live today, independent of expiry, and `redeemedEverAt` means a refunded row never re-arms, so this design does not worsen it. Fix = delete `:285` and `:290-291`, leaving only the status restore (compare the sibling `PromoRedemptionService.ts:125-130`, which correctly touches only its own doc). **File it as high priority.** |
| The unchecked `DrawGrantService.grantMonthlyCouponEntries` return at `RedemptionService.ts:234` (boolean discarded; the streak path at `:378-411` compensates, this one does not) | Adjacent, pre-existing. A redemption during a draw freeze burns the coupon and grants zero entries. **File it.** |
| Pausing a personal clock while a campaign is toggled inactive | Speculative machinery for a rare admin action. Instead: I2 disables the Claim button honestly, and J2 documents that the clock keeps running |
| Admin per-campaign funnel (`mintedCount` / `activeCount` / `expiredUnredeemedCount` / `notifiedCount`) and a per-user issuance lookup | Both rollups filter `status: "redeemed"` (`MonthlyCouponQueryService.ts:80-82`, `RedemptionAnalyticsService.ts:38-41`) and `RedeemableIssuance` appears in **zero** admin files. **Highest-value follow-up** — this branch writes `notifiedAt`, and until the funnel exists, reading it is a hand-written Mongo query |
| Repo-wide `getKlaviyoConfig` env fix (derive mode from `VERCEL_ENV`, prefix `[DEV]` on `!isLiveEnv`) | Correct, one line, and matches `facebook-env.ts:8-11` — but it changes behaviour for **all 28** emitters at once. G7 gates this feature narrowly. **Raise the repo-wide change as its own decision.** |
| `MilestoneIssuance` / `MilestoneReward` | No `validForDays` there; they flow into the same wallet list and redeem endpoint but are a separate rail |

---

## 7. Naming

`validForDays` does not exist anywhere in the codebase (grepped). The closest precedent for an N-day window is `PromoLink.eligibilityRules.cancelledWithinDays` (`src/models/PromoLink.ts:27`). **Coining `validForDays`** as the single term — used identically across all 12+ declaration sites above. `BonusCodeTrigger = "cancel-click" | "checkout-start" | "one-time-purchase"` is also coined; keep it in one exported type in `CampaignService.ts` and reuse it verbatim in the Klaviyo builder. Per CLAUDE.md, flag both to DJ before they are written into that many files.