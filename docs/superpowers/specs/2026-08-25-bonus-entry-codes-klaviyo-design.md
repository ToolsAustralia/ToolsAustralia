# Bonus-entry codes for Klaviyo flows — design

**Date:** 2026-08-25
**Branch:** `feature/coupon-klaviyo`
**Status:** Design for review. No code written.
**Trigger:** Ads team asked for three codes (EXTRA100, LOCKIN100, BACKIN200) for five Klaviyo flow emails, plus confirmation of the custom properties those flows reference.

> **Revision 2 (same day).** Revision 1 proposed a new `PromoLinkIssuance` collection. That was **wrong** and has been replaced. A four-lens adversarial review found (a) a per-user relative window already exists in production and I had claimed none did, (b) the right vehicle is the **existing** `RedeemableIssuance` rail, not a new collection, and (c) **two live production bugs** that matter more than the feature. What follows is the corrected design. Revision 1's reasoning is preserved in §7 so the change is auditable.

---

## 0. TL;DR

| Question | Answer |
|---|---|
| Does the coupon feature work today? | **No — worse than first reported.** One existing feature is silently broken in production (§2.1), and every code redemption can burn the code without granting entries (§2.2). |
| Will it expire per user who triggered it? | Not today for these codes — but **the primitive already exists twice** and I missed both. The fix is to anchor one existing field differently, not to build a new system. |
| Are the Klaviyo properties accurate? | Two names mis-cased, one nonexistent, four are event- not profile-properties — **and `cancellation_date` is the wrong date entirely** (§5). |
| Is Revision 1's approach the best? | **No.** It forked the vocabulary against a shipped rail and would have started life with a known refund-lockout bug. Corrected below. |

---

## 1. What changed, and why

### 1.1 I was wrong that no per-user relative window exists

`PromoLink.eligibilityRules.cancelledWithinDays` is a **per-user relative window already running in production**: it measures `Date.now() − user.subscription.cancelledAt` against `cancelledWithinDays × 24h`, and it is reachable from the admin modal today.
_(`PromoEligibilityService.ts:70-82`; admin form `AdminPromoLinkModal.tsx:432-509`; Zod `promo/link/create/route.ts:30-37`)_

Revision 1 asserted "nowhere in the codebase is there a per-user, relative-to-issuance expiry." That is false, and it was the premise the whole design rested on.

### 1.2 But that window does not save us — it is broken on the path that matters

This is the headline finding, and it is a **live production defect**, not a design consideration.

Inside `grantBenefits`:

```
payment-processing.ts:1148   handleSubscriptionPackage(user, packageData)
                               → $unset { "subscription.cancelledAt": 1 }        (:1940, DB)
                               → user.subscription.cancelledAt = undefined       (:1954-1956, in-memory)
                               → isActive = true, status = "active"
                     … 139 lines later, no refetch …
payment-processing.ts:1288   checkAndApplyPromoLink(user, …)
                               → PromoEligibilityService.evaluateAudienceEligibility(link, user)
                               → hasCancellationSignal() === false  →  audience_mismatch  →  0 entries
```

**Every existing `cancelled-membership-comeback` promo link grants zero bonus entries on a membership resubscribe — 100% of the time, silently.** The refusal returns `{ bonusEntries: 0 }` behind a `console.log` that production strips (`payment-processing.ts:991-1001`).

It only works on **one-time pack** purchases, because `handleOneTimePackage` does not touch `subscription`.

`docs/CANCELLED_MEMBERSHIP_COMEBACK_PROMO.md:55` asserts the opposite. There is **no test coverage** — no `src/services/promo/__tests__` exists, and no test file anywhere imports `PromoRedemptionService` or `PromoEligibilityService`.

### 1.3 Three of four judges rejected Revision 1

| Lens | Ranking | Why |
|---|---|---|
| Leanness & convergence | C > B > A | A forks the vocabulary against the shipped `RedeemableIssuance` rail. |
| Correctness & failure modes | **A > B > C** | Only A moves the decision out of the window where the transaction is rewriting the fields eligibility reads. |
| Operator & ads-team | C > B > A | A makes every new code an engineering project; it adds a stateful object with no admin surface. |
| Ship risk & blast radius | C > A > B | A adds a new Klaviyo emitter onto a fire-and-forget transport and a shared dev/prod account; rollback leaves orphan rows and un-unsendable email. |

Even the judge that ranked A first recommended **against building it as a new collection** — and instead building the same mechanism on the existing rail.

**B is dead.** No judge ranked it first, its BACKIN200 "zero code" claim is false (§1.2), its LOCKIN100 leg *fails open*, and adding an `eligibilityAudience` enum value means touching ~15 hand-duplicated declaration sites across 12 files — including `src/lib/internal-norm/schemas/promo-sub-domains.ts:137`, where an omission returns **HTTP 500 for the entire `promo.link.list` Norm endpoint** via the runtime `responseSchema` validation (`withNorm.ts:208-217`). That is exactly the rule-10 footgun, invisible to `tsc`. Rollback would leave enum-poisoned rows that `PromoLinkList.tsx:217-219` renders as the *most permissive* label, "All Users".

---

## 2. Two live bugs that outrank the feature

### 2.1 The cancelled-members ordering bug

Described in §1.2. Every comeback promo silently grants zero on the exact conversion it exists to cause. **File and fix separately from this marketing request.**

### 2.2 Burn-before-grant: a code can be consumed with no entries delivered

The idempotency key is claimed **before** the work:

```
payment-processing.ts:526-544   PaymentEvent.create({ _id: benefitsGrantedEventId(…) })
payment-processing.ts:651       grantBenefits(…)        ← "after PaymentEvent is created atomically"
  PromoRedemptionService.ts:96-110   atomically claim the code   ← BURNED HERE
  payment-processing.ts:1322-1331    $inc accumulatedEntries     ← WALLET CREDITED HERE
  payment-processing.ts:1350+        addToMajorDraw(…)
      major-draw-helpers.ts:63       throw "No queued draw available during freeze period"
  payment-processing.ts:1381-1391    catch → "Non-blocking - log but don't fail payment processing"
```

Net effect during a draw freeze: **code consumed, wallet incremented, no draw entry, no retry possible** (the `PaymentEvent._id` is already taken), and nothing visible in production logs because `console.log`/`warn` are stripped.

The sibling `DrawGrantService` path has the same class of defect from the other direction — it *returns* `false` when no draw is available and the coupon caller **discards the return value**, while the streak path checks and compensates (`RedemptionService.ts:234` vs `:373-405`).

**This is a precondition, not a follow-up.** Any per-user issuance design makes it strictly worse, because the issuance is one-shot per person — where today a burned redemption could at least be retried with the same code on a later purchase.

---

## 3. The corrected design

### 3.0 Morgan's decision collapses most of this — ship the simple version

> *"I think it's fine if it can be redeemed by anyone. They shouldn't receive the code until they receive the email within the flow. The code will also be one use per customer, expires after 14 days."* — Morgan, 2026-08-25

That settles the question the whole exclusivity design was built to answer. **No eligibility gating is wanted.** So:

**Ship three plain `PromoLink` rows with `eligibilityAudience: "all"`, created in the existing admin form. Zero code.**

| | EXTRA100 | LOCKIN100 | BACKIN200 |
|---|---|---|---|
| `bonusEntries` | 100 | 100 | 200 |
| `eligibilityAudience` | `all` | `all` | `all` |
| `appliesToMembership` | ✅ | ✅ | ✅ |
| `appliesToOneTime` | — | ✅ | — |

One-use-per-customer is **already enforced atomically** (`PromoRedemptionService.ts:96-110`) and is already reversed on refund. Nothing needs building for it.

Everything in §3.2–§3.3a below — the issuance rail, enrolment triggers, the `Bonus Code Issued` event — is **held in reserve**. It becomes necessary only if the answer to §3.0.1 is "evergreen *and* the deadline must be enforced per recipient." Otherwise it is scope we do not need, and this section supersedes it.

Two consequences worth noting:

- **The cancelled-members ordering bug (§2.1) no longer blocks this work.** It only bites codes using the `cancelled-members` audience, which we are no longer using. It remains a real production defect silently zeroing existing comeback promos — **file it separately**, don't ride it in on a marketing request.
- **Burn-before-grant (§2.2) still bites.** A redemption landing in the 30-minute draw-freeze window burns the code and grants nothing, unrecoverably. Lower probability than I implied, real impact. Worth fixing, arguably not a launch blocker.

#### 3.0.1 The expiry problem, and how to handle it properly

**The problem stated exactly.** A code has **one clock**, starting the day an admin creates it. A customer has **their own clock**, starting the day they qualify. Today the email quotes the customer's clock and the server enforces the code's clock, so the two diverge from day 1:

| Day | Admin's code | Customer entering the flow | Email says | Server does |
|---|---|---|---|---|
| 0 | created, expires day 14 | — | — | — |
| 13 | 1 day left | qualifies | "you have 14 days" | dies tomorrow ❌ |
| 15 | expired | qualifies | "you have 14 days" | already dead ❌ |

**The fix: stop asking the code to carry the deadline. Let the trigger event carry it.**

At the instant a customer qualifies, the app is already running code — that is where the Klaviyo event is emitted. Compute the deadline *there*, and put it on the event:

```
expiresAt = end of day, Australia/Sydney, 14 days from now

  code_expires_at         "2026-09-08T13:59:59.000Z"        ISO instant, for Klaviyo logic/segments
  code_expires_at_label   "Monday 8 September, 11:59pm AEST"  pre-formatted server-side
```

The email renders **the label**. That resolves the timezone half of the problem outright: the string is built with `formatDateInAEST` (`src/utils/common/timezone.ts:67`, `date-fns-tz` already a dependency), so it is correct Australian local time and depends on **nothing** in Klaviyo's date formatter — which matters, because the existing `formatDateForKlaviyo` helper is en-US in the server's timezone (§5).

Use **end of day**, not the exact minute. Someone who qualifies at 9:04am should not get a 9:04am cutoff on day 14 — it reads wrong against "you have 14 days" and turns every edge case into a support ticket.

**Then choose an enforcement tier.**

| | Tier 1 — soft *(recommended to start)* | Tier 2 — hard |
|---|---|---|
| Email shows | each person's true deadline ✅ | each person's true deadline ✅ |
| Server refuses on day 15 | no | yes |
| Code's global `expiresAt` | a **generous backstop** — e.g. the campaign's real end date, or 90 days | same backstop, plus the per-user check |
| Storage | none | one `RedeemableIssuance` row per qualifier |
| Cost | **two event properties + set the backstop** | the reserve design in §3.2 — anchor change + trigger wiring, ~80% already built |
| Failure mode | a straggler redeems on day 20 and gets the entries | none, but a new stateful object to operate |

**Tier 1 fixes the actual complaint** — the email is never wrong again — for almost nothing. A straggler converting on day 20 still converted, which is the point of the campaign.

**The backstop must be set deliberately: not blank, not 14 days.** Blank is an unbounded leak (§3.0.2); 14 days is the silent death above. Give it the campaign's real end date — "this flow runs to 31 December" — which is a date the ads team can own without a cron.

**Two wrinkles to decide once:**

- **Flow delay.** If Klaviyo waits a day before sending the abandoned-checkout email, the customer sees 13 days, because the clock started at the event. Either add the delay to the number (`14 + delay`) or accept it — the label always shows the true date, so nobody is misled either way.
- **Re-qualification.** Abandon checkout twice and you get two events, two emails, two deadlines. The later one is more generous, which under Tier 1 is harmless. Under Tier 2 it needs the re-arm rule in §3.3a.

**Upgrading later is cheap and non-breaking.** Tier 1 already emits the exact instant the customer was promised; Tier 2 just starts persisting and enforcing that same value. Nothing about the codes, the copy, or the flows changes.

#### 3.0.3 Tier 1 — the full flow

**Step 1 — Admin setup. No deploy, about five minutes.**

`/admin/promos` → **Promo Links** tab → create three links:

| Field | EXTRA100 | LOCKIN100 | BACKIN200 |
|---|---|---|---|
| `code` | `EXTRA100` | `LOCKIN100` | `BACKIN200` |
| `bonusEntries` | 100 | 100 | 200 |
| `appliesToMembership` | ✅ | ✅ | ✅ |
| `appliesToOneTime` | — | ✅ | — |
| `eligibilityAudience` | `all` | `all` | `all` |
| `campaignType` | `general` | `general` | `general` |
| `expiresAt` | **campaign end date** (e.g. 31 Dec 2026) | same | same |

`expiresAt` is the **backstop**, not the customer's deadline. Never set it to today + 14.

**Step 2 — The only code Tier 1 needs: four properties on three events.**

```ts
const expiresAt = endOfDayAEST(addDays(new Date(), 14));   // computed at emit time

{
  bonus_code:                   "BACKIN200",
  bonus_code_entries:           200,
  bonus_code_expires_at:        expiresAt.toISOString(),
  bonus_code_expires_at_label:  formatDateInAEST(expiresAt, "EEEE d MMMM, h:mmaaa") + " AEST",
}
```

| Code | Rides on | Status |
|---|---|---|
| EXTRA100 | `One-Time Package Purchased` | already server-side — properties only |
| LOCKIN100 | `Started Checkout` | needs the server-side move (P6) |
| BACKIN200 | `Subscription Cancellation Requested` | new event at cancel-click (P5) |

P5 and P6 are **not expiry work** — they are needed for those two flows to fire correctly at all. EXTRA100 could ship with nothing but the four properties.

For EXTRA100, attach the properties **only when `subscription.isActive` is false**, so the event carries the offer only when the offer applies.

**Step 3 — Runtime, worked example (BACKIN200).**

*Mon 1 Sep, 9:04am AEST* — Dave clicks Cancel.
`CancelSubscriptionService` sets `autoRenew = false`, `cancelledAt = now`, `endDate = period end`; he stays active until then. Then **[new]** emit `Subscription Cancellation Requested` with the four properties above plus the real `package_name`, `tier` and `cancellation_date`, and **[new]** sync his Klaviyo profile so `membership_status` reflects the cancellation (P7).

*Mon 1 Sep, 9:05am* — Klaviyo receives it. The win-back flow triggers. The ads team's flow does whatever it likes — wait two days, check he has not resubscribed, then send.

*Wed 3 Sep* — Dave gets the email:

> Come back to Boss and we'll **include 200 free entries** on your first month. Use code **BACKIN200** — offer ends **Monday 15 September, 11:59pm AEST**.

That date is `{{ event.bonus_code_expires_at_label }}`. Not computed by Klaviyo, not in the server's timezone, not the code's creation date. **His** date.

*Sat 6 Sep* — He clicks through, reaches the payment step of the membership modal, and types `BACKIN200` into "Enter coupon code" → APPLIED. (Or the email links to `?promo=BACKIN200`, which `usePromoLink` stashes in sessionStorage and applies for him.)

*Sat 6 Sep* — He pays. `create-subscription` puts `promoLinkCode` into Stripe subscription metadata (`route.ts:484`); `invoice.payment_succeeded` → `grantBenefits` → `checkAndApplyPromoLink` (`:1288`) → `PromoRedemptionService.redeem`, which checks: code active ✓, inside the backstop ✓, `appliesToMembership` ✓, audience `all` ✓, `usedBy` does not contain Dave ✓ — then **atomically** adds him to `usedBy` and increments `usageCount`. 200 entries land in the major draw under the `promo-link` bucket, and the ledger records `data.grants.promoLink` for refund reversal.

*Any later attempt* — `already_used`. One per customer, enforced atomically.

*If he refunds* — reversal pulls him from `usedBy` and removes the entries. Note this **re-arms the code for him** — the open decision in §8.

**Step 4 — The other two differ only in the mint point.**

- **EXTRA100** — fires when a one-time purchase completes and the buyer has no active subscription. The Klaviyo segment does the "never took a membership" check; the app just conditionally attaches the properties.
- **LOCKIN100** — fires at checkout-start. Klaviyo's flow owns the abandonment logic (did not convert within X hours).

**Step 5 — Failure paths to expect.**

| Situation | What happens | Verdict |
|---|---|---|
| Redeems on day 20 | Succeeds | By design. They converted. |
| Redeems after the backstop date | Refused `expired` | **The backstop and the flow's end date must be kept in sync.** The one ops discipline Tier 1 requires. |
| Redeems during the 30-min draw freeze | Code burned, entries never land, unrecoverable | Real. §2.2 — worth fixing alongside. |
| Already used it | Validate says "valid", they see APPLIED, pay, get nothing, silently | **P3 fixes this.** Will generate support tickets otherwise. |
| Stranger found the code | Redeems successfully | Accepted — Morgan's call (§3.0.2). |

**Step 6 — What Tier 1 explicitly does not do.**

It does not stop a redemption after the customer's personal 14 days; it does not stop a stranger; it does not cap total redemptions; and it records only who *redeemed*, never who was *offered*. Upgrading to Tier 2 means persisting the same `bonus_code_expires_at` value Tier 1 is already computing.

#### 3.0.2 Exposure, stated once

Morgan is right that the code isn't published anywhere by us. But an email to thousands is public the moment one person posts it. With `eligibilityAudience: "all"` and **no global redemption cap anywhere in the model**, the only limit is one redemption per account — and since `usedBy` is keyed on `userId` and email verification is stubbed at purchase, that means **one redemption per free email address**.

BACKIN200's 200 entries exceeds the 150 included with the $250 Boss Pack, and the major draw is entry-weighted, so a leaked code lets a $20 purchase outrank the top pack. Morgan owns the offer and has made the call; flagging once and proceeding. Cheap mitigations that don't change the design: a global cap, and a rate limit on `/api/codes/validate` (which today has none, while its sibling enforces 60/min).

---

### 3.1 Principle (applies only to the reserve design in §3.2)

> The app decides each customer's deadline **at the moment they qualify**, stores it as one absolute instant, and ships that same instant to Klaviyo in the trigger event. Klaviyo owns *whether and when to send*; the app owns *the code, the clock, and the grant*. Copy and enforcement read the same value, so they cannot disagree.

This is still right. There is no inbound Klaviyo webhook anywhere in `src/app/api`, so "when did they receive it" is genuinely unobservable — inverting it is the only sound answer. It also removes any dependence on Klaviyo computing a date correctly in AEST/AEDT, which nobody has verified.

### 3.2 What changed: reuse the rail, don't build one

**Build on `MonthlyEntryCampaign` + `RedeemableIssuance`.** No new collection.

That rail already ships everything Revision 1 proposed to rebuild:

| Requirement | Already there |
|---|---|
| One issuance per customer per code | unique index `{campaignId, userId}` (`RedeemableIssuance.ts:92`) |
| Per-user expiry column | `expiresAt`, required + indexed (`:80-86`) |
| Atomic claim | `findOneAndUpdate({status:'active', expiresAt:{$gt:now}})` (`RedemptionService.ts:199-213`) |
| Hard refusal when no issuance exists | `:108-109` — this is the leak defence, already written |
| **Refund mirror** | `unredeemMonthlyCouponRedemption`, already wired into the reverser (`refund-ledger-reversal.ts:214-224`) |
| Purchase gate | `purchaseRequirement: none \| membership \| one-time \| any` |
| Admin redemptions view | `/api/admin/monthly-coupon/campaign/[id]/redemptions` |
| Checkout coupon-row wiring | `validateAsCampaign` in `/api/codes/validate` + the payment-processing branch |

A new `PromoLinkIssuance` would have had to re-implement all of it — and the reverser as written calls only `promoLinkUnredeem` (`:190-211`), so a fresh collection **starts life with a refund-lockout bug**. Meanwhile `delete-user-cascade.ts` contains zero promo references today, proving this team has already forgotten one cascade duty.

**One real change to the rail:** anchor `RedeemableIssuance.expiresAt` to `issuedAt + validForDays` instead of copying `campaign.endsAt` (`CampaignService.ts:260`, `:401`), and stop `RedemptionService` truncating a personal window against the campaign window (`:174-180`). That single anchor change *is* the "inactive after 14 days" requirement.

### 3.3 Per-code plan — they are not uniform

| Code | Vehicle | Why |
|---|---|---|
| **BACKIN200** | Issuance rail — **mandatory** | Redemption-time evaluation is provably broken for it (§1.2). Minting at cancel-click also puts the app's clock and the email's clock on the same instant, curing the period-end trigger skew. |
| **LOCKIN100** | Issuance rail — **mandatory** | No persisted abandoned-checkout anchor exists, and the nearest candidate is overwritten by the very checkout that redeems the code — so any redemption-time rule **fails open**, the worst direction. |
| **EXTRA100** | Issuance rail, or a simpler interim | Its anchor (`oneTimePackages[].purchaseDate`) does survive to check time. If shipped the simple way, it needs a guard test pinning the invariant it silently depends on — the "don't push to the local user object" comment at `payment-processing.ts:1867-1871`. Without that test a future refactor flips it to always-pass with no signal. |

For consistency and one code path, **ship all three on the rail.** The per-code table above matters only if we later want to cut scope.

**Where each is minted:** BACKIN200 at cancel-click; LOCKIN100 at checkout-start; EXTRA100 on one-time purchase completion when the buyer has no active subscription. Each mint emits `Bonus Code Issued` carrying the code, the entry count and that customer's `expiresAt`.

### 3.3a The enrolment model — "the code plus its guest list"

An admin creates **one campaign row** (the code). Each qualifying customer gets **one issuance row** (their seat on the list). Redemption asks "is there a row for this campaign and this user?" — no row, no entry. The code string is public; the guest list is what makes it exclusive.

This is not a new idea being introduced: it is the shipped model. What changes is **when** people join the list.

| | Today | Needed |
|---|---|---|
| Who enrols | admin picks a target list in bulk (`all-active-subscribers` / `manual` / `csv` / `dynamic-segment`), or the user lazily enrols themselves by opening the rewards wallet | **the app enrols one customer the moment they qualify** |
| Each row's `expiresAt` | copied from `campaign.endsAt` (or a never-expires sentinel) — same instant for everyone | **`issuedAt + validForDays`** |

Both hooks already exist. `CampaignService.ensureActiveCampaignIssuancesForUser(userId)` (`:442`) is a **single-user enrolment function** — today its only caller is `RedeemablesWalletService:51`. The three qualification triggers call that same function. The `expiresAt` stamp lives on exactly two lines (`CampaignService.ts:260` and `:401`).

The redemption plumbing is likewise complete: `checkAndRedeemCampaign` (`payment-processing.ts:1043`) already reads `campaignCode` from Stripe metadata, calls `RedemptionService.redeem` (`:1047`), and records `monthlyIssuanceId` into the refund ledger (`:1396-1433`) — which is why the refund mirror works. **Nothing is missing from the checkout path except enrolled users.**

**Re-qualification rule** (a decision this model forces, and the one genuinely new piece of behaviour): the unique `{campaignId, userId}` index means a returning qualifier cannot get a second row. So on re-qualification —

- issuance **`redeemed`** → leave it. One grant per person, ever. This is what "one-time" means.
- issuance **`active` and unexpired** → leave it. Do not reset the clock; a customer who abandons checkout three times gets one window, not a rolling one they can farm.
- issuance **expired and never redeemed** → **re-arm it** with a fresh `issuedAt` / `expiresAt`.

Without the third case an evergreen flow dies for anyone who qualified once, ignored it, and came back months later — the exact customer the flow exists to recover.

**Launch backfill comes free.** The existing batch targeting modes can seed the initial cohort on day one — e.g. everyone who cancelled in the last 14 days — with no new code. Ongoing enrolment then runs off the triggers.

**Known wart:** `monthKey` is required on both the campaign and the issuance, which is a semantic mismatch for an evergreen code. Set it from the issuance month and ignore it; renaming the model is not worth the blast radius.

**Do not re-derive audience in the app.** "Never took a membership" belongs in the Klaviyo segment: `subscription.isActive` is `false` for paused and past-due members and **`true` for scheduled-cancel members**, and a subscription subdoc is written at abandoned-checkout time with status `incomplete`.

### 3.4 Preconditions — must ship with or before the codes

| # | Fix | Why it blocks |
|---|---|---|
| **P1** | **Claim the code/issuance only after entries are successfully routed** — or make the promo step participate in the reversal ledger the way `drawGrants` already does (`refund-ledger-reversal.ts:115-132` already records `sourceKey: "promo-link"`). | §2.2. A one-shot issuance makes the existing burn-before-grant window unrecoverable. |
| **P2** | Check `DrawGrantService`'s boolean and compensate, mirroring the streak path. | Same class, other direction. |
| **P3** | Make `/api/codes/validate` evaluate audience + already-used for promos. It **already does exactly this for campaigns** (`route.ts:117-127`) but not promos (`:75-98`). | Today an ineligible customer sees a green APPLIED badge, pays in full, and gets zero entries with the reason swallowed. Note: unauthenticated route, so this is a UX preview only — redemption stays authoritative. |
| **P4** | Rate-limit `/api/codes/validate` to 60/min, matching its sibling `promo/link/validate:4-9`. | It currently imports no limiter at all, so a stranger can anonymously confirm a leaked code and read its payout. |
| **P5** | Emit **`Subscription Cancellation Requested`** at cancel-click, with the real package name, tier and the true cancellation date. | Flow E otherwise fires ~28 days late, and this doubles as BACKIN200's mint point. |
| **P6** | Move the two authed **`Started Checkout`** emits server-side. | Ad-blocked members never enter Flow C — and this is LOCKIN100's mint point. |
| **P7** | Sync the Klaviyo profile on cancellation, and after any entry grant. | Otherwise the win-back segment reads churned members as active, and emails quote stale entry counts. |
| **P8** | Persist the refusal reason. The four reasons exist only as type literals (`PromoRedemptionService.ts:12-15`) and die in a stripped `console.log`. | Without it, an admin seeing "0 uses" cannot tell a broken gate from a bad email. This is the precondition for trusting *any* of this in production. |

P8 was raised independently by two judges as the single biggest operator upgrade available. It is cheap.

### 3.5 Guards to ship regardless

- **A global redemption cap on the code.** None exists anywhere — `usageCount` is only ever `$inc`'d and displayed, never compared to a limit. Against a leak the only lever today is flipping `isActive` *after* the damage.
- **Reconsider BACKIN200's 200 entries.** The major draw is entry-weighted (`major-draw/select-winner/route.ts:69-84`), and 200 entries **exceeds the 150 included with the $250 Boss Pack** (`membershipPackages.ts:185-190`). A leaked code converts *around* the funnel rather than into it, diluting every legitimate entrant proportionally. Issuance-gating is the structural answer; the entry value is the business one.

### 3.6 Testing — currently zero

No test file anywhere imports `PromoRedemptionService` or `PromoEligibilityService`, on a service that moves real money and real prize entries. New suite `test:promo-issuance`: window arithmetic across an AEDT/AEST transition, expiry boundary, double-redeem concurrency, redemption with no issuance, refund re-arm, idempotent re-issue, and a guard test for the §3.3 invariant.

---

## 4. Flow-by-flow readiness

| Flow | Trigger today | Verdict |
|---|---|---|
| **A. New Member** | `Subscription Started` · server | ✅ Works. |
| **B. Post Purchase** | `Placed Order` · server | ⚠️ Also fires on **every monthly renewal**. Must filter `is_renewal = false` or every member gets the sequence monthly. |
| **C. Abandoned Checkout** | `Started Checkout` | ⚠️ Both authed paths are client-side only; `static.klaviyo.com` is on standard blocklists. Feeds only a draft flow today. → P6. |
| **D. Failed Renewal** | `Subscription Renewal Failed` · server | ✅ Works, already live. |
| **E. Cancellation & Win-back** | `Subscription Cancelled` | ❌ Fires at **period end**, ~28 days after cancel-click. Payload hardcodes `packageName: "Subscription"` and a raw tier ID. → P5. |

---

## 5. Reply to the ads team on the properties

Klaviyo property names are case-sensitive, and a missing property renders **empty rather than erroring** — a mis-cased name fails silently in a live email.

| They wrote | Status | Use instead |
|---|---|---|
| `{Current_draw_entries}` | ❌ wrong case | `current_draw_entries` |
| `{Accumulated_Entries}` | ❌ wrong case | `accumulated_entries` |
| `{free_entries_count}` | ❌ does not exist | `{{ event.entries_granted }}` |
| `{package_name}` | ⚠️ event, not profile | `{{ event.package_name }}` |
| `{promo_slug}` | ⚠️ event, not profile | `{{ event.promo_slug }}` |
| `{next_payment_attempt}` | ⚠️ event, not profile | `{{ event.next_payment_attempt }}` |
| `{{ event.cancellation_date }}` | ❌ **wrong date** — see below | fixed by P5 |
| `{subscription_tier}` | ✅ exists | stale on cancellation until P7 |
| `{partner_discount_active}` | ✅ exists | — |
| `{next_renewal_date}` | ✅ exists | — |

**New correction, found in review:** `createSubscriptionCancelledEvent` stamps `cancellation_date: formatDateForKlaviyo()` **with no argument** (`klaviyo-events.ts:112`) — so it is the *emission* moment (period end), not the cancellation moment. And `formatDateForKlaviyo` (`klaviyo-helpers.ts:759-766`) formats **en-US in the server's timezone with no `timeZone` option**, so Australians can be shown a US-format UTC date.

**Other caveats:** `accumulated_entries` is not refreshed after a redemption until P7. `current_draw_entries` points at the previous draw for anyone who held no entry at the last rollover. `entries_purchased`, `lifetime_value`, `total_spent` and `member_entries` **drop when a membership lapses** — current-state figures despite the naming; do not use them in win-back copy. All `upsell_*` properties are permanently zero.

**On "one-time":** today it can only mean one use per customer — no global cap exists (§3.5).

---

## 6. Sequencing

| Phase | Ships |
|---|---|
| **P0** | Send §5 to the ads team today. No code. |
| **P1** | **Fix the two live bugs** — §2.1 (ordering) and §2.2 (burn-before-grant, = P1/P2). These are production defects independent of this request. |
| **P2** | Event + sync fixes: P5, P6, P7. Flows A–E become trustworthy with or without codes. |
| **P3** | Observability + guards: P3, P4, P8, redemption cap. |
| **P4** | The rail change: `issuedAt + validForDays` anchoring, mint points, `Bonus Code Issued`. Create the three codes. |
| **P5** | Tests, domain docs, BUSINESS.md, CUSTOMER.md, Cobber FAQ 47/48 + knowledge-pack rebuild, doc-sync trigger globs (which contain **no promo path at all** today). |

**Separately and urgently:** the shared dev/production Klaviyo account. `KLAVIYO_MODE=development` prefixes `[DEV]` onto *event names only*; profile upserts are unprefixed, so any local run mutates real customer profiles — and four flows marked `live` are triggered by `[DEV]` metrics. Own ticket, ahead of all of this.

---

## 7. Superseded: why Revision 1 was wrong

Kept for auditability.

Revision 1 proposed a new `PromoLinkIssuance` collection plus `validForDays` / `requiresIssuance` on `PromoLink`. It was rejected because:

1. **It rested on a false premise** — that no per-user relative window existed (§1.1).
2. **It forked the vocabulary.** `RedeemableIssuance` is the shipped word for "a per-user right to redeem a code." A second, parallel issuance collection gives operators two issuance systems with two admin stories — the exact failure the naming rule exists to prevent.
3. **It would have shipped with a known bug.** The refund reverser calls only `promoLinkUnredeem`; a new collection left at `status: 'redeemed'` would permanently lock out a refunded customer.
4. **It doubled the cascade surface** that `delete-user-cascade.ts` has already demonstrably forgotten once.
5. **It added a new Klaviyo emitter** onto a fire-and-forget transport (`klaviyo.ts:1846`) and a shared dev/prod account — so `Bonus Code Issued` could vanish silently while the issuance's clock kept ticking.

What survives from Revision 1: the **principle** (§3.1) and the **mint-at-qualification mechanism**. Only the vehicle changed.

---

## 8. Open questions

**Ads team:** (1) Confirm the codes require a purchase — this design assumes yes, which keeps us inside the published competition terms that list only three entry methods. (2) Confirm "one-time" = one use per customer. (3) Is 14 days from *qualifying* acceptable? The email always prints the true deadline, so copy is never wrong, but a flow delay shortens the felt window. (4) Is 200 entries right for BACKIN200 given §3.5?

**DJ:** (5) Refund — does a refunded code come back or stay burned? Recommendation: restore only if still inside the original window. (6) Should EXTRA100 accept a one-time pack too, or membership only?

---

## Appendix — found, out of scope

- **Referral entries are silently lost during a draw gap** while the referral is still marked converted and both counters incremented — two members told they got 100 entries each, receiving nothing, unrecoverably.
- Three out-of-band grant paths route entries into a frozen draw.
- `Major Draw Won` has never fired — the admin winner-selection route contains no Klaviyo call.
- Four hand-rolled copies of the draw-grant helper with differing semantics.
- Admin manual entry edit overwrites the source breakdown and can zero a user out of a draw.
- `/api/redeemables/status` hands every active campaign's shared code to any authenticated user regardless of targeting.
- Per-user coupon codes are minted with `Math.random()`.
- Klaviyo list subscription is written once at registration, fire-and-forget, never retried — the lapsed cohort is the most likely to be missing, which is precisely the win-back audience.
- Klaviyo's native Stripe integration is also connected, creating competing revenue metrics.
- The competition terms cap entries at 500,000 per entrant; nothing enforces it.
- Email verification is stubbed out at purchase, so `usedBy` keyed on `userId` means one redemption per free email address.
