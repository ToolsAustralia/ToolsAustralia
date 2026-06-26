# Tools Australia — Customer Context

> **Audience.** Developers and Claude sessions who need the authoritative reference on *who the customer is*, *what data we hold about them*, and *how they move through the product*. This is the **customer-side companion to [BUSINESS.md](BUSINESS.md)**: where BUSINESS.md documents the business mechanics (packages, pricing, draw cadence, billing rules), CUSTOMER.md documents the **customer** — their identity, their data/fields, and their journey/flows.
>
> **Scope.** This file covers **customers only** — guests and members. The underlying technical entity is the [`src/models/User.ts`](src/models/User.ts) record, which is a **mixed-class collection**: the same model also holds **staff and admin** accounts (`userType: "customer" | "staff" | "admin"`, `roleId`). A customer is `userType: "customer"` / `roleId: null` ([User.ts:291-292](src/models/User.ts#L291)). Staff/admin RBAC fields are flagged where they appear but are **out of scope** here — see [docs/auth/](docs/auth/) for those.
>
> Wherever a deep business mechanic is involved (billing anchor, past-due recovery, draw cadence, retention pricing), this doc **links to BUSINESS.md / docs/** rather than re-deriving it.

---

## 1. Who the customer is

There is **no separate "guest" model**. Registered guests and members are the same `User` collection, differentiated at runtime by what their `subscription` and purchase sub-documents hold. "Member" status is **derived** from `subscription.isActive` / `hasActiveSubscription` ([UserContext.tsx:73-77](src/contexts/UserContext.tsx#L73)) — there is no `isMember` boolean field on the model.

| Customer type | How it's represented in code | What they can do |
| --- | --- | --- |
| **Anonymous visitor** | No `User` record at all (not signed in). Only retroactively traceable via `signupAttribution.anonymousId` *after* they register ([User.ts:241-256](src/models/User.ts#L241)). | Browse the public site. No entries, no partner access. |
| **Registered guest** (account, no membership) | A `User` exists but `subscription` is absent / `isActive: false` (`status` defaults to `"incomplete"`) and the purchase arrays are empty ([User.ts:485-496](src/models/User.ts#L485)). | Signed in; can purchase. Gated out of member-only surfaces until first purchase activates them. Classified as **Guest** in the dashboard ([settings/page.tsx:42-65](src/app/(site)/my-account/settings/page.tsx#L42)). |
| **Active member / subscriber** | `subscription.isActive: true` with Stripe `status` of `active` / `trialing` ([User.ts:38-40](src/models/User.ts#L38)). **One subscription at a time.** | Monthly entries, partner discounts, retention modals, full member dashboard at `/my-account/`. |
| **One-time-only buyer** | No active `subscription`, but holds entries in `oneTimePackages` ([User.ts:89-96](src/models/User.ts#L89)) and/or `miniDrawPackages` ([User.ts:99-112](src/models/User.ts#L99)). Can hold **multiple** of these. | Entries / partner access from each pack until its `endDate`; no recurring billing. Shows as **Guest** in the dashboard. |

A single customer can be more than one of the last two at once (e.g. an active member who also bought a one-time pack). For the package catalog itself (Tradie / Foreman / Boss subscriptions; Apprentice → VIP one-time packs; Additional and upsell packs) see [BUSINESS.md §2](BUSINESS.md).

---

## 2. The customer data model

Every field below lives on the `User` Mongoose model ([src/models/User.ts](src/models/User.ts); interface lines 3-313, schema 315-1133). This is a **load-bearing** inventory — keep it intact when the model changes.

**PII legend:** **PII** = personal/identifying or payment data (email/phone/address/name/payment/DOB); **Sensitive** = secret/credential material; **—** = non-sensitive.

> **Caveats.** The schema is `strict: true` + `strictQuery: true` — fields not in the schema are rejected ([User.ts:1130-1131](src/models/User.ts#L1130)). `mobile` is normalized to `+61…` format on every save via a pre-save hook ([User.ts:1136-1158](src/models/User.ts#L1136)). The exact client-facing `UserData` shape returned to the browser (defined in `@/hooks/queries/useUserQueries`) is **unverified** here; credential/secret fields below are presumed stripped from API responses but that projection was not traced.

### 2a. Identity & profile

| Field | Type | Meaning | PII |
|---|---|---|---|
| `_id` | string | Mongo document id (typed as string) ([User.ts:4](src/models/User.ts#L4)) | — |
| `firstName` | string (req, ≤50) | Given name ([User.ts:5](src/models/User.ts#L5)) | **PII** |
| `lastName` | string (req, ≤50) | Family name ([User.ts:6](src/models/User.ts#L6)) | **PII** |
| `state` | string (opt) | AU state/territory code; validated against NSW/VIC/QLD/WA/SA/TAS/ACT/NT ([User.ts:10](src/models/User.ts#L10)) | **PII** (coarse) |
| `profession` | string (opt, ≤100) | e.g. Builder, Electrician, Other ([User.ts:11](src/models/User.ts#L11)) | — |
| `birthdate` | Date (opt) | DOB; drives age-based eligibility; cannot be future ([User.ts:12](src/models/User.ts#L12)) | **PII** |
| `profileSetupCompleted` | boolean (def false) | Whether profile setup is done ([User.ts:13](src/models/User.ts#L13)) | — |
| `role` | "user" \| "admin" (def "user") | Legacy coarse role marker ([User.ts:14](src/models/User.ts#L14)) | — |

### 2b. Authentication & credentials

| Field | Type | Meaning | PII |
|---|---|---|---|
| `email` | string (req, unique, lowercase) | Login + primary contact; regex-validated ([User.ts:7](src/models/User.ts#L7)) | **PII** |
| `password` | string (opt, ≥6) | bcrypt hash; **optional** — passwordless customers have none ([User.ts:8](src/models/User.ts#L8)) | **Sensitive** |
| `isEmailVerified` | boolean (def false) | Email verified flag ([User.ts:145](src/models/User.ts#L145)) | — |
| `isMobileVerified` | boolean (opt, def false) | Mobile verified flag ([User.ts:146](src/models/User.ts#L146)) | — |
| `emailVerificationToken` / `mobileVerificationToken` | string (opt) | Verification tokens ([User.ts:147-148](src/models/User.ts#L147)) | **Sensitive** |
| `emailVerificationCode` / `…Expires` / `…Attempts` | string / Date / number | 6-char email code + expiry + attempt counter ([User.ts:151-153](src/models/User.ts#L151)) | **Sensitive** (code) |
| `smsOtpCode` / `…Expires` / `…Attempts` | string / Date / number | SMS OTP for passwordless auth ([User.ts:159-161](src/models/User.ts#L159)) | **Sensitive** (code) |
| `loginCode` / `…Expires` / `…Attempts` | string / Date / number | Emailed passwordless sign-in code ([User.ts:164-166](src/models/User.ts#L164)) | **Sensitive** (code) |
| `passwordResetToken` / `passwordResetExpires` | string / Date | Single-use reset token + expiry ([User.ts:169-170](src/models/User.ts#L169)) | **Sensitive** (token) |

### 2c. Contact & marketing consent

| Field | Type | Meaning | PII |
|---|---|---|---|
| `mobile` | string (opt) | AU mobile; validated + normalized to `+61…` on save ([User.ts:9](src/models/User.ts#L9), hook [1136-1158](src/models/User.ts#L1136)) | **PII** |
| `acceptsPromotionalEmail` | boolean (opt) | Klaviyo marketing opt-in; **omitted/undefined ⇒ opted in** ([User.ts:180](src/models/User.ts#L180)) | — |
| `pendingKlaviyoMergeFromEmail` | string (opt, lowercase) | Old email to merge from in Klaviyo after a verified email change; cleared after merge ([User.ts:156](src/models/User.ts#L156)) | **PII** |

### 2d. Subscription / membership

Embedded subdocument `subscription` (one active membership at a time; [User.ts:29-86](src/models/User.ts#L29), schema 466-595). `packageId` is `Schema.Types.Mixed` to allow ObjectId or string.

| Field | Type | Meaning | PII |
|---|---|---|---|
| `subscription.packageId` | string\|null | Current package id after any changes ([User.ts:30](src/models/User.ts#L30)) | — |
| `subscription.startDate` / `endDate` | Date | Membership start / cycle end ([User.ts:31-32](src/models/User.ts#L31)) | — |
| `subscription.cancelledAt` | Date (opt) | When the user triggered cancellation ([User.ts:33](src/models/User.ts#L33)) | — |
| `subscription.pastDueAt` | Date (opt) | First past_due timestamp ([User.ts:35](src/models/User.ts#L35)) | — |
| `subscription.lastReanchoredInvoiceId` | string (opt) | Idempotency marker for past-due re-anchor ([User.ts:37](src/models/User.ts#L37)) | — |
| `subscription.isActive` | boolean (def false) | Active membership flag ([User.ts:38](src/models/User.ts#L38)) | — |
| `subscription.autoRenew` | boolean (opt, def true) | Auto-renew toggle (soft-cancel shortcut) ([User.ts:39](src/models/User.ts#L39)) | — |
| `subscription.status` | string (def "incomplete") | Stripe status string (see §3) ([User.ts:40](src/models/User.ts#L40)) | — |
| `subscription.pendingStripeSubscriptionId` / `…RequestId` / `…CreatedAt` | string / string / Date | Non-canonical pending Stripe sub from initial checkout ([User.ts:43-45](src/models/User.ts#L43)) | — |
| `subscription.previousSubscription` | subdoc (opt) | **Downgrade ghost state** (§3): cached old `packageId`, `packageName`, `benefits{entriesPerMonth, discountPercentage}`, `startDate`, `endDate`, `downgradeDate` ([User.ts:49-59](src/models/User.ts#L49)) | — |
| `subscription.pendingChange` | subdoc (opt) | **Upgrade ghost state** (§3): `newPackageId`, `changeType: "upgrade"`, `stripeSubscriptionId?`, `paymentIntentId?`, `upgradeAmount?` ([User.ts:63-69](src/models/User.ts#L63)) | — |
| `subscription.lastDowngradeDate` / `lastUpgradeDate` | Date (opt) | Anti-gaming / anti-webhook-interference guards ([User.ts:72-75](src/models/User.ts#L72)) | — |
| `subscription.lastMonthAccumulatedEntries` | number (opt) | Carry-over for renewal entry calc; **persists through cancel** ([User.ts:80](src/models/User.ts#L80)) | — |
| `subscription.lastResubscribedAt` | Date (opt) | Most-recent resubscribe time (drives carry-over banner) ([User.ts:85](src/models/User.ts#L85)) | — |
| `stripeCustomerId` | string (opt) | Stripe customer id ([User.ts:17](src/models/User.ts#L17)) | **PII** (payment link) |
| `stripeSubscriptionId` | string (opt, sparse) | Canonical Stripe subscription id ([User.ts:18](src/models/User.ts#L18)) | — |

**One-time / mini-draw purchase arrays** (a customer can hold many):

| Field | Type | Meaning | PII |
|---|---|---|---|
| `oneTimePackages[]` | array | Each: `packageId, purchaseDate, startDate, endDate, isActive, entriesGranted` ([User.ts:89-96](src/models/User.ts#L89)) | — |
| `miniDrawPackages[]` | array (opt, def []) | Each: `packageId, packageName, miniDrawId?, purchaseDate, startDate, endDate, isActive, entriesGranted, price, partnerDiscountHours, partnerDiscountDays, stripePaymentIntentId` ([User.ts:99-112](src/models/User.ts#L99)) | — |

### 2e. Entries & draw history

| Field | Type | Meaning | PII |
|---|---|---|---|
| `miniDrawParticipation[]` | array (opt, def []) | Per-mini-draw tracking: `miniDrawId, totalEntries, entriesBySource{"mini-draw-package"?, "free-entry"?}, firstParticipatedDate, lastParticipatedDate, isActive` ([User.ts:116-126](src/models/User.ts#L116)) | — |
| `accumulatedEntries` | number (def 0) | Total entries ever received ([User.ts:129](src/models/User.ts#L129)) | — |
| `entryWallet` | number (def 0) | **Deprecated — kept at 0** ([User.ts:130](src/models/User.ts#L130)) | — |
| `rewardsPoints` | number (def 0) | Points earned from purchases (legacy; see §7) ([User.ts:131](src/models/User.ts#L131)) | — |
| `cart[]` | array | Cart items, `type: "product" \| "ticket"` with `productId?` / `miniDrawId?`, `quantity`, `price?` ([User.ts:136-142](src/models/User.ts#L136)) | — |

> **Major-draw entries are NOT on `User`.** They were removed; the single source of truth is `MajorDraw.entries` ([User.ts:133,752](src/models/User.ts#L133)). See §6.

### 2f. Saved payment methods (PCI note)

| Field | Type | Meaning | PII |
|---|---|---|---|
| `savedPaymentMethods[]` | array | Each: `paymentMethodId` (req), `isDefault` (def false), `createdAt`, `lastUsed?` ([User.ts:21-26](src/models/User.ts#L21)) | **PII** (payment) |

**PCI note:** by design **only the Stripe payment-method id is stored** — no raw card numbers / PAN. Card data lives with Stripe ([User.ts:20-22,443](src/models/User.ts#L20)).

### 2g. Perks state — partner / referral / affiliate

| Field | Type | Meaning | PII |
|---|---|---|---|
| `partnerDiscountQueue[]` | array (opt, def []) | Stacked partner-discount access periods. Each: `_id?, packageId, packageName, packageType("membership"\|"one-time"\|"mini-draw"\|"upsell"), discountDays, discountHours, purchaseDate, startDate?, endDate?, status("active"\|"queued"\|"expired"\|"cancelled"), queuePosition, expiryDate (12mo from purchase), stripePaymentIntentId?` ([User.ts:274-288](src/models/User.ts#L274)) | — |
| `referral` | subdoc (opt) | This user's code: `code` (unique sparse index), `successfulConversions` (def 0), `totalEntriesAwarded` (def 0) ([User.ts:224-228](src/models/User.ts#L224)) | — |
| `affiliateReferral` | subdoc (opt) | Link to the Affiliate who referred this user: `affiliateId (ref Affiliate), affiliateCode, referredAt, firstPurchaseCompleted (def false), membershipTied (def false)` ([User.ts:232-238](src/models/User.ts#L232)) | — |

### 2h. Attribution / marketing snapshot

| Field | Type | Meaning | PII |
|---|---|---|---|
| `signupAttribution` | subdoc (opt) | Promo page + UTM/ad context at signup: `promotionPageType("evergreen"\|"toolset"), promotionSlug, visitedAt, anonymousId, utmSource, utmMedium, utmCampaign, utmContent, utmTerm, campaignId, adsetId, adId` ([User.ts:241-256](src/models/User.ts#L241)) | — |

> The resolved **`convertingPlatform`** is **not** on `User` — it lives on the `PaymentEvent` record (see §8).

### 2i. Preferences, flags & engagement history

| Field | Type | Meaning | PII |
|---|---|---|---|
| `isActive` | boolean (def true) | Account-active flag ([User.ts:174](src/models/User.ts#L174)) | — |
| `processedPayments[]` | string[] | Processed-payment ids (idempotency safety) ([User.ts:185](src/models/User.ts#L185)) | — |
| `cancellationUpsellRedeemed` / `…RedeemedAt` | boolean / Date | One-time cancellation upsell (+100 entries) redeemed flag + timestamp ([User.ts:188-189](src/models/User.ts#L188)) | — |
| `retentionOffersConsumed` | subdoc (opt) | One-time retention flags: `pause30d?`, `discount50_2mo?` ([User.ts:193](src/models/User.ts#L193)) | — |
| `upsellPurchases[]` | array (opt) | Each: `offerId, offerTitle, entriesAdded, amountPaid, purchaseDate, triggeringPaymentIntentId?` ([User.ts:196-204](src/models/User.ts#L196)) | — |
| `upsellHistory[]` | array (opt) | Each: `offerId, action, triggerEvent, timestamp` ([User.ts:207-212](src/models/User.ts#L207)) | — |
| `upsellStats` | subdoc (opt) | `totalShown, totalAccepted, totalDeclined, totalDismissed, conversionRate, lastInteraction` ([User.ts:215-222](src/models/User.ts#L215)) | — |
| `redemptionHistory[]` | array (opt, def []) | Points-redemption log: `redemptionId?, redemptionType("discount"\|"entry"\|"shipping"\|"package"), packageId?, packageName?, pointsDeducted, value, description, redeemedAt, status("completed"\|"pending"\|"cancelled")` ([User.ts:259-269](src/models/User.ts#L259)) | — |

### 2j. Timestamps

| Field | Type | Meaning | PII |
|---|---|---|---|
| `lastLogin` | Date (opt) | Last login time ([User.ts:173](src/models/User.ts#L173)) | — |
| `createdAt` / `updatedAt` | Date | Auto (`timestamps: true`) ([User.ts:311-312](src/models/User.ts#L311)) | — |

### 2k. Staff / admin-only fields — NOT part of the customer record

These exist on the same collection but are RBAC / service-account machinery ([User.ts:290-308](src/models/User.ts#L290)). **Do not document or treat as customer-facing.** A customer always has `userType: "customer"` and `roleId: null`.

| Field | Type | Meaning |
|---|---|---|
| `roleId` | ObjectId\|null (def null) | Staff role ref; `null` = customer |
| `userType` | "customer"\|"staff"\|"admin" (def "customer") | Account class |
| `serviceAccount` | boolean (opt, def false) | Non-human service account (e.g. Norm AI) |
| `inviteToken` / `inviteTokenExpires` / `invitedBy` / `invitedAt` | mixed | Staff invite machinery (`inviteToken` is **Sensitive**) |
| `tokenVersion` | number (def 0) | Permission-change counter forcing JWT re-auth |
| `role: "admin"` | (see §2a) | Legacy admin marker — not a customer value |

---

## 3. Customer lifecycle & states

`User.subscription.status` is a free-form `String` that defaults to `"incomplete"` and receives Stripe status values directly ([User.ts:493-496](src/models/User.ts#L493)). The **canonical enum** lives on `MembershipStatusHistory.membershipStatus` ([MembershipStatusHistory.ts:26-40](src/models/MembershipStatusHistory.ts#L26)) and is mirrored as `MembershipNormalizedStatus` ([membershipAnalytics.ts:15-24](src/types/admin/membershipAnalytics.ts#L15)). This mirrors [BUSINESS.md §10](BUSINESS.md) from the **customer's** point of view.

### 3a. The states

| State | Source | What it means *for the customer* |
| --- | --- | --- |
| `incomplete` | Stripe | First payment not yet collected — the customer hasn't truly started. |
| `incomplete_expired` | Stripe | First payment was never collected; dead/terminal. Safe to resubscribe. |
| `trialing` | Stripe | Late-month joiners (25th/26th/27th AEST) sit here until the 24th anchor date. They've **paid full price** — this is the billing-anchor mechanism, **not** a free trial ([BUSINESS.md §9b](BUSINESS.md), [BILLING_ANCHOR_24.md](docs/BILLING_ANCHOR_24.md)). |
| `active` | Stripe | Paid and current — full member benefits. |
| `past_due` | Stripe | A renewal payment failed; `subscription.pastDueAt` is set. The customer sees a past-due hero card + `RenewalFailedModal` and can self-recover. Collection is paused (`pause_collection` with `keep_as_draft`) during recovery ([SubscriptionCollectionPauseService.ts:7-11](src/services/subscription/SubscriptionCollectionPauseService.ts#L7)). |
| `unpaid` | Stripe | Stripe gave up after its retry sequence. Still recoverable via the renew/retry path. |
| `scheduled_cancel` | **App (normalized)** | The customer requested cancellation but **benefits stay live until cycle end**. The cancel path sets `autoRenew=false` + `cancelledAt` + `endDate`; the raw `status` string is **not** itself rewritten to `scheduled_cancel` — that is the canonical/analytics label for this condition ([CancelSubscriptionService.ts:124-134](src/services/subscription/CancelSubscriptionService.ts#L124)). |
| `canceled` | Stripe | Subscription has ended; benefits gone. Immediate cancels set `isActive=false`, `status="canceled"` ([CancelSubscriptionService.ts:129-131](src/services/subscription/CancelSubscriptionService.ts#L129)). |
| `none` | **App** | Never had a subscription, or fully cleared — the registered-guest / fully-lapsed state. |

**On "paused" and "expired":** there is **no distinct `paused` or `expired` enum value**. "Paused" is the Stripe `pause_collection` mechanism layered onto a `past_due` subscription during recovery, not a customer-facing status. "Expired" is the colloquial term for a fully-ended subscription past its grace window — represented canonically as `canceled` (or `incomplete_expired` for one that never started); the resubscribe flow calls a fully-ended member's path `create_new`. *(Unverified: whether any UI string literally shows the words "expired" / "paused" to the customer — treat both as conceptual, not enum values.)*

### 3b. The two app-specific "ghost" states

Two `subscription` sub-fields act as state without being in the enum, yet change what tier/benefits the customer has **right now** ([BUSINESS.md §10b](BUSINESS.md)):

| Ghost state | Field | Customer meaning |
| --- | --- | --- |
| **Downgrade benefit-preservation** | `subscription.previousSubscription` ([User.ts:49-59](src/models/User.ts#L49)) | After a downgrade, the **old (higher) tier's** `entriesPerMonth` and `discountPercentage` are cached and stay live until `endDate` — the customer keeps the better benefits through the cycle they already paid for. |
| **Upgrade-awaiting-payment** | `subscription.pendingChange` ([User.ts:63-69](src/models/User.ts#L63)) | An upgrade was initiated but the charge is in-flight; the desired package is parked here. Entries are granted **server-side by the Stripe webhook** once the upgrade invoice is paid, not by the client. |

### 3c. Key transitions (customer view)

- **Guest → member** — first successful purchase activates the account; `incomplete → active` (or `trialing` for 25th–27th joiners). Activation runs the welcome / `UserSetupModal` sequence.
- **Upgrade** (`active → active`, cycle resets) — immediate full-price charge, `billing_cycle_anchor: "now"`, entries granted on the paid invoice; transits the `pendingChange` ghost state. See §5.
- **Downgrade** (`active → active` at lower tier) — **no charge now**, takes effect at cycle end; old benefits preserved via `previousSubscription`. See §5.
- **Soft-cancel / `autoRenew` off** (`active → scheduled_cancel`) — `PATCH /api/stripe/update-auto-renew` sets `cancel_at_period_end: true`; benefits stay through the cycle; re-enabling undoes it and clears `cancelledAt`/`endDate`.
- **Renewal failure** (`active → past_due → unpaid`) — `invoice.payment_failed` sets `pastDueAt`; the customer recovers via `RenewalFailedModal`. Recovery re-anchors future renewals to the catch-up date ([BUSINESS.md §9d](BUSINESS.md)).
- **End of cycle after cancel** (`scheduled_cancel → canceled`) — benefits end at `endDate`.
- **Win-back** via `POST /api/stripe/renew-subscription`, branching on current Stripe status — `retry_payment`, `reactivate`, or `create_new` (see §5.6).

---

## 4. Account creation & authentication

Auth is **NextAuth (JWT session strategy)** with two customer-facing providers — `credentials` (email + password) and `google` (OAuth) — plus an internal `auto-login` bridge provider used to convert a guest into a session after a server-verified action ([auth.ts:45-171](src/lib/auth.ts#L45)). New accounts are created **passwordless** (no `password` field). See [docs/auth/](docs/auth/).

### 4a. CRITICAL — registering in step 1 does NOT auto-login or grant membership (verified)

This is the most important and non-obvious behaviour. Registering in **step 1** of the `MembershipModal` only creates/updates a guest account and bridges to step 2 — it leaves `isAuthenticated: false` and grants no membership.

- Step-1 success calls `POST /api/auth/register`, which returns `{ success: true, message: "Step 1 completed", data: { userId, email, firstName, lastName, mobile, ... } }`. **No session token, no auth cookie is issued** ([register/route.ts:904-919](src/app/api/auth/register/route.ts#L904)).
- The modal stores that response in component state `guestUserData` and advances to step 2. It does **not** call `signIn()` ([MembershipModal/index.tsx:1436-1442](src/components/modals/MembershipModal/index.tsx#L1436)).
- The bridge is `hasCompletedRegistration = isAuthenticated || guestUserData !== null` ([MembershipModal/index.tsx:594](src/components/modals/MembershipModal/index.tsx#L594)). A guest passes through step 2 (payment) as `isAuthenticated: false` the entire time, using `guestUserData` as the credential for the subscription/payment-intent calls.
- The new account is created with `subscription.isActive: false`, `subscription.status: "incomplete"`, `accumulatedEntries: 0`, and **no `password`** ([register/route.ts:704-742](src/app/api/auth/register/route.ts#L704)). **Membership is granted only later, via the Stripe payment + webhook path**, not by registering.
- The account becomes a real session **only after payment**: on payment success the modal POSTs `/api/auth/auto-login` with the `paymentIntentId` and then `signIn("auto-login", { token })` ([MembershipModal/index.tsx:2357-2387](src/components/modals/MembershipModal/index.tsx#L2357)). `/api/auth/auto-login` requires a Stripe `paymentIntentId` belonging to the user's Stripe customer **as proof of payment** before minting the bridge token ([auto-login/route.ts:64-102](src/app/api/auth/auto-login/route.ts#L64)).

The register route even hard-codes `isAuthenticated: false` in its Klaviyo "Started Checkout" event "because this path runs at registration submit and the user is, by definition, a guest" ([register/route.ts:109-111](src/app/api/auth/register/route.ts#L109)). Documented at [docs/auth/gotchas.md:14-26](docs/auth/gotchas.md#L14).

### 4b. Registration internals (guest account creation)

`POST /api/auth/register` validates `firstName`, `lastName`, `email`, Australian `mobile` (normalised to `+61…`), plus optional `affiliateCode`, `promotionSlug`, `packageId`, and UTM/click-ID fields ([register/route.ts:56-86](src/app/api/auth/register/route.ts#L56)). Rate limited at 20/min/IP. A **"plain account"** = `!accumulatedEntries || accumulatedEntries === 0`.

| Case | Behaviour |
|------|-----------|
| Email/mobile belong to a **converted** account (`accumulatedEntries > 0`) | Rejected `400` with `isExistingAccount: true` + `existingAccountEmail`; told to log in ([register/route.ts:302-337](src/app/api/auth/register/route.ts#L302)). |
| Email/mobile belong to an account with **saved payment methods** | Same rejection ([register/route.ts:341-378](src/app/api/auth/register/route.ts#L341)). |
| Email **and** mobile match the **same plain account** | Account is **updated in place** (name/email/mobile/attribution), re-fires `User Registered` ([register/route.ts:382-502](src/app/api/auth/register/route.ts#L382)). |
| Email and mobile match **different** accounts | Rejected `400` "Registration conflict" ([register/route.ts:503-519](src/app/api/auth/register/route.ts#L503)). |
| Only email **or** only mobile matches a plain account | That plain account is updated ([register/route.ts:523-700](src/app/api/auth/register/route.ts#L523)). |
| No match | New passwordless account created; a Stripe customer is created and linked (`stripeCustomerId`) ([register/route.ts:702-770](src/app/api/auth/register/route.ts#L702)). |

### 4c. Login paths

| Path | Mechanism |
|------|-----------|
| **Email + password** | `LoginModal` → `signIn("credentials")`; the provider looks up the user and `bcrypt.compare`s the password. **Passwordless users (no `password`) cannot use this provider** — `authorize` returns `null` ([auth.ts:56-135](src/lib/auth.ts#L56)). |
| **Email sign-in code (passwordless)** | "Send code to sign in instead" → `POST /api/auth/send-login-code` then `POST /api/auth/verify-login-code`, which returns a bridge `token` consumed by `signIn("auto-login", { token })`. This is how no-password customers log in ([LoginModal/index.tsx:460-556](src/components/auth/LoginModal/index.tsx#L460)). |
| **Google OAuth** | `signIn("google")` via popup. The `signIn` callback **rejects Google sign-in for emails with no existing account** (`return false`) — new users must register the normal way first. On success it sets `isEmailVerified = true` ([auth.ts:325-344](src/lib/auth.ts#L325)). |
| **Post-payment auto-login** | `/api/auth/auto-login` (payment-proof) → `signIn("auto-login")` — converts a paying guest into a session ([MembershipModal/index.tsx:2357-2387](src/components/modals/MembershipModal/index.tsx#L2357)). |

After a successful login the client reads the fresh id via `getSession()`, invalidates user-scoped caches via `usePurchaseInvalidation`, then `router.push("/my-account")` + `router.refresh()`.

### 4d. Email verification — what it actually gates

Email verification is **6-character code** based (not a click-link) and is **not required to register or to pay**:

- `send-email-verification` generates a code stored with expiry + attempt counter; rate limited.
- `verify-email` checks the code (max 5 attempts, expiry enforced), sets `isEmailVerified = true`, updates `lastLogin` ([verify-email/route.ts:81-125](src/app/api/auth/verify-email/route.ts#L81)).
- It functions as an **alternate login gate inside `LoginModal`**: when a password login fails with an email-verify error, the modal shows the verification flow; on success, `verify-email` mints a **membership-gated** bridge `token` (only if the user has membership/`stripeCustomerId`) and signs them in — otherwise the client falls back to the password step.
- Google OAuth implicitly verifies the email.

> **Unverified:** whether `isEmailVerified` gates any **non-auth** capability (draw entry, checkout, page access). No such gate appears in the auth layer; if one exists it lives in another domain.

### 4e. Password reset

- `POST /api/auth/request-password-reset` — looks up the user (returns `404` if no account — it does **not** mask existence), generates a 32-byte-hex `passwordResetToken` + expiry, emails a reset link. Rate limited to once per 5 minutes ([request-password-reset/route.ts:27-87](src/app/api/auth/request-password-reset/route.ts#L27)).
- `POST /api/auth/reset-password` — finds the user by unexpired token, `bcrypt.hash`es the new password (min 6 chars, cost 12), then **clears the token** so it is single-use ([reset-password/route.ts:23-36](src/app/api/auth/reset-password/route.ts#L23)). Setting a password this way lets a previously-passwordless customer subsequently use the `credentials` provider.

### 4f. Per-path summary

| Path | Flow |
|------|------|
| **New guest (membership signup)** | `MembershipModal` step 1 → `POST /api/auth/register` creates passwordless account, returns `guestUserData`; **still `isAuthenticated: false`, no membership** → step 2 payment uses `guestUserData` → on payment success, `/api/auth/auto-login` (payment proof) + `signIn("auto-login")` establishes the session; membership is granted via Stripe/webhook. |
| **Returning member (password)** | `LoginModal` → `signIn("credentials")`. If password fails on an unverified email, switch to the email-code verify flow (bridge token). No-password members use the "send sign-in code" path instead. |
| **Returning member (Google)** | `LoginModal` "Sign in with Google" → popup OAuth → callback rejects unknown emails, marks known emails verified → poll `getSession()` → redirect to `/my-account`. |

---

## 5. The membership journey

Members manage their membership from **My Account → Membership** ([membership/page.tsx](src/app/(site)/my-account/membership/page.tsx)) and **My Account → Settings → Subscription** ([SubscriptionTab.tsx](src/app/(site)/my-account/components/settings/SubscriptionTab.tsx)), both of which render the `SubscriptionManagementModal`. For pricing/tier mechanics see [BUSINESS.md §2, §9, §13](BUSINESS.md).

### 5.1 Initial purchase (joining)

New members pay the **full package price immediately at signup**, charged to their card via Stripe. There is **no free trial** — "trial" only appears as a Stripe billing-anchor artifact (§5.2) and is purely cosmetic ([BILLING_ANCHOR_24.md:61-63](docs/BILLING_ANCHOR_24.md)).

### 5.2 Renewal date — the 24th rule

Membership renews **monthly**. The renewal day depends on the day you joined (Australian Eastern time):

| When you joined (AEST day of month) | When you renew |
|---|---|
| 25th, 26th, or 27th | Anchored to the **24th** of each month |
| Any other day (1st–24th, 28th–31st) | Your **own monthly billing date** (the day you joined) |

Only 25th/26th/27th joiners are pulled to the 24th — giving ≥3 days to fix a failed renewal before the major-draw period (28th–27th) ([BILLING_ANCHOR_24.md:5,9-13](docs/BILLING_ANCHOR_24.md); [anchor-billing.ts:23-48,87-96](src/utils/billing/anchor-billing.ts#L23)). Anchored joiners still pay full price at signup; Stripe shows them as `trialing` until the 24th, then `active`. If a renewal fails and the member later recovers (pays the overdue invoice), future renewals are **re-anchored to the recovery-payment date**, with 25/26/27 again clamped to the 24th ([anchor-billing.ts:107-151](src/utils/billing/anchor-billing.ts#L107)).

### 5.3 Upgrade (move to a higher tier)

Upgrade = **pay now, benefits activate immediately, billing cycle resets to today**. The member confirms in `UpgradeConfirmModal`, then completes a Stripe payment. The dedicated upgrade route updates the existing Stripe subscription with `proration_behavior: "none"` and `billing_cycle_anchor: "now"` — charge price and **reset the billing cycle to today** ([upgrade-subscription-payment/route.ts:216-219](src/app/api/stripe/upgrade-subscription-payment/route.ts#L216)). The member immediately gets the new tier's entry grant and benefits.

Upgrades are **blocked while a renewal has failed** (`past_due`) — payment must be resolved first ([SubscriptionManagementModal/index.tsx:805-819](src/components/modals/SubscriptionManagementModal/index.tsx#L805)).

> **Charge-amount caveat (unverified):** the in-modal upgrade opens `StripePaymentModal`, which collects a **full-price** payment, whereas the standalone `/api/stripe/upgrade-subscription-payment` route computes a **prorated** charge ([upgrade-subscription-payment/route.ts:260-284](src/app/api/stripe/upgrade-subscription-payment/route.ts#L260)). Both reset the cycle to "now"; which exact amount the customer sees depends on which endpoint `StripePaymentModal` invokes — not traced. Verify before asserting an exact upgrade charge to customers.

### 5.4 Downgrade (move to a lower tier)

Downgrade = **no charge now; the change takes effect at the end of the current billing cycle**. The member keeps their current (higher) tier's benefits until the cycle ends, then the cheaper plan begins. Stripe is updated immediately with `proration_behavior: "none"` and `billing_cycle_anchor: "unchanged"` ([downgrade-subscription/route.ts:181-208](src/app/api/stripe/downgrade-subscription/route.ts#L181)). Accumulated entries are **preserved** and keep stacking onto the new plan's base entries. UI copy: "You'll keep all your [current] benefits for N more days… No refunds, but you keep what you paid for!" A member can't downgrade while an upgrade is pending; downgrades are hidden while `past_due`.

### 5.5 Auto-renew toggle

A member can turn **auto-renew off** (`cancel_at_period_end: true`) or back **on** (clears it) via `PATCH /api/stripe/update-auto-renew` ([update-auto-renew/route.ts:44-70](src/app/api/stripe/update-auto-renew/route.ts#L44)). Turning it back on clears `cancelledAt`/`endDate`. With auto-renew off, the member keeps full access until period end and is **not charged again**.

### 5.6 Cancellation & retention flow

Clicking Cancel always opens the multi-step `CancellationFlowModal` — there is **no instant cancel**. Steps:

1. **Reason** — pick one of seven reasons (too expensive, only joined for a giveaway, haven't won, don't use benefits, too many messages, prefer cheaper, other; "other" requires free text) ([Step1Reason.tsx:17-25](src/components/modals/CancellationFlowModal/Step1Reason.tsx#L17)).
2. **Offers (retention)** — the server picks an **ordered list of save offers** tailored to the reason, shown one at a time; declining advances to the next. The member is never told how many remain ([Step2Offer.tsx:22-23](src/components/modals/CancellationFlowModal/Step2Offer.tsx#L22)).
3. **Confirm** — a "Sure you want to cancel?" warning that accumulated entries and the major-draw spot are permanently lost.

The five possible save offers:

| Offer | What the member gets | One-time? |
|---|---|---|
| `discount_50_2mo` | 50% off the next **2 months** (Stripe coupon) | Yes ([RetentionDiscountService.ts](src/services/subscription/RetentionDiscountService.ts)) |
| `pause_30d` | **Pause 30 days**, no charge, entries frozen, auto-resumes | Yes ([RetentionPauseService.ts](src/services/subscription/RetentionPauseService.ts)) |
| `tier_downgrade` | Switch to a cheaper plan (routes into the downgrade flow) | No |
| `bonus_entries_100` | +100 bonus entries to stay (reuses the `cancellationUpsellRedeemed` flag) | Yes |
| `unsubscribe_marketing` | Switches off **marketing** email + SMS only (receipts, renewals, draw results unaffected) | No |

One-time offers already consumed are filtered out so they're never re-offered ([cancellation-flow-eligibility.ts:31-39](src/utils/subscription/cancellation-flow-eligibility.ts#L31)). If the member is **`past_due`**, **all retention offers are skipped** — they go straight to a "Payment needs attention" confirm screen.

**Cancellation effect:** cancelling sets `cancel_at_period_end`, so the member **keeps full access until period end and is not charged again**. A `past_due` subscription is instead cancelled **immediately** (no paid period to preserve). Accumulated entries are preserved on the account in case the member resubscribes ([CancelSubscriptionService.ts:88-140](src/services/subscription/CancelSubscriptionService.ts#L88)).

### 5.7 Reactivate vs Resubscribe (lapsed / cancelled members)

These are two **distinct** paths, both via `POST /api/stripe/renew-subscription`:

- **Reactivate** — for a member who cancelled but is **still within the grace window** (canceled / `cancel_at_period_end`, within ~30 days of the cancel date). It simply **un-cancels the same subscription** (clears `cancel_at_period_end`) — **no new charge, same billing period, no new entry grant**. It is **same-tier only**; a tier change is rejected (`REACTIVATE_TIER_CHANGE_NOT_ALLOWED`, HTTP 400) ([renew-subscription/route.ts:174-180,354-421](src/app/api/stripe/renew-subscription/route.ts#L174)).
- **Resubscribe** (`create_new`) — for a member whose subscription is **fully inactive/expired**. They go back through **membership selection + payment** (a brand-new subscription is created and charged), optionally with a pre-selected tier. A resubscriber who originally joined on the 25th–27th keeps the 24th anchor. `lastMonthAccumulatedEntries` survives the cancellation so entry history carries over ([renew-subscription/route.ts:424-532](src/app/api/stripe/renew-subscription/route.ts#L424)).

The same endpoint also handles **failed-renewal recovery** (`retry_payment`): paying the overdue invoice reactivates the subscription and grants the cycle's entries. Members fix a failed renewal through the `RenewalFailedModal`.

---

## 6. Entries & draw participation

There are two **independent** draw systems, each with its own entry pool. See [docs/draws/](docs/draws/) and [BUSINESS.md §3](BUSINESS.md). Per-tier entry counts are **data-driven** (`MembershipPackage.entriesPerMonth` / `totalEntries`, [MembershipPackage.ts:9-10](src/models/MembershipPackage.ts#L9)) — do not hard-code them; see [BUSINESS.md §2](BUSINESS.md) for the catalog values.

### 6a. Two separate draw systems

| | Major Draw | Mini Draw |
|---|---|---|
| Cadence | Monthly cycle (28th–27th window) | Per product; runs until it fills |
| Model | `MajorDraw` ([MajorDraw.ts:47-67](src/models/MajorDraw.ts#L47)) | `MiniDraw` ([MiniDraw.ts:38-49](src/models/MiniDraw.ts#L38)) |
| How it ends | Status lifecycle `queued → active → frozen → completed`, time-driven | Auto-closes when `totalEntries >= minimumEntries` ([mini-draw-helpers.ts:51-55](src/utils/draws/mini-draw-helpers.ts#L51)) |
| Entry pool | `MajorDraw.entries[].entriesBySource` | `MiniDraw.entries[].entriesBySource` |

**Critical:** a **mini-draw pack is a SEPARATE pool.** Buying one credits only the `MiniDraw` model's `entries[]` (source `mini-draw-package`) and grants **zero major-draw entries** ([MiniDraw.ts:42-44](src/models/MiniDraw.ts#L42)). (`MajorDraw` has a distinct `mini-draw` source key, but that is a different internal mechanism — *unverified beyond the schema key*.)

### 6b. How entries are earned

| Way to earn | Pool | Source key | Carries forward? | Notes |
|---|---|---|---|---|
| **Monthly subscription (by tier)** | Major | `membership` | **Yes — accumulates** | Initial: `baseEntries × promoMultiplier`; each renewal: `lastMonthAccumulated + baseEntries` ([subscription-entries-calculator.ts:51-117](src/utils/payment/subscription-entries-calculator.ts#L51)). |
| **One-time pack** | Major | `one-time-package` | **No — current draw only** | Credited to the single target draw ([major-draw-queries.ts:140-147](src/utils/database/queries/major-draw-queries.ts#L140)). |
| **Additional packs** | Major | `one-time-package` (same key) | **No — current draw only** | Treated as one-time entries; *not separately keyed — unverified*. |
| **Post-purchase upsell** | Major | `upsell` | **No — current draw only** | [MajorDraw.ts:221](src/models/MajorDraw.ts#L221). |
| **Cancellation / retention upsell** | Major | `cancellation-upsell` | **No — current draw only** | [MajorDraw.ts:241-250](src/models/MajorDraw.ts#L241). |
| **Referral (bonus)** | Major | `referral` | **No — current draw only** | `REFERRAL_REWARD_ENTRIES = 100` per conversion ([referral.ts:8](src/lib/referral.ts#L8)). |
| **Promo multiplier** | Major | applied to base | n/a (modifier) | Multiplies *subscription* base entries at grant time. |
| **Bonus-entry promo** | Major or Mini | `bonus-entry-promo` | **No — current draw only** | On both schemas. |
| **Mini-draw pack** | **Mini only** | `mini-draw-package` | n/a | **Zero major-draw entries.** |

### 6c. Accumulation / carry-forward rule

- **Subscription (membership) entries carry forward while the subscription stays active.** Each renewal re-grants the running total (`lastMonthAccumulated + baseEntries`) into that cycle's draw ([subscription-entries-calculator.ts:83-117](src/utils/payment/subscription-entries-calculator.ts#L83)). A self-healing reconciler backfills any renewal that failed to credit the active draw.
- **One-time, additional, upsell, referral, and promo entries are current-cycle-only** — written to a single target draw and not re-added to the next. The target draw is chosen by `getTargetMajorDraw()`, which re-routes purchases made during the freeze/gap to the next queued draw.
- **New-entry purchases are blocked during a ~4-hour blackout each cycle** (freeze + gap, status ≠ `active`); subscription *renewals* are re-targeted instead of blocked ([docs/draws/rules.md:22-31](docs/draws/rules.md#L22)).

### 6d. Draw eligibility

A customer is **ineligible** for any giveaway if either condition holds ([giveaway-eligibility.ts:6-19](src/utils/giveaway-eligibility.ts#L6)):

| Rule | Detail |
|---|---|
| **Age** | Must be **18+**; `MIN_AGE = 18`, computed from `birthdate`. |
| **State** | **SA and ACT residents excluded**; `INADMISSIBLE_STATES = ["SA", "ACT"]`. |

The Australian-resident requirement is enforced via the `state` field (codes are AU states/territories); there is **no explicit "Australian resident" boolean** in `giveaway-eligibility.ts` — eligibility keys only on state code + age. *(Unverified: whether residency is gated elsewhere, e.g. at registration.)* All eligibility checks route through this shared helper.

---

## 7. Customer perks

Four customer-facing perk systems. See [docs/partner/](docs/partner/), [docs/referrals/](docs/referrals/), [docs/affiliate/](docs/affiliate/), [docs/rewards-redeemables/](docs/rewards-redeemables/).

### 7a. Partner discounts

Partner-discount access grants visibility into a **percentage slice of the partner-offer brand catalog**. The visible offer count is the first *k* offers in catalog order, *k* = `ceil(total × pct/100)` — except Foreman subscriptions, which use `round(0.75 × total)` ([partner-catalog-visibility.ts:106](src/utils/partner-discounts/partner-catalog-visibility.ts#L106)).

**Subscription tiers** (access lasts *while the membership is active*, not a fixed window — [partner-access-duration.ts:13](src/utils/partner-discounts/partner-access-duration.ts#L13)):

| Subscription tier | Catalog visibility |
|---|---|
| Tradie | 50% |
| Foreman | 75% |
| Boss | 100% |

**One-time / additional-pack buyers** get a **time-limited window** (a day/hour count per package), not lifecycle access, capped at **12 months from purchase** to use ([partner-discount-queue.ts:291-292](src/utils/partner-discounts/partner-discount-queue.ts#L291)). The one-time ladder and mini-pack slices:

| One-time tier | Visibility | | Mini Pack | Visibility |
|---|---|---|---|---|
| VIP | 100% | | Mini Pack 1 | 5% |
| Power | 85% | | Mini Pack 2 | 10% |
| Boss | 70% | | Mini Pack 3 | 15% |
| Foreman | 55% | | | |
| Tradie | 40% | | | |
| Apprentice | 25% | | | |

When a customer holds **both** a subscription and one-time packs, the **higher catalog tier wins**; on a tie, membership wins ([partner-catalog-visibility.ts:124-179](src/utils/partner-discounts/partner-catalog-visibility.ts#L124)). Multiple one-time windows **stack** — higher tier consumed first, FIFO within a tier, a new higher tier can preempt an active lower one (remaining time preserved and re-queued). Status is stored per-customer in `User.partnerDiscountQueue`.

> For an **unknown** plan id, the resolver defaults to **100%** ([partner-catalog-visibility.ts:81](src/utils/partner-discounts/partner-catalog-visibility.ts#L81)); the MyRewards SSO path deliberately overrides this with a **fail-closed** resolver returning no tier ([member-level.ts:107-110](src/utils/partner-discounts/member-level.ts#L107)). *(Unverified: the actual brand-catalog size that the percentages multiply.)*

### 7b. Referrals

Each customer is both a **referrer** (shares a code) and can be a **referee** (uses someone else's). The code is auto-generated as `TA` + 6 chars.

- **Referee eligibility** — codes are **only for first-time users** (zero `processedPayments`); you cannot use your own code ([referral.ts:154-164](src/lib/referral.ts#L154)).
- **Reward** — on conversion (referee's qualifying purchase), **both** referrer and referee receive **100 bonus major-draw entries** each (`REFERRAL_REWARD_ENTRIES = 100`).
- Entries are added **directly to the active major draw** (source `referral`), **not** to the user's accumulated-entry balance ([referral.ts:312,390](src/lib/referral.ts#L312)). Both parties get a reward email.
- Conversion is **immediate** (no email-verification gate) and idempotent. Events are tracked in `ReferralEvent` with status `generated → pending → converted` (also `expired`/`flagged`).

### 7c. Affiliate program

**A regular customer cannot self-enroll as an affiliate.** Affiliates are a **separate account type** created by an admin (core fields — name, email, username, password, code — are "set by admin", [Affiliate.ts:4-27](src/models/Affiliate.ts#L4)), with their own auth/portal (`login`/`logout`/`dashboard`/`bank-details` — there is **no** affiliate `register` route). A *customer* participates only passively: visiting via an affiliate link stamps `User.affiliateReferral` ([affiliate.ts:86](src/lib/affiliate.ts#L86)).

Commission model (high level): default **30%** of the purchase amount, editable per affiliate by admin. Commissions are recorded per payment as `AffiliateCommission` rows (`one-time-package`, `upsell`, `membership-first`, `membership-recurring`, `mini-draw-package`) — so recurring membership renewals also pay out each cycle. Paid via `AffiliatePayout`.

### 7d. Rewards / redeemables

There are **two** systems; treat the points one as legacy.

**Legacy points balance — paused/deprecated.** `User.rewardsPoints` and `redemptionHistory` still exist on the model, and `entryWallet` is explicitly **deprecated — set to 0** ([User.ts:130-131](src/models/User.ts#L130)). The whole rewards surface is gated by a feature flag that **defaults OFF** (`rewardsEnabled()` returns false unless `REWARDS_ENABLED`/`NEXT_PUBLIC_REWARDS_ENABLED = "true"`, [featureFlags.ts:27-39](src/config/featureFlags.ts#L27)). When off, reward API routes return HTTP **503** with code `REWARDS_PAUSED` ([rewardsGuard.ts:32-38](src/lib/rewardsGuard.ts#L32)).

**Event-based redeemables ledger (current).** An issuance ledger (not a points balance) — each grant is a discrete record a customer can redeem. A customer's wallet merges two sources ([RedeemablesWalletService.ts:34-130](src/services/redeemables/RedeemablesWalletService.ts#L34)):
- **Monthly-coupon** issuances from `MonthlyEntryCampaign` → `RedeemableIssuance` (status `active`/`redeemed`/`expired`/`cancelled`; carries `entriesAmount`, `code`, `expiresAt`; some `neverExpires`).
- **Milestone** issuances → `MilestoneIssuance` / `MilestoneReward`.

Items auto-issue for active campaigns on wallet read, and an item is redeemable when `status === "active"` and not past `expiresAt`. Some campaign coupons carry a `purchaseRequirement` (e.g. `membership`).

---

## 8. Marketing & attribution data captured

What marketing/attribution data we capture about a customer, and which of it **leaves to third parties** (Klaviyo, Meta/TikTok/Snapchat). See [docs/tracking/](docs/tracking/).

### 8a. UTM / attribution capture & persistence

On landing with marketing query params, the client persists **`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `campaign_id`, `adset_id`, `ad_id`** ([utm-helpers.ts:79-96](src/utils/tracking/utm-helpers.ts#L79)):

| Storage | Key | Lifetime | Notes |
|---|---|---|---|
| `sessionStorage` | legacy session store | per-tab | "transitional" |
| First-party cookie | `_ta_attr` | 90 days | **first-touch** (never overwrites a non-expired value), `SameSite=Lax`, `Domain=.toolsaustralia.com.au; Secure` in prod ([attribution-cookie.ts:11,48-61](src/utils/tracking/attribution-cookie.ts#L11)) |

Paid **click IDs** are captured into separate cookies on mount: Meta `_fbc`/`_fbc_ts` (synthesized from `?fbclid=` so it survives without the Meta SDK), TikTok `ttclid`, Snapchat `_sc_click`; the Meta browser-ID `_fbp` is set by the Pixel. A **signup snapshot** is also persisted server-side in `User.signupAttribution` (§2h).

### 8b. The "converting platform" concept

At purchase, `resolveAttributionAtEdge` reads the click cookies + `_ta_attr` and resolves a **single** converting platform via a priority+recency ladder ([resolveConvertingPlatform.ts:11-76](src/services/attribution/resolveConvertingPlatform.ts#L11)):

- **Tier 1 (paid clicks, 7-day window):** `meta`, `tiktok`, `snapchat`, `google` (google reserved). Most-recent click wins.
- **Tier 2 (owned channels, 5-day window):** `klaviyo_email`, `klaviyo_sms`.
- **Fallback:** normalized `utm_source` → `direct` or `other`.

The result is persisted on the **`PaymentEvent`** record (not `User`): `convertingPlatform`, `attributionConfidence` (`click`/`utm_only`/`inferred_backfill`), and denormalized `attributionAdId/AdsetId/CampaignId` ([PaymentEvent.ts:30-36,126-135](src/models/PaymentEvent.ts#L30)). *Verified: no `convertingPlatform` field on the `User` model.*

### 8c. Customer profile properties synced to Klaviyo (PII leaving to a third party)

`userToKlaviyoProfile` builds the profile sent to Klaviyo ([klaviyo-helpers.ts:114-357](src/utils/integrations/klaviyo/klaviyo-helpers.ts#L114)). **Top-level identifiers are sent in clear (PII):** `email`, `first_name`, `last_name`, `phone_number` (`+61…`). Custom `properties` include (non-exhaustive):

| Category | Properties |
|---|---|
| Identity / account | `user_id`, `created_at`, `last_login`, `is_active`, `role`, `state`, `profession`, `is_email_verified`, `is_mobile_verified`, `profile_setup_completed`, `app_accepts_promotional_email` |
| Subscription | `has_active_subscription`, `subscription_tier`, `subscription_start/end_date`, `subscription_auto_renew`, `subscription_status`, `subscription_has_pending_upgrade`, `subscription_previous_tier`, `subscription_last_upgrade/downgrade_date`, `past_due_renewal_entries`, `membership_status`, `membership_active_duration_months`, `next_renewal_date` |
| Entries / points / spend | `accumulated_entries`, `rewards_points`, `entries_purchased`, `giveaways_entered`, `member/one_time/upsell/mini_draw_entries`, `lifetime_value`, `total_spent`, `first/last_purchase_date`, `total_one_time/mini_draw_packages` |
| Upsell engagement | `total_upsells_purchased`, `upsell_total_shown/accepted/declined`, `upsell_conversion_rate`, `upsell_last_interaction` |
| Referral / partner | `referral_code`, `referral_successful_conversions`, `referral_total_entries_awarded`, `partner_discount_active/queued_count/total_days/next_activation_date` |
| Segmentation / current draw | `brand_interest` (removed once any purchase is made); `current_draw_id/name/start_date/subscription_active/one_time_packages/entries` |

**Note:** UTM / converting-platform values are **not** synced as Klaviyo properties — only `brand_interest` (from signup slug) is. **List/consent:** marketing subscribe happens **once at registration**, gated by `acceptsPromotionalEmail`; SMS marketing + transactional subscribe if a phone exists; later syncs update data only, never re-subscribe ([klaviyo-profile-sync.ts:34-70,150-177](src/utils/integrations/klaviyo/klaviyo-profile-sync.ts#L34)).

### 8d. Meta / TikTok / Snapchat CAPI customer events

Events sent to Meta (Pixel + server CAPI, deduped by shared `event_id`): `PageView` (pixel only), `Purchase`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `AddPaymentInfo`, `Lead`, `CompleteRegistration`, `Subscribe` (initial), and custom `MembershipUpgrade`/`MembershipDowngrade`. **Renewals are intentionally NOT sent as `Purchase`** ([EVENT_PARAMETER_MATRIX.md:76-85](docs/tracking/EVENT_PARAMETER_MATRIX.md#L76)).

Identity payload (`user_data`, [facebook-helpers.ts:200-275](src/utils/tracking/facebook-helpers.ts#L200)):

| Identifier | Meta key | Sent as |
|---|---|---|
| Email / phone / first / last name | `em` / `ph` / `fn` / `ln` | **SHA-256 hashed** |
| City / state / zip / country / birthdate | `ct` / `st` / `zp` / `country` / `db` | **SHA-256 hashed** |
| User `_id` | `external_id` | **SHA-256 hashed** |
| Click ID / browser ID | `fbc` / `fbp` | **raw** |
| IP address / user agent | `client_ip_address` / `client_user_agent` | **raw** |

Hashing is plain SHA-256 of lowercased+trimmed input. The same identity model applies to TikTok (`email`, `phone`, `external_id` hashed; `ttclid`, `ttp`, IP, UA raw) and Snapchat.

### 8e. PII flowing to third parties — flags

- **Klaviyo receives raw, unhashed PII** — email, first/last name, mobile (E.164), state, profession, plus the full behavioral/spend profile. **This is the largest clear-text PII export.**
- **Meta/TikTok/Snapchat receive PII only as SHA-256 hashes** (email, phone, name, location, DOB, user `_id`), but **raw** click IDs, browser IDs, IP, and user agent. A SHA-256 email is a stable pseudonymous identifier, **not** anonymization.
- **The first-touch `_ta_attr` cookie persists 90 days** and survives login/OAuth; it holds only campaign metadata, no direct PII.

---

## 9. Account surface & privacy

What a guest/member sees and can do, their PII footprint, retention, and data rights. **Key files:** `src/app/(site)/my-account/**`, `src/app/(site)/privacy/page.tsx`, `src/lib/support-chat/chatStorage.ts`, `src/components/support-chat/SupportChatWidget.tsx`, `src/components/layout/Header.tsx`.

### 9a. The account dashboard (`/my-account`)

All `/my-account/*` routes require a signed-in session; an unauthenticated visitor is redirected to `/login` ([page.tsx:147-152](src/app/(site)/my-account/page.tsx#L147)). The dashboard hides the site header/footer and adds a 5-item bottom nav (**Home, Profile, Draws, Membership, Support**).

| Surface | Route | What the customer sees / can do |
|---|---|---|
| **Home / overview** | `/my-account` | Identity bar (name, email, membership badge), Major Draw entry breakdown, entry projections, pending-entry/renewal state, partner-discount queue + unlock CTA, refer-a-friend, quick actions. |
| **Draws** | `/my-account/draws` | Major-draw entry strip, mini-draws entered / not entered, winners. |
| **Membership** | `/my-account/membership` | Packages chart, partner benefits, plan picker. |
| **Support** | `/my-account/support` | Contact info + the same `ContactForm` as `/contact`. |
| **Settings** | `/my-account/settings?tab=` | Four tabs: **Profile, Subscription, Password, Payment** + Sign out. |

**Settings tabs:**
- **Profile** — name and email are **read-only** ("Contact support to change"); editable: phone, date of birth, state, profession; shows email-verification status. Saves via `POST /api/user/update-profile`. *(Editable set is UI-confirmed, not endpoint-confirmed.)*
- **Subscription** — current plan/price/next-billing; upgrade/downgrade, **cancel** ("retain access until the end of your billing period"), or **reactivate** a cancelled plan.
- **Password** — change password. **Payment** — default saved card (brand/•••• last4); add/manage cards.

A customer is classified as `member`, `past_due`, or `guest`; one-time-pack holders without an active subscription show as **Guest** ([settings/page.tsx:42-65](src/app/(site)/my-account/settings/page.tsx#L42)).

### 9b. PII footprint

The `User` document (§2) holds the bulk of customer PII — identity (name, email, mobile, birthdate, state, profession), auth secrets, billing (`stripeCustomerId`, `savedPaymentMethods[]` — **only Stripe payment-method IDs, no card numbers**), activity/history, marketing consent, and attribution. The **chat** models also hold customer data, but **PII is redacted at the service layer before storage** and raw tool arguments are never stored ([ChatMessage.ts:6-9](src/models/ChatMessage.ts#L6)). *(Other collections — orders, payment events, draw entries — hold transactional references but were not exhaustively enumerated.)*

### 9c. Data retention

- **Chat data** — `ChatConversation` and `ChatMessage` carry a **MongoDB TTL index of 90 days** (auto-purge), aligned across both collections ([ChatConversation.ts:99-104](src/models/ChatConversation.ts#L99), [ChatMessage.ts:77-82](src/models/ChatMessage.ts#L77)). The in-chat disclosure states chats are "stored securely in Australia and automatically deleted after 90 days".
- **Privacy-policy stated retention** ([privacy/page.tsx:213-227](src/app/(site)/privacy/page.tsx#L213)): account info — while active + 7 years; competition records — min 3 years; transaction records — 7 years; marketing opt-out records — indefinite.

### 9d. Data rights

| Right | How it works in code | Self-service? |
|---|---|---|
| **Delete chat history** | "Delete my chat history" button (signed-in members only, two-tap confirm) → `DELETE /api/chat/history` → deletes all that member's conversations + messages, scoped by session userId ([deleteMemberChatHistory.ts:32-80](src/services/support-chat/deleteMemberChatHistory.ts#L32)) | **Yes** |
| Access / correction / **account deletion** / opt-out | Email request to support; responded within 30 days; deletion "subject to legal retention requirements" ([privacy/page.tsx:236-264](src/app/(site)/privacy/page.tsx#L236)) | **No** — there is **no customer-facing self-service "delete my account" endpoint** (matching routes are all admin/staff, e.g. `/api/admin/users/[id]/actions`). *(Verified: no `/api/user/delete`-style customer endpoint.)* |
| Marketing opt-out | Email unsubscribe / SMS STOP / contact support | Yes (via email links) |

### 9e. What sign-out clears client-side

Sign-out is wired in two places — the dashboard Settings page and the site Header — and both run the same sequence **before** the server `signOut` (this satisfies the privacy + multi-user-safety rule that user-scoped client storage be cleared at the auth boundary):

1. `localStorage.removeItem("wasAuthenticated")` and `removeItem("topBarHidden")` (UI hints).
2. `clearSupportChatStorage()` — removes the per-user chat keys `ta_support_chat_conversation_id` and `ta_support_chat_messages` so chat history can't leak to the next user on a shared device; each removal is independently fault-tolerant ([chatStorage.ts:21-24,108-117](src/lib/support-chat/chatStorage.ts#L21)).
3. `signOut({ callbackUrl: "/" })`.

**Intentionally NOT cleared:** the device-level `ta_support_chat_disclosure_ack` key (the one-time "I've seen the AI notice" flag) — treated as a device pref like cookie-consent, so users aren't re-nagged on every account switch ([chatStorage.ts:65-70](src/lib/support-chat/chatStorage.ts#L65)).

---

## 10. Glossary

| Term | Meaning |
|---|---|
| **Customer** | A `User` record with `userType: "customer"` / `roleId: null`. Guest or member. The subject of this document. |
| **Guest (registered)** | Signed-in customer with no active subscription and no active packs. Derived, not a field. Shows as "Guest" in the dashboard. |
| **Member / subscriber** | Customer with `subscription.isActive: true` (Stripe `active`/`trialing`). One subscription at a time. |
| **One-time / mini-draw buyer** | Customer holding entries in `oneTimePackages` / `miniDrawPackages` without an active subscription. Can hold many. |
| **`guestUserData`** | Client-side step-1 registration payload that bridges `MembershipModal` step 1 → step 2 **without** a session. Step-1 register does NOT log in or grant membership (§4a). |
| **Passwordless account** | A customer with no `password` field. Logs in via emailed sign-in code or Google, not the `credentials` provider. |
| **`auto-login` provider** | Internal NextAuth bridge that mints a session from a server-verified action (payment proof / verification token). |
| **Anchor (the 24th rule)** | 25th/26th/27th joiners renew on the 24th; everyone else renews on their own monthly date (§5.2; [BILLING_ANCHOR_24.md](docs/BILLING_ANCHOR_24.md)). |
| **Ghost state** | A `subscription` sub-field that changes current benefits without being a status enum value: `previousSubscription` (downgrade preservation) or `pendingChange` (upgrade awaiting payment) (§3b). |
| **`scheduled_cancel`** | App/analytics label for a member who cancelled but keeps benefits until cycle end (`cancel_at_period_end`); not written to the raw `status` string (§3a). |
| **Reactivate** | Un-cancel the **same** subscription within ~30-day grace; no charge, no new entries, same tier only (§5.7). |
| **Resubscribe (`create_new`)** | Brand-new subscription for a fully-expired member; charged; entry history carries via `lastMonthAccumulatedEntries` (§5.7). |
| **Accumulated entries** | `User.accumulatedEntries` — total entries ever received; subscription entries carry forward each renewal, one-time/referral/upsell entries do not (§6c). |
| **Major Draw** | Monthly headline giveaway; entries pooled on `MajorDraw.entries`, **not** on `User` (§6a). |
| **Mini Draw** | Per-product draw with a **separate** entry pool; a mini-draw pack grants **zero** major-draw entries (§6a). |
| **Partner discount** | Tiered visibility into a slice of the partner brand catalog — lifecycle for subscriptions, time-windowed (12-month cap) for one-time packs (§7a). |
| **Converting platform** | The single resolved acquisition channel at purchase time, stored on `PaymentEvent` (not `User`) (§8b). |
| **`_ta_attr`** | First-touch attribution cookie (90-day, campaign metadata only, survives login) (§8a). |
| **Redeemables ledger** | Current event-based issuance system (`RedeemableIssuance` / `MilestoneIssuance`); distinct from the deprecated `rewardsPoints` balance (§7d). |
| **`entryWallet`** | Deprecated field, always 0 (§2e). |
