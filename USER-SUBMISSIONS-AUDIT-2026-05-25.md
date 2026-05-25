# User Submissions Audit — Contact Form

**Date:** 2026-05-25
**Source:** `contactsubmissions` collection, production (read-only). 367 messages, 2025-11-26 → 2026-05-25 (~6 months).
**Method:** 100% of messages read manually; cluster sizes are keyword lower-bounds (a message can hit several clusters) cross-checked against the manual read.
**Scope:** user-written contact-form messages only. The 989 `errorreports` (988 auto-logged payment errors) were excluded by request — they are machine telemetry, not user prose.

> **Triage state on the data itself:** 364 of 367 submissions are still status `new`. Only 3 have ever been actioned. This backlog is its own finding — there is effectively no support-triage happening on this inbox.

---

## Executive summary

The contact inbox is dominated by **one root cause expressed many ways**: people buy what they believe is a one-off draw entry, and only afterwards discover (a) it created a **recurring monthly membership**, and/or (b) they live in a **state that cannot win**. Almost everything else — cancellation demands, refund demands, "unauthorised charge", chargeback/legal threats — flows downstream of those two disclosure gaps.

| Signal | ≈ count | % of 367 |
|---|---|---|
| Cancellation / unsubscribe requests | **187** | 51% |
| Refund demands | 68 | 19% |
| "Didn't realise it was recurring / one-off" | 48+ | 13%+ |
| "Charged without my authorisation" | 33 | 9% |
| State eligibility (SA/ACT/VIC) found out **after** paying | 32 | 9% |
| Login / verification-email problems | 16 | 4% |
| Double charge (same session) | 12 | 3% |
| Account deletion / card removal requests | 10 | 3% |
| Scam / fraud / B2B spam (external) | 17 | 5% |
| Profile field can't be edited | 7 | 2% |
| Referral bonus not received | 6 | 2% |
| Dashboard won't load (error) | 7* | 2% |
| Mini-draw accidental purchase | 4 | 1% |
| Upgrade entries miscounted | 4* | 1% |

\* manual-read count; the keyword tally undercounts these two.

**The single highest-leverage fix:** make the recurring/subscription nature and the state-eligibility rule unmistakable **before** the card is charged. That one change would deflate the cancellation, refund, "unauthorised", and chargeback clusters simultaneously — well over half the inbox.

---

## Verification against production data (2026-05-25)

Per-complainant check against Mongo (`users`, `membershipstatushistories`, `paymentevents`, `errorreports`) + Stripe (`charges`, `subscriptions`). Read-only. Verdicts below **supersede** the Part 1 framing where they differ.

### #3 Same-session double charges — ❌ LARGELY REFUTED (correction — my first pass was wrong)
**My initial "8 of 9 double charges" was a bug in my verification script, not a platform bug.** The script counted any Stripe charge with `status: "succeeded"` as money taken. But a charge can be `status: succeeded` while `captured: false` — a temporary **authorization hold** whose PaymentIntent was later **canceled/abandoned** (it shows as *Incomplete*/*Cancelled* in the dashboard and **receives $0**). The `Date.now()` idempotency bug *does* spawn duplicate PaymentIntents, but the extra ones are abandoned holds, not captures.

Re-checked with authoritative fields (`amount_captured`, `amount_refunded`, each PaymentIntent's `amount_received`) and reconciled to the dashboard **"Spent"** for all 9 — every row balances:

| user | dashboard "Spent" = net captured | extra same-second PIs | true double-capture? |
|---|---|---|---|
| jacobrowan85 | A$57.50 (one $20 + $25 + $12.50) | 3× $20 canceled/incomplete ($0 received) | **No** |
| gaza-r-k | A$40.00 (one $40) | 3× $40 canceled ($0) | **No** |
| aedanmccu | A$120.00 (6 monthly $20) | 1× $20 canceled hold ($0) | **No** |
| ben.grantham | A$100.00 (5 monthly $20) | canceled hold ($0) | **No** |
| liammurray454 | A$40.00 (2 monthly $20) | canceled hold ($0) | **No** |
| rusty_4eva154 | A$200.00 (5 monthly $40) | $80 attempts all failed/canceled ($0) | **No** |
| ranifesaitu | A$80.00 net ($100 gross − $20 refund) | canceled hold ($0) | **No** |
| gypseymiller67 | A$40.00 (2 monthly $20, a month apart) | none | **No** (renewal) |
| **lewis.mayers** | A$100.00 net ($150 gross − **$50 refund**) | — | **Yes — 1 real double-capture, already refunded** |

**Corrected verdict: there is no systemic double-*capture*.** Exactly **one** genuine double-charge in the sample (`lewis.mayers`, 2026-03-27, matches receipt INV-1774593572079) and it was **already refunded**. What customers *perceive* as "charged twice" is the duplicate **authorization hold** showing as *pending* on their bank statement before it drops off — a real, fixable UX problem (remove `Date.now()` from the idempotency key so only one PI is created), **but not lost money.** I retract the earlier "money owed back" statement.

### #4 Cancelled-but-charged — ❌ REFUTED as a billing bug (my earlier framing was too strong)
In **every** verifiable case our records show **no cancellation at the date the user claims**; the disputed charges occurred **before** the actual (later) cancellation, and **3 of them were already refunded**. When a cancellation *is* completed, **no further charges occur** — the cancel feature works.
- `jacson_lalande98` (the strongest claim: "cancelled 18/2, charged 3×, have email") — only a **Jan-17** cancel and a **May-24** cancel exist; a **new** subscription was created **2026-03-26** (re-subscribe / disclosure #1) and billed Mar/Apr/May *before* the May-24 cancel.
- `cecil.farah1` — **no cancellation at all**; the "$20" was a **past-due recovery** retry that finally succeeded 2026-05-25.
- `lowriemark4` / `bigdano` / `tasulu2008` — charges **predate** the real cancel date; the **last charge was refunded** in each.
- Tell-tale: `ebb_zy`, `frosty.95`, `parker.childs`, `georgia_foster21`, `j.zvyoung` were all cancelled by **`cancel_api_admin`** on 24–25 May — i.e. **support had to cancel for them** because they couldn't self-serve. `tasulu2008` is **passwordless** (couldn't log in to cancel — see #5).

**So #4 is not a cancel-races-renewal bug.** It's users *unable to find/complete cancellation* (discoverability + #5) and *re-subscription confusion* (#1).

### #5 Passwordless stranded at `/login` + resend/overwrite — ✅ CONFIRMED, large blast radius
**29,989 of 37,069 users (80.9%) are passwordless.** `/login` offers only password + Google; the email-code path lives only in `LoginModal`. A passwordless user landing on `/login` cannot get in. Resend is 1/5-min (429) and each send overwrites the prior code, so a delayed first email entered after a resend reads "Invalid" (`send-login-code/route.ts:58`, `verify-login-code/route.ts:65`). Both login complainants exist as real accounts.

### #6 Dashboard loading error — ⚠️ NOT CONFIRMED (consistent with what you saw)
All **7** reporters have **zero** error reports and **healthy accounts**. Also: opening a user in the **admin panel is a different code path** than the user's own `/my-account` dashboard — so "I opened it, no error" is expected and doesn't exercise the user path. No evidence of a systemic/persistent bug; most consistent with **transient** (cold-start/deploy) or **client-side**, possibly correlated with the **past-due** state several were in at the time. Caveat: GET endpoints may not auto-log 500s, so this isn't 100% conclusive — the decisive check is **Vercel 5xx logs** for `/api/users/[id]/my-account` + `/api/major-draw` around the complaint timestamps (offered, not yet run).

### #7 DOB — ✅ symptom REAL (303 users), ⚠️ creation root-cause NOT yet pinned
**303 users have an impossible birthdate (year ≥ 2025)** — e.g. complainant `lcarrott` = 2026-03-11, `parker.childs` = 2026-04-07, `neiltorrance` = 2026-02-26. **But** the signup picker uses `maxDate={new Date()}` (`Step2Demographics.tsx:118`), whose day-range check *should* block future dates — so there's an **unexplained bypass** in how the bad value is saved; I have **not** confirmed the creation mechanism. The edit-path silent-reject branch (`BirthdatePicker.tsx:169,182`) only blocks *out-of-range (future)* selections; correcting *down* to a valid past year works in code, so it doesn't fully explain "can't change the year." The specific reporter's DOB is now correct (resolved). **Verdict: real data problem; needs a focused repro to find the save path — don't assume the silent-reject is the cause.**

---

## Part 1 — Issues the website does **NOT** currently handle (or are bugs)

Ranked by ticket-volume impact. Each item carries the code verdict and the file to change.

### 1. Recurring nature is not disclosed at the point of payment — **NOT HANDLED** (biggest driver)
Users believe a draw entry is a single purchase; the selected plan's `period === "mo"` silently routes them into Stripe subscription creation, and the payment screen never restates "you will be billed monthly until you cancel."

- Evidence (representative): #36, #54, #55, #71, #87, #89, #102, #109, #117, #118, #122, #124, #127, #144, #151, #159, #173, #183, #195, #207, #214, #220, #222, #228, #240, #245, #252, #268–271, #286, #288, #299, #300, #323, #329, #330, #332–336, #355, #357, #362, #364, #367.
- Code: the payment CTA is just `Pay $X` with only "secured by Stripe" fine print — `src/components/modals/StripePaymentModal/PaymentForm.tsx:254`. A grep of the registration `PaymentStep` for `monthly|/mo|recurring|auto-renew|cancel` returns **zero** matches. The one-off vs membership distinction is driven only by the plan's `period` and is never restated at payment time (`src/components/modals/MembershipModal/index.tsx:814,860`).
- Fix direction: on the payment confirmation, when `period === "mo"`, show explicit "$X today, then $X every month — cancel anytime in your account" copy and ideally a checkbox acknowledgement. Make the one-off path visually distinct.

### 2. State ineligibility (SA/ACT) is shown only **after** payment — **NOT HANDLED**
The eligibility rule exists in code but is enforced/disclosed too late: a guest's state isn't even collected until the post-payment account-setup modal.

- Evidence: #5, #14, #16, #21, #31, #45, #74, #92, #123, #136, #143, #148, #150, #171, #187, #196, #197, #210, #235, #253, #256, #258, #259, #261, #282, #295, #298, #302, #308 (ACT), #319, #322, #343. Several explicitly call it "misleading"; #302 and #314 reference the ombudsman.
- Code: excluded states are `["SA","ACT"]` in `src/utils/giveaway-eligibility.ts:6` (a pure helper — it gates nothing in the flow). State is first captured in `src/components/modals/UserSetupModal/Step2Demographics.tsx:85` which renders **after** the charge; for one-time/guest buyers the account is created by the webhook *post-payment* (`src/app/api/stripe/create-one-time-purchase/route.ts:702`), and billing state is hardcoded `"NSW"` at checkout (`src/components/modals/MembershipModal/index.tsx:660`). The only pre-payment mention is buried in `src/app/(site)/terms/page.tsx:88`.
- Fix direction: collect/confirm state **before** payment (or a pre-payment "not available in SA/ACT" interstitial). Note the user perception also includes VIC — worth confirming the intended excluded set.

### 3. Duplicate PaymentIntents → duplicate *authorization holds* (not double captures) — **UX-BUG** *(see Verification #3 for the correction)*
Stripe idempotency keys are suffixed with `Date.now()`, so two rapid submits get different keys → two PaymentIntents. **Verified against production: the extra PI is abandoned/canceled and captures $0 — only one charge is ever taken** (net captured = dashboard "Spent" in all 9 sampled cases; one isolated true double-capture was already refunded). The real harm is the duplicate **pending authorization hold** on the customer's statement (drives "you charged me twice" complaints) until it drops off — not lost money. The webhook benefit-dedup only stops re-processing the **same** PI.

- Evidence: #3 ("$20 twice"), #10, #17, #26, #27, #51, #107, #108 ("one in the morning and one just now"), #175 (one $50 pack billed twice, receipt #INV-1774593572079-ZQZV), #344.
- Code: `src/app/api/stripe/create-one-time-purchase/route.ts:599` and `src/app/api/stripe/create-payment-intent/route.ts:129` both build `pi_..._${Date.now()}`. There is **no** server-side purchase cooldown — `src/lib/purchaseCooldown.ts` only pauses client query refetch, despite docs claiming it prevents double-charges (`docs/draws/rules.md:51`, `docs/draws/backend.md:36`, `BUSINESS.md:517` — all stale/wrong).
- Webhook double-processing **is** correctly deduped (`src/services/stripe-webhook-queue/enqueue.ts:32`, unique `{paymentIntentId,eventType}` on `src/models/PaymentEvent.ts:111`) — so the bug is purely on PI creation, not webhook handling.
- Fix direction: derive the idempotency key from stable inputs (user + package + a client-generated request id), drop `Date.now()`, and add a short server-side per-user cooldown. *(Not yet verified whether the subscription create/renew paths share the same pattern — flagged as open.)*

### 4. Cancellation: "cancelled but still charged" + hidden cancel entry point — **PARTIALLY HANDLED / BUG**
A self-serve cancellation flow exists and works for cleanly-active subs, but two real gaps drive tickets:

- **Cancelled-but-charged:** a healthy cancel only sets `cancel_at_period_end: true` (`src/services/subscription/CancelSubscriptionService.ts:100`); Stripe still bills the in-flight cycle, and there's no lock guarding a self-serve cancel racing the anchor-24 renewal charge job. Evidence: #140, #246, #263, #342 (has cancellation-confirmation email + 3 subsequent charges, bank chargeback opened), #357 ("cancelled and it auto-renewed").
- **Cancel is hidden from the main dashboard card for past_due/inactive users (discoverability — NOT "can't cancel"; corrected 2026-05-26):** the dashboard "Manage Membership" button only renders when `isActive=true` (`src/app/(site)/my-account/components/MembershipStatus.tsx:143`), so a past_due user's front card shows "No Active Membership". **However, cancellation IS available** via **Settings → Subscription**, which renders `PastDueAlert` with an explicit **"Cancel Subscription"** button (`SettingsRedesignSubscription.tsx:361` → `PastDueAlert.tsx:38-45` → `handleCancelSubscription` → `CancellationFlowModal`; cancel takes effect immediately for past_due). So the 619 past_due users **can** cancel — the gap is that the path is in Settings, not on the dashboard card, which is likely why some emailed support. Evidence: #62, #119, #132, #159, #179, #191, #192, #316.
- Fix direction: surface a cancel/stop-billing path even when the local record is inactive; reconcile cancel against the renewal job; show the "ends on <date>, no further charges" state explicitly after cancel.

### 5. Passwordless users stranded at `/login`; resend & code-retry bugs — **IS-A-BUG**
- The `/login` page only offers password + Google (`src/app/login/page.tsx:464,632`), but registration is **passwordless** (`src/app/api/auth/register/route.ts:586`). The 6-digit email-code entry exists only in `LoginModal` (`src/components/modals/LoginModal/index.tsx:476`). A passwordless user who lands on `/login` directly has no way in.
- Resend is rate-limited to **1 / 5 min** (`src/lib/email/utils.ts:122`) and each new code **overwrites** the previous (`send-login-code/route.ts:58`), so a delayed-then-resent code makes the first-arriving code "invalid" — exactly the complaints. Rate-limit store is in-memory/per-instance (`src/lib/email/rate-limiter.ts:10`), inconsistent on serverless.
- No recovery for a mistyped sign-up email (email is locked, see #9). Evidence: #6, #7, #11, #13, #84, #111, #154, #251, #320, #359.

### 6. Dashboard / profile fails to load after login — **PARTIALLY HANDLED / BUG**
- The account page blocks render on all three queries but only surfaces the *account* query's error; if `/api/major-draw` 500s it can hang on a spinner (`src/app/(site)/my-account/page.tsx:276,287`). Any 401/403/`USER_NOT_FOUND` triggers an auto `signOut()` mid-load (`src/lib/queries.ts:155`), reading as "can't access my profile." Evidence: #326, #331, #337, #348, #350, #361, #363 (all May 2026 — looks like a recent regression).
- Fix direction: surface major-draw query failures with a retry instead of an infinite spinner; don't auto-logout on a transient profile fetch error. **Action: check production 5xx rates on `/api/major-draw` and `/api/users/[id]/my-account`** — the clustering in May suggests a live regression.

### 7. Date-of-birth picker silently rejects the year — **IS-A-BUG**
`BirthdatePicker` silently returns without applying a change when the clamped date is out of range (`src/components/ui/BirthdatePicker.tsx:182,169`), leaving the view on the current year. Users see "stuck on 2026 / says I'm too young." Evidence: #264, #265.

### 8. No self-serve account deletion — **NOT HANDLED**
There is no user-facing delete-account endpoint (only admin: `src/app/api/admin/users/[id]/delete/route.ts`). Evidence: #29, #58, #113, #226, #257, #266, #267, #276, #290 + many "delete my account/details." (Card removal *is* handled — see Part 2.)

### 9. Email & name locked with no self-serve change — **NOT HANDLED (by design, but generates tickets)**
Email and first/last name are deliberately locked in the UI ("Contact support to change", `src/app/(site)/my-account/components/settings/ProfileTab.tsx:226,247`). A working `update-email` backend exists but is wired to no control. This is the root of the email-typo and name-typo tickets: #48, #53, #111, #165, #313. Fix direction: at minimum a guarded self-serve email-correction (the backend already exists).

### 10. Mini-draw "Free Entries" + one-tap charge — **IS-A-BUG (UX)**
The mini-draw modal markets entries as **"Free Entries"** (`src/components/modals/MiniDrawPackageModal.tsx:99`) while "Purchase Now" immediately charges the saved card with no "you'll be charged $X" confirmation (`src/components/features/MiniDrawPackages.tsx:256`). There is no points/entries balance to spend, so users assume they're applying entries they already own. Evidence: #188 ($500 accidental), #339.

### 11. Referral bonus silently fails when the code is lost — **PARTIALLY HANDLED**
The grant logic is correct and two-sided (+100 each, `src/lib/referral.ts:300`), but it only fires if the code reaches Stripe metadata on the referee's **first** settled payment. The `?ref=` code lives in sessionStorage (per-tab, dies on tab close — `src/hooks/useReferralCode.ts:30`) and only counts if applied as a coupon in the modal. Failures are swallowed (non-blocking try/catch). So "neither of us got the bonus" is usually: referee wasn't first-time, or the code never made it to metadata. Evidence: #30, #80, #96, #227, #241.

### 12. Upgrade entries can be under-credited — **PARTIALLY HANDLED / BUG**
The intended model stacks correctly (`lastMonthAccum + newBase × promo`, `src/utils/payment/subscription-entries-calculator.ts:168`), but only when the `isUpgrade` metadata guard holds AND the promo multiplier resolves to its painted value at the moment the upgrade invoice settles (`src/services/stripe-webhook-handlers/index.ts:3530,3542`). "Had 160, now 200" (+40 = base only, no 10x) is consistent with the multiplier resolving to 1x at settlement. Evidence: #23, #159, #238, #328. **Auditable per-user** via `scripts/verify-major-draw-entries.ts` (upgrades surface as `REVIEW`).

---

## Part 2 — Issues the website **already handles** (so these tickets are UX/awareness, not missing features)

| Capability | Status | Where |
|---|---|---|
| Self-serve cancellation flow | ✅ works for cleanly-active subs | `CancellationFlowModal` → `api/stripe/cancel-subscription` |
| "Existing subscription" 409 + stale-`incomplete` re-validation | ✅ core fix shipped | `SubscriptionReferenceService.ts:99` (matches commit "fix existing subscription error") |
| Resubscribe with accumulated-entry carry-over | ✅ | `CancelSubscriptionService.ts:136`, `ResubscribeTierPicker` |
| Webhook double-processing dedup | ✅ | `enqueue.ts:32`, `PaymentEvent.ts:111`, `ProcessedStripeEvent` |
| Saved-card removal | ✅ (with a last-card-on-active-sub confirm gate) | `payment-methods/[id]/route.ts:14` |
| State-eligibility rule itself | ✅ exists (just gated too late — Part 1 #2) | `giveaway-eligibility.ts:6` |
| Mini-draw ticket visibility | ✅ implemented | `MiniDrawInteractions.tsx:61`, `/my-account/draws` |
| Profile editing: phone / state / DOB | ✅ editable (DOB has the year bug, Part 1 #7) | `ProfileTab.tsx:318,370,349` |
| Password reset (for password users) | ✅ 24h token | `request-password-reset` → `reset-password` |
| Referral grant logic | ✅ correct two-sided +100 | `referral.ts:300` |
| Upgrade entry stacking | ✅ correct when guards hold (Part 1 #12) | `subscription-entries-calculator.ts:168` |

**Implication:** for cancellation specifically, the feature exists — the 187 cancel tickets are mostly *discoverability + the "I didn't know I subscribed" surprise*, plus the smaller hard-bug subset in Part 1 #4. Fixing disclosure (Part 1 #1) shrinks this far more than any cancellation-UI change.

---

## Part 3 — Out of scope (not website/codebase issues)

- **Scam / impersonation / fraud (~17):** third parties using the Tools Australia name + ABN to send fake invoices (#15, #42, #44), B2B "credit application / Net 30" social-engineering (#72, #120, #208, #209, #218, #219), spammy quote requests / distributor inquiries (#215, #260, #293), account-takeover report (#294), legal/chargeback threats stemming from the billing surprise (#229, #314). These are abuse/comms issues, not code defects — though they're amplified by the billing confusion.
- **Pure info questions (~9):** draw timing, who won, how notifications work, "do you have an app" (#178, #180, #211, #277, #309, #351).
- **Tests / praise / partnership:** #1, #2, #93, #205, #206.

---

## Part 4 — Prioritised recommendations

1. **Pre-payment disclosure of recurring billing** (Part 1 #1) — deflates the cancel + refund + unauthorised + chargeback clusters at once. Highest ROI.
2. **Pre-payment state-eligibility gate/notice** (Part 1 #2) — kills the SA/ACT refund cluster and the ombudsman/legal exposure.
3. **Remove `Date.now()` from the idempotency key** (Part 1 #3) — stops the duplicate *authorization holds* that drive "you charged me twice" complaints (note: verified this is a pending-hold UX issue, **not** lost money — no systemic double-capture); also correct the stale docs that claim a cooldown protection that doesn't exist.
4. **Cancellation hardening** (Part 1 #4) — surface cancel when DB is inactive; reconcile against the renewal job; confirm "no further charges."
5. **Triage the inbox** — 364/367 untriaged; several are bank-chargeback/ombudsman threats (#229, #263, #302, #314, #342) that need a human now.
6. **Investigate the May dashboard-load cluster** (Part 1 #6) against production 5xx logs — possible recent regression.
7. Lower-volume but cheap: DOB year bug (#7), passwordless `/login` entry (#5), self-serve email correction (#9), mini-draw charge confirmation (#10).

---

## Appendix — confidence notes

- Cluster sizes are keyword lower-bounds; `cant_load` and `upgrade_entries` are manual counts (regex undercounted them).
- Strong (code-cited, directly verified): #1, #2, #3, #5, #7, #8, #9, #10, Part 2 table.
- Structurally plausible, needs a production data/log confirmation: #4 (cancelled-but-charged race), #6 (which endpoint is 5xx-ing), #11/#12 (per-user via `verify-major-draw-entries.ts`).
- The subscription create/renew paths were not traced for the same `Date.now()` idempotency pattern as the one-time path — verify before assuming renewals are immune.
