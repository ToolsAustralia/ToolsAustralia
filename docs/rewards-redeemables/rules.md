# Rewards-Redeemables — Rules

## R1. Atomic redemption

Redemption must be atomic: validate → burn → fulfill. If fulfillment fails after burn, the issuance status must roll back OR an admin-visible reversalIssues record must be written. No silent loss.

## R2. Idempotent issuance

`RedeemableIssuance` writes use a stable issuance key (`${campaignId}:${userId}` or `${drawId}:${userId}` etc.) to prevent double-issuance from webhook retries or campaign re-runs.

## R3. Refund reversal — redeemed issuances are clawed back too

Full-refund reversal revokes milestone issuances granted by the refunded payment; an already-**redeemed** issuance is first un-redeemed (`RedemptionService.unredeemMilestoneRedemption` removes the granted entries + draw entries) and then set `status: "revoked"` ([MilestoneService.revokeIssuancesFromPaymentEvent](../../src/services/milestones/MilestoneService.ts)). A monthly coupon or milestone redemption consumed *on* the refunded purchase is likewise un-redeemed (coupon back to `status: "active"`, its entries removed). `RefundProcessed.data.reversalIssues[]` records reversal-step **failures** only — nothing survives by design, only by error. Steps are registered in `buildLedgerReversalSteps` ([refund-ledger-reversal.ts](../../src/utils/payment/refund-ledger-reversal.ts)).

## R3b. A refunded PERSONAL-WINDOW grant is spent, on the redeem side too (2026-08-25)

R3's reversal restores a redeemed monthly coupon to `status: "active"` and `$unset`s `redeemedAt`,
leaving a refunded row byte-identical to a never-redeemed one on every field except
**`redeemedEverAt`**. `decideRearm` has always honoured that on the **mint** side (a refund cannot
farm a second *grant*). The **redeem** side did not, and for a personal-window campaign that was a
money hole rather than a cosmetic gap: a trigger campaign must be `purchaseRequirement: "none"` —
a cancel-click has no purchase to qualify on — so `hasQualifyingPurchase` returns `true` immediately
and the customer could re-claim the full grant (100–200 real Major Draw entries) while holding a
full refund. The wallet agreed with them, rendering an enabled Claim button.

Three sites now read `redeemedEverAt`, all scoped by `personalWindowGoverns(campaign)`:

1. `RedemptionService.redeem()` — refuses with `already_redeemed` before the claim.
2. The same method's **atomic claim filter** — `redeemedEverAt: { $exists: false }` spread into the
   `findOneAndUpdate` filter, so two racing claims on a refunded row cannot both win.
3. `RedeemablesWalletService` — `isRedeemableNow` is false, so the wallet stops offering Claim,
   **and the item’s `status` is projected as `"redeemed"` for display**. The stored row is
   untouched; this is presentation only. Without it the card keeps a future `expiresAt` and a
   stored `status: "active"`, so it sits in the CLAIMABLE tab as an "Active" pill with no button —
   a broken button — and Cobber FAQ 88 ("it is not returned to your account") reads as false on
   screen. Because both wallet list filters key on that status, the projection also moves the row
   into **past**, where a spent grant belongs, and makes FAQ 88 literally true with no copy change.
   (`/api/codes/validate` refuses too — see [docs/promo/api.md](../promo/api.md).)

**The scoping is not incidental.** With `validForHours` unset, all four expressions are byte-identical
to what they were: legacy monthly coupons restore a refunded coupon to claimable **on purpose**, and
that behaviour is untouched. If the business ever wants refunded personal codes reusable, it is one
predicate to remove at each site — not a redesign.

Pinned by `npm run test:bonus-code-mint` §6 (second-redeem attempt + wallet agreement) and
`npm run test:campaign-window` (checkout refusal).

## R3c. The code that reaches Stripe metadata is re-validated SERVER-SIDE (2026-08-25)

`/api/codes/validate` is a **preview**. It can only answer per-customer when the caller has a
session — and the population these codes target does not have one. `MembershipModal` computes its
user id as `isAuthenticated ? userData._id : guestUserData.userId`, and **step-1 registration in
this codebase does not authenticate** (CLAUDE.md rule 6), so a customer applying a code straight
after registering reaches checkout as a **guest**. The guest leg answers from the campaign window
alone, so it says APPLIED — and a guest who holds no issuance, or whose personal window has lapsed,
would pay and receive nothing. That is exactly the `checkout-start` / LOCKIN100 population, so
R3b and the `not_held` refusal would have protected everyone except the people they were written
for.

So the authoritative check runs where the **server** already knows who is buying:
`CampaignCodeValidationService.resolveCodeForCheckout({ code, userId, context })`, called by all
**four** routes that write `campaignCode` into Stripe metadata:

- `POST /api/stripe/create-subscription` (guest — id resolved by email lookup)
- `POST /api/stripe/create-subscription-existing-user` (session)
- `POST /api/stripe/create-one-time-purchase` (guest — id resolved by email lookup; **two**
  metadata sites, reuse-PI and create-PI, both covered by one hoisted call)
- `POST /api/stripe/create-one-time-purchase-existing-user` (session)

Three properties are load-bearing:

1. **No body field is trusted.** Each route passes an id it resolved itself.
2. **No resolved account ⇒ refuse.** Issuances are keyed `{campaignId, userId}` and
   `RedemptionService` requires a real user row, so a code applied by someone with no account can
   never redeem — carrying it into metadata only defers the failure past the payment.
3. **Refusal drops the code; it never fails the purchase.** The customer is buying a membership or
   a pack. Dropping is also recoverable — a genuine holder keeps the issuance in their wallet and
   can claim it there — whereas leaving a non-holder’s code in metadata produces the silent
   "paid and got nothing" that `checkAndRedeemCampaign` cannot report. It **fails closed** on an
   unexpected error, for the same reason.

Every refusal logs at `console.error` (production strips `warn`), tagged `[campaign-code]` with the
route `context` and the `reason`.

Pinned by `npm run test:campaign-window` Site 5, including a source-level guard asserting all four
routes call the resolver and none writes `validatedData.campaignCode` directly — a fix applied to
one route is not a fix.

## R4. Wallet conservation under pause

When a user is "rewards-paused" (e.g. abuse), existing issuances are NOT revoked. They remain in the wallet but redemption is gated via `rewardsGuard.ts`. Admin can manually revoke if needed.

## R5. Targeting purity

`TargetingService` filters must be pure (no side effects during evaluation). Side effects (writing issuances) only happen in the `CampaignService.run()` step after targeting completes.

## R6. CSV import preview before commit

Bulk CSV imports must offer a dry-run / preview that lists who would receive what, before actually writing issuances. _TODO: verify this is implemented in `CsvImportService.ts`._

## R7. Top-percentile computed against MajorDraw, not subscription

`topMajorDrawPercentile.ts` computes percentiles across draw participation, not subscription tier. A high-tier non-participant doesn't qualify; a low-tier active participant might.

## R8. Purchase-gated coupons require a REAL in-window purchase

A campaign coupon's `purchaseRequirement` (`"none"` | `"membership"` | `"one-time"` | `"any"`) is enforced by the single predicate `hasQualifyingPurchase(...)` in [purchase-eligibility.ts](../../src/utils/redeemables/purchase-eligibility.ts):

- `"none"` → always eligible.
- `"membership"` → an active subscription.
- `"one-time"` → a `oneTimePackages` purchase whose `purchaseDate` falls inside the campaign window `[startsAt, endsAt | now]`.
- `"any"` → membership OR an in-window one-time purchase.

The window floor is the campaign `startsAt` — the purchase must happen **during the campaign**. Lifetime purchase history (and lifetime `accumulatedEntries`) must **never** be used as a purchase proxy.

Both call sites must stay in lockstep on this predicate: `RedemptionService.redeem()` enforces it before the burn (else `ineligible`), and `RedeemablesWalletService.isRedeemableNow` applies the same check so the client "Claim" button stays disabled until the qualifying purchase exists. Changing one without the other lets the button and the endpoint disagree. Both queries must select the user's `subscription` + `oneTimePackages` and the campaign's `startsAt`/`endsAt`/`validForHours`.

## R9. The four campaign-window truncation sites must agree

> **2026-08-27 — the open-ended `endsAt` sentinel changed NONE of these four sites, deliberately.**
> A campaign may now carry `endsAt` = `NEVER_EXPIRES_ISSUANCE_DATE` (year 9999) to mean "no minting
> backstop, issues until an admin disables it" — see
> [architecture.md](./architecture.md#the-three-campaign-expiry-shapes-and-the-open-ended-sentinel-2026-08-27).
> Every one of the four sites below already handles it correctly *without* knowing about it, because the
> sentinel is a real, far-future `endsAt`: site 1's `isCampaignRedeemable` returns true through
> `personalWindowGoverns` before `endsAt` is ever consulted; site 2's `endsAt >= now` leg matches on a
> year-9999 date the same as on any other future date; site 3 already substitutes `endsAt: null` for a
> personal-window campaign, so the ceiling is `now` either way; site 4 is unchanged for the same reason as
> site 1. **Do not add an `isOpenEndedDate` branch to any of them.** `isOpenEndedDate` is a
> presentation-layer helper for the admin form and the admin list — a fifth reading of `endsAt` in the
> redemption path is exactly the drift this rule exists to prevent.


A campaign that hands out **personal windows** (`validForHours` set — see `personalWindowGoverns` /
`isCampaignRedeemable` in [bonus-code-policy.ts](../../src/utils/redeemables/bonus-code-policy.ts))
stamps each issuance its OWN `expiresAt`. The campaign's own `endsAt` becomes a **minting
backstop** ("no new customer qualifies after this date"), not a redemption deadline — a customer
who was already issued a code must be able to redeem it right up to THEIR `expiresAt`, even after
the campaign's `endsAt` has long passed. Four independent places re-check the campaign window at
redemption/checkout time, and every one of them has to reach the same verdict or a customer holding
a perfectly valid personal coupon gets refused — three of the four with a misleading message
("invalid code" / generic "not valid" instead of "you missed your window"):

1. **`RedemptionService.redeem()` — the redemption window check.** Calls
   `isCampaignRedeemable(campaign, now)` directly (imported, never hand-inlined) so this site can't
   drift from the shared predicate.
2. **`RedemptionService.redeem()` — the by-code campaign resolve.** A Mongo query, so the
   `validForHours >= 1` leg lives in the `$or`. This one matters most for a `campaignMode: "global"`
   issuance: its row carries **no `code` of its own** (only the campaign does), so it can ONLY be
   found by first resolving the campaign by code. Without the leg, that resolve returns nothing once
   `endsAt` passes and the customer is told `invalid_code` — "we never gave you this" — instead of
   the truth. (Do **not** touch the sibling `$or` a few lines below it that resolves `MilestoneReward`
   — a different rail entirely, with no `validForHours`.)
3. **`RedemptionService.redeem()` / `RedeemablesWalletService.getUserWallet()` — the
   purchase-requirement ceiling.** `hasQualifyingPurchase`'s window ceiling defaults to the
   campaign's `endsAt` (or `now` when absent). For a personal-window campaign that ceiling must be
   `now`, not the long-past `endsAt` — otherwise a legitimately late qualifying purchase (made after
   the campaign's backstop but before the customer's own deadline) is rejected. Both sites pass
   `personalWindowGoverns(campaign) ? { startsAt: campaign.startsAt, endsAt: null } : campaign` into
   `hasQualifyingPurchase` — **never** widened for legacy campaigns (unset `validForHours`); that
   ceiling was hardened deliberately (see the doc comment on `hasQualifyingPurchase`). Both queries
   must select `validForHours` on the campaign or `personalWindowGoverns` silently evaluates to
   `false` and the ceiling never gets overridden — a bug the regression test below specifically
   pins.
4. **`CampaignCodeValidationService.validate()`, behind `POST /api/codes/validate` — the checkout
   preview gate.** This one fires **first**, before checkout even reaches redemption — fixing only
   sites 1–3 yields a coupon the server would honour but checkout calls invalid. The campaign lookup
   gets the same `$or` leg and selects `startsAt endsAt neverExpires validForHours`. Additionally:
   once the campaign is found, a personal-window campaign's OWN backstop no longer vetoes it, but the
   customer's **individual** deadline still can — so for an identified caller the service looks up
   that user's own issuance and, if ITS `expiresAt` has passed, returns a dated refusal instead of a
   bare "invalid campaign code". `userId` is the caller's **session** id, never a body field. With no
   session (guest checkout) it falls back to the campaign window only — this route is an
   unauthenticated **preview**; redemption stays authoritative. The route handler's own "auto"
   fallback (the only mode the real frontend uses for campaign codes) previously discarded EVERY
   invalid campaign message in favour of a generic "This code is not valid right now." — fixed
   alongside the `$or`/lookup change, or the dated reason would compute correctly and never reach the
   customer. Full response table in [docs/promo/api.md](../promo/api.md).

Regression coverage: [`campaign-window.test.ts`](../../src/services/redeemables/__tests__/campaign-window.test.ts)
(`npm run test:campaign-window`) exercises all four sites end-to-end against a live DB — it does NOT
re-test `isCampaignRedeemable`/`personalWindowGoverns` in isolation (that's
`test:bonus-code-policy`'s job); it proves each call site actually **consults** those predicates,
including the purchase-ceiling override and the message reaching the real `POST` handler.

## R10. A duplicate-key error is classified by WHICH index collided, never by campaign mode (2026-08-27)

`RedeemableIssuance` carries two unique indexes — `(campaignId, userId)` and `(campaignId, code)` —
and `CampaignService.createIssuanceForUser`'s mint is an upsert that can throw `E11000` on either.
**The handler must read `error.keyPattern` and nothing else.** It used to compute
`isUserCollision = !needsUniqueCode || keyPattern has "userId"`, whose first disjunct is
unconditionally `true` in `campaignMode: "global"` — the comment above it stated, in plain English,
that global mode "cannot collide on `{campaignId,code}` because it writes no code", which was
exactly wrong (see the index note in [models.md](./models.md#redeemableissuance)). Every code
collision was therefore reported as a `{campaignId,userId}` race, re-read, found nothing, and
returned **`already_active` with no issuance**.

Two rules follow, and both are load-bearing:

1. **Classify from `keyPattern`.** `"userId" in keyPattern` ⇒ a genuine concurrent-trigger race.
   `"code" in keyPattern` with `needsUniqueCode` ⇒ the pre-existing regenerate-and-retry.
   `"code" in keyPattern` **without** `needsUniqueCode` ⇒ the live index is still `unique + sparse`;
   log it naming the migration and **throw**. No `keyPattern` at all ⇒ treat it as the conservative
   case and throw rather than guess.
2. **`already_active` is only ever returned WITH an issuance.** That outcome is what the issue route
   maps onto a non-retryable status for Klaviyo, and `mintBonusCodeForTrigger` emails nothing on it —
   so `already_active` without a row is the value that silently means *"no grant exists, but tell the
   caller everything is fine."* A `{campaignId,userId}` collision whose re-read finds no winner is a
   broken invariant, not a race: log and throw, so the route answers `error` — the one status whose
   retry can still recover the grant.

Regression coverage: `npm run test:global-campaign-enrolment`.

## R11. The Stripe stamp is authoritative; the recorded checkout intent is the recovery (2026-08-27)

`campaignCode` in Stripe metadata is written on the **unpaid** object immediately before the charge
(R3c) and always wins at grant time. But the request that writes it is capped client-side at 15s and
the browser charges regardless of how it ends — observed live: the server answered `200 in 14903ms`,
the browser had already aborted, the card was charged, and the webhook saw no `campaignCode`. Raising
the cap does not close that; a dropped connection or a closed tab reproduces it at any cap.

So the server records its own copy. `attachTypedCodeToCheckout` calls
`CampaignCodeValidationService.recordCheckoutIntent` — writing `checkoutIntentAt` /
`checkoutIntentTargetId` onto the customer's own issuance — **before** the Stripe round trip, because
the Stripe round trip is the slow half the browser abandons during. `checkAndRedeemCampaign` then
consults `resolveCheckoutIntent` **only when the paid object carries no code at all**.

The invariants:

- **The stamp wins.** Apply A → remove → apply B is decided by the stamp, never by the intent.
- **A removal clears the intent** (`code: null` ⇒ `checkoutIntentAt: null` across the customer's
  rows), so "apply → remove → pay" cannot recover a code the customer took off. A code the server
  *refuses* records a clear too.
- **The intent is a CANDIDATE, never a decision.** `RedemptionService.redeem` still re-applies every
  eligibility / expiry / already-spent gate, so nothing is granted that the normal path would refuse.
- **The window expires** (`CHECKOUT_INTENT_WINDOW_MS`, 30 min). That is what stops a later purchase or
  a renewal invoice auto-redeeming a code the customer never applied to it.
- **It never blocks the sale.** Both halves swallow their own errors; a failure costs the recovery,
  never the purchase.

A recovery fires a `console.error` naming the issuance and the Stripe object — it is the alarm that an
attach was lost, and a rising rate means the attach path needs attention even though the grant landed.

Regression coverage: `npm run test:checkout-intent-recovery` (the service pair) and
`npm run test:attach-typed-code` §7 (the ordering — intent before Stripe).
