# Payment — Testing

## Suites

Tests live under [src/utils/payment/__tests__/](../../src/utils/payment/__tests__/).

> _TODO: enumerate exact test files and matching `npm run test:*` scripts. The pattern is one tsx test per script name in package.json._

| Script (likely names) | Covers |
|---|---|
| `npm run test:anchor-billing` | Anchor billing math (overlap with [billing-stripe](../billing-stripe/) and [subscription](../subscription/)) |
| `npm run test:stripe-collection-pause` | Pause-collection clearing + invoice selection (overlap) |
| `npm run test:redeemables` | Reverser modules for redeemables grants (overlap with [rewards-redeemables](../rewards-redeemables/)) |
| `npm run test:invoice-generated-gate` | Fences `shouldEmitInvoiceGenerated(billing_reason)` — the server-side "Invoice Generated" receipt gate ([backend.md](./backend.md), [gotchas.md](./gotchas.md)). Test lives at `src/utils/integrations/klaviyo/__tests__/invoice-generated-gate.test.ts` (klaviyo/tracking area, not `utils/payment/__tests__/`). |
| `npm run test:purchase-event-time` | Fences the CAPI Purchase `event_time` pipeline used by `grantBenefits` — `normalizeEpochToUnixSeconds` (ms vs seconds) + `resolveEventTime` (out-of-window → "now") ([backend.md](./backend.md)). Test lives at `src/lib/tracking/__tests__/purchase-event-time.test.ts` (tracking area, not `utils/payment/__tests__/`). |
| `npm run test:attach-typed-code` | Fences `attachTypedCodeToCheckout` ([backend.md](./backend.md), [gotchas.md](./gotchas.md)): full metadata preservation on the update payload (the catastrophic-failure case — a partial map destroys `packageId`/CAPI/A-B/attribution on an object about to be charged), clearing via `campaignCode: ""`, the unpaid-only state guard **including the anchor-day `trialing` + open-invoice shape and its already-paid twin**, both possession proofs, identity-from-metadata-not-caller, identity resolution (the `"guest"` / `"new"` placeholders and the `userEmail → User.findOne` fallback — the path that actually shipped broken), and Stripe failures as typed results rather than throws. Stripe is stubbed and verified by object identity before any case runs. **Extended 2026-08-27 (§7):** the recorded checkout intent — that the attach calls `recordCheckoutIntent` with the RESOLVER’s canonical code, against the identity taken from the object’s own metadata, naming the Stripe object being charged, and **before** the Stripe update. The ordering is asserted as an explicit `["intent", "stripe"]` log rather than a call count: a record written after the Stripe write would be missing in exactly the abandoned-request case it exists for, and nothing about the returned result would reveal that. Also pinned: a cleared code and a server-REFUSED code each record a clear, never the code. The caller's applied string (`"  lockin100 "`) and the resolver's canonical answer (`"LOCKIN100"`) are deliberately **different**, so "wrote the resolver's code" cannot pass against an implementation that echoes the caller's input. **Extended 2026-08-27 (§8) — all three code types:** the seam now takes the **raw typed string** and classifies it server-side, so §8 pins that a referral code lands in `metadata.referralCode` (asked with the identity resolved from the object's own metadata, and short-circuiting before the campaign resolver is reached), a promo-link code lands in `metadata.promoLinkCode` with the **model's** canonical code, an expired promo link is not a promo code, and swapping one type for another clears the slot it replaced. Three clearing cases are load-bearing and none is visible to `tsc`: a `?promo=` **attribution** `promoLinkCode` that this seam did not write is never touched (that is what `metadata.typedCodeSlot` exists for), clearing removes the slot the marker names, and a **pre-marker** object — `campaignCode` stamped, no marker — is still cleared on removal, which is what keeps *apply A → decline → remove A → retry* working. |

> **Renamed 2026-08-27:** this suite was `npm run test:campaign-code-checkout` over `campaign-code-checkout.test.ts`. The seam it fences carries all three code types now, so both moved to `attach-typed-code`. `test:campaign-code-checkout` is kept in `package.json` as a **deprecated one-line alias** (it runs `npm run test:attach-typed-code`) so existing CI and agent invocations do not break; delete it alongside the route alias.
| `npm run test:decline-guidance` | Fences the confirm-time card-decline pipeline ([gotchas.md](./gotchas.md#confirm-time-card-declines-throw--routes-must-return-the-400-payment-failed-shape-fixed-2026-07)): `isStripeCardError` duck-typing, `extractPaymentErrorCodes` across all error shapes (incl. ApiError `.data`), the `DECLINE_CODE_GUIDANCE` map (sensitive-code non-leak + message-length caps), and `formatPaymentError` end-to-end for the production bug shape (`decline_code: invalid_account` carried on `ApiError.data`). Test lives at `src/utils/payment/stripe/__tests__/payment-error-decline-guidance.test.ts`. |
| `npm run test:invoice-pi-recovery` | Fences PaymentIntent recovery on `pay-failed-invoice` ([gotchas.md](./gotchas.md)): `isInvoicePayable`, `requires_action` staying inside `CLIENT_CONFIRMABLE_STATUSES` (the 3DS state whose absence caused every production 500 in the week to 2026-09-03), and the deliberate behavioural split between `selectConfirmableInvoicePaymentIntent` (refuses a PI on a void/uncollectible invoice — it becomes a browser `client_secret`) and `dropNonConfirmableInvoicePaymentIntent` (passes it through — it only gates a fresh `invoices.pay` attach). All three mutations verified to fail the suite. Test lives at `src/utils/payment/stripe/__tests__/invoice-payment-intent-recovery.test.ts`. |
| `npm run test:shop-entries` | Fences the **merchandise entry grant** — the one benefit path that starts in the shop rather than a package. It lives here because the grant runs through `processPaymentBenefits` like every other one ([cart-shop-products/testing.md](../cart-shop-products/testing.md) holds the full assertion list). Runs against `E2E_MONGODB_URI`, never the dev database, because several assertions can only be made by reading a document back out of Mongo. |

## Test conventions

- No jest/vitest. Standalone tsx scripts.
- Each test file needs a matching `test:*` entry in `package.json`.
- Pure-policy helpers (no Stripe SDK) tested directly. Stripe-touching helpers are integration-tested or smoke-tested via Stripe CLI.

## Manual smoke testing

```bash
# 3DS test card requiring authentication
4000 0000 0000 0341

# Decline
4000 0000 0000 0002

# Insufficient funds
4000 0000 0000 9995

# Authentication required (3DS challenge)
4000 0027 6000 3184
```

Stripe Dashboard > Developers > Test cards has the full reference.

## Grant assertions must read back from Mongo (2026-08-20)

Anything that credits a benefit is asserted at the **database** level, not by inspecting the
value a function returned. Mongoose strict mode drops keys absent from the schema **silently,
on save rather than on assignment** — so a grant can compute the right number, appear to store
it, and persist nothing, with `tsc` green and the function's own return value correct.

`test:shop-entries` carries a **control** for exactly this: it writes an undeclared key
alongside a declared one and asserts the undeclared key is gone on re-read. Without that
control the positive assertion proves nothing — if strict mode were off, it would pass either
way. This failure mode has shipped twice on `MajorDraw.entriesBySource`.

The same suite also demonstrates why a passing test is not evidence on its own: its multiplier
ladder assertion was **dead for weeks** — it divided both sides of the comparison by the same
variable, so every iteration was algebraically identical and it could not have failed. When
adding a guard here, mutate the code it guards and confirm the test goes red before trusting it.

## What's NOT well tested

- 3DS redirect flow (manual smoke only).
- Saved-payment-method deletion flow with active subscription.
- Refund reversal end-to-end (reverser-step units exist; full orchestration is production-only).

> _TODO: identify specific gaps and add test scripts._

| `npm run test:typed-code-checkout` | Fences `resolveTypedCodeAtCheckout` / `typedCodeRefusalCopy` (`src/utils/payment/typed-code-at-checkout.ts`) — the purchase-click resolve for a code the customer typed but never pressed **Apply** on ([frontend.md](./frontend.md), [gotchas.md](./gotchas.md)). `globalThis.fetch` is stubbed; no DB/env. **The file's whole reason for existing is the 429/500 pair:** `/api/codes/validate` returns `{ success: false, valid: false }` for both its own rate limiter and its own outage, and `{ success: true, valid: false }` at HTTP 200 for a genuine refusal — so a `!body.valid` read would make our rate limiter and our downtime start **stopping sales**, strictly worse than the bug being fixed and invisible to `tsc`. Both directions are pinned (429/400/500/`success:false`/unknown `type`/thrown fetch/unparseable body → `inconclusive`; a real `valid:false` → `refused`). Also: each of the three code types resolves as **itself** rather than being flattened to campaign; an empty box short-circuits without touching the network; and the 8s cap is **actually exercised** against a fetch that honours the abort signal and never settles otherwise, because an unexercised timeout is a promise, not a behaviour. Finally a rule-11 sweep over the assembled refusal copy (ban list mirrored from the FAQ corpus's) — every string here is customer-facing at the most sensitive moment there is. **§6 — `evaluatePurchaseRequirementGate`, the sale-block regression (added 2026-08-27):** a campaign code configured `purchaseRequirement: "membership"`, typed on a one-time pack, must stop the customer **once** and then get out of the way. The load-bearing assertion is not that press 1 stops — it is that **press 2 with identical inputs returns `allow`**, because the first shipped form of that gate toasted and returned without recording anything and therefore blocked that sale *forever*, which is strictly worse than the dropped code the branch exists to fix. Pinned in both requirement directions and both surfaces' button labels, plus: the escape survives casing/whitespace drift between the press and the remembered refusal; a *different* code is still asked about once (the escape must not leak across codes); and `none` / `any` / a matching requirement / an absent requirement / no code at all never stop a sale — the live configuration for all three codes shipping this week. A rule-11 sweep runs over the gate's own two sentences. **§6b — the switch the stop's own copy sends them on (added 2026-08-27):** the stop says *"This code is for membership packs only"*, so the sensible customer switches to a membership tier — where the code is valid. While the stop was remembered by **code alone**, that switch skipped the resolve and charged them with their one-per-lifetime grant silently dropped; the fix's own message was what routed them into the loss. The stop is therefore a **pairing**, `{ code, isSubscriptionPurchase }`, and §6b pins all three consequences: the same code after switching to a membership returns `allow` (honoured, not remembered as refused), switching **back** to a pack still returns `allow_without_code` so the sale is never re-walled, and the mirror case (a pack-only code stopped on a membership) behaves symmetrically. **What it cannot prove:** that the modals thread the answer into the charge. No DOM runner exists here, and a source-text grep guard is the pattern `test:campaign-code-metadata` was written to replace — that half is proven by the e2e leg *"minted code TYPED BUT NEVER APPLIED"*. |
