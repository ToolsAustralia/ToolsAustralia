# Verified recovery channel (email OR mobile) + SMS login — design

**Date:** 2026-08-25 · **Branch:** `feature/august-28-draw-10-updates` · **Status:** awaiting review
**Supersedes:** the first draft of this file, which assumed *both* channels required and a
standalone `/my-account` gate. The requirement is now **at least one**, enforced in the
profile-setup step that already exists.

## 1. The actual requirement

Registration is passwordless. A buyer sets a password in the **profile-setup popup** that appears
after purchase. That password is the thing they forget. So:

> **Every member must finish setup holding at least one verified contact channel — email OR
> mobile — and that channel is what gets them back in.**

This is a **recovery-credential** requirement, not a data-hygiene mandate. It is deliberately
*not* a purchase gate: nothing about verification blocks buying, and nothing here changes that.

## 2. The mental model, checked against the code

| Clause | Verdict | Evidence |
|---|---|---|
| Passwordless register | ✅ **True** | `register/route.ts:827-866` creates the user with no password; no session minted. |
| Passwordless **login** | ❌ **False** | `/login` offers only password + Google + "Forgot password?" ([login/page-client.tsx:489,671,805](../../../src/app/login/page-client.tsx)). |
| Purchase → auto-login | ⚠️ **Partly** | True on the in-modal non-3DS path (`MembershipModal:2586→2612`). **Three paths mint no session** — see §3. |
| Upsell first, then profile setup | ✅ **True** | `UpsellModal` onClose → `setTimeout(… requestModal("user-setup"), 500)`. |
| Only purchasers can log in | ❌ **False as a rule** | No purchase check in any provider. It's *emergent*: purchasing is what creates a password. |
| The profile popup sets a password | ✅ **True** | Step 1, min 8 chars, bcrypt rounds 12. |

### 🚩 Gap A — the setup step does **not** currently enforce verification

Step 3 looks like a gate and isn't. `environmentFlags.emailVerificationMandatory()` is hardcoded
`return false` ([environment.ts:42-44](../../../src/lib/environment.ts#L42-L44)), so:

- "Complete Setup" is never disabled by it (`primaryDisabled`),
- the copy *"You can skip this and verify later"* renders
  ([Step3EmailVerification.tsx:114-118](../../../src/components/modals/UserSetupModal/Step3EmailVerification.tsx)),
- and `/api/user/setup` never checks `isEmailVerified` before flipping `profileSetupCompleted`.

**A member finishes setup today with zero verified channels.** That is precisely the hole
producing your support tickets — and it means this project is mostly *turning on* a gate that was
built and left off, plus adding the second channel to satisfy it.

### 🚩 Gap B — a verified email buys a login method that isn't on the login page

The emailed sign-in code (`send-login-code` → `verify-login-code`) exists and works, but its only
UI is `LoginModal`, which is mounted in exactly two places: the dev gallery, and inside
`ExistingAccountModal`. The sole production route to it is *go re-register with your existing
email → hit the "account already exists" wall → click Login*.

So today, "verify your email so you can sign in with a code" is a promise the login page cannot
keep. **Adding SMS login without also surfacing email-code login on `/login` would ship an
asymmetry** where the mobile channel works and the email channel — the one 9,087 members already
have — still doesn't.

## 3. Who never reaches setup at all

Three purchase paths end with a paying customer and **no session**, so they never see the popup,
never set a password, and never verify anything. They are the next cohort of locked-out members:

1. **3DS / SCA buyers.** `MembershipModal:3957` redirects to `/checkout/success` and returns; no
   success landing page calls `signIn` (verified: zero hits across `checkout/`,
   `purchase-success/`, `upsell-success/`).
2. **One-time buyers who never registered.** Account creation is deferred to the Stripe webhook;
   the response deliberately omits `autoLogin` (`create-one-time-purchase/route.ts:892-909`).
3. **Auto-login failure after a successful charge.** Falls through to `router.push("/login")` —
   paid, not logged in.

Also: **`/api/auth/auto-login` never asserts the PaymentIntent succeeded** — it only checks the PI
belongs to the user's Stripe customer
([auto-login/route.ts:81-88](../../../src/app/api/auth/auto-login/route.ts#L81-L88)). Combined with
`create-one-time-purchase` returning `autoLogin: true` on a `requires_action`/`processing` intent,
a session can be minted before the money lands.

### 3a. The fix: one `session-from-payment` primitive (decided — long-term, not a stopgap)

The 3DS redirect carries `payment_intent_client_secret` in the URL
([use3DSRedirectHandler.ts:46](../../../src/hooks/use3DSRedirectHandler.ts#L46)). Stripe hands that
secret only to the payer, so it is proof of possession. That is enough to mint a session **without
the client asserting who it is**:

```
POST /api/auth/session-from-payment   { paymentIntentClientSecret }
  1. parse the PI id from the secret; stripe.paymentIntents.retrieve(id)
  2. compare client_secret                      → proof of possession
  3. assert paymentIntent.status === "succeeded" → closes the pay-before-session gap
  4. resolve User by paymentIntent.customer === user.stripeCustomerId
  5. no user yet (webhook race)? → { pending: true }; the page retries
  6. signAutoLoginToken → client signIn("auto-login", { token })
```

**This replaces `/api/auth/auto-login` and all three `MembershipModal` call sites**, so 3DS and
non-3DS stop being separate code paths — which is precisely why 3DS was missed. It is *stricter*
than today's route on both counts: identity comes from the PaymentIntent rather than a
client-supplied `{userId, email}`, and success is asserted rather than assumed. Step 5 covers
failure path 2.

`/api/stripe/verify-payment-complete` already exists, has **zero callers**, and its own comments
describe it as the auto-login authorization step. Fold it into this route or delete it — do not
leave a third half-path.

Lands in **Phase 1**, before the gate, so no cohort reaches Phase 3 unable to satisfy it.

## 4. Production reality (audited 2026-08-25, read-only)

`npm run find:duplicate-mobiles:prod`

| Metric | Value |
|---|---|
| Total users | 55,959 |
| Have a mobile | **55,956 (99.99%)** |
| Email verified | 9,087 (16.2%) |
| Mobile verified | 5 |
| Active subscribers | 4,858 — **0 without a mobile** |
| — unverified email | 1,406 (28.9%) |
| Duplicate-mobile groups | **109** (218 accounts) — **0 staff** |
| Unnormalised mobiles (`04…` not `+61…`) | **4,972** |
| Invalid mobiles | 0 |

Mobile coverage is effectively universal, and every paying member has one. SMS is a **more**
reachable recovery channel than email for this base.

**Access-control cohorts (audited 2026-08-26):**

| Metric | Value |
|---|---|
| Total users | 56,397 |
| Ever paid (`processedPayments` non-empty) | 11,979 |
| — **who fail an `isActive`-based gate** | **4,613 (38.5%)** — cancelled 3,937 · past_due 1,086 · paused 6 |
| — with no password | 1,514 |
| **Never paid** | **44,448 (79%)** |
| — with a password | 149 |
| — with a verified email | 135 |
| — **able to log in at all today** | **159 (0.36%)** |
| — logged in within 90 days | **8** |
| — **with a mobile on file** | **44,445** |

Two things drive §5e. First, the never-paid cohort is *already* locked out by accident — only 159
can authenticate — so the `/membership` redirect is near-costless. Second, they almost all have a
mobile, so **ungated SMS login would expand the cohort able to log in from 159 to 44,445** — a
280× jump, at ~$0.114 per attempt, all landing on `/membership` anyway.

*(~438 new users appeared between the 08-25 and 08-26 runs — roughly 24h apart. Indicative, not a
measured rate; at ~21% ever-paid conversion that implies ~2,700 new purchasers/month reaching the
setup gate.)*

## 5. Design

### 5a. Step 3 becomes "Secure your account"

One step, two ways to satisfy it. Whichever the member picks, they end with a verified channel.

```
stepsNeeded:  if (!isEmailVerified && !isMobileVerified) steps.push(3)
```

- Default the UI to **email** (free) with **"Use my mobile instead"** as the alternative. This
  keeps SMS spend proportional to genuine need — see §7.
- Reuse Step 3's existing "Wrong email?" → *Update & verify* editor as the pattern for
  "Wrong number?".
- Success on either channel satisfies the step.

### 5b. Turn the gate on

`emailVerificationMandatory()` is the existing switch and its name no longer fits the concept.
Replace it with `verifiedContactRequired()` — one verified channel, either kind — and update its
five call sites. Server-side, `/api/user/setup`'s `completeSetupOnly` guard gains
`(isEmailVerified || isMobileVerified)` so the rule is enforced where it counts, not only in the
UI.

⚠️ `userSetupModalClosable()` returns `isDevelopment()`, so **the hard gate is freely dismissible
under `npm run dev`** — manual QA will not reproduce production blocking. Test with the flag
forced.

### 5c. SMS login — and email-code login — on `/login`

- New: `send-mobile-login-code` / `verify-mobile-login`, resolving the account **by mobile**,
  minting the bridge token via `signJWT` exactly as `verify-login-code` does.
- **Resolving by mobile is the security property.** There is no `{account, deliver-here}` pair to
  manipulate, so the F-001 takeover class becomes structurally impossible rather than guarded.
- Surface both code paths on `/login` (Gap B), framed as *"Trouble signing in?"* rather than
  co-equal buttons — that framing is also the main cost lever (§7).
- Fix `ExistingAccountModal`, whose mobile-conflict branch is broken by construction today
  (Login button is `disabled={!email}`, and `register` deliberately withholds the email on a
  mobile match as an enumeration guard — so every sign-in from it fails).

### 5d. For SMS, logging in *is* verifying

An existing member's mobile is already on file but unverified. Sending a code to **that** number
and having them return it proves control of it — exactly as strong as the email-code flow, which
sends to the on-file address. So:

> `send-mobile-login-code` requires only a **valid, unique mobile on file** — not
> `isMobileVerified`. Success sets the flag.

This dissolves the chicken-and-egg for all 46,872 currently-unverified members with **no backfill
campaign and no bulk SMS spend**. They verify by using it. This is the single most important
decision in the document.

### 5e. Access control: three separate questions (decided 2026-08-26)

The codebase currently answers "is this a real customer?" **24 different ways** across 93 files.
This project adds no 25th. It draws one line instead:

| Question | Answered by | Never used for |
|---|---|---|
| **Are you this account?** (login) | password · code to verified email · code to mobile on file · Google | payment status |
| **Can you reach the dashboard?** | `hasEverPaid` | `subscription.isActive` |
| **Is this account banned/removed?** | `user.isActive` | "hasn't bought yet" |

**Login is NOT gated on payment.** A never-paid registrant may hold a session — they simply can't
reach `/my-account` or `/rewards`. They can still buy, claim a promo, use a referral link.
Rejecting them at login would surface *"This account has been deactivated. Please contact an
administrator."* — manufacturing the support tickets this project exists to remove — and would
break abandoned-checkout recovery on the warmest 44,448 leads in the database.

**`user.isActive` stays moderation-only.** It is the removed-staff / admin-ban flag, checked in
all three NextAuth providers. Overloading it with "hasn't paid" would merge *banned* and *not yet
a customer* into one unrecoverable state and flip 79% of the user table to a status that reads as
punitive.

#### The dashboard gate

`src/middleware.ts` already carries two redirects of exactly this shape — staff → `/admin`
(`:74`), unauthenticated → `/login` (`:83`). A third joins them:

```ts
if (isProtectedRoute && token && !token.hasEverPaid && !isInternalUser(token))
  → redirect /membership
```

`protectedRoutes` is already `["/rewards", "/my-account"]`; `/membership` already exists; staff are
already diverted to `/admin` *before* this check by `isStaffBlockedPath`. The token stamp is
**free** — the `jwt` callback already runs `User.findById(token.sub)` on every request
([auth.ts:290](../../../src/lib/auth.ts#L290)) to keep the session fresh.

Redirecting to the join page is better funnel design than showing a non-customer an empty
dashboard. This is not a punishment path.

#### The predicate

```
hasEverPaid = processedPayments.length > 0
```

**Ever paid, never currently-active.** `processedPayments` is webhook-written and is *not* cleared
on refund or cancellation, so cancelled / past-due / paused members keep access. Using
`subscription.isActive` instead would bounce **4,613 paying customers** off their own dashboard —
including past-due members who still hold live entries and can win a draw (BUSINESS.md §226).

> ⚠️ **The just-paid race.** `processedPayments` is written by the Stripe webhook, so a buyer can
> reach `/my-account` before it lands and be bounced to `/membership` seconds after paying. Two
> mitigations, apply both: (a) widen the predicate to union the signals purchase routes write
> synchronously (`stripeSubscriptionId`, `oneTimePackages.length`, `subscription.startDate` — all
> "ever" signals); (b) `session-from-payment` (§3a) has already verified the PaymentIntent
> **succeeded**, so it stamps `hasEverPaid: true` at mint. This is why §3a and this section ship
> together in Phase 1.

#### SMS login is gated the same way — before the send

`send-mobile-login-code` resolves the user by mobile and checks `hasEverPaid` **before calling
Twilio**. No spend on a non-customer.

This is not a nicety. **44,445 of the 44,448 never-paid users have a mobile on file**, while only
**159** can log in at all today. Shipping SMS login ungated would hand a working login to 44k
accounts that never had one — a 280× expansion of the cohort — at ~$0.114 per attempt, all landing
on `/membership` regardless.

**Email-code login stays ungated:** it is free to send, so a cost-motivated gate has nothing to
buy there. The setup-step mobile verification (§5a) needs no gate either — it only runs
post-purchase.

*Response copy:* state it plainly and route them to `/membership`. This does confirm the number
has an account, but `send-login-code` and `request-password-reset` already enumerate today
(404 *"No account found with this email address"*), so vagueness here buys nothing. Closing
enumeration is worth doing — as its own change across all three routes, not this one.

### 5f. Not changing

Klaviyo SMS subscription stays ungated on verification (it's a live channel: 358 signups / 236
conversions). `isMobileVerified` syncs as a segmentable profile property. Nothing blocks purchase.

## 6. Blockers — clear before login-by-mobile ships

**B1 · 4,972 mobiles stored unnormalised.** The model's `pre("save")` hook normalises to `+61…`
but only runs on save, and `updateOne` bypasses it. A lookup on the canonical form **silently
misses ~5,000 members** — they appear not to have an account. Backfill first.

**B2 · `mobile` is not unique.** [User.ts:1332](../../../src/models/User.ts#L1332) is a plain index.
109 groups must be resolved before a `unique + sparse` index can build.

What the duplicates actually are — **every group is exactly 2 accounts**, and in each case one
human with two addresses:

| Shape | Groups | Resolution |
|---|---|---|
| Neither account has entries | **78** (72%) | Both empty. Mechanical. |
| One has entries, other has zero | **25** (23%) | Keep the one with entries. |
| **Both** have entries | **6** (5%) | Needs a per-group decision. |
| Both have an active subscription | **0** | Nobody is double-billed. |

> ⚠️ An earlier draft called ~101 of these "contested". That was wrong: the scoring counted
> `stripeCustomerId` as account value, but `register` creates the Stripe customer **before any
> payment** ([register/route.ts:876-887](../../../src/app/api/auth/register/route.ts)), so it only
> means "registered". Entry count is the honest signal.

The 25 one-sided groups are the lockout story in data — the zero-entry account is usually the
**older** one: `melanie.gibson199@hotmail.**co**` (0 entries, 2025-12-04) then
`melanie.gibson199@hotmail.**com**` (6 entries, 2026-01-26). Typo'd, locked out, gave up,
re-registered.

**Unblocking the index does not require merging anything.** The index needs uniqueness, nothing
more — so **unset `mobile` on the 109 loser accounts**. Non-destructive, reversible, no entries
moved, no accounts deleted. Whether to merge the 6 (and the 25) is a customer-service decision on
its own timeline, explicitly **not** a blocker.

If merging does happen: `accumulatedEntries` is a **lifetime** counter and most of those entries
belong to draws that have already run, so moving the number inflates a historical stat. Only
entries in the currently-open draw genuinely need to move.

**B3 · Six phone normalisers, three behaviours.** Critically `formatMobileNumber`
([sms.ts:84-101](../../../src/lib/sms.ts#L84-L101)) — which computes Twilio's `to` — handles bare-9
numbers starting `4` but not `5`, unlike the model hook. Consolidate to one.

**B4 · Seed collisions.** `seed-active-member.ts:228` and `seed-past-due-member.ts:312` both
hardcode `+61400000000`; the unique index won't build on a seeded dev DB.

**B5 · `update-phone` never resets `isMobileVerified`.** `update-email` correctly sets
`isEmailVerified = false` on change; the mobile twin does not, and has no uniqueness check. A
member who changes their number keeps a `true` flag pointing at an unverified one.

**B6 · Admin "Resend SMS verification" sends nothing** but returns
`"SMS verification code sent successfully"`. Support staff are telling members to check for a text
that was never sent.

**B7 · `stepsNeeded` is duplicated.** The identical derivation is re-computed inline in the
open/restore effect (`UserSetupModal/index.tsx:302-311`). Changing one and not the other desyncs
restore from render.

**B8 · Step `3` is hardcoded as "the last step" in eight places** (`primaryDisabled`,
`primaryLabel`, `ActionFooter` `isFinalStep`/`onPrimary`, `handleComplete`'s `activeStep === 3`,
two auto-complete effects), and the "finish now" shortcut lives inside `if (activeStep === 2)`.
Adding a channel choice inside step 3 avoids a step 4 and sidesteps all of this — a reason to
prefer one step with two modes over two steps.

**B9 · No SMS credentials exist anywhere.** `twilio@^5.9.0` is an installed dependency but no
`TWILIO_*` var is set in `.env.example`, either `.env.local`, or Vercel — which is the only reason
the F-001 takeover (B-list, §10) has stayed latent. Per §7 the gateway changes, so this becomes:
register the chosen provider's credentials in all four places, and **drop the `twilio` package**
once `sms.ts` is rewritten.

**B10 · Password length disagrees across the codebase:** 8 in `user/setup`, but **6** in
`reset-password`, `change-password`, and the model. A member forced to pick 8 can immediately
reset to 6.

## 7. Provider and cost — self-coded OTP on an AU gateway (decided 2026-08-26)

**Twilio Verify is out. We own the OTP logic and send over an Australian direct-carrier gateway.**

### 7a. Verified unit prices

> **Corrected 2026-08-26.** An earlier revision of this section used a 1.55 AUD/USD rate (actual:
> **1.3956**), a volume extrapolated from two user-count samples, and a hidden 1.25× resend factor
> baked into the per-unit price. All three inflated the case. Figures below are primary-sourced
> and the arithmetic is shown.

**Mobile Message** ([pricing](https://mobilemessage.com.au/pricing)) — AUD, **excludes GST**. Tiers
are per **credits bought in one purchase**, not monthly usage, and credits never expire. 1 credit =
1 SMS ≤160 chars.

| Credits purchased | Per SMS |
|---|---|
| 500+ | 4.0¢ |
| 1,000+ | 3.5¢ |
| **10,000+** | **3.0¢** |
| 100,000+ | 2.5¢ |
| First 30 days, any tier | **1.6¢** |

**Twilio** ([AU pricing](https://www.twilio.com/en-us/sms/pricing/au)) — USD. Outbound SMS
**US$0.0515**/segment · Verify **US$0.05 per successful verification *plus* that SMS** (verbatim:
*"$0.05 per successful verification … plus standard channel fees"*) · dedicated AU number
**US$8.25/mo** · failed-message fee US$0.001 · ⚠️ *"additional carrier fees may apply"* with **no
published AU figure** — treat $0.0515 as a floor.

**GST washes out**: Mobile Message quotes ex-GST (claimable); Twilio does not charge GST to
GST-registered B2B customers (reverse charge). Compare ex-GST.

At **1 USD = 1.3956 AUD**:

| | Per SMS (AUD ex-GST) | vs Mobile Message |
|---|---|---|
| Twilio Verify | **14.17¢** | 4.7× |
| Twilio raw SMS API | **7.19¢** | 2.4× |
| Mobile Message @10k credits | **3.0¢** | — |

Twilio also carries FX exposure (1.393–1.415 in the week of this audit) plus 2–3% card FX; Mobile
Message does not. Twilio's number is **A$138/yr**; Mobile Message's is free.

**Buy in bulk.** Because the tier is per-purchase and credits never expire, a single 10,000-credit
purchase locks 3.0¢ and covers 12–18 months. Doing that inside the first 30 days locks **1.6¢** —
~A$160 ex-GST for well over a year. Highest-leverage pricing action available.

The usual objection is losing Verify's **Fraud Guard** (SMS-pumping protection). It does not apply
here, because §5e already closed that surface with access control: sends are gated on
`hasEverPaid` **before** the provider is called, numbers are AU-validated, and the setup-step
verification is session-authed and post-purchase. We are not paying a vendor to police an endpoint
that refuses non-customers.

The second objection — *rolling your own OTP is where people get it wrong* — is fair, and this
codebase proves it: today's `sms.ts` uses `Math.random()`, stores codes in plaintext, and
rate-limits in a per-lambda `Map`. But nothing is being invented. **`verify-login-code` is the
in-house reference**: timing-safe compare, 5-attempt cap, expiry, distributed IP limiter. The SMS
path mirrors it. Copying working hardened code beats adopting a vendor SDK.

### 7b. Provider selection — route quality, not headline price

The cheapest routes carry the most intermediary hops, and hops mean latency and failure points.
Fine for marketing; for an OTP a 90-second code is a support ticket. So the criterion is
**cheapest among providers with direct AU carrier connections**, not cheapest.

Shortlist — both PAYG, no monthly fee, credits never expire, free API, both ACMA Sender ID
Register participants:

- **Mobile Message** — ~2–4¢ standard (1.6¢ first purchase), 500-credit minimum, **free dedicated
  virtual number**, handles **ACMA sender ID registration free** as a certified provider.
- **Cellcast** — ~3.7¢ at our tier, free shared number, dedicated numbers purchasable, free replies.

> **Required before committing: a bake-off.** Buy minimum credits on both, send 50 OTPs each to
> Telstra / Optus / Vodafone numbers across different times of day, measure delivery time and
> success rate. ~$20. Vendor uptime claims are marketing; this is the only evidence that matters,
> and no independent AU deliverability benchmark was found.

**Sender:** a **dedicated AU virtual number**, not a branded alphanumeric ID — unless the chosen
provider registers a sender ID for us free (Mobile Message says it does). The ACMA register closed
30 June 2026 and an unregistered branded sender is now labelled **"Unverified"** on the handset —
the worst possible label on a verification code.

### 7c. Running cost — measured base, unmeasurable share

**Measured against production, 2026-08-26:**

| Signal | Value |
|---|---|
| Accounts created, last 30d | 8,139 |
| — of those, already paid | **1,228** ← new purchasers reaching the setup step |
| Distinct users who logged in, last 30d | **1,478** |
| Existing payers with **no** verified channel | **2,995** ← one-off Phase 3 backlog |

*Caveats: `lastLogin` is a single timestamp, so 1,478 counts distinct users, not login events —
repeat logins are undercounted. 1,228 misses anyone who registered earlier but paid this month.*

So the monthly **opportunity** base is ~2,700 (1,228 setup + 1,478 login). **What share picks SMS
over email is not knowable before launch** — any figure here would be a guess presented as data,
which is exactly the error the 7a banner records. Sensitivity instead:

| SMS share | Sends/mo | Mobile Message @3.0¢ | Twilio Verify |
|---|---|---|---|
| 20% | ~540 | **A$16/mo** | A$77/mo |
| 35% | ~950 | **A$29/mo** | A$135/mo |
| **100% (ceiling)** | ~2,700 | **A$81/mo** | A$383/mo |

**The ceiling is the number that matters: A$81/month even if every verification and login went by
SMS.** The decision does not hinge on the unknown. Plus a one-off ~A$30 as the 2,995-payer backlog
verifies; no base-wide campaign (§5d).

**Instrument it.** Add a counter on which channel members pick at the setup step (Phase 3) — that
converts the guess into a measurement inside a fortnight and makes the next cost review evidential.

**What the §5e pre-send gate is worth.** 44,445 never-paid accounts hold a mobile. Ungated, a
single 5% curiosity wave is ~2,200 wasted sends to people who land on `/membership` anyway —
recurring, with nothing to stop retries. The gate costs one boolean check before the send.

### 7d. What changes this decision

International members (AU-only gateways stop working → Twilio/Telnyx return) · a 10× volume jump
(different tiers, dedicated routes) · removing §5e's pre-send gate (Fraud Guard's value returns).

*Confidence: **high** on the unit prices (both primary-sourced, arithmetic shown in 7a) and on the
~79% per-message saving. **Unknown, by nature** on SMS-vs-email share — hence the ceiling framing
in 7c rather than a point estimate. **Low-to-medium** on relative route quality between the two
finalists — hence the 7b bake-off. One unquantified risk: Twilio's unpublished AU carrier fee could
widen the gap further, never narrow it.*

## 8. Phases

### Phase 0 — Data remediation *(nothing visible)*
Normalise the 4,972 · adjudicate the 109 groups · consolidate the normalisers (B3) · fix seeds
(B4) · `unique + sparse` index in the model **and** `ensure-indexes.ts` · uniqueness check +
`isMobileVerified` reset on every mobile write path (B5).

### Phase 1 — Session-from-payment + access gate + Verify adapter *(mostly dark)*
**`POST /api/auth/session-from-payment` (§3a)** — replaces `/api/auth/auto-login` and the three
`MembershipModal` call sites; fold in or delete the unwired `verify-payment-complete`. This must
land before Phase 3 so no purchase cohort reaches the gate unable to satisfy it.

**The `hasEverPaid` access gate (§5e)** — ships in the same phase because it shares the token
stamp: `jwt` callback stamps it, `session-from-payment` stamps it `true` at mint (closing the
just-paid race), `middleware.ts` redirects non-payers off `/my-account` + `/rewards` to
`/membership`, and `send-mobile-login-code` checks it **before** the Twilio call. One predicate,
three consumers, one phase — splitting them would ship the race.

*User-visible in this phase:* the `/membership` redirect. Affects **159** accounts that can log in
today, **8** active in the last 90 days.

Then:
**`sms.ts` → a thin send-only gateway adapter** (§7). It exposes one neutral function —
`sendSms(e164, body)` — and is the *only* file that names the provider, per the vendor-isolation
rule. Delete `generateOTP`, the in-memory `Map`, the module-scope `setInterval`.

**The OTP logic is ours, mirrored from `verify-login-code`** — crypto-random code, hashed at rest,
expiry, 5-attempt cap, `timingSafeEqual` compare, `createDistributedRateLimiter` keyed on user
*and* number, `requireSameOrigin`. Not a new pattern: the same shape as the working email-code path.

Then: `send-mobile-verification` / `verify-mobile` (session-authed) · `send-mobile-login-code` /
`verify-mobile-login` (by mobile, §5d, `hasEverPaid`-gated **before** the send) · delete
`passwordless-login`, `send-otp`, `verify-otp`, `PasswordlessLoginModal` · fix B6 · widen
`UserData` with `isMobileVerified` (it already ships over the wire but is invisible to TypeScript)
· provider spend alert.

### Phase 2 — Login recovery goes live
SMS login **and** email-code login surfaced on `/login` (Gap B) · fix `ExistingAccountModal` ·
update `e2e/helpers/session.ts`, which is selector-coupled to the password form and gates the
whole suite.

**Ships: locked-out members get back in. This alone closes the support tickets.**

### Phase 3 — The gate turns on
Step 3 → "Secure your account", email-or-mobile (§5a) · `verifiedContactRequired()` replaces
`emailVerificationMandatory()` · server-side guard in `/api/user/setup` · fix B7/B8 · decide the
3DS cohort (§3) · **instrument the channel choice** (§7c) — one counter on email-vs-mobile at the
setup step, so the SMS-share guess becomes a measurement within a fortnight.

**Ships: every new member leaves setup with a working way back in.**

### Phase 4 — Docs, Cobber, Norm, BUSINESS/CUSTOMER
See §9.

## 9. Obligations

**Hook-blocking:** `CUSTOMER.md` will fire (`src/models/User.ts`, `src/app/api/auth/**`,
`src/lib/auth.ts`, `src/contexts/UserContext.tsx`, `src/components/auth/**`,
`src/app/(site)/my-account/**` all match `CUSTOMER_TRIGGER_GLOBS`). `BUSINESS.md` does **not**
fire for this scope, but rule 5 is owed by judgment: **§10f asserts "send-login-code is the only
hard gate"**, which Phase 3 inverts.

**Domain docs** (`findDomain` is first-match-wins, so billing isn't obvious):
`src/models/User.ts` → **docs/subscription/** · `src/lib/sms.ts` → **docs/email/** (SMS section is
a stub) · `LoginModal/**` → **docs/shared-ui/** · plus `docs/auth/`, `docs/dashboard-account/`,
`docs/e2e/`, `docs/infrastructure/`.

**Cobber (rule 5c):** FAQ id 44 tells members *"verifying your email is optional and never
required… your entries are granted whether or not your email is verified."* The second half is
**already false** — campaign redeemable issuance defaults to `requiresEmailVerified ?? true`
([CampaignService.ts:350-351](../../../src/services/redeemables/CampaignService.ts#L350-L351)),
silently skipping **1,406 active subscribers**. That is a live accuracy bug Cobber repeats today
and should be fixed regardless of this project; the first half becomes false in Phase 3. id 32 is
the login deflection target (19 signals route to it). Count pinned at **89** in
`faqs.test.ts:166`; **duplicate ids 77 and 78 already exist**. Re-run
`npm run build:chat-knowledge-pack` and `npm run test:chat-faqs`.

**Norm (rule 10):** `internal-norm/schemas/users.ts:53,197` types `isEmailVerified` as
non-nullable. Verify with `npm run norm:smoke`.

**Env (rule 9):** register the chosen gateway's credentials in `.env.example` (provider-named, e.g.
`SMS_GATEWAY_API_KEY` / `SMS_GATEWAY_SENDER`), then set values in this worktree's `.env.local`, the
**main folder's** `.env.local`, and Vercel. **Also remove the now-unused `twilio` dependency** from
`package.json` — nothing imports it once `sms.ts` is rewritten. No `TWILIO_*` var was ever
registered, so there is nothing to clean up there.

## 10. Security invariants

1. A code is only ever delivered to a number **supplied by the caller in the same request that
   verifies it** (SMS login), or to `user.mobile` from an **authenticated session** (setup step).
   Never to a request-body number paired with a *different* identifier — that is the F-001 shape.
2. Every OTP route: `createDistributedRateLimiter` (the `Map` in `sms.ts` doesn't work on
   serverless — each lambda gets its own) + `requireSameOrigin`.
3. **Spend ceiling is now ours to enforce.** An AU-domestic gateway has no equivalent of Twilio's
   Geo Permissions, so the app owns it: `validateMobileNumber` (AU `+61 4/5` only) runs
   server-side **before** every send, `hasEverPaid` gates SMS-login sends (§5e), and the provider
   account carries a hard credit cap. These three replace Fraud Guard — see §7a for why that trade
   is sound *given §5e*, and §7d for the condition that reverses it.
4. **We now store OTP material, so it must be handled like a credential:** crypto-random (never
   `Math.random()`), **hashed at rest**, short expiry, 5-attempt cap, `timingSafeEqual` compare,
   cleared on success and on expiry. All five already exist in `verify-login-code` — mirror it,
   do not re-derive it. This invariant did not apply under Verify, which held the code for us.
5. Deactivated-account check runs **after** code validation, matching `verify-login-code`.
5. **Re-assess F-004.** It was accepted as won't-fix because its target was zero-value: register's
   mobile-only-match branch rebinds an account's login email
   ([register/route.ts:727-728](../../../src/app/api/auth/register/route.ts#L727-L728)). Once mobile
   is a **login identifier**, that residual is no longer zero-value.

## 11. Not doing

Blocking purchase on verification · requiring *both* channels · a base-wide verification campaign
(§5d makes it unnecessary) · verified-only Klaviyo sends · WhatsApp/voice fallback · **Twilio, in
any form** (§7) · fixing the `auto-login` PaymentIntent-status gap (flagged, separate) · closing
account enumeration on `send-login-code` / `request-password-reset` (real, but its own change
across all three routes — see §5e).

## 12. Open questions

1. ~~The 3DS / never-registered cohort~~ — **decided 2026-08-26:** build the long-term
   `session-from-payment` primitive (§3a) in Phase 1, replacing `auto-login` and unifying the 3DS
   and non-3DS paths. Explicitly not a stopgap.
2. ~~Duplicate adjudication~~ — **decided 2026-08-26:** unsetting the loser's `mobile` unblocks the
   index without merging (B2). Merging the 6 both-have-entries groups is decoupled and can happen
   later. *Still open, non-blocking:* whether to merge those 6 at all, and whether current-draw
   entries move with them.
3. ~~Twilio vs alternatives~~ — **decided 2026-08-26:** self-coded OTP over an AU direct-carrier
   gateway (§7). *Still open, blocking Phase 1:* **which of Mobile Message or Cellcast**, settled by
   the §7b bake-off. Confirm both appear on
   [ACMA's participating-telco list](https://www.acma.gov.au/47-view-list-all-participating-telcos-register)
   (not verified — the page would not load during research).
4. **Klaviyo sender ID** — now lower stakes: if the chosen gateway registers a sender ID free
   (Mobile Message says it does), we do not need Klaviyo's. Still worth knowing whether one exists,
   so marketing and transactional SMS present consistently.
