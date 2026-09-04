# One-time pack double charge — design

**Date:** 2026-09-04 · **Branch target:** `fix/one-time-pack-double-charge` · **Status:** awaiting sign-off

---

## In plain English

When a logged-in member buys a one-time pack **and types in a new card**, we charge them twice.

The checkout screen prepares a payment up front so Apple Pay and Google Pay can show the right
amount. When the member presses Purchase, the card form **actually takes the money** using that
prepared payment. Then, one to three seconds later, our server — which has no idea the money already
moved — creates a **second, separate payment** and charges the same card again. Both charges look
legitimate to us, so the member also receives the pack's free entries twice.

That is why Mick Beswick was charged $25 twice on 3 September for one Apprentice Pack, and shows 18
entries instead of 9.

Two things limit the blast radius. It only happens with a **newly typed card** — paying with a saved
card is a single charge. And it only affects **one-time packs**; Mini Packs are immune because they
charge a completely different way.

**We already wrote this fix once.** Guest checkout (brand-new customers) hands the server the payment
it already took, and the server reuses it instead of charging again. The logged-in path never got
that wiring. So the deeper problem is not a missing parameter — it is that **the same purchase logic
was copied into two routes, and only one copy got fixed.** This design closes the gap *and* collapses
the two copies into one shared piece of code, so the next path cannot silently miss it.

Members who are affected keep everything they paid for; we are not changing history here, only
stopping it happening again.

---

## 1. Problem and done

An authenticated member buying a one-time pack with a new card is charged twice and granted entries
twice. 54 distinct members across 57 checkouts since January 2026, still occurring (3 in the first
two days of September). `verified` — see §3.

**Done when:**

- A one-time pack purchase moves money exactly once, for every payment-method path (new card, saved
  card, wallet, 3-D Secure), and grants entries exactly once.
- Re-running the duplicate-charge probe over new data reports **0** machine-speed (≤10s) one-time
  clusters.

**Failure looks like:** a member is charged once but granted nothing, or a member deliberately buying
the same pack twice in a row is charged only once. Both are worse than the current bug.

---

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Which charge survives | The **upfront PaymentIntent** the client already confirmed | The money has already moved. Refunding it and re-charging is two more failure points for zero gain. |
| How the server learns of it | Client sends `paymentIntentId`; route validates and adopts | Exactly the pattern the guest route already proves in production (`create-one-time-purchase/route.ts:494`). |
| Avoiding a repeat divergence | **Extract one shared resolver** used by both one-time routes | The bug's real cause is two copies of the purchase logic. Adding the missing parameter to copy #2 leaves copy #3 free to forget. |
| Safety net when nobody passes the id | Resolver refuses to create if an **unclaimed** succeeded charge exists for this customer+package+amount within 15 min | Covers the "client confirmed, then the route call failed, user retried" case, which double-charges today. Not speculative — it is the same class of failure. |
| How "claimed" is marked | Explicit metadata key `oneTimeChargeClaimed: "true"` | Inferring it from `entriesCount` couples the guard to unrelated metadata. Explicit beats clever on money paths. |
| Rejected: switch one-time to SetupIntent | No | The upfront PaymentIntent exists so wallets display the correct amount (`create-payment-intent/route.ts:24`). Removing it breaks wallet checkout to fix something adoption already fixes. |
| Rejected: dedupe via Stripe idempotency keys | No | The two charges come from two *different* mechanisms — a client `confirmPayment` on an existing PI, and a server `create`. Idempotency keys only dedupe `create` calls, so they can never see each other. |
| Rejected: a feature flag | No | Per CLAUDE.md §4 the commit is the rollback unit. A flag whose "off" position restores double-charging is not a state we would ever select. |
| History repair | Out of scope | Explicitly excluded by the requester. §9 tracks the affected-customer list as a separate hand-off. |

---

## 3. Starting state (verified)

### The two charging paths

| # | Created by | Confirmed by | Metadata fingerprint |
|---|---|---|---|
| 1 | `POST /api/stripe/create-payment-intent` (`route.ts:201`) | **Client**, `stripe.confirmPayment` (`CardFormSection.tsx:369`) | no `entriesCount`, no `paymentMethodId` |
| 2 | `POST /api/stripe/create-one-time-purchase-existing-user` (`route.ts:455`) | **Server**, `confirm: true` | has `entriesCount`, `items`, `price`, `paymentMethodId` |

`verified` — both fire for one checkout. `MembershipModal/index.tsx:4177` confirms path 1 and
captures `confirmedPaymentIntentId`; `:4411` then calls path 2 **without** passing it.

### The divergence

| Route | Accepts `paymentIntentId`? | Reuse branch? |
|---|---|---|
| `create-one-time-purchase` (guest) | Yes — `route.ts:46` | Yes — `:494-615` validates status/amount/customer, stamps metadata, skips create |
| `create-one-time-purchase-existing-user` | **No** — `route.ts:39` | **No** |

Client mirrors it: the guest branch sends the id (`MembershipModal/index.tsx:4686`); the
authenticated branch does not (`:4411`). `verified`.

### Production evidence

Read-only probe over 40,656 `BenefitsGranted` PaymentEvents, 400 days, production. Clusters = same
user + package within 10 min; "tight" = a gap ≤10s, which is machine-speed. `verified`:

| packageType | tight clusters | extra charges | users | loose (genuine repeats) |
|---|---|---|---|---|
| **one-time** | **57** | **57** | **54** | 34 |
| upsell | 9 | 9 | 9 | 77 |
| membership | 1 | 1 | 1 | 9 |
| **mini-draw** | **0** | 0 | 0 | 106 |

Mini-draw is the **control**: it charges server-side only via `useDefaultPayment`
(`useMiniDrawPurchase.ts:188`), never confirms an upfront PI, and shows zero tight clusters across
106 real repeat purchases. That is what rules out "the detector just finds noise". `verified`.

Mechanism confirmed against Stripe live metadata for every recent affected pair — **14/14 one-time
pairs** were `create-payment-intent` → purchase-route, same payment method, same amount, both
succeeded. `verified`.

Worked example — Mick Beswick, `cus_VBByF1Nmhov1nq`, 3 Sept:

| PaymentIntent | Created | Status | Origin |
|---|---|---|---|
| `pi_3UBM0y…` | 07:48:16 | `requires_payment_method` (abandoned) | create-payment-intent |
| `pi_3UBM1P…` | 07:48:43 | **succeeded $25** | create-payment-intent, client-confirmed |
| `pi_3UBM1q…` | 07:49:10 | **succeeded $25** | purchase route, `confirm: true` |

Both succeeded charges used the same `pm_1UBM1nJ3N9Ka6RJMVdft291R`.

The 9 **upsell** rows are a different defect (both PIs from the purchase route — a genuine
double-submit) and stop after 2026-05-26. Out of scope; noted in §9. `verified`.

### Facts the fix depends on

| Fact | Provenance |
|---|---|
| The webhook grants entries per-PaymentIntent (`PaymentEvent._id` = `BenefitsGranted-<pi>`), so two PIs = two grants | `verified` `PaymentEvent.ts:42` |
| The webhook falls back to package data when `entriesCount` is absent — this is why the metadata-less upfront charge still granted 9 entries, and why adopting it is safe | `verified` `stripe-webhook-handlers/index.ts:984-1002` |
| `promoMultiplier` is computed server-side in the webhook, **not** read from metadata — adoption cannot lose it | `verified` `index.ts:1301` |
| `affiliateCode`, `campaignCode`, `referralCode`, `experimentId`, `variantId` **are** read from metadata — adoption **must** stamp them or attribution is lost | `verified` `index.ts:1319` |
| `confirmedPaymentIntentId` is in scope and populated at the authenticated call site — declared `:3601`, assigned `:4167`/`:4338`, used at `:4411` | `verified` |
| The saved-card path never confirms the upfront PI (`:4173`), so it charges once today and must keep doing so | `verified` |
| Route-level double-submits already dedupe — the client sends a per-click UUID used as the Stripe idempotency key (`:287`) | `verified` |

### Latent defect found in passing

`create-payment-intent`'s idempotency key ends in `Date.now()` (`route.ts:154`), so it is not
idempotent at all. Every call mints a fresh chargeable PaymentIntent; abandoned ones linger as
"Incomplete" (Mick has one). Not the cause of the double charge — but it is what makes the Stripe
dashboard hard to read during exactly this kind of investigation. Phase 3. `verified`.

---

## 4. Design

### New shared unit

`src/utils/payment/stripe/resolve-purchase-payment-intent.ts` — named to match the existing sibling
`resolvePurchaseIdentity` in `src/utils/payment/checkout-identity.ts`, per the one-concept-one-name
rule.

```ts
resolvePurchasePaymentIntent({
  customerId,
  packageId,                 // canonical, via normalizeMembershipPlanId
  suppliedPaymentIntentId,   // from the client, when it already confirmed one
  createConfig,              // from createPaymentIntentConfig — carries amount,
                             // description and the full webhook metadata
  idempotencyKey,
}): Promise<{ paymentIntent: Stripe.PaymentIntent; outcome: "adopted" | "recovered" | "created" }>
```

`createConfig` is the single source of the amount, description and metadata, for both the create
path and the stamp path. Passing them separately as well would let the charged amount and the
validated amount drift apart — the one mistake this resolver exists to prevent.

Resolution order — **first match wins**:

1. **Adopt** — `suppliedPaymentIntentId` given. Retrieve; require `status ∈ {succeeded, processing}`,
   `amount === createConfig.amount`, and customer matching or absent. Stamp metadata. Never charges.
2. **Recover** — no id supplied. List the customer's recent PaymentIntents (`limit: 10`) and adopt
   one that is `succeeded`/`processing`, same amount, same `metadata.packageId` **compared after
   `normalizeMembershipPlanId`** (the upfront PI carries the raw client id, which may hold the
   `-member` suffix), created within **15 minutes**, and **not** carrying `oneTimeChargeClaimed`.
   Never charges.
3. **Create** — nothing to adopt. `create` with `confirm: true` and the caller's idempotency key,
   exactly as today.

Every outcome stamps `oneTimeChargeClaimed: "true"` plus the full webhook metadata. That marker is
what makes step 2 precise: a member deliberately buying the same pack twice has their first charge
already claimed, so it cannot be adopted a second time.

**A claimed PI supplied explicitly is a replay, not an error.** If `suppliedPaymentIntentId` is
already claimed *and* matches this customer, package and amount, return it as `adopted` and do
nothing else. This is the network-retry case: the first call adopted and stamped successfully, the
response was lost, the client retried. Answering 400 there would show a failure for a purchase that
completed. Only a claimed PI whose customer, package or amount does **not** match is rejected.

### Flow after the fix (authenticated, new card)

1. Step 2 mounts → `create-payment-intent` mints the upfront PI (unchanged — wallets need it).
2. Purchase pressed → `confirmStripeIntent()` confirms it. **Money moves once.**
3. Client sends `paymentIntentId: confirmedPaymentIntentId` to the existing-user route.
4. Route calls the resolver → **adopt**. No second charge. Metadata stamped so the webhook sees
   affiliate/campaign/referral/experiment codes.
5. Webhook grants entries once, keyed on that single PI.

Saved-card path is unchanged: no id supplied, recovery finds nothing (the upfront PI is
`requires_payment_method`, which is not adoptable), so it **creates** — one charge, as today.

### Edge cases and failure states

| Case | Behaviour |
|---|---|
| Supplied PI is `requires_action` (3-D Secure pending) | Reject adoption with 400; the client's `completePendingAuthentication` already owns this (`useMembershipQueries.ts:217`). |
| Supplied PI amount ≠ package price (promo changed mid-checkout) | Reject with 400. Never adopt a charge for the wrong amount. |
| Supplied PI belongs to another customer | Reject with 400. Same guard the guest route has. |
| Supplied PI already `oneTimeChargeClaimed`, matching customer/package/amount | Return it as `adopted`, no charge, no error — the client is retrying after a lost response. |
| Supplied PI already claimed but customer/package/amount **mismatch** | Reject with 400 — a replayed id from a different checkout. |
| **`paymentIntents.update` (stamping) times out — did it land?** | Treat as non-fatal and continue, mirroring the guest route (`:581-615`). The charge is real and the webhook's package fallback still grants the right entries; only the optional attribution codes are at risk. Failing the request here would show an error for a payment that succeeded — strictly worse. Logged via `console.error` so it survives the production build. |
| **Client confirms, then the route call fails entirely** | Today: user retries → second charge. After the fix: retry hits **recover**, adopts the existing charge, no second charge. |
| Member deliberately buys the same pack twice in 15 min | First charge is claimed, so it is not adoptable; second checkout confirms its own upfront PI. Two charges, two grants — correct. |
| Concurrent double-submit of the route | Unchanged: Stripe idempotency key (per-click UUID) dedupes. |
| Refund | Unchanged — one charge now exists where two did, so existing reversal logic applies as-is. |

---

## 5. Threading checklist

| # | Location | Change | Miss it and… | Mode |
|---|---|---|---|---|
| 1 | `create-one-time-purchase-existing-user/route.ts` Zod schema | add `paymentIntentId: z.string().optional()` | Zod **strips** the unknown key silently; the client sends it, the route never sees it, double charge persists and every test still passes | **silent** |
| 2 | `MembershipModal/index.tsx:4411` | pass `paymentIntentId: confirmedPaymentIntentId` | The bug, unchanged | silent |
| 3 | `useMembershipQueries.ts` — both the `MembershipPurchaseData` type **and** the destructured `mutationFn` parameter list **and** the `apiPost` body | thread `paymentIntentId` through all three | The type change alone type-checks clean while the destructure silently drops the value before `apiPost` — same invisible failure as row 1 | **silent** |
| 4 | Resolver: stamp `oneTimeChargeClaimed` on **every** outcome incl. `create` | write the marker | Recovery adopts an already-consumed charge → member gets a second pack free, we lose revenue | **silent** |
| 5 | Resolver: carry `affiliateCode`/`campaignCode`/`referralCode`/`experimentId`/`variantId` into the stamped metadata | copy all five | Affiliate goes unpaid, campaign code unredeemed, A/B arm mis-attributed — no error anywhere | **silent** |
| 6 | `docs/payment/` (manifest owns `src/utils/payment/**`) | document the resolver | doc-sync `Stop` hook blocks | loud |
| 7 | `docs/billing-stripe/` + `docs/subscription/` (manifest owns the touched routes/modal) | update | doc-sync `Stop` hook blocks | loud |
| 8 | `BUSINESS.md` / `CUSTOMER.md` | one-line touch — `src/app/api/stripe/**` is a business-trigger glob | `STALE BUSINESS DOCS` block | loud |
| 9 | `package.json` `test:*` entry for the new test | add it | Test exists but is undiscoverable and never runs in CI | **silent** |

Rows 1, 3, 4, 5 are the dangerous ones — Zod strip and metadata omission both produce plausible,
error-free, wrong behaviour.

---

## 6. Tests

New: `src/utils/payment/stripe/__tests__/resolve-purchase-payment-intent.test.ts`, wired as
`npm run test:one-time-charge` (row 10). Stripe is stubbed; assertions are on the calls made.

| Assertion | Guards |
|---|---|
| Supplied succeeded PI → `paymentIntents.create` is **never called**; outcome `adopted` | The bug |
| Adoption stamps `oneTimeChargeClaimed` **and** all five attribution keys | Rows 4, 5 |
| No id supplied, unclaimed matching PI exists → adopted, `create` not called; outcome `recovered` | Retry-after-failure |
| No id supplied, matching PI already **claimed** → `create` **is** called | Deliberate repeat purchase still charges |
| No id supplied, candidate is `requires_payment_method` → `create` is called | Saved-card path unaffected |
| No id supplied, candidate `packageId` differs only by the `-member` suffix → still adopted | Normalization in recover step |
| Supplied PI already claimed, everything matches → returned as `adopted`, no throw, no `create` | Lost-response retry is not an error |
| Amount mismatch / foreign customer / claimed-with-mismatch → throws, `create` not called | Never adopt the wrong charge |
| `paymentIntents.update` rejects → resolver still returns the adopted PI | Stamp timeout is non-fatal |
| `createOneTimePurchaseExistingUserSchema.parse({ …, paymentIntentId })` returns the field | Row 1 — Zod strips unknown keys silently, so this is asserted at the schema, not through a route call |

Existing suites re-run: `npm run test:anchor-billing`, `npm run test:zero-trial-guard`,
`npm run test:facebook-capi`, plus `lint` and `type-check`.

**Post-deploy verification** (the number from §1): re-run the probe after a week; one-time tight
clusters must be **0** for checkouts dated after the deploy.

---

## 7. Phases

| # | Ships | User-visible win | Status |
|---|---|---|---|
| **1** | Resolver with adopt + create; existing-user route uses it; schema + client + hook threaded; regression tests | **Members buying a one-time pack with a new card are charged once.** | **shipped** |
| **2** | Guest route migrated onto the same resolver; recovery + `oneTimeChargeClaimed` added | One implementation instead of two, so a future path cannot miss it; a failed-then-retried checkout stops double-charging. | **shipped** (guest route: 251 lines → ~60) |
| **3** | `create-payment-intent` idempotency key no longer ends in `Date.now()` | No more stray "Incomplete" PaymentIntents cluttering Stripe and confusing support. | **deferred — see below** |

**Phase 3 deliberately not shipped.** It is cosmetic, and it needs a per-checkout key threaded
from the modal into `create-payment-intent` to be done correctly — a merely *stable* key would
be worse than the current one, because a member's second purchase of the same pack would be
handed back the first (already-succeeded) PaymentIntent and the card form would fail to confirm
it. With Phase 2's recovery in place the orphan intents are inert (`requires_payment_method` is
never adoptable and never charged), so this is Stripe-dashboard tidiness, not money safety. Not
worth churning a live payment route for in the same change as the fix.

### Verification actually performed

- `npm run type-check` — clean. `npm run lint` on all changed files — 0 errors; the 3 warnings
  are pre-existing (confirmed by linting the same files with the change stashed).
- `npm run test:one-time-charge` (new, 12 cases), `test:campaign-code-metadata` (drives both
  changed routes end-to-end), `test:anchor-billing`, `test:attach-typed-code` — all pass.
- **Mutation-tested, and the first version of the guard failed it.** Disabling the resolver's
  adopt branch turns the suite red on the right assertion. The source-thread check did **not**
  initially: an unscoped `paymentIntentId: confirmedPaymentIntentId` match also hit the *guest*
  branch, which always carried the id — so that assertion would have passed throughout the
  entire nine-month bug. It is now scoped to the `purchaseMembership.mutateAsync` call and
  anchored to a non-comment line, and re-verified against four separate mutations (modal line
  deleted, modal line commented out, route Zod key removed, hook destructure removed) — all
  four now fail as intended.

---

## 8. Rollback

No feature flag (CLAUDE.md §4 — the commit is the rollback unit, and a flag whose "off" state
restores double-charging is not a state worth being able to select). Rollback is `git revert` of the
PR, which restores the current behaviour exactly. The resolver is a new file whose only importers are
the two one-time purchase routes changed in the same PR, so reverting the PR leaves nothing dangling.

**In-flight work at revert time:** none is stranded. Charges already adopted are ordinary succeeded
PaymentIntents whose webhooks have already granted; the `oneTimeChargeClaimed` marker is inert
metadata that the reverted code simply ignores.

**Recovery surface when the happy path half-completes:** a charge that succeeds while the route call
fails is already visible in Stripe and, because the webhook's package fallback grants entries
regardless (§3), the member is not short-changed. Admin can see the payment under the user's Payment
activity tab.

---

## 9. Open dependencies

| Item | Owner | Asked | Expected | Blocks |
|---|---|---|---|---|
| Decide refunds for the 54 affected members — CSV of user + PI pair + amount can be produced on request | DJ | 2026-09-04 | — | Nothing. Explicitly out of scope for this spec. |
| Confirm the 9 **upsell** double-charges (all pre-2026-05-26, different mechanism) are genuinely fixed rather than dormant | DJ | 2026-09-04 | — | Nothing. Separate defect; recommend a follow-up probe. |

Neither blocks any phase. If both answers are "no", the design is unchanged.
