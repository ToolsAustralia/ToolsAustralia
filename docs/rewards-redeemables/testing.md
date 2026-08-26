# Rewards-Redeemables — Testing

## Suites

| Script | Covers |
|---|---|
| `npm run test:redeemables` | Redeemables service tests under [src/services/redeemables/__tests__/](../../src/services/redeemables/__tests__/) |
| `npm run test:redeemables-purchase-gate` | [purchase-eligibility.test.ts](../../src/utils/redeemables/__tests__/purchase-eligibility.test.ts) — 16 assertions covering `hasQualifyingPurchase(...)` across all four `purchaseRequirement` values, window bounds (inclusive `startsAt`/`endsAt`, `neverExpires` → `now`), and the regression that an active member does NOT auto-pass a `"one-time"` requirement. |

### Per-customer bonus codes

Six suites are **pure** (no DB, no env) and cover the arithmetic and the decision tables; three are
**integration** suites that run the real service/route code against a live database. The split
matters: a pure suite proves a predicate is right, an integration suite proves the call site
actually consults it and that the write lands.

| Script | Kind | Covers |
|---|---|---|
| `npm run test:bonus-code-expiry` | pure | [expiry-hours.test.ts](../../src/utils/redeemables/__tests__/expiry-hours.test.ts) — `expiryAfterHours`'s exact-offset arithmetic (both DST transitions asserted on elapsed milliseconds, not the shifted wall-clock hour; year rollover; leap day; no second/ms rounding; zero/negative/fractional guards), plus `decideRearm`'s re-arm cooldown (`REARM_COOLDOWN_DAYS`): inside vs outside the cooldown, the exact boundary, `redeemedEverAt` winning regardless of cooldown, the no-`firstIssuedAt` fallback, and that the no-trigger path is byte-identical to before. Replaces `expiry-window.test.ts`, deleted 2026-08-26 with the calendar-day helper it tested (`endOfDayAESTAfterDays`). |
| `npm run test:bonus-code-policy` | pure | [bonus-code-policy.test.ts](../../src/utils/redeemables/__tests__/bonus-code-policy.test.ts) — `decideRearm`'s decision table (3-arg calls only), `personalWindowGoverns`, `isCampaignRedeemable`. |
| `npm run test:issuance-expiry` | pure | [issuance-expiry.test.ts](../../src/services/redeemables/__tests__/issuance-expiry.test.ts) — `resolveIssuanceExpiry`'s precedence chain. |
| `npm run test:campaign-window` | DB | [campaign-window.test.ts](../../src/services/redeemables/__tests__/campaign-window.test.ts) — the four campaign-window truncation sites (see [rules.md R9](./rules.md)). |
| `npm run test:trigger-eligibility` | pure | [trigger-eligibility.test.ts](../../src/services/redeemables/__tests__/trigger-eligibility.test.ts) — the trigger bypass in `isUserEligibleForCampaign`. |
| `npm run test:klaviyo-canonical` | pure | Bonus Code Issued event-property shape, and that the builder emits the *passed* expiry. |
| `npm run test:bonus-code-mint` | **DB** | [bonus-code-mint.test.ts](../../src/services/redeemables/__tests__/bonus-code-mint.test.ts) — the mint, the re-arm lifecycle, the refund guarantee, concurrency, and legacy parity. See below. |
| `npm run test:campaign-enrolment` | **DB** | [campaign-enrolment.test.ts](../../src/services/redeemables/__tests__/campaign-enrolment.test.ts) — the trigger-as-targeting relaxation, the email-verified waiver boundary, and the wallet-sweep leak defence, against a real database. Renamed from `test:bonus-code-trigger` on 2026-08-26 when the three internal trigger call sites were deleted: what remains tests `CampaignService` enrolment, not any trigger wiring. See below. |
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
   instant is the one the email prints and the redemption gate compares against, and a re-arm moves
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

Ten sections, all through the real `POST` handler with real `NextRequest` objects:

- **Authorization.** No header, a wrong secret and a wrong secret *of the same length* all answer
  `401` (the same-length case is the one a naive `timingSafeEqual` throws on). An **unset** server
  secret answers `500`, never `200` — the fail-closed property, asserted rather than assumed.
- **Rotation.** With `BONUS_CODE_WEBHOOK_SECRET=<old>,<new>` both are accepted; dropping `<old>` from
  the list revokes it on the next call.
- **The production assertion.** With `VERCEL_ENV=preview`, a fully valid authorised call answers
  `403` and writes **no issuance row**.
- **The body contract**, including the case that matters most in practice: an **empty** `userId`
  (what `{{ person.user_id }}` renders on a newsletter-form profile) and a non-ObjectId `userId` both
  fall through to the email rather than `400` — and, symmetrically, a **malformed email does not
  `400`** a call the `userId` can serve. An unknown trigger answers `400` and echoes the offending
  value; a `400` whose trigger *was* valid still records that trigger on its audit row, because that
  row is what names the broken flow.
- **Customer resolution**, including the `409` when `userId` and `email` name different accounts, and
  the `200 user_not_found` for an unknown id, an unknown address and a deactivated account. Also the
  quiet cousin of the `409`: a **usable `userId` that resolves to nothing does not fall back to the
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
- **Response opacity**: `{ ok: true }` for a mint and `{ ok: true }` for "no such customer" are
  asserted byte-for-byte identical, which is the property that stops the endpoint being a
  customer-state oracle.
- **The audit row on every path**, checked by outcome — including the refusals, which is what makes
  the daily cap real, since the budget counts these rows.

Two safety mechanisms worth knowing before editing it: Klaviyo is stubbed and **verified by object
identity** before `VERCEL_ENV` is forced to `"production"`; and `BONUS_CODE_BY_TRIGGER` is repointed
at per-run fixture codes (restored in `finally`), so the suite never creates a campaign carrying the
real `BACKIN200` / `LOCKIN100` / `EXTRA100` — so it needs no refuse-to-run guard and stays runnable
after launch. Audit rows are cleaned up by the sha256 of a per-run client IP that only this file
sends.

#### `test:code-visibility` — what it protects

`GET /api/redeemables/status` returns `code` only for campaigns the caller holds an issuance for.
Three shapes matter: the holder sees the code in both `activeCampaigns` and the singular
`activeCampaign`; the non-holder still sees the campaign **listed** with the `code` key absent (it
is a redaction, not a filter — asserting only "no code" would also pass if the campaign had
vanished); and a caller holding a *different* campaign's issuance sees exactly one of the two
codes, which is the assertion that catches a naive "does this user hold any issuance?" check.
`next-auth` is stubbed in `require.cache` to stand in for the session cookie a test process cannot
mint; everything downstream is the real handler.

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
