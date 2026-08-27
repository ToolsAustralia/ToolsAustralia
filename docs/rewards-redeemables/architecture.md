# Rewards-Redeemables — Architecture

## Two systems in one domain

### Redeemables (wallet-based)

Users earn redeemable items via campaigns and draws. Each issuance is a `RedeemableIssuance` row tied to the user. Users redeem via the `/rewards` page; the redemption updates the issuance status.

### Milestones (tier achievements)

`MilestoneReward` defines tiers (config); `MilestoneIssuance` records when a user achieved a tier. Achieving a tier may auto-issue redeemables.

## Service layout ([src/services/redeemables/](../../src/services/redeemables/))

| Service | Role |
|---|---|
| `RedeemablesWalletService.ts` | The wallet — list user's redeemables, balances, status. |
| `RedemptionService.ts` | The redeem action — burn the issuance, fulfill the reward. |
| `CampaignService.ts` | Campaign-level grants (e.g. "all top-10% members in March get X"). |
| `DrawGrantService.ts` | Draw-tied grants (e.g. winner-of-draw redeemables). |
| `TargetingService.ts` | Audience filtering — who is eligible for a campaign? |
| `RedemptionAnalyticsService.ts` | Reporting on redemptions. |
| `CsvImportService.ts` | Bulk import of redeemables (admin tool). |

Cross-domain helper: [campaignAudienceFilter.ts](../../src/utils/redeemables/campaignAudienceFilter.ts), [topMajorDrawPercentile.ts](../../src/utils/redeemables/topMajorDrawPercentile.ts), [cancellation-upsell-eligibility.ts](../../src/utils/redeemables/cancellation-upsell-eligibility.ts), [purchase-eligibility.ts](../../src/utils/redeemables/purchase-eligibility.ts) (purchase-gated coupon predicate, shared by redeem + wallet).

## Lifecycle

```
[Campaign run] → TargetingService picks users → CampaignService writes RedeemableIssuance per user
                                                          │
                                                          ▼
                                               User sees in /rewards (RedeemablesWalletService reads)
                                                          │
                                                          ▼
                                              User clicks redeem → RedemptionService runs
                                                          │
                                                          ▼
                                       Issuance.status = "redeemed"; reward delivered (varies by type)
```

## Per-customer anchored expiry (bonus-entry codes)

A campaign carrying `validForHours` hands **each customer their own window**: the code dies N hours after
*that* customer's code was issued, not N hours after the admin created the campaign. The anchor is the
instant the **Klaviyo flow's webhook fires**, immediately before the discount email — not the earlier moment
the customer qualified, which the nurture sequences trail by 2.5–17 days. Two mint paths exist and they are
deliberately asymmetric:

```
TRIGGER PATH  (cancel-click | checkout-start | one-time-purchase)
  Klaviyo flow, one step above the discount email
    → POST /api/bonus-codes/v1/issue                            ← owns 100% of its own auth
        → production assertion → shared secret → daily mint budget
        → Zod → resolveBonusCodeCustomer({ userId?, email? })    ← identity_conflict when the two
                                                                   disagree: audited + console.error,
                                                                   answered 200 like every other
                                                                   customer-state outcome (api.md)
        → mintBonusCodeForTrigger(user, trigger)                 ← the mint-and-email orchestration
        → CampaignService.ensureCampaignIssuanceForUser({ userId, campaignCode, trigger })
             → resolve campaign by code (endsAt still gates MINTING)
             → isUserEligibleForCampaign(..., { trigger })     ← leak defence passes only WITH a trigger
             → createIssuanceForUser(..., { trigger })          ← mints / re-arms, stamps expiresAt
             → returns StampedIssuanceResult { outcome, issuance? }

SWEEP PATH    (every rewards-wallet read)
  RedeemablesWalletService.getUserWallet → CampaignService.ensureActiveCampaignIssuancesForUser(userId)
             → isUserEligibleForCampaign(..., no trigger)      ← leak defence REFUSES validForHours campaigns
             → legacy (endsAt / neverExpires) campaigns only
```

### Expiry precedence chain

`resolveIssuanceExpiry(campaign, issuedAt)` in [CampaignService.ts](../../src/services/redeemables/CampaignService.ts)
is the single stamp site. Precedence:

| # | Condition | `expiresAt` |
|---|---|---|
| 1 | `personalWindowGoverns(campaign)` (i.e. `validForHours >= 1`) | `expiryAfterHours(issuedAt, validForHours)` — exact epoch-millisecond offset, no calendar/timezone involved |
| 2 | `campaign.neverExpires` | `9999-12-31T23:59:59.999Z` sentinel |
| 3 | otherwise | `campaign.endsAt` (legacy shared window) |
| — | none of the above | `null` ⇒ `outcome: "not_applicable"`, nothing written |

A third path, `issueCampaignToUsers` (the admin/cron bulk issue), stamps through the same resolver but is
**refused outright** for a personal-window campaign when the caller is the cron — it has no trigger gate of
its own, so it would otherwise mass-mint the whole subscriber base. See [gotchas.md](./gotchas.md) trap 6b.

`validForHours` wins over `neverExpires` because a personal window is the whole point of a trigger campaign;
the pair is rejected at the zod boundary and in the model's `pre("save")`, so rule 1 vs 2 should never
actually contend. The predicate is **imported** from `bonus-code-policy.ts`, never inlined — every
truncation site in the codebase must agree on what "personal window" means.

**Field renamed `validForDays` → `validForHours` (2026-08-26, bonus-code-webhook-rework).** The window is
now an **exact hour count measured from the issuing instant** (see `expiryAfterHours` below), not a count of
whole Sydney calendar days snapped to 23:59:59.999. The rename is **complete** across all three classes of
site:

- **Typed** (`tsc` catches these): the `MonthlyEntryCampaign` model, `bonus-code-policy.ts`'s
  `personalWindowGoverns`/`isCampaignRedeemable`, `CampaignService.ts`, both admin campaign API routes, the
  cron issuance route, `MonthlyCouponQueryService`, the Norm Zod schema + route, and the two admin UI
  components.
- **`.select()` projections** (`tsc` is blind — a missing field reads back `undefined` with no error):
  `RedeemablesWalletService`, `MonthlyCouponQueryService`, `CampaignCodeValidationService`, and
  `CampaignService.updateCampaign`'s merged-state guard.
- **Mongo query legs** (worse than a projection — a stale key matches **zero documents forever**, so live
  personal-window codes stop working with no error anywhere): the `{ validForHours: { $gte: 1 } }` `$or`
  leg in both `RedemptionService` and `CampaignCodeValidationService`, plus the `$unset`/`delete` clearing
  keys in `CampaignService.updateCampaign`.

When touching this field, **grep for the string literal, not the identifier** — the last two classes are
invisible to the compiler. The temporary `isPersonalWindowCampaign()` bridge that once lived in
`CampaignService.ts` has been deleted; all four of its call sites now import `personalWindowGoverns`
directly, so there is exactly one definition of "personal window" again.

### Re-arm decision table

`decideRearm(row, now, hasTrigger, firstIssuedAt?)` ([bonus-code-policy.ts](../../src/utils/redeemables/bonus-code-policy.ts))
classifies the existing row before anything is written. `createIssuanceForUser` then acts on the outcome:

| Existing row | `hasTrigger` | `firstIssuedAt` vs now | Outcome | What is written |
|---|---|---|---|---|
| none | any | — | `minted` | atomic upsert; stamps `issuedAt`, `firstIssuedAt`, `expiresAt` |
| `redeemedEverAt` set (or status `redeemed`/`cancelled`) | any | any | `spent` | nothing — one grant per person, **ever**, regardless of cooldown |
| `expiresAt > now` | any | any | `already_active` | nothing; the **stored** stamp is returned |
| `expiresAt <= now` | `false` | any | `expired_no_rearm` | nothing — unchanged from before the cooldown existed |
| `expiresAt <= now` | `true` | within `REARM_COOLDOWN_DAYS` (default 30) | `expired_no_rearm` | nothing |
| `expiresAt <= now` | `true` | absent, or `>= REARM_COOLDOWN_DAYS` ago | `rearmed` | new `issuedAt`/`expiresAt`, `notifiedAt`/`notifyError` cleared; `firstIssuedAt` preserved |

**Why the cooldown (4th param) exists.** The Klaviyo webhook that replaced the three internal triggers on
2026-08-26 (see the bonus-code-webhook-rework spec) always supplies a trigger on every call, so the
`hasTrigger` gate alone can no longer refuse a re-arm — a late retry, a flow re-entry, or the marketing team
re-running a flow would silently hand out a second full window and a second email. `firstIssuedAt` is
preserved across every re-arm specifically so this question is answerable: `decideRearm` refuses to re-arm
within `REARM_COOLDOWN_DAYS` of it. The boundary is strictly exclusive on the cooldown's END the same way the
`expiresAt` check is strictly exclusive — at the instant the cooldown ends, the re-arm is already allowed.
When `firstIssuedAt` is not supplied at all, there is nothing to enforce the cooldown against and the
pre-cooldown `"rearmed"` behaviour stands; the caller is expected to fall back to the row's `issuedAt` for a
legacy row that predates the `firstIssuedAt` field (`decideRearm` itself has no notion of `issuedAt`).

**Wired 2026-08-26 (Task 2 of bonus-code-webhook-rework).** `CampaignService.ts`'s `createIssuanceForUser`
now passes `existing?.firstIssuedAt ?? existing?.issuedAt` as `decideRearm`'s 4th argument — the fallback to
`issuedAt` lives at the call site (not inside `decideRearm`, which has no notion of `issuedAt` at all), so a
legacy row minted before `firstIssuedAt` existed still has something to anchor the cooldown against. The
`existingRow` query already projects both fields (`.select("... issuedAt firstIssuedAt")`), so no query
change was needed to wire this.

Every outcome returns the row **as persisted** (`StampedIssuance`), because the persisted instant is the one
the redemption gate compares against and the one every rendered copy of the deadline derives from.

**Rationale corrected 2026-08-26 — the rule survived, both of its old reasons did not.** This used to read
"the Klaviyo 'Bonus Code Issued' email must print the stored instant … a sub-second gap across Sydney
midnight prints a deadline a full calendar day off". No email prints it at all (a Klaviyo flow email renders
against its own trigger metric, so the three discount templates cannot read `expires_at_label` off that
event), and the midnight cliff belonged to the calendar-day model — `expiryAfterHours` removed it. The
surviving reason is the re-arm: a **re-arm moves this instant**, so a caller recomputing `now +
validForHours` against a row it did not just write can be a whole **72-hour window** away from what
redemption enforces. See the header comment in
[CampaignService.ts](../../src/services/redeemables/CampaignService.ts) and
[testing.md](./testing.md) §2.

### `StampedIssuanceResult.outcome` — which outcomes are retryable

`ensureCampaignIssuanceForUser` is the entry point the incoming Klaviyo bonus-code webhook (spec
2026-08-26-bonus-code-webhook-rework, §9) delegates to, and that endpoint answers Klaviyo with an HTTP
status that decides whether Klaviyo **retries** the call. The outcome union is what the endpoint's status
map is built on, so its retryable/permanent split is load-bearing and must not drift silently:

```ts
interface StampedIssuanceResult {
  outcome: RearmOutcome | "not_applicable" | "error";
  issuance?: StampedIssuance;
}
// RearmOutcome = "minted" | "rearmed" | "already_active" | "spent" | "expired_no_rearm"
```

| Outcome | Meaning | Retryable? |
|---|---|---|
| `minted` | First-ever grant for this person. | n/a — succeeded |
| `rearmed` | A lapsed window was reopened (outside the re-arm cooldown). | n/a — succeeded |
| `already_active` | A live window already exists. | **No.** The customer already holds a working code; retrying changes nothing. |
| `spent` | `redeemedEverAt` is set — one grant per person, for life. | **No.** Permanent by design. |
| `expired_no_rearm` | Lapsed, but no trigger, or still inside `REARM_COOLDOWN_DAYS`. | **No.** Not a transient failure — it is the policy working as intended. |
| `not_applicable` | Invalid `userId`, no campaign carries the code, user missing/inactive, or the user is ineligible for this campaign. | **No.** All six causes are permanent for the lifetime of this request — none of them resolve themselves on a retry. |
| `error` | **Added 2026-08-26 (C1, Task 2).** The catch-all in `ensureCampaignIssuanceForUser` — a transient failure (a DB blip, an unexpected throw) that a retry genuinely might recover from. | **Yes.** This is the ONE outcome a retry can help. |

**Why `error` had to be split out of `not_applicable` (C1, the blocker this task existed to clear).** Before
this change, the catch-all at the bottom of `ensureCampaignIssuanceForUser` returned the same
`not_applicable` value as six genuinely permanent no-ops (invalid ObjectId, no campaign, user missing/inactive,
ineligible, unresolvable expiry). A caller — specifically the webhook endpoint — had no way to tell "nothing
to do here, don't retry" apart from "the database blinked, please retry." Since the endpoint answers Klaviyo
*before* Klaviyo sends the discount email, collapsing those two meant every infrastructure blip permanently
lost a customer's grant while the email was already in flight, with no signal anywhere. Getting this split
backwards is worse than not doing it at all: a permanent condition mapped to a retryable status creates a
retry storm for no benefit, and a transient one mapped to a permanent status loses the grant for good. **Only
the catch-all changed** — all six pre-existing `not_applicable` returns are correct as-is and were
deliberately left alone; they were verified individually, not renamed on the assumption that "collapsed into
one value" meant "all wrong."

**The one exception, made loud rather than silent:** the "no active campaign carries this code" path
(`not_applicable`, unchanged) now also `console.error`s (`"[bonus-code] no active campaign for code"`,
naming the code). Under the pre-webhook model this was a documented **benign** inert state — the feature
being off until an admin created a campaign. Under the webhook model it is a **launch-configuration error**:
someone switched a Klaviyo flow on before the matching campaign existed, silently sending customers discount
emails carrying a code that will never work. The status is unchanged (a retry cannot conjure a missing
campaign), but this is the cheapest early warning available, and `console.error` survives Vercel's
`removeConsole` (unlike `log`/`info`/`debug`/`warn`).

## Exact-hours expiry (`expiryAfterHours`)

[`bonus-code-policy.ts`](../../src/utils/redeemables/bonus-code-policy.ts) also exports
`expiryAfterHours(from, hours)` — epoch-millisecond arithmetic (`from.getTime() + hours * 3600 * 1000`), no
timezone conversion of any kind. It replaced a calendar-day, Sydney-midnight-snapping helper that used to
live in `src/utils/common/timezone.ts`, now that the webhook model anchors a code's expiry on the instant
Klaviyo calls rather than on the customer's own eligibility moment. **Wired 2026-08-26**:
`resolveIssuanceExpiry`'s personal-window branch in `CampaignService.ts` calls
`expiryAfterHours(issuedAt, campaign.validForHours)`, and the old calendar-day helper has been **deleted**
outright — it had exactly one caller and one test, both replaced. `createAESTDateAsUTC`,
`getAESTAbbreviation` and `formatExpiryLabelAEST` in that file are unrelated and all survive.

DST-safe **by construction**, not by any DST-aware logic: DST is a property of how an instant is *projected*
onto the Sydney calendar for display, not a property of the timeline the two instants sit on, so subtracting
or adding milliseconds between two `Date`s can never be affected by which side of a transition either one
falls on. The one visible consequence — deliberately kept, not a bug — is that the *rendered wall-clock hour*
of the expiry can shift by exactly one hour across a DST transition (a Friday 2:00pm AEST issuance expires
Monday 3:00pm AEDT); the *elapsed* time is always exactly the requested number of hours. See
[`expiry-hours.test.ts`](../../src/utils/redeemables/__tests__/expiry-hours.test.ts) for both a spring-forward
and a fall-back case pinned this way. Do not re-apply the old `.setUTCSeconds(59, 999)` compensation here —
that existed only to counteract `createAESTDateAsUTC` hardcoding seconds to `:00`, which does not apply to an
already-millisecond-precise offset.

## Refund integration

When a payment that granted redeemables is refunded:
1. Refund webhook → `processRefundReversal` ([payment](../payment/architecture.md)).
2. `buildLedgerReversalSteps` ([refund-ledger-reversal.ts](../../src/utils/payment/refund-ledger-reversal.ts)) registers one named step per grant kind and runs them through the generic orchestrator in `src/utils/payment/reversers/`.
3. The redeemables steps claw back grants tied to the payment — **redeemed or not**: milestone issuances are revoked (redeemed ones un-redeemed first, removing their granted entries and draw entries), and a coupon/milestone redemption consumed on the refunded purchase is un-redeemed.

Redeemed value is reclaimed automatically, not written off — only reversal steps that **fail** appear in `RefundProcessed.data.reversalIssues[]` for admin attention.

## Pause behaviour

(Migrated from `docs/rewards-pause.md`.)

> _TODO: read root `docs/rewards-pause.md` and merge here. Brief: rewards can be paused per user (e.g. abuse) without revoking existing issuances._

## Prize catalog

(Migrated from `docs/prize-catalog.md`.)

> _TODO: read root `docs/prize-catalog.md` and merge here. Brief: prize catalog config and how the UI consumes it._

## Cross-domain integration

- **[draws](../draws/)**: `DrawGrantService` is invoked when a draw winner is declared.
- **[promo](../promo/)**: campaign multipliers can reference redeemable types.
- **[payment](../payment/)**: reversers handle refund.
- **[upsell](../upsell/)**: `cancellation-upsell-eligibility.ts` decides who gets the cancel-upsell offer (uses redeemable history).
