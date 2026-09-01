# Rewards-Redeemables — Testing

## Suites

| Script | Covers |
|---|---|
| `npm run test:redeemables` | Redeemables service tests under [src/services/redeemables/__tests__/](../../src/services/redeemables/__tests__/) |
| `npm run test:redeemables-purchase-gate` | [purchase-eligibility.test.ts](../../src/utils/redeemables/__tests__/purchase-eligibility.test.ts) — 16 assertions covering `hasQualifyingPurchase(...)` across all four `purchaseRequirement` values, window bounds (inclusive `startsAt`/`endsAt`, `neverExpires` → `now`), and the regression that an active member does NOT auto-pass a `"one-time"` requirement. |
| `npm run test:bonus-code-audience` | pure | [bonus-code-audience.test.ts](../../src/services/redeemables/__tests__/bonus-code-audience.test.ts) — `BonusCodeAudienceService` / `bonusCodeAudienceFilter.ts`, 44 assertions. (1) source-level guard that none of the audience files restate a `"trigger": "CODE"` literal, and that the service imports + calls `isCampaignRedeemable(campaign, now)` rather than hand-rolling it; (2) each addressable-forecast filter builder evaluated against the same fixture shapes `trigger-eligibility.test.ts` uses; (3) recency-scoping actually narrows the population (`qualifiedSince` excludes a stale qualifier that still matches the unscoped filter); (4) cancel-click's "not resubscribed" check keys off `autoRenew`, not `isActive` (the cancel-at-period-end grace-window bug); (5) the three issuance-state filters (`stillRedeemable` / `redeemed` / `expiredOrLapsed`) are exhaustive and non-overlapping — asserted with a representative status × expiry × campaign-redeemability matrix, not spot checks, via a small in-test Mongo-filter evaluator (no DB connection; handles `$and`/`$or`/`$ne`/`$exists`/`$gte`/`$gt`/`$lte`, dotted paths into arrays, and value-based Date/ObjectId equality). |

### Per-customer bonus codes

Five suites are **pure** (no DB, no env) and cover the arithmetic and the decision tables; seven are
**integration** suites that run the real service/route code against a live database. The split
matters: a pure suite proves a predicate is right, an integration suite proves the call site
actually consults it and that the write lands.

| Script | Kind | Covers |
|---|---|---|
| `npm run test:bonus-code-expiry` | pure | [expiry-hours.test.ts](../../src/utils/redeemables/__tests__/expiry-hours.test.ts) — `expiryAfterHours`'s exact-offset arithmetic (both DST transitions asserted on elapsed milliseconds, not the shifted wall-clock hour; year rollover; leap day; no second/ms rounding; zero/negative/fractional guards), plus `decideRearm`'s re-arm cooldown (`REARM_COOLDOWN_DAYS`): inside vs outside the cooldown, the exact boundary, `redeemedEverAt` winning regardless of cooldown, the no-`firstIssuedAt` fallback, and that the no-trigger path is byte-identical to before. Replaces `expiry-window.test.ts`, deleted 2026-08-26 with the calendar-day helper it tested (`endOfDayAESTAfterDays`). |
| `npm run test:bonus-code-policy` | pure | [bonus-code-policy.test.ts](../../src/utils/redeemables/__tests__/bonus-code-policy.test.ts) — `decideRearm`'s decision table (3-arg calls only), `personalWindowGoverns`, `isCampaignRedeemable`. **Extended 2026-08-27:** `campaignExpiryShape` across the whole `{neverExpires, validForHours}` space — including the anti-drift case, `validForHours` beating `neverExpires` exactly as `resolveIssuanceExpiry` does; `isOpenEndedDate` over the sentinel, a local-picker round-trip, a genuine year-10000 `Date` and its expanded `+010000-…` ISO form, an unparseable 5-digit year, and the null/blank cases; and **the mass-mint lock pinned** — `personalWindowGoverns` stays true for the open-ended shape, so the monthly cron's `!campaign.validForHours` filter still excludes it. |
| `npm run test:issuance-expiry` | pure | [issuance-expiry.test.ts](../../src/services/redeemables/__tests__/issuance-expiry.test.ts) — `resolveIssuanceExpiry`'s precedence chain. **Extended 2026-08-27:** the open-ended trigger shape (`validForHours: 72`, `neverExpires: false`, `endsAt` = the year-9999 sentinel) must still stamp `issuedAt + 72h` — the sentinel is the CAMPAIGN's clock and must never leak into the customer's deadline. |
| `npm run test:campaign-window` | DB | [campaign-window.test.ts](../../src/services/redeemables/__tests__/campaign-window.test.ts) — the four campaign-window truncation sites (see [rules.md R9](./rules.md)), **plus the wallet as the fifth (Site 3, added 2026-09-01 — [rules.md R12](./rules.md))**. Site 3 reproduces the `ANZACDAY25` shape exactly: a legacy campaign left `isActive: true` past its `endsAt`, holding an `active` issuance stamped with the year-9999 sentinel `expiresAt`. It asserts the wallet does NOT offer it (`isRedeemableNow: false`) **and, in the same block, that `RedemptionService` refuses it** (`campaign_not_active`) — the two sides pinned together, which is the only form of this assertion that catches drift. Two preconditions are asserted first (the row is still active with a future expiry; the campaign is still `isActive`) so the headline assertion can never pass for the wrong reason, and an inverse case proves a live campaign still yields `isRedeemableNow: true`. Mutation-checked 2026-09-01: restoring `campaign.isActive !== false` in the wallet turns exactly one assertion red. Its "every Stripe route writes the verified code into metadata" guard **moved out** on 2026-08-26 — see `test:campaign-code-metadata` below. |
| `npm run test:campaign-code-metadata` | **DB** | [campaign-code-metadata.test.ts](../../src/app/api/stripe/__tests__/campaign-code-metadata.test.ts) — all four Stripe checkout routes write the **server-verified** campaign code into Stripe metadata, never the request-body field. Lives in [billing-stripe](../billing-stripe/testing.md) (its files are `src/app/api/stripe/**`) but the invariant is this domain's: the code that lands in metadata is what the webhook later redeems, granting entries and burning a one-per-lifetime grant. Replaces a text-grep guard; see below. |
| `npm run test:claim-grant-compensation` | **DB** | [claim-grant-compensation.test.ts](../../src/services/redeemables/__tests__/claim-grant-compensation.test.ts) — **F1 + F2, added 2026-08-27.** A claim must never report success while granting nothing — **and must never reverse a grant it cannot prove was unwritten**. Six scenarios: a monthly-coupon claim whose grant is verified `not_written` reports `grant_unavailable` and reverses everything (issuance back to `active`, `redeemedEverAt` unset, wallet counter and `redemptionHistory` row undone); the same issuance then claims for real; a **pre-existing** `redeemedEverAt` (refunded legacy coupon) is preserved, not erased, by the compensation; the manual milestone claim compensates identically; an **`unconfirmed`** write reverses **nothing** and reports `grant_unresolved` (issuance stays `redeemed`, `redeemedEverAt` stays stamped, wallet keeps its `$inc` and history row); and a **thrown** grant is treated as the same fact. Scenarios 5–6 are the F2 pin: scenario 4 used to drive the `"throw"` case and assert full reversal, i.e. it pinned the ambiguity as intended, so it had to change with the fix. `DrawGrantService.grantMonthlyCouponEntries` is stubbed on the class object (now answering a `DrawGrantOutcome`) rather than deleting/freezing the real draws — the failure must be forced without mutating the shared draw data every other suite grants into. |
| `npm run test:trigger-eligibility` | pure | [trigger-eligibility.test.ts](../../src/services/redeemables/__tests__/trigger-eligibility.test.ts) — the trigger bypass in `isUserEligibleForCampaign`. |
| `npm run test:klaviyo-canonical` | pure | Bonus Code Issued event-property shape, and that the builder emits the *passed* expiry. |
| `npm run test:bonus-code-mint` | **DB** | [bonus-code-mint.test.ts](../../src/services/redeemables/__tests__/bonus-code-mint.test.ts) — the mint, the re-arm lifecycle, the refund guarantee, concurrency, and legacy parity. See below. |
| `npm run test:campaign-enrolment` | **DB** | [campaign-enrolment.test.ts](../../src/services/redeemables/__tests__/campaign-enrolment.test.ts) — the trigger-as-targeting relaxation, the email-verified waiver boundary, and the wallet-sweep leak defence, against a real database. Renamed from `test:bonus-code-trigger` on 2026-08-26 when the three internal trigger call sites were deleted: what remains tests `CampaignService` enrolment, not any trigger wiring. See below. |
| `npm run test:global-campaign-enrolment` | **DB** | [global-campaign-enrolment.test.ts](../../src/services/redeemables/__tests__/global-campaign-enrolment.test.ts) — **added 2026-08-27, the suite whose absence let the launch-stopper ship.** Three sections: (1) MECHANISM, on a throwaway collection it builds itself — a `unique + sparse` compound index really does reject the second code-less row with `keyPattern {campaignId,code}`, the `unique + partial` one accepts it, and the partial one still rejects a duplicate per-user code; (2) THIS DATABASE — the live `campaignId_1_code_1` is unique + partial and NOT sparse, which fails loudly naming `npm run migrate:issuance-partial-code-index` on any environment that has not run it; (3) END TO END — three different customers into ONE `campaignMode: "global"` campaign, all `minted`, all holding a row, plus the re-run of customer #1 still being `already_active` **with** its stored issuance. Section 3 is red on the old index even with section 2 removed. |
| `npm run test:checkout-intent-recovery` | **DB** | [checkout-intent-recovery.test.ts](../../src/services/redeemables/__tests__/checkout-intent-recovery.test.ts) — **added 2026-08-27.** The four properties the lost-attach recovery rests on: applying a code records the intent against that customer’s issuance; REMOVING it clears the record (so “apply → remove → pay” cannot recover a code the customer took off); an intent older than `CHECKOUT_INTENT_WINDOW_MS` is not a candidate, with an in-window control; and a spent grant is never a candidate. Deliberately does NOT re-test the redemption gates — `resolveCheckoutIntent` returns a candidate and `RedemptionService` decides. |
| `npm run test:bonus-code-webhook` | **DB** | [bonus-code-webhook.test.ts](../../src/services/redeemables/__tests__/bonus-code-webhook.test.ts) — `POST /api/bonus-codes/v1/issue` through the **real handler**: authorization, rotation, the production assertion, the body contract, customer resolution, the status map, the 72-hour window, and the mint budget. See below. |
| `npm run test:code-visibility` | **DB** | [code-visibility.test.ts](../../src/app/api/redeemables/status/__tests__/code-visibility.test.ts) — a campaign code is returned only to a customer holding an issuance for it. See below. |

#### `test:bonus-code-mint` — what it protects

1. **Mongo's own upsert contract.** `createIssuanceForUser` reads
   `lastErrorObject.updatedExisting` off an `includeResultMetadata` upsert to tell "I inserted"
   from "a concurrent trigger won". `tsc` can type that field but cannot tell you what the driver
   really returns on a **matched, `$setOnInsert`-only** update. Section 1 pins both branches with
   the exact option set the mint uses: insert ⇒ `updatedExisting: false` plus an `upserted` id;
   match ⇒ `updatedExisting: true`, no `upserted`, the pre-existing document returned, and the
   stored fields left untouched (the match call deliberately carries a *different* `issuedAt`, so a
   future swap to `$set` would be visible).
2. **The mint.** One row; `metadata.issuedBy` records the trigger; `firstIssuedAt === issuedAt`;
   the deadline handed back to the caller **is** the persisted one. (The old rationale — "a
   recomputed value could print a date a calendar day off" — was the calendar-day model's midnight
   cliff and no longer applies under `expiryAfterHours`. The assertion stays because the persisted
   instant is the one the redemption gate compares against and the one every rendered copy derives
   from — the `Bonus Code Issued` event, the wallet label, the checkout refusal; no email prints it,
   see [gotchas.md](./gotchas.md) launch step 4 — and a re-arm moves
   it: recomputing on an `already_active` outcome would hand back a *different* deadline.)
3. **Re-send vs re-arm.** A second trigger inside the live window returns the stored deadline and
   writes nothing. A lapsed grant re-arms in place: `firstIssuedAt` survives, `issuedAt` moves,
   `notifiedAt`/`notifyError` are cleared so the new deadline can be emailed.
4. **One per person, for life.** redeem → `unredeemMonthlyCouponRedemption` → re-trigger. The
   reversal restores `status: "active"` and `$unset`s `redeemedAt`, so `redeemedEverAt` is the only
   field left distinguishing a refunded grant from a never-redeemed one. Both the still-live and
   the lapsed re-trigger must report `spent`.
5. **Concurrency.** Five simultaneous triggers ⇒ exactly one `minted`, four `already_active`, one
   row, and **zero** `not_applicable` — `ensureCampaignIssuanceForUser` swallows a throw into
   `not_applicable`, so that outcome is the fingerprint of the pre-fix E11000 escaping the caller
   and surfacing as "cancel failed" on a subscription Stripe had already cancelled.
6. **Legacy parity.** No `validForHours` ⇒ `expiresAt` equals the campaign's `endsAt` to the
   millisecond; `neverExpires` ⇒ the year-9999 sentinel; and the wallet sweep still enrols into a
   legacy campaign while refusing a personal-window one — the same sweep call decides both.

#### `test:campaign-enrolment` — what it protects

- **The trigger is the targeting.** A subscription-less customer is enrolled into a
  personal-window campaign on the trigger alone, and the *same* trigger does **not** widen a legacy
  campaign. A user explicitly pinned into a personal-window campaign is still refused by the wallet
  sweep, and enrolled the moment a trigger is passed — the gate, isolated.
- **The email-verified waiver, from both sides.** A trigger campaign waives
  `requiresEmailVerified` — whether Mongoose stored it by schema default or an admin set it
  deliberately — because the customer proved they are real by doing the qualifying thing;
  `checkout-start` fires seconds after registration, so enforcing it there excludes the trigger's
  entire population. With **no** trigger, or on a **legacy** campaign (where `triggerIsTargeting`
  is false), the flag still gates exactly as before. Section 2a deliberately reads the campaign
  back from Mongo and asserts the row carries `requiresEmailVerified: true` *before* asserting the
  waiver: that persisted value is what made the first attempt at this fix dead code, and it is
  invisible to `test:trigger-eligibility`, which builds campaign objects by hand. Neither suite
  substitutes for the other.
- **Nothing here emits, and nothing here needs a stub.** The suite loads `CampaignService` only,
  which imports no Klaviyo, email or ads client directly or transitively — minting and emailing are
  separate modules by design. The Klaviyo `require.cache` stub, the object-identity gate, the
  `VERCEL_ENV` save/restore, the SIGINT/SIGTERM handler and the `BACKIN200` refuse-to-run guard all
  went with sections 3–5 on 2026-08-26; each existed only to make the production-gate section safe.
  The production gate itself did not go untested — it is asserted through the real handler in
  `test:bonus-code-webhook`, which stubs Klaviyo and repoints `BONUS_CODE_BY_TRIGGER` at per-run
  fixture codes, so it stays runnable after the real campaigns exist.

#### `test:bonus-code-webhook` — what it protects

Twelve sections, all through the real `POST` handler with real `NextRequest` objects:

- **Authorization.** No header, a wrong secret and a wrong secret *of the same length* all answer
  `401`. The same-length case is the only one `timingSafeEqual` actually compares byte by byte;
  three further cases (added 2026-08-26, fix round 2) drive **differing lengths** — shorter, longer,
  and a multi-byte value of the same *string* length but a different *byte* length — because every
  rejection fixture here used to be exactly `SECRET_CURRENT.length` characters, so the case
  spec §7 explicitly names ("wrong-length header → 401, **not** a thrown `timingSafeEqual`") was
  unreachable. `timingSafeEqual` THROWS a RangeError on unequal-length buffers, so the byte-length
  pre-check in `auth.ts` is load-bearing: without it (and its `try`/`catch`) every wrong-length
  secret answers `500`, which is the status this endpoint uses to mean "retry, the grant is
  recoverable" — Klaviyo would retry an unauthenticated caller indefinitely. *Mutation-proven:*
  removing the guard and the catch turns 4 assertions red. An **unset** server
  secret answers `500`, never `200` — the fail-closed property, asserted rather than assumed.
- **Rotation.** With `BONUS_CODE_WEBHOOK_SECRET=<old>,<new>` both are accepted; dropping `<old>` from
  the list revokes it on the next call. **And the `MIN_SECRET_LENGTH` floor** (added 2026-08-26): a
  configured secret one byte under the floor is DROPPED, leaving no candidates, so the endpoint
  fails **closed** with `misconfigured` / `500` rather than honouring a brute-forceable value. Pinned
  in both halves deliberately — the behavioural leg derives its fixture from the constant, so on its
  own it would simply move with a lowered floor and keep passing (the "a content assertion naming a
  business value has its own expiry date" trap in `docs/config-and-data/gotchas.md`), so the
  constant is also asserted directly as `>= 16`: raising the floor is a tightening and stays
  allowed, lowering it is the regression. *Mutation-proven:* `MIN_SECRET_LENGTH = 1` turns 4
  assertions red — and turned **none** red before the direct assertion was added.
- **The production assertion.** With `VERCEL_ENV=preview`, a fully valid authorised call answers
  `403` and writes **no issuance row**.
- **The body contract**, including the case that matters most in practice: an **empty** `userId`
  (what `{{ person.user_id }}` renders on a newsletter-form profile) and a non-ObjectId `userId` both
  fall through to the email rather than `400` — and, symmetrically, a **malformed email does not
  `400`** a call the `userId` can serve. An unknown trigger answers `400` and echoes the offending
  value; a `400` whose trigger *was* valid still records that trigger on its audit row, because that
  row is what names the broken flow.
- **Customer resolution**, including the `identity_conflict` refusal when `userId` and `email` name
  different accounts, and the `200 user_not_found` for an unknown id, an unknown address and a
  deactivated account. The conflict answers `200` with a body byte-identical to a mint (see api.md,
  "Why the identity conflict is not a `409`"), so the suite asserts **both remaining detectors** as
  well as the status: the **audit row**, and the route's **`console.error`** — captured across the call
  by swapping `console.error` for a recorder and restoring it in a `finally`. With the status no longer
  distinguishing the condition those two are the only ways to see it at all, and a test checking only
  the status would let either signal be deleted silently (deleting the `console.error` used to leave
  the suite green). Also
  the quiet cousin of it: a **usable `userId` that resolves to nothing does not fall back to the
  email**. Driven against the real fixture campaign and asserting **zero** issuance rows for the
  address's owner, so a regression to the falling-through behaviour mints and fails the assertion
  rather than silently no-opping.
- **The status map's load-bearing split**: a thrown mint answers `500` (so Klaviyo retries and the
  grant is recoverable) while "no campaign carries this code" answers `200` (so a permanent condition
  does not manufacture a retry storm). Those two were one value before this rework, and the whole
  retry story rests on telling them apart — the suite forces the throw by patching
  `CampaignService.ensureCampaignIssuanceForUser` and restores it in a `finally`.
- **The window**: exactly `259_200_000` ms — the literal, not the expression under test — between
  `issuedAt` and `expiresAt`; a second call inside the window answers `already_active`, leaves the
  deadline **unchanged** and emits no second email; a spent grant (`redeemedEverAt` set, window
  lapsed, `status` restored to `active` as a refund would) stays `spent` and is not re-armed.
- **The budget**: the kill switch and an exhausted daily cap both answer `429` and mint nothing;
  restoring the budget mints on the very next call. **And the fail-closed path** — the gate's count
  query is patched to throw (a Mongo outage), which must answer `500`, audit as `error` and mint
  nothing. That is the assertion that keeps a database outage BLOCKING minting instead of uncapping
  it, and this gate is the only control that survives a leaked secret. The suite first asserts the
  patched query was actually reached, so the `500` cannot pass for some unrelated reason.
- **WHICH outcomes consume the cap** (section 10b, added 2026-08-26, fix round 2). Everything above
  sets the cap to `"0"` (trips at any count, including a permanently-zero one) or `"1000000"`
  (allows at any count), so `mintedToday` was never load-bearing in an assertion and
  `BUDGET_CONSUMING_OUTCOMES` was never read at all — leaving the cap's *definition* mutable in
  both directions with type-check, lint and every suite green. Empty it (or drop `"minted"` /
  `"rearmed"`) and real mints stop being counted: `mintedToday` is permanently `0`, the cap never
  fires, and the endpoint is uncapped from the moment the secret leaks. Add a non-minting outcome
  and the opposite happens: `not_applicable` is the branch's normal RESTING state — no campaign
  carries the code until an admin creates one, plus every ineligible customer — so a few hundred
  inert calls in one UTC day answer `429` to every legitimate flow send for the rest of that day.
  Closed by three things: an **exhaustive `Record<BonusCodeCallOutcome, boolean>` classification**
  in the test (so a new outcome added to the model without a decision here is a compile error, the
  same forcing function `BonusCodeWebhookCall.ts` uses for the trigger enum) asserted equal to the
  constant; a **delta** across one real mint through the route using the production counting query
  verbatim (`+1`, never an absolute — the count is collection-wide for the UTC day and other suites
  share the database); and the same delta across one `not_applicable` call (`0`). Plus the count
  made load-bearing in the gate itself: a cap set to the LIVE count refuses the next call, one
  above it mints. *Mutation-proven:* emptying the constant turns 3 assertions red, adding
  `"not_applicable"` to it turns 2 red; both type-check and lint clean.
- **Response opacity**: `{ ok: true }` for a mint and `{ ok: true }` for "no such customer" are
  asserted byte-for-byte identical, which is the property that stops the endpoint being a
  customer-state oracle.
- **The audit row on every path**, checked by outcome — including the refusals, which is what makes
  the daily cap real, since the budget counts these rows.
- **The Klaviyo profile the event is addressed to** (section 7, added 2026-08-26). The stub records
  `customer_properties`, not just the properties, and the mint case asserts the customer's own
  `email` and `first_name`. That block is built from the user document
  `resolveBonusCodeCustomer` PROJECTED, and `WEBHOOK_USER_PROJECTION` is a plain string literal:
  dropping a field from it is neither a compile error nor a runtime error. The event simply goes out
  with `email: ""`, Klaviyo has no profile to attach it to, and the only record that answers "why
  didn't this customer get their code?" silently stops landing — with no admin surface to notice it
  from. *Mutation-proven:* removing `email` from the projection type-checks and turns one assertion
  red; before this it turned none.
- **The re-arm cooldown, end to end** (section 11, added 2026-08-26, fix round 2). `rearmed` and
  `expired_no_rearm` were the only two of the endpoint's eleven status-map rows that nothing drove
  through the route, and they are exactly the two the cooldown decides between. The anchor reaches
  `decideRearm` as an OPTIONAL fourth argument (`existing?.firstIssuedAt ?? existing?.issuedAt` at
  `CampaignService.ts`), so replacing it with `undefined` type-checks cleanly — and with it gone
  rule 4 never fires: every lapsed row plus a trigger returns `rearmed`, so a flow re-entry, a late
  retry, or marketing re-running a sequence hands the same customer a second full 72-hour window and
  a second code, unbounded, on money-equivalent prize-draw entries. **Neither existing suite can see
  it**: `test:bonus-code-policy` passes `firstIssuedAt` in as an argument, so it tests the decision
  in isolation and never reaches the caller, and `test:bonus-code-mint` §5 deliberately ages
  `firstIssuedAt` PAST the cooldown (its own comment says so), so no DB-backed test ever built a
  lapsed row *inside* it. Section 11 does both through the route: mint, push `expiresAt` into the
  past leaving `firstIssuedAt` where the mint put it → `200` + `expired_no_rearm` + deadline
  unmoved + one row + zero emits; then age `firstIssuedAt` one day past `REARM_COOLDOWN_DAYS` →
  `200` + `rearmed` + a deadline exactly 72 hours out and in the future + `firstIssuedAt` preserved
  (so the next cooldown still anchors on the FIRST grant) + exactly one email. *Mutation-proven:*
  passing `undefined` for the anchor type-checks, lints clean, leaves `test:bonus-code-policy` and
  `test:bonus-code-mint` fully green, and turns 3 section-11 assertions red.

Two safety mechanisms worth knowing before editing it: Klaviyo is stubbed and **verified by object
identity** before `VERCEL_ENV` is forced to `"production"`; and `BONUS_CODE_BY_TRIGGER` is repointed
at per-run fixture codes (restored in `finally`), so the suite never creates a campaign carrying the
real `BACKIN200` / `LOCKIN100` / `EXTRA100` — so it needs no refuse-to-run guard and stays runnable
after launch. Audit rows are cleaned up by the sha256 of a per-run client IP that only this file
sends. Cleanup runs each deletion as an **individually guarded step** (2026-08-26): as unguarded
sequential `await`s, one throwing `deleteMany` skipped everything below it — and the campaigns this
file creates are genuinely live campaigns in a shared database, so a leak leaves a real
`MonthlyEntryCampaign` row carrying a fixture code that then collides with the unique index on
`code` on the next run. Same pattern as `campaign-window.test.ts` / `campaign-enrolment.test.ts`;
`test:bonus-code-mint` was converted at the same time and had `MilestoneIssuance` added to its
steps — its §4 drives a real `RedemptionService.redeem()`, which runs
`MilestoneService.checkAndIssueMilestones`, so it shares that footprint with its sibling. That leak
is latent only while no active `MilestoneReward` has a threshold low enough for a fixture user to
reach; the moment one does, every run leaks a row permanently.

#### `test:code-visibility` — what it protects

`GET /api/redeemables/status` returns `code` only for campaigns the caller holds an issuance for.
Three shapes matter: the holder sees the code in both `activeCampaigns` and the singular
`activeCampaign`; the non-holder still sees the campaign **listed** with the `code` key absent (it
is a redaction, not a filter — asserting only "no code" would also pass if the campaign had
vanished); and a caller holding a *different* campaign's issuance sees exactly one of the two
codes, which is the assertion that catches a naive "does this user hold any issuance?" check.
`next-auth` is stubbed in `require.cache` to stand in for the session cookie a test process cannot
mint; everything downstream is the real handler. Its cleanup was converted to individually guarded
steps on 2026-08-26 for the same reason as its two siblings — it also creates live campaigns in a
shared database.

**All four DB-backed suites in this domain now guard each cleanup step**
(`test:campaign-window`, `test:campaign-enrolment`, `test:bonus-code-mint`,
`test:bonus-code-webhook`), as does `test:code-visibility`. Copy that shape into any new one:
unguarded sequential `await`s mean one failure silently skips every step below it, and what is left
behind is not a stray test row but a **live campaign** and, in two of them, a real entry
subdocument inside a live `MajorDraw`.

## Test conventions

- Standalone tsx scripts (per CLAUDE.md); each needs its own `test:*` entry in `package.json` or it
  is undiscoverable.
- Pure-policy helpers (`campaignAudienceFilter`, `topMajorDrawPercentile`,
  `cancellation-upsell-eligibility`, `purchase-eligibility`, `bonus-code-policy`) are testable
  directly.
- Service tests can stub the repository layer to focus on logic.

### Conventions for the DB-touching suites

These connect to a **real** dev database. Every one of them:

- creates its own users/campaigns/issuances under a per-run identifier and deletes them in a
  `finally`, including on failure — issuances are removed **by `userId`**, which is safe precisely
  because every user was created by that run;
- never mutates or deletes a document it did not create, and never runs an unscoped `deleteMany`.
  **Two** suites reach shared data, both because they drive a successful `RedemptionService.redeem`,
  which pushes an entry subdocument into the live target `MajorDraw` (and can issue a
  `MilestoneIssuance`): `bonus-code-mint` (§6, the refund lifecycle) and `campaign-window` (three
  scenarios assert `success: true`). Both `$pull` the entries back out in `finally`, filtered to that
  run's users, and `campaign-window` also clears any `MilestoneIssuance` for them. `campaign-window`
  was previously listed here as safe while it was in fact leaving Major Draw entries behind on every
  run — if you add a scenario that redeems, add the cleanup in the same edit;
- **never creates a campaign carrying a real trigger code.** `campaign-enrolment` used to, in its
  production-gate section, and needed a refuse-to-run guard plus a SIGINT/SIGTERM handler to survive
  it: a globally-unique non-sparse index on `code` meant the suite would collide the day the real
  `BACKIN200` campaign existed, and a leaked fixture would silently no-op every real cancel-click.
  That section and all three guards were deleted on 2026-08-26. `bonus-code-webhook` needs the real
  codes too and solves it differently — it repoints `BONUS_CODE_BY_TRIGGER` at per-run fixture codes
  and restores it in `finally`. Prefer that pattern; never reintroduce a fixture on a live code;
- keeps fixture campaigns **inert for everyone else**: `manual-users` pinned to a single throwaway
  user, so no real account can be enrolled during the seconds the campaign exists;
- never calls a third-party API — an emit is asserted through the persisted
  `notifiedAt`/`notifyError`, or through a stub verified by identity;
- is **rerunnable**: a second run passes with no manual cleanup.

## What's NOT well tested

- CSV import at scale
- Prize-catalog rendering edge cases
- **The Klaviyo flows themselves.** The three internal trigger call sites were deleted on
  2026-08-26; what replaced them lives in Klaviyo, not in this repo. `mintBonusCodeForTrigger` and
  the webhook route are covered end to end, but that each flow calls the endpoint at the right step,
  with the right trigger and the right customer identifier, is unverifiable from here. So is the
  emit that ENTERS each flow: delete `"Started Checkout"` from the register route or the cancel-time
  event from the cancel service and the whole downstream sequence dies silently, with every test in
  this repo still green.
- `expired_no_rearm` is covered only by the pure policy suite: reaching it through the wallet sweep
  needs a legacy campaign that is still live while its issuance has already expired, which the
  legacy stamping rule (`expiresAt = campaign.endsAt`) makes unreachable.

## The blind spot that let a launch-stopper ship (2026-08-27)

Worth stating plainly, because the lesson generalises. The `campaignMode: "global"` index bug
(one issuance per campaign, ever) survived a full acceptance suite, three review rounds and a
production seeder. Nothing was broken about any of those; the suite was **structurally incapable**
of seeing it.

The acceptance journey mints exactly **one** issuance per campaign per run — membership leg →
LOCKIN100, pack leg → EXTRA100, negative leg mints nothing — against a database that `run.ts` →
`wipeAndSeed` → `dropDatabase()` empties between runs. A **second customer on one campaign never
happens**. The failure needed exactly that, so no number of green runs could have produced it.

The rule to carry forward: **when a feature's whole point is that many people use the same thing,
at least one test must exercise the second and third user.** A suite that always uses one identity
per fixture is testing "does it work", not "does it work for a cohort" — and a marketing send is a
cohort by definition. `test:global-campaign-enrolment` §3 is that test.
