# Rewards-Redeemables — Backend

## Services ([src/services/redeemables/](../../src/services/redeemables/))

| Service | Responsibility |
|---|---|
| `RedeemablesWalletService.ts` | Read user wallet (active issuances, history, balances). Sets each campaign coupon's `isRedeemableNow` — gates purchase-required coupons via `hasQualifyingPurchase(...)` (loads user `subscription` + `oneTimePackages`), mirroring `RedemptionService` so the "Claim" button matches the redeem endpoint; ALSO requires the campaign to exist and `isActive !== false` (Task 10, 2026-08-25 — a deactivated/orphaned campaign must not show an enabled Claim button the server then refuses). Every wallet item carries `expiresAtLabel` (see below). |
| `RedemptionService.ts` | Execute redemption: validate, atomic burn, fulfillment hand-off. Purchase-gated coupons are enforced with `hasQualifyingPurchase(...)` before the burn (returns `ineligible` otherwise). |
| `CampaignService.ts` | Run a campaign: target users, write `RedeemableIssuance` rows. Owns the single expiry stamp site (`resolveIssuanceExpiry`) and both mint paths — see [CampaignService mint surface](#campaignservice-mint-surface). |
| `DrawGrantService.ts` | Issue redeemables tied to draw outcomes (winners, top-percentile). |
| `TargetingService.ts` | Audience selection helpers — segments, filters, percentile. |
| `RedemptionAnalyticsService.ts` | Aggregate redemption analytics for admin dashboards. |
| `CsvImportService.ts` | Bulk CSV import for admin (large campaigns). |
| `BonusCodeNotifier.ts` | Emits the "Bonus Code Issued" Klaviyo event for a `StampedIssuance` and persists the outcome (`notifiedAt` / `notifyError`). See [BonusCodeNotifier — the Klaviyo emit](#bonuscodenotifier--the-klaviyo-emit). |
| `mintBonusCodeForTrigger.ts` | **The service the Klaviyo bonus-code webhook delegates to** (`POST /api/bonus-codes/v1/issue` is its only caller — see [api.md](./api.md#post-apibonus-codesv1issue--the-klaviyo-bonus-code-webhook)). `mintBonusCodeForTrigger(user, trigger)` — resolves the code from `BONUS_CODE_BY_TRIGGER`, mints/re-arms, notifies on `minted`/`rearmed` only, never throws, and **returns the `StampedIssuanceResult`** so the route can map the outcome to a status. Owns the production gate (below). Kept as a service rather than inlined into the handler: a route handler must not orchestrate a mint-and-email. |
| `index.ts` | Re-exports for clean imports. `BonusCodeNotifier` and `mintBonusCodeForTrigger` are deliberately NOT re-exported here — the webhook route imports `@/services/redeemables/mintBonusCodeForTrigger` directly, and nothing outside this folder should reach `BonusCodeNotifier`. |

## Utilities ([src/utils/redeemables/](../../src/utils/redeemables/))

| File | Purpose |
|---|---|
| `campaignAudienceFilter.ts` | Pure-policy filter — given a user, does this campaign apply? |
| `topMajorDrawPercentile.ts` | "Top N%" computation across major-draw participants. |
| `cancellation-upsell-eligibility.ts` | Decides who gets the cancel-upsell offer based on redeemable history. |
| `purchase-eligibility.ts` | Pure predicate `hasQualifyingPurchase(user, campaign, requirement, now)` — resolves a campaign's `purchaseRequirement` (`"none"` \| `"membership"` \| `"one-time"` \| `"any"`) against the user's active subscription and in-window `oneTimePackages`. The single source of truth shared by the redeem endpoint and the wallet's `isRedeemableNow`. |
| `bonus-code-policy.ts` | Pure policy for per-customer bonus-code issuances (no DB, no ambient clock — `now` is always injected). `decideRearm(row, now, hasTrigger, firstIssuedAt?)` returns `"minted" \| "rearmed" \| "already_active" \| "spent" \| "expired_no_rearm"`. Four rules are load-bearing: (1) `redeemedEverAt` is a **permanent** "this grant is spent" marker — a refund restores `status: "active"` and `$unset`s `redeemedAt`, so without `redeemedEverAt` a refunded row would be indistinguishable from a never-redeemed one and "one grant per person, ever" would silently become "one grant per refund cycle"; wins over the cooldown too, a spent grant stays spent; (2) the live-window test keys off `expiresAt`, **never** off `status: "expired"` — no code path in this repo writes that status, so a predicate matching the status string would match zero documents forever, silently; (3) re-arming a lapsed window requires an explicit `hasTrigger` — the wallet read path sweeps active campaigns on every load, so without this gate opening `/my-account` would re-arm (and eventually burn) a lifetime grant, and this rule is checked **before** the cooldown so the no-trigger outcome is byte-identical regardless of `firstIssuedAt`; (4) **the re-arm cooldown** — even with a trigger, a re-arm is refused for `REARM_COOLDOWN_DAYS` (exported const, default 30) after `firstIssuedAt`. The cooldown exists for the incoming Klaviyo webhook model, where the caller always supplies a trigger, so rule 3 alone can no longer refuse a replay (a late retry, a flow re-entry) — see [architecture.md](./architecture.md#re-arm-decision-table), and it is now wired: `CampaignService.ts`'s `createIssuanceForUser` passes `existing?.firstIssuedAt ?? existing?.issuedAt` as the 4th argument. Also exports `expiryAfterHours(from, hours)` — plain epoch-millisecond arithmetic (`from.getTime() + hours * 3600 * 1000`), DST-safe by construction because DST affects only the *display* projection of an instant, never the distance between two instants. It replaces the calendar-day `endOfDayAESTAfterDays` and is now wired into `resolveIssuanceExpiry` — see [architecture.md](./architecture.md#exact-hours-expiry-expiryafterhours). Also exports `personalWindowGoverns(campaign)` (true when `campaign.validForHours >= 1`, meaning the campaign hands each customer their own expiry window rather than a shared one) and `isCampaignRedeemable(campaign, now)`, which consumes it: `isActive` and `startsAt` always gate redemption, but `endsAt` gates only legacy (non-`validForHours`) campaigns — once a campaign hands out personal windows its `endsAt` is a *minting* backstop, not a redemption deadline, so letting it veto here would cut a customer's emailed deadline short. **Renamed `validForDays` → `validForHours` (2026-08-26, bonus-code-webhook-rework)** — complete across every consult site, including the untyped `.select()` projections and Mongo query legs; the temporary `isPersonalWindowCampaign()` bridge in `CampaignService.ts` has been deleted and all four call sites import `personalWindowGoverns` directly. See [architecture.md](./architecture.md#per-customer-anchored-expiry-bonus-entry-codes). |

## CampaignService mint surface

Three entry points write `RedeemableIssuance` rows. All three stamp `expiresAt` through the **same**
`resolveIssuanceExpiry(campaign, issuedAt)` helper (precedence chain: `validForHours` > `neverExpires` >
`endsAt` — full table in [architecture.md](./architecture.md#expiry-precedence-chain)).

`NEVER_EXPIRES_ISSUANCE_DATE` (`9999-12-31T23:59:59.999Z`) is **declared in
[`bonus-code-policy.ts`](../../src/utils/redeemables/bonus-code-policy.ts) and re-exported here** (moved
2026-08-27; the admin modal is a client component and importing `CampaignService` would drag mongoose and
the models into the browser bundle). It serves two clocks: the `expiresAt` of a `neverExpires` issuance, and
a campaign `endsAt` meaning "no minting backstop, issues until an admin disables it". `bonus-code-policy.ts`
also exports `isOpenEndedDate(value)` (a **year threshold**, not an equality test) and
`campaignExpiryShape(campaign)` — the latter is **display/form only** and must never be substituted for
`personalWindowGoverns` at a mint site. See
[architecture.md](./architecture.md#the-three-campaign-expiry-shapes-and-the-open-ended-sentinel-2026-08-27).

| Entry point | Trigger? | Purpose |
|---|---|---|
| `issueCampaignToUsers({ campaign, userIds, … })` | n/a (bulk) | Bulk issue. Captures **one** `issuedAt` **above** the loop, so a single click straddling Sydney midnight cannot hand two users in the same batch different expiry days. Also stamps `firstIssuedAt`. **Refuses** a personal-window campaign when `issuedBy === "cron"` — this path has no trigger gate, so the cron would otherwise mass-mint the whole subscriber base (gotchas trap 6b). |
| `ensureActiveCampaignIssuancesForUser(userId)` | **never** | The wallet read sweep (called from `RedeemablesWalletService.getUserWallet`). Enrols the user into every live campaign they qualify for. Returns `{ issuedCount, issued: StampedIssuance[] }` — `issued` was added **additively**, so callers reading only `issuedCount` are unaffected. |
| `ensureCampaignIssuanceForUser({ userId, campaignCode, trigger })` | **required** | The ONE entry point for the three eligibility triggers (`"cancel-click" \| "checkout-start" \| "one-time-purchase"`) — and the entry point the incoming Klaviyo bonus-code webhook delegates to (spec 2026-08-26-bonus-code-webhook-rework). Resolves one campaign by code, checks eligibility **with** the trigger, mints or re-arms. **Never throws** — a failure here must not take down a cancellation, a payment webhook, or the bonus-code webhook, so it catches internally. It `console.error`s (survives `removeConsole`) and returns `{ outcome: "error" }` for a genuinely unexpected failure (C1, 2026-08-26) — a transient DB blip is now DISTINCT from the six deliberate no-ops, which still return `{ outcome: "not_applicable" }`. See [architecture.md](./architecture.md#stampedissuanceresultoutcome--which-outcomes-are-retryable) for the full retryable/permanent split. |

### Returned shape

```ts
interface StampedIssuance { id; campaignId; campaignCode; code?; entriesAmount; issuedAt; expiresAt }
interface StampedIssuanceResult { outcome: RearmOutcome | "not_applicable" | "error"; issuance?: StampedIssuance }
```

`issuance` is always the row **as persisted**, never a recomputed value — the persisted instant is the one
the redemption gate compares against and the one every rendered copy derives from, and a **re-arm MOVES
it**, so a caller recomputing `now + validForHours` against a row it did not just write can be a whole
72-hour window away from what redemption enforces. `already_active` deliberately returns the ORIGINAL date
for exactly that reason. `already_active` itself emails nothing — it is a silent no-op (see
[patterns.md](./patterns.md) P7 rule 2); there is no "re-send". (Corrected 2026-08-26: this used to say the
"Bonus Code Issued" **email prints the stored instant**. No email prints it at all — see
[BonusCodeNotifier — the Klaviyo emit](#bonuscodenotifier--the-klaviyo-emit).)

### The trigger gate — TWO halves, and both are load-bearing

`isUserEligibleForCampaign(user, campaign, now, options?)` opens with:

```ts
if (personalWindowGoverns(campaign) && !options?.trigger) return false;     // half 1: keep people OUT
const triggerIsTargeting = Boolean(options?.trigger) && personalWindowGoverns(campaign); // half 2: let them IN
```

**Half 2 — `triggerIsTargeting` — is not an optimisation; without it the feature cannot fire at all.**
Every stored-audience branch keys off `hasActiveSubscription` (`all-active-subscribers` returns it
bare; `dynamic-segment` early-returns on it; `manual-users`/`csv-users` need a pre-pinned id list,
which by definition cannot contain someone who has not triggered yet). But two of the three triggers
fire for people who have no subscription **by design** — `one-time-purchase` gates on
`!subscription.isActive`, and `checkout-start` fires for a guest seconds after registering (who also
fails `requiresEmailVerified`, before any verification email could be
actioned). And `cancel-click` runs *after* the commit has set `subscription.isActive = false`, so it
no-opped on every immediate/past-due cancellation — a prime win-back cohort. All three were dead.

When a trigger is passed **and** the campaign hands out personal windows, the **trigger is the
targeting**: the customer proved eligibility by doing the qualifying thing. The bypass relaxes
exactly two things — the implicit active-subscription requirement, and the *default* of
the **email-verified requirement** — waived outright, not merely defaulted away (a `??` fallback
there was dead code: the schema persists `requiresEmailVerified: true`, so it never ran — see
[gotchas.md](./gotchas.md)). Both are proxies for "is this a real, engaged customer?", which the
trigger answers directly and better. Everything an admin configured as an AUDIENCE still gates:
manual/CSV pins, explicit `excludeUserIds`, `states`, `membershipTiers`,
`topEntriesPercent`, the inactivity window, plus `user.isActive` and campaign liveness. With no
trigger it is `false` and every pre-existing path is byte-identical.

Pinned end-to-end by `npm run test:trigger-eligibility` (19 assertions, pure — no DB), which fails
on 4 assertions against the pre-fix code.

**Half 1** is the older leak defence and still matters:

This is the highest-stakes line in the mint path. `ensureActiveCampaignIssuancesForUser` runs on **every
rewards-wallet read**, and the `"all-active-subscribers"` targeting branch returns a bare
`hasActiveSubscription`. Without the gate, every active member who opened `/my-account` would self-enrol into
a trigger campaign and burn their one-per-lifetime grant without ever receiving the email.

### `mintBonusCodeForTrigger` — the production gate and the returned outcome

- **Production gate, ahead of the MINT.** Returns `{ outcome: "not_applicable" }` unless
  `VERCEL_ENV === "production"`. Gating only the email is not enough: Vercel previews are production
  builds against the shared database, so a preview deploy would still write the issuance row and burn
  a real customer's one-per-lifetime grant — they would later be told they had used a code they never
  saw. The webhook route asserts the same thing ahead of this call and answers `403`, so in practice
  this never fires; it is kept because it is the copy that sits ahead of the **mint**.
  `BonusCodeNotifier` keeps a third copy as an inner backstop for a future direct caller.
  Consequence to know: minting cannot be exercised on a preview deploy or locally.
- **It RETURNS the outcome** (`Promise<StampedIssuanceResult>`, was `Promise<void>`). The webhook
  route needs it to choose a status — `error` → `500` (retry recovers the grant), everything else →
  `200`. Never throws; the caller reads `outcome`.
- **Notify is awaited directly, with no wait budget** (removed 2026-08-26). The 5s ceiling that used
  to wrap it existed solely because the mint was awaited on the customer's own **registration
  request**, where a 30s Klaviyo stall read to them exactly like a failed signup. A webhook handler
  blocks nobody, so the ceiling bought nothing and cost an "outcome unknown" marker on the row (the
  third `notifyError` state, also removed — see [models.md](./models.md)). A `notify()` that throws is
  caught and logged **without** changing the outcome: the grant already exists, so reporting it as a
  retryable error would be wrong twice over (the retry would come back `already_active`).
- **Lookup order.** `ensureCampaignIssuanceForUser` resolves the CAMPAIGN before the user. `code` is
  uniquely indexed and "no campaign carries this code" is the overwhelmingly common state, so the
  inert path costs one indexed hit instead of two.

### Atomicity

`createIssuanceForUser` mints via `findOneAndUpdate(..., { upsert: true, new: true, includeResultMetadata: true })`,
not `findOne` + `create`. The old read-then-write was not atomic: a double-clicked Cancel threw `E11000` out of
the caller **after** Stripe had already cancelled, so the customer saw "cancel failed" on a cancelled
subscription. Two concurrency signals are handled, both as success:

- `res.lastErrorObject.updatedExisting === true` — a concurrent trigger inserted between our read and the
  upsert ⇒ `already_active`, with the winner's stored stamp.
- A surviving `E11000` is discriminated by **`error.keyPattern`**, because two unique indexes exist:
  `{campaignId, userId}` ⇒ a concurrent trigger won, return `already_active` (re-read for the stamp);
  `{campaignId, code}` ⇒ the generated per-user code collided, regenerate and retry (up to 3 attempts — the
  pre-existing retry loop, preserved).

The upsert passes `runValidators: true`. `findOneAndUpdate` runs **no** schema validation by default, so
without it the move off `create()` would have silently dropped the validation the old mint had. Note the bulk
path has never had it — which is why `createIssuanceForUser` treats a missing `expiresAt` on an existing row
as long-expired rather than dereferencing it (it is reached from the wallet read, which has no `try`/`catch`).

### The re-arm write filter

The re-arm update matches `status: { $in: ["active", "expired"] }`, not `status: "active"`. `decideRearm`
deliberately ignores the status string and can return `"rearmed"` for a legacy `status: "expired"` row;
an `"active"`-only filter would match nothing there, and the mint would report `already_active` with **no
date** to a caller about to email a deadline. The `$set` normalises `status` back to `"active"`.

### The permanent spent marker

`RedemptionService.redeem` writes `$min: { redeemedEverAt: now }` alongside its existing `$set` in the atomic
claim. `$min` writes the field when absent and preserves the FIRST value when present. The claim's filter is
**not** widened — it is already race-safe. The refund path (`unredeemMonthlyCouponRedemption`) restores
`status: "active"` and `$unset`s `redeemedAt` but **must never touch `redeemedEverAt`**.

## BonusCodeNotifier — the Klaviyo emit

`BonusCodeNotifier.notify({ user, issuance: StampedIssuance, trigger })` sends the "Bonus Code
Issued" Klaviyo event (`createBonusCodeIssuedEvent` in
[klaviyo-events.ts](../../src/utils/integrations/klaviyo/klaviyo-events.ts) — property table in
[KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md#bonus-code-issued-2026-08-25)) and
writes the outcome back onto the issuance row.

- **`expiresAt` on the event is `issuance.expiresAt` — the persisted value, never recomputed.** The
  persisted instant is the one the redemption gate compares against and the one every rendered copy
  derives from, and a **re-arm moves it**, so a recomputed value can be a whole 72-hour window out;
  see gotchas trap 2/4. `expires_at_label` is built via `formatExpiryLabelAEST()`, the single
  server-side formatter every rendered copy derives from — but **no email renders it**: a Klaviyo
  flow email renders against its OWN trigger metric, so the three discount templates cannot read
  `expires_at_label` off this event, and the two components that would render the same wallet string
  are behind the rewards pause flag or unmounted. Corrected 2026-08-26 (this bullet used to say "the
  email and the server … must agree" and "app and email can never print different strings").
- **Awaited, not `trackEventBackground`.** Every other Klaviyo event in this codebase fires via
  `klaviyo.trackEventBackground(...)` (fire-and-forget). This one is `await klaviyo.trackEvent(...)`
  deliberately — `trackEvent` cannot throw (its own `catch` returns `{ success: false }`), so the
  await is bounded by one request timeout, and the caller needs the boolean result to persist
  `notifiedAt` / `notifyError` (see [models.md](./models.md)) for support triage.
- **Idempotency key.** `event.unique_id = `${issuance.id}:${issuance.expiresAt.toISOString()}`` before
  the emit. The Klaviyo events payload has no dedup key by default, and `trackEvent`'s retry loop
  treats `"timeout"` as retryable (`MAX_RETRIES = 5`), so an accepted-but-slow POST could otherwise
  land up to 5 times. Keying on issuance id + expiry instant collapses repeats of the SAME deadline
  to one event, while a legitimately re-armed deadline (a new `expiresAt`) produces a new
  `unique_id` and a new event, as it should.
- **Production-only gate — this copy is the INNER BACKSTOP, not the real one.** `notify()` returns
  immediately, logging via `console.error` (survives `compiler.removeConsole`), unless
  `process.env.VERCEL_ENV === "production"`. **The authoritative gate is
  `mintBonusCodeForTrigger.ts` and it sits ahead of the MINT, not the email** — by the time
  `notify()` runs, the issuance row is already written and the grant already burned, so gating only
  here would not save it. See the "production gate" bullet under `mintBonusCodeForTrigger` above;
  do not restate the reasoning in both places. `BonusCodeNotifier`'s copy exists solely so a future
  *direct* caller of `notify()` cannot email a real customer from a preview.
- **One call site, for all three triggers.** cancel-click, checkout-start and one-time-purchase all
  arrive on the same webhook and reach `notify()` through `mintBonusCodeForTrigger.ts`, which is the
  ONLY call site. Do not add a second `notify()` call anywhere — that is a double email. See the
  trigger contract in [patterns.md](./patterns.md) P7 and the endpoint contract in
  [api.md](./api.md#post-apibonus-codesv1issue--the-klaviyo-bonus-code-webhook).

## Customer-facing code visibility and expiry label (Task 10, 2026-08-25)

**A campaign `code` is returned only to a customer who holds an issuance for that
campaign.** `GET /api/redeemables/status` used to return `code: campaign.code` for
**every** active campaign to **any** authenticated user, gated only on being
signed in — any signed-in customer could read a trigger campaign's code before
qualifying for it. The route now loads the caller's own `RedeemableIssuance` rows
first (`.select("campaignId status expiresAt redeemedAt")`) into a
`heldCampaignIds` set, and both `activeCampaigns[].code` and the singular
`activeCampaign.code` are `campaign.code` when held, `undefined` otherwise. The
rest of the shape is unchanged (name/dates/etc. still render for a campaign the
customer has not qualified for — only the code is withheld), so existing clients
do not break. `RedeemablesWalletService.getUserWallet` was never affected — it
already scopes campaigns to the ones behind the caller's own issuances
(`campaignIds = redeemableIssuances.map(...)`).

**One customer-facing expiry string.** `RedeemableWalletItem.expiresAtLabel`
(required, `string`) is `formatExpiryLabelAEST(issuance.expiresAt)` — the single
server-side formatter every rendered copy of the deadline derives from, so no
copy can disagree with the instant redemption enforces. Corrected 2026-08-26:
this used to read "the exact same function the Klaviyo 'Bonus Code Issued' email
renders". **No email renders it.** The event carries `expires_at_label`, but a
Klaviyo flow email renders against its OWN trigger metric, so the three discount
templates cannot read it (see
[BonusCodeNotifier — the Klaviyo emit](#bonuscodenotifier--the-klaviyo-emit)
above), and this field's own two consumers are unreachable today (see
[frontend.md](./frontend.md), "Known gap"). `RedeemablesWallet.tsx` and `RewardsFloatingWidget.tsx` now render this
label instead of `new Date(item.expiresAt).toLocaleDateString()`, which formats
in the **viewer's** browser locale/timezone (the same instant reads `04/10/2026`
to an en-AU browser and `10/4/2026` — read as 10 April, six months wrong — to an
en-US one). The campaign `.select()` in `getUserWallet` now also includes
`isActive` (feeds the `isRedeemableNow` tightening above) and `validForHours`
(feeds `personalWindowGoverns` below) — a `.select()` omission on either field
reads back as `undefined` at runtime with no type error, which has already
happened twice on this branch.

**"Never expires" falls back to the issuance's own date for personal-window
campaigns.** `neverExpires` and `validForHours` are mutually exclusive on the
campaign model, but an item's `neverExpires` value is forced `false` whenever
`personalWindowGoverns(campaign)` is true (or the campaign is missing/orphaned),
regardless of `campaign.neverExpires` — a personal-window issuance always has a
real, finite per-customer `expiresAt`, and the UI must never render "No expiry"
for one.

**Human refusal copy in `POST /api/redeemables/redeem`.** The raw
`RedemptionFailureReason` string (e.g. `campaign_not_active`) is never sent to
the client. `humanRefusalMessage(reason, expiresAt)` maps every reason to a
customer-facing sentence; `expired` names the actual date via
`formatExpiryLabelAEST(expiresAt)`.

`RedemptionResult` (`RedemptionService.ts`) carries an optional `expiresAt?: Date`,
set at both `reason: "expired"` return sites to the matched issuance's own
`expiresAt` — the value the service already computed while deciding "expired",
never re-derived by the route. **Fix round 1 (2026-08-25):** the route
originally re-looked-up the issuance itself (`resolveExpiredLabel()`, since
deleted) to avoid touching `RedemptionService.ts` (off-limits at the time). Its
milestone-reward-code branch omitted the `status: "active"` filter
`RedemptionService.redeem` uses at that same branch. `MilestoneIssuance`'s
unique index is `{milestoneRewardId, userId, streakGeneration,
achievementCycle}`, not `{milestoneRewardId, userId}` — a repeatable milestone
can leave a customer with several rows for the same reward+user, so an older
`active`-and-expired row and a newer non-active, not-yet-expired row can both
exist. The service's own lookup (status-filtered) found the older row and
returned `expired`; the route's duplicate (unfiltered, sorted by `issuedAt`)
found the newer row and reported a future expiry date on an already-failed
request. Returning the matched `expiresAt` on `RedemptionResult` instead —
`RedemptionService.ts` was reopened for this task once every task that had
made it off-limits was complete — removes the second lookup entirely: there is
now exactly one issuance-identification path, so the two can never disagree
again, and the route now only formats a value it is handed (`route.ts` holds no
business logic). Rule 11 applies throughout: copy never uses odds/chance/lottery
language and never frames entries as bought.

## Refund integration

The refund-reversal steps for redeemables (`campaignUnredeem`, `milestoneRevoke`) are registered in `buildLedgerReversalSteps` ([src/utils/payment/refund-ledger-reversal.ts](../../src/utils/payment/refund-ledger-reversal.ts)); [src/utils/payment/reversers/](../../src/utils/payment/reversers/) holds only the generic orchestrator + types. Milestone issuances granted by the refunded payment are revoked — already-redeemed ones are un-redeemed first (entries clawed back) — and a coupon redeemed on the refunded purchase is un-redeemed back to `active`. Only step **failures** surface in `RefundProcessed.data.reversalIssues[]`.

## Bonus-code webhook guards ([src/lib/bonus-code-webhook/](../../src/lib/bonus-code-webhook/)) — added 2026-08-26

Three modules that stand in front of `POST /api/bonus-codes/v1/issue` (the route itself is built in a later task and imports all three). A caller who gets past them mints a real per-customer bonus code, which grants real prize-draw entries — so every one of them is designed to **fail closed**.

### `auth.ts` — the shared-secret check

```ts
export const BONUS_CODE_SECRET_HEADER = "x-bonus-code-secret";
export const MIN_SECRET_LENGTH = 16;
export type BonusCodeAuthVerdict =
  | { ok: true }
  | { ok: false; status: 500; reason: "misconfigured" }
  | { ok: false; status: 401; reason: "missing-secret" }
  | { ok: false; status: 401; reason: "bad-secret" };

export function parseConfiguredSecrets(raw: string | undefined): string[];
export function verifyBonusCodeWebhookSecret(
  presented: string | null | undefined
): BonusCodeAuthVerdict;
```

- **Unset secret → refuse, never allow.** `BONUS_CODE_WEBHOOK_SECRET` unset (or every comma-entry shorter than `MIN_SECRET_LENGTH`) returns `{ ok: false, status: 500, reason: "misconfigured" }` and writes a `console.error`. **This is the single most important line in the module.** The nearest neighbour in this repo does the opposite — `src/app/api/cron/monthly-redeemables-issuance/route.ts:9-14` is `if (!cronSecret) return true`, which makes the endpoint fully public the moment an env var is missing, and compares with `===`. Do not copy it. The shape here mirrors `verifyNormRequest` (`src/lib/internal-norm/auth.ts:87-95`).
- **Constant-time with a mandatory byte-length pre-check**, because `timingSafeEqual` *throws* on unequal-length buffers — the guard is load-bearing, not decorative. It compares `Buffer.length` (bytes), not `String.length` (UTF-16 units), so a multi-byte character cannot slip a mismatch into the throw.
- **Comma-separated list** so a secret rotates with overlap: add the new one → marketing updates the three flows → remove the old one. Every candidate is compared with no early exit, so the matching secret's position in the list is not observable through response timing.
- **The secret is never logged** — not raw, not hashed, not truncated, not in an error message, not in an audit row.
- Synchronous and I/O-free, so there is no outage that can make it fail open. Middleware cannot help here: its matcher excludes `/api` outright, so the route owns 100% of its own authorization.

### `budget.ts` — the fail-closed daily cap

```ts
export function utcDayKey(d?: Date): string;
export const BUDGET_CONSUMING_OUTCOMES: readonly BonusCodeCallOutcome[]; // ["minted","rearmed"]
export const DEFAULT_DAILY_MINT_CAP = 500;
export type BonusCodeBudgetVerdict =
  | { ok: true; mintedToday: number; dailyCap: number }
  | { ok: false; status: 429; reason: "kill_switch" | "daily_cap" }
  | { ok: false; status: 500; reason: "error" };

export function evaluateBonusCodeBudget(input: {
  killSwitch: boolean; mintedToday: number; dailyCap: number;
}): BonusCodeBudgetDecision;              // pure, no I/O
export function resolveDailyMintCap(raw: string | undefined): number;
export function resolveKillSwitch(raw: string | undefined): boolean;
export async function assertBonusCodeMintBudget(
  deps?: BonusCodeBudgetDeps             // { readMintedToday?, now? } — test injection
): Promise<BonusCodeBudgetVerdict>;
```

- **A database outage BLOCKS minting.** The whole body is wrapped and the catch returns `{ ok: false, status: 500, reason: "error" }`. A catch that returned "allowed" would build a cap that uncaps itself at exactly the moment things are going wrong. Pattern: `src/lib/support-chat/costGuard.ts:110-143`. `500` rather than `429` because in the endpoint's status map 500 is the status whose retry actually recovers a grant.
- **This is the only control that survives a leaked secret**, which is why there is deliberately no rate limiter on the route: `createDistributedRateLimiter` fails *open* by design, `createRateLimiter` is per-lambda and bypassable, and keying on IP would be actively harmful because Klaviyo calls from a shared egress pool.
- **What it counts:** `BonusCodeWebhookCall` rows for the current UTC day whose outcome is in `BUDGET_CONSUMING_OUTCOMES`. It does **not** count `RedeemableIssuance` — the legacy cron bulk-issues to thousands in one run and would exhaust the cap for a completely legitimate reason. Refusals do not consume budget either, so an enumeration sweep cannot starve the real flows.
- `BONUS_CODE_DAILY_MINT_CAP` unset → 500. An explicit `0` is honoured (a second break-glass). Anything not a non-negative integer falls back to 500 **and logs**, rather than silently capping at zero (looks like an outage) or at infinity (an uncapped mint endpoint). `BONUS_CODE_KILL_SWITCH=true` (any casing) stops everything and wins over the cap.
- Writes an early-warning `console.error` once the day passes 80% of the cap — the "no alert" gap BUSINESS.md used to concede.
- **Accepted imprecisions, stated so nobody rediscovers them:** it is a **soft** cap (the audit row is written after the mint, so concurrent calls can each read the same pre-mint count — overshoot is bounded by concurrency); an **unwritten audit row is an uncounted mint**, which loosens the cap slightly but never tightens it wrongly; and the window resets at **UTC** midnight (10/11am Sydney), matching the repo's existing `utcDayKey`.

### `audit.ts` — the trail

```ts
export function hashIp(ip: string): string;
export interface BonusCodeWebhookCallMeta {
  requestId: string;
  outcome: BonusCodeCallOutcome;
  status: number;
  trigger?: BonusCodeTrigger | null;
  userId?: string | null;
  ip?: string | null;      // RAW — hashed inside, never persisted raw
  durationMs?: number;
  now?: Date;
}
export async function writeBonusCodeWebhookCall(
  meta: BonusCodeWebhookCallMeta
): Promise<void>;
```

- **A failed audit write must not fail the request.** Everything is wrapped; failures go to `console.error` and the promise still resolves, so the route can `await` it with no risk of it changing the response. The discount email is already in flight from the Klaviyo flow — losing the customer's grant because a log write hiccuped would be strictly worse than losing the log line.
- **Takes the RAW IP and hashes it internally**, so no caller can persist one by mistake. `hashIp` is exported for reuse and tests.
- **Write a row for every call — accepted, refused and errored.** See [models.md](./models.md) for the outcome vocabulary and the indexes.
- Dynamic imports keep Mongoose off the module top level (pattern: `src/lib/support-chat/audit.ts`); the outcome-union import is `import type`, so it is erased at compile time and pulls in no runtime code.
- **Separator convention, so it is not mistaken for a fork:** the auth verdict's `reason` values are kebab (`missing-secret`, `bad-secret`) because they follow `verifyNormRequest`'s shape family; the audit `outcome` vocabulary is snake throughout because it must interoperate with `RearmOutcome` (`already_active`, `expired_no_rearm`). The route maps one to the other explicitly.

## Cron / jobs

Campaign runs are typically admin-triggered, not cron-scheduled. _TODO: confirm whether any scheduled campaigns exist (e.g. monthly top-percentile)._

## Models

See [models.md](./models.md) for the 4 collections owned by this domain.
