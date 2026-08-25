# Tools Australia — Customer Context

> **Audience.** Developers and Claude sessions who need the authoritative reference on *who the customer is*, *what data we hold about them*, and their auth/account flows.
>
> **Scope and complementary contract.** CUSTOMER.md **OWNS** the customer entity and data — the `User` model/fields, customer-type taxonomy, PII footprint, data-rights, and the field-level mapping of which field holds which state. For business **mechanics** (state machine, billing rules, cancellation-flow internals, entries mechanics, perk rules, the member dashboard), CUSTOMER.md links to [BUSINESS.md](BUSINESS.md) rather than restating them — **single source of truth per fact**.
>
> The underlying technical entity is the [`src/models/User.ts`](src/models/User.ts) record, a **mixed-class collection**: the same model also holds **staff and admin** accounts (`userType: "customer" | "staff" | "admin"`, `roleId`). A customer is `userType: "customer"` / `roleId: null` ([User.ts:291-292](src/models/User.ts#L291)). Staff/admin RBAC fields are flagged where they appear but are **out of scope** here — see [docs/auth/](docs/auth/) for those.

---

## 1. Who the customer is

There is **no separate "guest" model**. Registered guests and members are the same `User` collection, differentiated at runtime by what their `subscription` and purchase sub-documents hold. "Member" status is **derived** from `subscription.isActive` / `hasActiveSubscription` ([UserContext.tsx:73-77](src/contexts/UserContext.tsx#L73)) — there is no `isMember` boolean field on the model (though `isMember` IS a derived value computed in `UserContext.tsx:77`, not a model field).

| Customer type | How it's represented in code | What they can do |
| --- | --- | --- |
| **Anonymous visitor** | No `User` record at all (not signed in). Only retroactively traceable via `signupAttribution.anonymousId` *after* they register ([User.ts:241-256](src/models/User.ts#L241)). | Browse the public site. No entries, no partner access. |
| **Registered guest** (account, no membership) | A `User` exists but `subscription` is absent / `isActive: false` (`status` defaults to `"incomplete"`) and the purchase arrays are empty ([User.ts:485-496](src/models/User.ts#L485)). | Signed in; can purchase. Gated out of member-only surfaces until first purchase activates them. Classified as **Guest** in the dashboard ([settings/page.tsx:66-108](src/app/(site)/my-account/settings/page.tsx#L66) — `isMember` derived at 66-70, badge ternary with the neutral Guest fallback at 91-108). |
| **Active member / subscriber** | `subscription.isActive: true` with Stripe `status` of `active` / `trialing` ([User.ts:38-40](src/models/User.ts#L38)). **One subscription at a time.** | Monthly entries, partner discounts, retention modals, full member dashboard at `/my-account/`. |
| **One-time-only buyer** | No active `subscription`, but holds entries in `oneTimePackages` ([User.ts:89-96](src/models/User.ts#L89)) and/or `miniDrawPackages` ([User.ts:99-112](src/models/User.ts#L99)). Can hold **multiple** of these. | Entries / partner access from each pack until its `endDate`; no recurring billing. Shows as **One-time** in the dashboard while a pack is active ([settings/page.tsx:102-107](src/app/(site)/my-account/settings/page.tsx#L102), derived from `acct === "onetime"` in [useDashboardState.ts:139-141](src/hooks/useDashboardState.ts#L139)); falls back to **Guest** only once all packs expire. |

A single customer can be more than one of the last two at once (e.g. an active member who also bought a one-time pack). For the package catalog itself (Tradie / Foreman / Boss subscriptions; Apprentice → VIP one-time packs; Additional and upsell packs) see [BUSINESS.md §2](BUSINESS.md).

---

## Journey map — the customer path at a glance

> **This is a router, not a restatement.** Each stage links to the section that OWNS the detail — CUSTOMER.md for *which field / what data*, [BUSINESS.md](BUSINESS.md) for *mechanics*, `docs/<domain>/` for *internals*. Per the single-source-of-truth contract nothing here re-explains a flow; it points you at the one place that does. Keep it a map: update the pointers when sections move, don't grow mechanics here.

### The membership spine — acquisition → conversion → lifecycle → win-back

```mermaid
flowchart TD
    A["Anonymous visitor<br/>UTM &amp; click-IDs captured (§8a)"] --> B["Register — MembershipModal step 1<br/>POST /api/auth/register"]
    B --> C["Guest account created<br/>passwordless · isAuthenticated:false · NO membership (§4a)"]
    C --> D["Step 2 payment<br/>uses guestUserData, still not logged in"]
    D --> E["Payment success<br/>/api/auth/auto-login = payment proof → session (§4a)"]
    E --> F["Stripe webhook grants membership<br/>subscription.isActive:true → active (§5.1)"]
    F --> G["UserSetupModal<br/>profession / state / email-verify (BUSINESS §10g)"]
    G --> H["Post-purchase upsell offer<br/>accept / decline / dismiss (§2i)"]
    H --> I["Member dashboard /my-account (§9a)"]
    I -->|"renews anchor-24"| J{"Monthly renewal (§5.2)"}
    J -->|"paid"| I
    J -->|"fails"| K["past_due → recovery ladder<br/>retry · 3DS · update card · pay overdue (BUSINESS §10e)"]
    K -->|"recovered"| I
    I -->|"upgrade / downgrade"| L["Tier change (§5.3 / §5.4)"]
    L --> I
    I -->|"cancel"| M["CancellationFlowModal<br/>retention offers (§5.6)"]
    M -->|"saved"| I
    M -->|"proceeds"| N["scheduled_cancel → canceled (§3, §5.7)"]
    N -->|"within ~30d grace"| O["Reactivate — no charge, same tier (§5.7)"]
    N -->|"expired"| P["Resubscribe — new charge, any tier<br/>entries carry over (§5.7 / BUSINESS §10i)"]
    O --> I
    P --> F
    classDef gotcha fill:#fde68a,stroke:#b45309,color:#111827;
    class C gotcha;
```

The **highlighted** node is the codebase's most non-obvious rule: registering in step 1 does **not** log the user in or grant membership — the guest crosses step 2 as `guestUserData` and only becomes a session after Stripe payment-proof (§4a, [docs/auth/gotchas.md](docs/auth/gotchas.md)). Side flows not on this spine (one-time / Additional packs, Mini Pack entry, perks) are in the router table below.

### Subscription lifecycle states

The canonical 10-state enum lives on [`MembershipStatusHistory`](src/models/MembershipStatusHistory.ts) — the nine Stripe/app states below plus the app-owned `paused` retention state; the full table + transition mechanics are [BUSINESS.md §10](BUSINESS.md). The picture:

```mermaid
stateDiagram-v2
    [*] --> none
    none --> incomplete: start checkout
    incomplete --> incomplete_expired: payment never collected
    incomplete --> active: payment collected
    incomplete --> trialing: joins 25th-27th
    trialing --> active: on the 24th anchor
    active --> past_due: renewal fails
    past_due --> active: pay overdue or retry
    past_due --> unpaid: Stripe gives up
    active --> paused: accept 30d pause offer
    paused --> active: resume charge paid
    paused --> past_due: resume charge fails
    active --> scheduled_cancel: cancel or autoRenew off
    scheduled_cancel --> active: resume / upgrade / downgrade
    scheduled_cancel --> canceled: cycle ends
    canceled --> active: reactivate within grace
    canceled --> active: resubscribe
    unpaid --> active: resubscribe
```

Two **ghost states** ride on top of the enum without being in it: `pendingChange` (upgrade charge in-flight) and `previousSubscription` (downgrade benefits held until `endDate`). They change what tier the customer effectively has *right now* — see §3b / [BUSINESS.md §10b](BUSINESS.md).

### Stage → authoritative source

| Journey stage | What happens | Owns the detail |
|---|---|---|
| Acquisition / attribution | UTM + click-IDs captured; converting platform resolved at purchase | §8a, §8b · [docs/tracking/](docs/tracking/) |
| Register (guest bridge) | Step-1 register creates a passwordless guest — **no login, no membership**. Registering with an existing guest's email/mobile updates that plain account; registering with a **staff/admin** email/mobile is rejected (`400`, "please log in") — privileged accounts are never created or mutated via public register (marker: `roleId`/`userType`, not `role`) | §4a, §4b · [docs/auth/gotchas.md](docs/auth/gotchas.md) |
| Login | password / email sign-in code / Google / post-payment auto-login (a scaffolded **SMS** sign-in code also exists but is **not live** — no SMS provider configured; when enabled, `send-otp` delivers the code only to the mobile **on file** for the account, never a number supplied in the request — see [docs/auth/gotchas.md](docs/auth/gotchas.md)) | §4c–§4f |
| First payment & activation | Full price at signup; webhook grants membership. Card declines return a 400 with the decline reason, and checkout shows short per-decline-code guidance (e.g. "Not enough funds on this card. Try another card."); sensitive codes (lost/stolen/fraud) get a generic "card declined" message | §5.1 · [BUSINESS.md §9, §10g](BUSINESS.md) · [payment-error-messages.ts](src/utils/payment/stripe/payment-error-messages.ts) |
| Post-purchase setup | UserSetupModal captures profession/state + email-verify prompt | [BUSINESS.md §10g](BUSINESS.md) · [docs/USER_SETUP_MODAL.md](docs/USER_SETUP_MODAL.md) |
| Upsell offer | Post-success offer; per-trigger dedup | §2i · [docs/upsell/](docs/upsell/) · [BUSINESS.md §5](BUSINESS.md) |
| Member dashboard | The ROI surface at `/my-account` | §9a · [BUSINESS.md §10h](BUSINESS.md) |
| Renewal (anchor-24) | Monthly renew; 25th–27th joiners anchored to the 24th | §5.2 · [BUSINESS.md §9b](BUSINESS.md) · [BILLING_ANCHOR_24.md](docs/BILLING_ANCHOR_24.md) |
| Upgrade / Downgrade | Immediate charge + cycle reset vs. deferred with benefits preserved | §5.3, §5.4 · [BUSINESS.md §10c, §10d](BUSINESS.md) |
| Auto-renew toggle | Soft-cancel shortcut (`cancel_at_period_end`) | §5.5 · [BUSINESS.md §10a](BUSINESS.md) |
| Past-due recovery | Self-serve retry → 3DS → update card → pay overdue. **Any failed renewal — including an admin re-bill of a stranded member — fires the "Subscription Renewal Failed" dunning email**, and leaves the member unpaused / in dunning rather than re-freezing them | §3a · [BUSINESS.md §9i, §10e](BUSINESS.md) · [FAILED_RENEWAL_PAY_NOW.md](docs/FAILED_RENEWAL_PAY_NOW.md) |
| Cancellation & retention | CancellationFlowModal; five save-offers, seven reasons. **Streak-stakes step (2026-07-15, dark until streak launch):** non-past-due members see a Membership Streak stakes screen between reason and the offers — loss framing (streak ≥ 2: banked renewals + next milestone + pause-freezes-your-streak) or forward framing (streak 0/1: the ladder); "Continue cancelling" always visible; exit recorded as `stakesAction` with `streakMonthsAtStart` on the event. The pause offer card also states the streak freezes. | §5.6 · [BUSINESS.md §13c](BUSINESS.md) · [docs/subscription/cancellation-flow.md](docs/subscription/cancellation-flow.md) |
| Reactivate vs Resubscribe | Grace-window reactivate vs. fully-expired win-back | §5.7 · [BUSINESS.md §10i](BUSINESS.md) |
| Entries & eligibility | How entries are earned; 18+, SA/ACT excluded | §6, §6a · [BUSINESS.md §3](BUSINESS.md) |
| One-time / Additional packs | Non-recurring packs (guest or member) | [BUSINESS.md §2](BUSINESS.md) · [docs/cart-shop-products/](docs/cart-shop-products/) |
| Mini-draw entry | Threshold-triggered Mini Pack purchase | [docs/draws/](docs/draws/) · [BUSINESS.md §3b](BUSINESS.md) |
| Perks | Partner / referral / affiliate / rewards | §7 · [docs/partner/](docs/partner/), [docs/referrals/](docs/referrals/), [docs/affiliate/](docs/affiliate/), [docs/rewards-redeemables/](docs/rewards-redeemables/) |
| Account surface & data rights | Dashboard, PII footprint, delete chat, sign-out clearing | §9 |

---

## 2. The customer data model

Every field below lives on the `User` Mongoose model ([src/models/User.ts](src/models/User.ts); interface lines 3-313, schema 315-1133). This is a **load-bearing** inventory — keep it intact when the model changes.

**PII legend:** **PII** = personal/identifying or payment data (email/phone/address/name/payment/DOB); **Sensitive** = secret/credential material; **—** = non-sensitive.

> **Caveats.** The schema is `strict: true` + `strictQuery: true` — fields not in the schema are rejected ([User.ts:1130-1131](src/models/User.ts#L1130)). `mobile` is normalized to `+61…` format on every save via a pre-save hook ([User.ts:1136-1158](src/models/User.ts#L1136)). The exact client-facing `UserData` shape returned to the browser (defined in `@/hooks/queries/useUserQueries`) is since 2026-07-19 an explicit **include-list wire projection** (`MY_ACCOUNT_USER_FIELDS`, [src/utils/dashboard/my-account-projection.ts](src/utils/dashboard/my-account-projection.ts)): all credential/secret fields below are excluded from API responses, as are `processedPayments`, `upsellHistory`, `upsellPurchases`, `redemptionHistory`, and `cart` — a wire-shape change only; nothing changed in what is *stored* about the customer.

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
| `email` | string (req, unique, lowercase) | Login + primary contact; permissive regex-validated — `local@domain.tld` shape only (accepts `+` plus-addressing and any TLD length ≥2 chars), deliverability is the real check ([User.ts:346](src/models/User.ts#L346)) | **PII** |
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
| `subscription.status` | string (def "incomplete") | Stripe status string, plus the app-owned `"paused"` retention state — for the full state machine see [BUSINESS.md §10](BUSINESS.md) ([User.ts:40](src/models/User.ts#L40)) | — |
| `subscription.pausedFrom` / `pausedUntil` | Date (opt) | **Retention-pause window** — set when a member accepts the 30-day `pause_30d` offer (§5.6). `pausedFrom` = the member's period end (freeze begins); `pausedUntil` = auto-resume date (`pausedFrom + 1 month`, the next billing-cycle boundary, calendar-clamped via `addMonths`). While `pausedFrom ≤ now < pausedUntil` the member is frozen (`status="paused"`, `isActive=false`); cleared on resume ([User.ts:50-51](src/models/User.ts#L50)). See [BUSINESS.md §10a](BUSINESS.md) | — |
| `subscription.pendingStripeSubscriptionId` / `…RequestId` / `…CreatedAt` | string / string / Date | Non-canonical pending Stripe sub from initial checkout ([User.ts:43-45](src/models/User.ts#L43)) | — |
| `subscription.previousSubscription` | subdoc (opt) | **Downgrade ghost state**: cached old `packageId`, `packageName`, `benefits{entriesPerMonth, discountPercentage}`, `startDate`, `endDate`, `downgradeDate` ([User.ts:49-59](src/models/User.ts#L49)) | — |
| `subscription.pendingChange` | subdoc (opt) | **Upgrade ghost state**: `newPackageId`, `changeType: "upgrade"`, `stripeSubscriptionId?`, `paymentIntentId?`, `upgradeAmount?` ([User.ts:63-69](src/models/User.ts#L63)) | — |
| `subscription.lastDowngradeDate` / `lastUpgradeDate` | Date (opt) | Anti-gaming / anti-webhook-interference guards ([User.ts:72-75](src/models/User.ts#L72)) | — |
| `subscription.lastMonthAccumulatedEntries` | number (opt) | Carry-over for renewal entry calc; **persists through cancel** ([User.ts:80](src/models/User.ts#L80)) | — |
| `subscription.streakMonths` | number (opt, default 0) | **Membership Streak**: consecutive paid renewals (join = month 0; +1 per paid renewal). Recovery keeps it, a retention pause freezes it, a grace-window (≤30 days) resubscribe **continues it (carried across the resubscribe/renew routes' subscription replacement — in-route grace/reset decision via `carryStreakAcrossSubscriptionReplace`)**, upgrades/downgrades never touch it; only a longer lapse resets it. **A fully refunded counted renewal decrements it by 1** (its `MembershipRenewalCycle` row flips to `refunded` so repairs agree). Written only by the Stripe webhook, the resubscribe/renew carry, the refund reversal, and the backfill script. **Customer-visible (P3, currently DARK behind `DASHBOARD_FEATURES.loyaltyStreak` until launch)**: the `/my-account` streak medallion card, milestones track, wallet Streak bucket, and a once-only celebration toast (localStorage marker `ta-streak-seen:<userId>` — user-scoped client storage, cleared on sign-out; re-seeded downward after a reset). Cobber FAQ ids 69–71 explain the feature to customers. | — |
| `subscription.streakGeneration` | number (opt, default 1) | Bumps on each out-of-grace resubscribe reset; scopes milestone re-earning (P2 engine built — streak rungs auto-grant free entries into the Major Draw once activated at launch; new streak issuances are strictly payment-coupled — cron only re-delivers failed grants). | — |
| `subscription.lastStreakStartInvoiceId` | string (opt) | Idempotency marker for the streak start/reset writer (internal). | — |
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
| `rewardsPoints` | number (def 0) | Points earned from purchases (legacy; see §7d) ([User.ts:131](src/models/User.ts#L131)) | — |
| `cart[]` | array | Cart items, `type: "product" \| "ticket"` with `productId?` / `miniDrawId?`, **`sku?`**, `quantity`, `price?` ([User.ts:136-142](src/models/User.ts#L136)). **`sku` added 2026-08-17**: a product line's identity is now `(productId, sku)`, not `productId` alone — two sizes of the same garment are two lines, and removing one does not remove the other. Absent on ticket items and on product lines added before variants existed; those keep their previous behaviour exactly. Not exposed to the browser — `cart` is excluded from the `MY_ACCOUNT_USER_FIELDS` wire projection (see caveats above). | — |

> **Major-draw entries are NOT on `User`.** They were removed; the single source of truth is `MajorDraw.entries` ([User.ts:133,752](src/models/User.ts#L133)). See [BUSINESS.md §3](BUSINESS.md).

**Merchandise is a fourth way a customer can hold entries (2026-08-17).** Buying an eligible shop
item credits free entries into the **Major Draw only** — never a Mini Draw — under the source key
`entriesBySource.shop`. What the customer receives is
`includedEntries × quantity × the item's own multiplier`.

**That multiplier belongs to the shop, not to the packs (2026-08-20).** An admin sets it per
product, per category, or shop-wide, and it defaults to 1× — the entries the product advertises,
unmultiplied. A one-time pack promo does **not** change what a garment grants. The number the
product page shows and the number the customer actually receives resolve from the same config,
so they cannot disagree.

Three customer-visible consequences worth knowing:

- **Entries are granted to every buyer**, including SA/ACT residents and anyone whose birthdate we
  do not hold. There is no eligibility check at point of sale — exclusion is applied by the draw
  export when a winner is selected, exactly as it is for every other entry source. A customer in an
  excluded state can therefore buy the garment and see the entries, and is excluded only from
  winner selection.
- **Returning one item from a multi-item order does not remove entries.** They are withdrawn only
  if the whole order is refunded. Stated in `/terms` §3d, §5.2 and §17.
- **An account is required to buy** — `Order.user` is mandatory, so there is no guest checkout in
  the shop. A guest must register before paying, which is also what gives the entries somewhere to
  attach.

**Currently switched off.** Every product ships at `includedEntries: 0` pending a trade-promotion
permit variation, and nothing renders on a product page at 0 — so no customer is promised entries
until it is enabled.

The order itself records `Order.entriesGranted`: **absent** means the grant has not run (in
flight, or failed and awaiting the reconcile cron); **0** means it ran and the order was worth no
entries. Support needs that distinction.

### 2f. Saved payment methods (PCI note)

| Field | Type | Meaning | PII |
|---|---|---|---|
| `savedPaymentMethods[]` | array | Each: `paymentMethodId` (req), `isDefault` (def false), `createdAt`, `lastUsed?` ([User.ts:21-26](src/models/User.ts#L21)) | **PII** (payment) |

**PCI note:** by design **only the Stripe payment-method id is stored** — no raw card numbers / PAN. Card data lives with Stripe ([User.ts:20-22,443](src/models/User.ts#L20)).

### 2g. Perks state — partner / referral / affiliate

| Field | Type | Meaning | PII |
|---|---|---|---|
| `partnerDiscountQueue[]` | array (opt, def []) | Stacked partner-discount access periods. Each: `_id?, packageId, packageName, packageType("membership"\|"one-time"\|"mini-draw"\|"upsell"), discountDays, discountHours, purchaseDate, startDate?, endDate?, status("active"\|"queued"\|"expired"\|"cancelled"), queuePosition, expiryDate (12mo from purchase), stripePaymentIntentId?` ([User.ts:274-288](src/models/User.ts#L274)) | — |
| `partnerDiscountConsent` | object (opt, **no default**) | **New 2026-07-31.** The customer's recorded agreement to share their details with the rewards portal: `scopeVersion, acceptedAt, fields[]`. `fields[]` is what they actually **saw** when they agreed — the legal artefact. **Absent = never consented** (fail-closed); a `scopeVersion` older than the current one also re-prompts, which is how "we ask again if what we share changes" is enforced. Re-consent overwrites, so this is current state, not history. | — |
| `referral` | subdoc (opt) | This user's code: `code` (unique sparse index), `successfulConversions` (def 0), `totalEntriesAwarded` (def 0) ([User.ts:224-228](src/models/User.ts#L224)) | — |
| `affiliateReferral` | subdoc (opt) | Link to the Affiliate who referred this user: `affiliateId (ref Affiliate), affiliateCode, referredAt, firstPurchaseCompleted (def false), membershipTied (def false)` ([User.ts:232-238](src/models/User.ts#L232)) | — |

**Shop discount (live 2026-08-17; ladder raised 2026-08-25).** A member's tier carries a shop
discount — Tradie 10%, Foreman 15%, Boss 25% — resolved by `resolveShopDiscountPercent` and applied at checkout before shipping
is assessed. It is not stored on `User`; it is derived from the active subscription tier at
purchase time, so it follows upgrades, downgrades and lapses automatically. It was hidden from the
tier benefit lists while the shop was pre-launch and is now shown.

### 2h. Attribution / marketing snapshot

| Field | Type | Meaning | PII |
|---|---|---|---|
| `signupAttribution` | subdoc (opt) | Promo page + UTM/ad context at signup: `promotionPageType("evergreen"\|"toolset"), promotionSlug, builtPrizeSlug, visitedAt, anonymousId, utmSource, utmMedium, utmCampaign, utmContent, utmTerm, campaignId, adsetId, adId`, plus **`clickPlatform`** ([User.ts:260-284](src/models/User.ts#L260)) | — |
| ↳ `signupAttribution.clickPlatform` | `"meta"\|"tiktok"\|"snapchat"\|"google"` (opt) | **Added 2026-07-24.** The paid platform whose **click id** (`_fbc` / `ttclid` / `_sc_click`) was present in the request cookies at registration, resolved server-side via the same `extractClickIdsFromRequest` the payment path uses (most-recent capture wins). **Only the platform name is stored — never the raw click id**, so signup-source analytics gain click-verified confidence with no new identifier added to the customer record. Stamped on all four registration branches. Absent for organic signups and for accounts created before this date. Powers the per-platform signup counts on the admin Advertising card. | — |

> The resolved **`convertingPlatform`** is **not** on `User` — it lives on the `PaymentEvent` record (see §8).

> **`promotionSlug` vs `builtPrizeSlug`:** the promo pages' "Build your prize" reels let a visitor assemble the toolset/toolbox combo they'd want to win (or pick the cash option), mirrored into the URL as `?toolset=`/`?toolbox=`. `promotionSlug` records **which page they landed on**; `builtPrizeSlug` records **the prize they had on screen when they registered** — either what they assembled, or, if they never touched the reels, the landing page's own default build (e.g. `makita-milwaukee` for `/promotions/makita`, never the bare `makita` landing slug). Both are indexed ([User.ts:1278-1279](src/models/User.ts#L1278)).

### 2i. Preferences, flags & engagement history

| Field | Type | Meaning | PII |
|---|---|---|---|
| `isActive` | boolean (def true) | Account-active flag ([User.ts:174](src/models/User.ts#L174)). `false` blocks login on every path (clear "account deactivated" message) and invalidates any live session on its next refresh — see §4c | — |
| `processedPayments[]` | string[] | Processed-payment ids (idempotency safety) ([User.ts:185](src/models/User.ts#L185)) | — |
| `cancellationUpsellRedeemed` / `…RedeemedAt` | boolean / Date | One-time cancellation upsell (+100 entries) redeemed flag + timestamp ([User.ts:188-189](src/models/User.ts#L188)) | — |
| `retentionOffersConsumed` | subdoc (opt) | One-time retention flags: `pause30d?`, `discount50_2mo?` ([User.ts:193](src/models/User.ts#L193)) | — |
| `upsellPurchases[]` | array (opt) | Each: `offerId, offerTitle, entriesAdded, amountPaid, purchaseDate, triggeringPaymentIntentId?` ([User.ts:867-897](src/models/User.ts#L867)). `triggeringPaymentIntentId` keys the per-trigger "one purchase per appearance" upsell dedup ([upsell/purchase/route.ts:203-214](src/app/api/upsell/purchase/route.ts#L203)). **Caveat:** rows written before 2026-07-10 lack it — the field was missing from the schema block and `strict: true` stripped it on write (fixed 2026-07-10), so the dedup only bites on purchases made after the fix. | — |
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

**Who internally can read a customer's record (2026-08-13).** Reading a customer's personal data
is now a *separate* staff grant from browsing the customer list. `users.view` gates the roster
(name, membership, status, entries); the new **`users.viewDetail`** gates the detail modal and its
reads — email, mobile, address, payment history, activity, deletion summary. Previously one
permission granted both, so any staff role that could see the customer list could read every
customer's contact details. Nothing about what is *stored* or *shared externally* changed — this
narrows internal access only. See [docs/auth/permissions-catalog.md](docs/auth/permissions-catalog.md#viewdetail--splitting-pii-depth-out-of-view-2026-08-13).

---

## 3. Customer lifecycle & states

`User.subscription.status` is a free-form `String` that defaults to `"incomplete"` and receives Stripe status values directly — plus the app-owned `"paused"` retention state (§3b) ([User.ts:493-496](src/models/User.ts#L493)). The **canonical enum** lives on `MembershipStatusHistory.membershipStatus` ([MembershipStatusHistory.ts:29-45](src/models/MembershipStatusHistory.ts#L29)); it is the nine Stripe-derived `MembershipNormalizedStatus` values ([membershipAnalytics.ts:15-24](src/types/admin/membershipAnalytics.ts#L15)) **plus `paused`** (the app-owned retention state, which is not part of that shared analytics union).

**For the full 10-state table and transition mechanics, see [BUSINESS.md §10](BUSINESS.md); for the visual lifecycle diagram, see the Journey map near the top of this doc.** What follows is the customer-OWNED field mapping and a customer's-eye summary.

### 3a. Field mapping

| What's changing | Field(s) that hold the state |
|---|---|
| Subscription status (active, past_due, canceled, etc.) | `subscription.status` + `subscription.isActive` |
| Scheduled cancellation (benefits-through-period) | `subscription.autoRenew: false` + `subscription.cancelledAt` + `subscription.endDate`; analytics label: `scheduled_cancel` |
| Past-due recovery | `subscription.pastDueAt`; re-anchor marker: `subscription.lastReanchoredInvoiceId` |
| Retention pause (30-day `pause_30d` freeze) | `subscription.status = "paused"` + `subscription.isActive = false`; window: `subscription.pausedFrom` / `pausedUntil`; one-time flag: `retentionOffersConsumed.pause30d` |
| Downgrade ghost state (old benefits preserved through cycle) | `subscription.previousSubscription` ([User.ts:49-59](src/models/User.ts#L49)) |
| Upgrade ghost state (charge in-flight) | `subscription.pendingChange` ([User.ts:63-69](src/models/User.ts#L63)) |

### 3b. Customer's-eye notes

- **`trialing`** — late-month joiners (25th/26th/27th AEST) sit here until the 24th anchor. **Recovered past-due members are also `trialing`** when their recovery reanchors the renewal forward (any recovery channel; a re-bill collected on the 25th/26th/27th is clamped to the next 24th — see [BUSINESS.md §9b, §9e](BUSINESS.md)). In every case they've **paid full price** — this is a billing-anchor artifact, not a free trial.
- **A failed re-bill returns the customer to `past_due` (2026-07-31)** — when a stranded customer's freshly minted cycle invoice declines, they now correctly go back to `past_due` rather than being left reading `active`. Previously they were emailed the renewal-failed notice while their account still showed active member state, so they never re-entered the recovery ladder and their delinquency was invisible on the account surface. Two customers had drifted this way (one for ~4 months). They are **not** re-paused by this — the recovery flow had just unpaused them.
- **`past_due` recovery timing (2026-07-31)** — a stranded past-due member whose invoice Stripe has given up on is now recovered **within the same daily run** rather than on the following day. Previously the run's charge attempt could be rejected by Stripe before reaching the card (`payment_intent_unexpected_state`), which cost the member a day: they stayed `past_due` for another 24h, kept their benefits suspended that much longer, and their account showed a decline that was never actually a card problem. Affected **245 attempts across 28–31 Jul 2026**. The set of customers who get recovered (and therefore re-anchored — see the `trialing` note above) is **unchanged**; only how quickly it happens. Customers with a Stripe retry still pending are untouched, as before.
- **`scheduled_cancel`** — the customer requested cancellation; benefits stay live until `subscription.endDate`. The raw `status` string is NOT rewritten to `scheduled_cancel` — that is an analytics label only.
- **`paused`** — the customer accepted the 30-day `pause_30d` retention offer (§5.6). They keep the paid period they already bought, then **freeze** for ~30 days (`status="paused"`, `isActive=false`): no charge and no member access/perks/new entries while frozen, but their **already-earned entries are untouched and still count in draws**. The freeze auto-resumes at `pausedUntil` (= period end + 1 month, the next billing-cycle boundary), when Stripe bills the next cycle — a successful charge returns them to `active`, a failed one to `past_due`. The customer (or an admin) can also **resume early**. See [BUSINESS.md §10a](BUSINESS.md).
- **Ghost states** — `previousSubscription` (downgrade: old tier's benefits live until cycle end) and `pendingChange` (upgrade: desired package parked while charge is in-flight). See [BUSINESS.md §10b](BUSINESS.md).

---

## 4. Account creation & authentication

Auth is **NextAuth (JWT session strategy)** with two customer-facing providers — `credentials` (email + password) and `google` (OAuth) — plus an internal `auto-login` bridge provider used to convert a guest into a session after a server-verified action ([auth.ts:45-171](src/lib/auth.ts#L45)). New accounts are created **passwordless** (no `password` field). See [docs/auth/](docs/auth/).

### 4a. CRITICAL — registering in step 1 does NOT auto-login or grant membership (verified)

This is the most important and non-obvious behaviour. Registering in **step 1** of the `MembershipModal` only creates/updates a guest account and bridges to step 2 — it leaves `isAuthenticated: false` and grants no membership.

- Step-1 success calls `POST /api/auth/register`, which returns `{ success: true, message: "Step 1 completed", data: { userId, email, firstName, lastName, mobile, ... } }`. **No session token, no auth cookie is issued** ([register/route.ts:904-919](src/app/api/auth/register/route.ts#L904)).
- The modal stores that response in component state `guestUserData` and advances to step 2. It does **not** call `signIn()` ([MembershipModal/index.tsx:1512-1527](src/components/modals/MembershipModal/index.tsx#L1512)).
- The bridge is `hasCompletedRegistration = isAuthenticated || guestUserData !== null` ([MembershipModal/index.tsx:624](src/components/modals/MembershipModal/index.tsx#L624)). A guest passes through step 2 (payment) as `isAuthenticated: false` the entire time, using `guestUserData` as the credential for the subscription/payment-intent calls.
- The new account is created with `subscription.isActive: false`, `subscription.status: "incomplete"`, `accumulatedEntries: 0`, and **no `password`** ([register/route.ts:704-742](src/app/api/auth/register/route.ts#L704)). **Membership is granted only later, via the Stripe payment + webhook path**, not by registering.
- The account becomes a real session **only after payment**: on payment success the modal POSTs `/api/auth/auto-login` with the `paymentIntentId` and then `signIn("auto-login", { token })` ([MembershipModal/index.tsx:2448-2477](src/components/modals/MembershipModal/index.tsx#L2448)). `/api/auth/auto-login` requires a Stripe `paymentIntentId` belonging to the user's Stripe customer **as proof of payment** before minting the bridge token ([auto-login/route.ts:64-102](src/app/api/auth/auto-login/route.ts#L64)).

The register route even hard-codes `isAuthenticated: false` in its Klaviyo "Started Checkout" event "because this path runs at registration submit and the user is, by definition, a guest" ([register/route.ts:109-111](src/app/api/auth/register/route.ts#L109)). Documented at [docs/auth/gotchas.md:26-50](docs/auth/gotchas.md#L26).

### 4a-ii. "Your Details" follows the visitor between pages (2026-08-04)

Each page mounts its own copy of the `MembershipModal`, so anything typed into step 1 used to be lost the moment the visitor navigated — someone who started on `/` and then opened the modal on `/promotions/[slug]` or `/membership` faced an empty form again. The four identity fields (first name, last name, email, mobile) are now kept in **`sessionStorage`** (`ta.guestDetails`, owned by [guest-details-storage.ts](src/utils/auth/guest-details-storage.ts)) and refilled when the modal opens.

What the customer can count on: it is **tab-scoped** — it survives navigation and reload but is gone when the tab closes; **card details are never stored** (an explicit four-field allowlist, so the card inputs in the same form object cannot leak in); it applies to **guests only** (a signed-in customer's fields come from their profile); and it is cleared the moment they authenticate, as well as on sign-out ([total-sign-out.ts](src/utils/auth/total-sign-out.ts)) so a shared device never hands the next person the previous visitor's contact details. Hydration fills blanks only — it can never overwrite something being typed.

### 4b. Registration internals (guest account creation)

`POST /api/auth/register` validates `firstName`, `lastName`, `email`, Australian `mobile` (normalised to `+61…`), plus optional `affiliateCode`, `promotionSlug`, `builtPrizeSlug` (validated the same way as `promotionSlug`), `packageId`, and UTM/click-ID fields ([register/route.ts:56-86](src/app/api/auth/register/route.ts#L56)). Rate limited at 20/min/IP. A **"plain account"** = `!accumulatedEntries || accumulatedEntries === 0`. `builtPrizeSlug` is captured on all four outcomes below (matched-account update, mobile/email-only update, and new-account creation) via `buildSignupAttribution` — see §2h.

| Case | Behaviour |
|------|-----------|
| Email/mobile belong to a **converted** account (`accumulatedEntries > 0`) | Rejected `400` with `isExistingAccount: true` + `existingAccountEmail`; told to log in ([register/route.ts:302-337](src/app/api/auth/register/route.ts#L302)). |
| Email/mobile belong to an account with **saved payment methods** | Same rejection ([register/route.ts:341-378](src/app/api/auth/register/route.ts#L341)). |
| Email **and** mobile match the **same plain account** | Account is **updated in place** (name/email/mobile/attribution), re-fires `User Registered` ([register/route.ts:382-502](src/app/api/auth/register/route.ts#L382)). Attribution is **merged, not replaced** — see the note below the table. |
| Email and mobile match **different** accounts | Rejected `400` "Registration conflict" ([register/route.ts:503-519](src/app/api/auth/register/route.ts#L503)). |
| Only email **or** only mobile matches a plain account | That plain account is updated ([register/route.ts:523-700](src/app/api/auth/register/route.ts#L523)). |
| No match | New passwordless account created; a Stripe customer is created and linked (`stripeCustomerId`) ([register/route.ts:702-770](src/app/api/auth/register/route.ts#L702)). |

**Re-registration preserves where the customer came from (2026-07-29).** On all three
existing-account branches, `signupAttribution` is now **merged** onto what the account already
carries rather than assigned wholesale. The rule is **preserve-when-absent**: `promotionSlug`,
`promotionPageType` and `builtPrizeSlug` survive only when the new signup does **not** carry one, so
a customer returning on a bare ad click keeps the promo page and prize they originally came from —
while a customer who genuinely lands on a *different* promo page and re-registers there is
re-attributed to it. UTMs and `clickPlatform` are last-write-wins, so a newer ad click still
refreshes. (This is deliberately **not** strict first-touch-wins; whether it should be is an open
product question.)

Before this, the whole subdocument was replaced. That became destructive once a bare `clickPlatform`
was enough to persist on its own: a customer who landed on a promo page, built a prize, registered,
abandoned payment, then came back days later through an ad with no promo slug and no UTMs would have
their original promo page and built prize **silently erased**, and the eventual purchase attributed
to no page and no build. That is precisely the customer the abandoned-checkout flow exists to bring
back. New-account branches still assign directly — there is nothing to preserve.

### 4c. Login paths

| Path | Mechanism |
|------|-----------|
| **Email + password** | `LoginModal` → `signIn("credentials")`; the provider looks up the user and `bcrypt.compare`s the password. **Passwordless users (no `password`) cannot use this provider** — `authorize` returns `null` ([auth.ts:56-135](src/lib/auth.ts#L56)). |
| **Email sign-in code (passwordless)** | "Send code to sign in instead" → `POST /api/auth/send-login-code` then `POST /api/auth/verify-login-code`, which returns a bridge `token` consumed by `signIn("auto-login", { token })`. This is how no-password customers log in ([LoginModal/index.tsx:464-556](src/components/modals/LoginModal/index.tsx#L464)). |
| **Google OAuth** | `signIn("google")` via popup. The `signIn` callback **rejects Google sign-in for emails with no existing account** (`return false`) — new users must register the normal way first. On success it sets `isEmailVerified = true` ([auth.ts:373-399](src/lib/auth.ts#L373)). |
| **Post-payment auto-login** | `/api/auth/auto-login` (payment-proof) → `signIn("auto-login")` — converts a paying guest into a session ([MembershipModal/index.tsx:2448-2477](src/components/modals/MembershipModal/index.tsx#L2448)). |

**Deactivated accounts (`User.isActive: false`) are rejected at login on every path (2026-07-09).** Credentials `authorize` throws `ACCOUNT_DEACTIVATED` (checked **after** password validation so account status is only revealed to a valid credential holder) and both login UIs surface "This account has been deactivated. Please contact an administrator."; the email sign-in-code path rejects at `verify-login-code` (403 + the same message, after the OTP is validated); Google's `signIn` callback returns `false` (AccessDenied); the auto-login provider re-checks `isActive` in the DB before accepting any bridge token and throws the same `ACCOUNT_DEACTIVATED`; and the jwt callback refuses to mint a first token for an inactive account. Previously login *succeeded* and the session-refresh guard killed the token seconds later — an unexplained login→auto-logout loop (hit by removed staff, admin-deactivated accounts, and invited staff who set a password via the public reset flow without completing `/staff-setup`).

After a successful login the client reads the fresh id via `getSession()`, invalidates user-scoped caches via `usePurchaseInvalidation`, then `router.push("/my-account")` + `router.refresh()`.

### 4d. Email verification — what it actually gates

`User.isEmailVerified` (def false) is set by a 6-character code flow (not a click-link) and is **not required to register or to pay**. It functions as an **alternate login gate inside `LoginModal`**: when a password login fails with an email-verify error, the modal shows the verification flow; on success, `verify-email` mints a **membership-gated** bridge `token` (only if the user has membership/`stripeCustomerId`) and signs them in. Google OAuth implicitly verifies the email.

> For the full verification mechanics (rate limits, attempt counters, code expiry), see [BUSINESS.md §10f](BUSINESS.md).

### 4e. Password reset

- `POST /api/auth/request-password-reset` — looks up the user (returns `404` if no account — it does **not** mask existence), generates a 32-byte-hex `passwordResetToken` + expiry, emails a reset link. Rate limited to once per 5 minutes ([request-password-reset/route.ts:27-87](src/app/api/auth/request-password-reset/route.ts#L27)).
- `POST /api/auth/reset-password` — finds the user by unexpired token, `bcrypt.hash`es the new password (min 6 chars, cost 12), then **clears the token** so it is single-use ([reset-password/route.ts:23-36](src/app/api/auth/reset-password/route.ts#L23)). Setting a password this way lets a previously-passwordless customer subsequently use the `credentials` provider.
- A passwordless customer can also **set a first password directly** from Account settings (the Password section renders a "Set a password" flow, no current-password required, when `hasPassword === false`). **Fixed 2026-07-20 (latent):** the settings page read `hasPassword` off the my-account payload, which never carries that derived field (it comes from `GET /api/users/[id]`) — so it was always `undefined`, the page always showed the "change password" flow demanding a current password the customer never had, and passwordless (e.g. Google-OAuth-only) customers **could not set a first password** from settings. Now sourced from the correct payload. See [dashboard-account/gotchas.md](docs/dashboard-account/gotchas.md).

### 4f. Per-path summary

| Path | Flow |
|------|------|
| **New guest (membership signup)** | `MembershipModal` step 1 → `POST /api/auth/register` creates passwordless account, returns `guestUserData`; **still `isAuthenticated: false`, no membership** → step 2 payment uses `guestUserData` → on payment success, `/api/auth/auto-login` (payment proof) + `signIn("auto-login")` establishes the session; membership is granted via Stripe/webhook. |
| **Returning member (password)** | `LoginModal` → `signIn("credentials")`. If password fails on an unverified email, switch to the email-code verify flow (bridge token). No-password members use the "send sign-in code" path instead. |
| **Returning member (Google)** | `LoginModal` "Sign in with Google" → popup OAuth → callback rejects unknown emails, marks known emails verified → poll `getSession()` → redirect to `/my-account`. |

---

## 5. The membership journey

Members manage their membership from **My Account → Membership → Manage plan** (the "manage" overlay sheet), reachable from the Membership page or the `/my-account?open=subscription` deep-link. (The old **Settings → Subscription** tab was removed in the 2026-07 dashboard revamp; Settings now holds only Profile / Theme / Password.) This section covers only the customer-OWNED facts (where the action happens, which fields change). For pricing, proration mechanics, retention-offer tables, and the full cancellation-flow internals, see [BUSINESS.md §9, §10, §13](BUSINESS.md).

### 5.1 Joining

Customer pays full package price immediately at signup via Stripe. There is **no free trial** — `trialing` is a billing-anchor artifact for 25th–27th joiners only (see [BUSINESS.md §9b](BUSINESS.md)).

**Which tier the customer is shown first (2026-08-04).** Any CTA that opens the join flow from a surface with no package cards on screen — the promotions hero "Enter Now", "Build your prize", "Enter to unlock discount", the major-draw CTAs, draw-results, and the dashboard "Become a member" — now opens **"Select Your Package"** as the first view, so the customer always picks. Behind that picker sits a default: **Foreman**, not Tradie. Backing out of the picker therefore leaves a real, payable package selected — a customer never lands on an empty "Billing Info" step. Tapping a specific tier card (the packages section, `/membership`, the account tier list) still goes straight to that tier: the tap already is the choice. Foreman is labelled **RECOMMENDED** on the package cards, in the picker, and on the "Selected Package" summary; Boss and the top one-time pack carry **Best Value**. Nothing is auto-purchased — every preselect is one "Change" tap away from another tier, and pricing/inclusions are unchanged ([BUSINESS.md §2](BUSINESS.md)).

**When the bank asks for authentication (3-D Secure) — fixed 2026-08-04.** Some issuers require the
cardholder to approve the charge before it can complete. That challenge is now presented and the
purchase finishes normally. Previously it was never shown: the customer was told *"Purchase
Complete! Your payment was successful"* while Stripe held the charge as **Incomplete** — no money
taken, no entries granted, and no error anywhere. If the customer abandons or fails the challenge
they are now told the payment did not go through and no charge was made, instead of being
congratulated. Failures are recorded as `ErrorReport`s (`3ds_*` codes) so repeated struggles are
visible internally. See [docs/payment/gotchas.md](docs/payment/gotchas.md).

**What the customer sees after paying (2026-08-04).** `/purchase-success` shows an order summary:
the pack they bought, the amount paid, the free entries granted, and a payment reference. It only
appears once the server confirms the entries were granted, so the figures are always real. Per the
free-entry model, the **pack** is the priced line and entries are listed separately as an inclusion
("Includes 150 free entries…") — entries are never shown as a purchased line item or priced per
unit.

**Fields set on activation:** `subscription.isActive: true`, `subscription.status: "active"` (or `"trialing"`), `subscription.startDate`, `subscription.endDate`, `subscription.packageId`.

### 5.2 Renewal date — the 24th rule

Membership renews monthly on the customer's own billing date — except 25th/26th/27th joiners are anchored to the **24th** of each month. See [BUSINESS.md §9b](BUSINESS.md) and [BILLING_ANCHOR_24.md](docs/BILLING_ANCHOR_24.md) for the mechanics.

### 5.3 Upgrade (move to a higher tier)

Customer confirms in `UpgradeConfirmModal` and completes a Stripe payment. Blocked while `past_due`. **Fields that change:** `subscription.packageId`, `subscription.startDate`/`endDate` (cycle resets to today), `subscription.pendingChange` (parked during charge, cleared on webhook confirmation). For charge-amount and proration detail see [BUSINESS.md §10c](BUSINESS.md).

### 5.4 Downgrade (move to a lower tier)

No charge now; takes effect at cycle end. **Fields that change:** `subscription.packageId` (updated immediately to new tier), `subscription.previousSubscription` (old tier's benefits cached here until `endDate`). For no-refund / entry-preservation rules see [BUSINESS.md §10d](BUSINESS.md).

### 5.5 Auto-renew toggle

`PATCH /api/stripe/update-auto-renew` sets `cancel_at_period_end`. **Fields:** `subscription.autoRenew`, `subscription.cancelledAt`, `subscription.endDate` (cleared when re-enabled). With auto-renew off the customer keeps full access until period end and is not charged again.

### 5.6 Cancellation & retention flow

No instant cancel — always routes through `CancellationFlowModal`. **Customer-OWNED fields consumed/set:** `retentionOffersConsumed` (tracks one-time saves used: `pause30d`, `discount50_2mo`), `cancellationUpsellRedeemed` (one-time +100-entry offer). For the five save-offer types, the seven cancellation reasons, and `past_due` short-circuit logic see [BUSINESS.md §13c](BUSINESS.md).

### 5.7 Reactivate vs Resubscribe

Two distinct paths via `POST /api/stripe/renew-subscription`:

- **Reactivate** — within ~30-day grace window; no charge, same tier only, clears `cancel_at_period_end`. **Fields:** `subscription.cancelledAt` cleared; `subscription.endDate` re-synced from Stripe to the end of the current billing period, so the UI shows the correct next renewal date ([renew-subscription/route.ts:464-476](src/app/api/stripe/renew-subscription/route.ts#L464)). `endDate` is only *cleared* on the auto-renew re-enable path (§5.5).
- **Resubscribe (`create_new`)** — fully-expired member, new charge, new subscription. **Fields:** `subscription.*` reset; `subscription.lastMonthAccumulatedEntries` survives so entry history carries over.

For the branch logic (retry_payment / reactivate / create_new) see [BUSINESS.md §10i](BUSINESS.md).

---

## 6. Entries & draw participation

**Major-draw entries are NOT on `User`.** Source of truth is `MajorDraw.entries`. The customer earns entries by subscription renewal, one-time/additional pack purchase, upsells, referrals, and promos — for the full earn table, carry-forward rules, and the freeze/gap blackout window see [BUSINESS.md §3, §3e](BUSINESS.md).

**Customer-OWNED fields:**
- `subscription.lastMonthAccumulatedEntries` — carry-over balance (persists through cancel).
- `accumulatedEntries` — total entries ever received (informational; major-draw pool is on `MajorDraw`).
- `miniDrawParticipation[]` — per-mini-draw tracking on the user record.

### 6a. Draw eligibility

A customer is **ineligible** for any giveaway if either condition holds ([giveaway-eligibility.ts:6-19](src/utils/giveaway-eligibility.ts#L6)):

| Rule | Detail |
|---|---|
| **Age** | Must be **18+**; `MIN_AGE = 18`, computed from `birthdate`. |
| **State** | **SA and ACT residents excluded**; `INADMISSIBLE_STATES = ["SA", "ACT"]`. |

The Australian-resident requirement is enforced via the `state` field (codes are AU states/territories); there is **no explicit "Australian resident" boolean** in `giveaway-eligibility.ts` — eligibility keys only on state code + age. *(Unverified: whether residency is gated elsewhere, e.g. at registration.)* Customer-facing eligibility checks route through this shared helper — its only consumers are the profile settings form ([ProfileTab.tsx](src/app/(site)/my-account/components/settings/ProfileTab.tsx)) and the post-purchase setup modal ([Step2Demographics.tsx](src/components/modals/UserSetupModal/Step2Demographics.tsx)). The admin major-draw winner-export and eligibility-summary paths do **not** call it — they re-implement the SA/ACT exclusion inline with hard-coded state comparisons ([MajorDrawService.ts:758-762](src/services/admin/MajorDrawService.ts#L758), [export/route.ts:130-131](src/app/api/admin/major-draw/export/route.ts#L130)) and apply no age check at export time.

---

## 7. Customer perks

Four customer-facing perk systems. For the full mechanics (tier-% ladders, referral payout rules, affiliate commission model, redeemables campaign config) see [BUSINESS.md §4, §7, §8, §13](BUSINESS.md) and [docs/partner/](docs/partner/), [docs/referrals/](docs/referrals/), [docs/affiliate/](docs/affiliate/), [docs/rewards-redeemables/](docs/rewards-redeemables/).

### 7a. Partner discounts

`User.partnerDiscountQueue[]` stores stacked access periods (field detail in §2g). Subscription tiers get lifecycle access (active while membership is active); one-time packs get a time-limited window capped at 12 months from purchase. When both are held, the higher catalog-visibility tier wins. Foreman subscription visibility uses `Math.round(total × 0.75)` ([partner-catalog-visibility.ts:114-116](src/utils/partner-discounts/partner-catalog-visibility.ts#L114)). The access-% "ring" the customer sees on the /my-account hero is derived by the shared queue-aware resolver ([partner-access-ring.ts](src/utils/partner-discounts/partner-access-ring.ts), 2026-07-09 — the admin user-detail modal now shows the identical ring; no customer-facing behavior changed). For the full tier-% table and stacking rules see [BUSINESS.md §4](BUSINESS.md).

**What the rewards-portal vendor can read about a customer (2026-07-16, default-dark).** iGoDirect's MyRewards portal (the white-label rewards portal at `myrewards.toolsaustralia.com.au`) can query `GET /api/partner-discount/member-status` (bearer-authed; 503 in production until `IGODIRECT_MEMBER_STATUS_ENABLED=true`) at SSO sign-in, page load, and offer redemption. Per call, the vendor receives only `active` (boolean), `member_level` (catalog-visibility %), and `expires_at` — keyed by the opaque `member_id` (`User._id`) it already holds from the SSO hand-off. **No PII fields are in this response** (name/email leave only via the SSO payload itself, owner-approved 2026-06-24 — see [docs/partner/api.md](docs/partner/api.md)). Every answer is reconcile-then-read, so it reflects the customer's live entitlement, including packs promoted at read time.

**Consent before anything is shared (2026-07-31, LIVE).** The first time a customer opens the partner portal they now see a consent screen before any of their details leave Tools Australia. It lists exactly what the hand-off sends — **Name**, **Email**, and an **Account reference** (the trailing 6 characters of their opaque `User._id`) — and states plainly that payment details, billing address and draw entries never cross. The list is **generated from the same code that builds the SSO payload** ([partner-consent.ts](src/utils/partner-discounts/partner-consent.ts)), so the screen can neither hide a field we send nor claim one we don't: the membership-tier row is deliberately **absent today** because `member_level` is not currently transmitted. One required tick, nothing optional and nothing pre-ticked — no marketing opt-in and no "remember this device", so there is no bundled consent (invalid under the Privacy Act / APPs). Agreeing writes `User.partnerDiscountConsent` (§2g); the token route refuses to mint until it is there, and a change to the shared-field set re-prompts everyone. Returning customers skip straight past it. Between the click and the portal, a full-screen transit screen shows the exchange happening step by step, with a Cancel escape hatch and plain-English failure states instead of a hanging spinner. **Not yet promised anywhere:** there is no "Account → Connected services" withdrawal page, so no copy claims one. **Standing public disclosure (2026-07-31):** the same three fields, the named processor (**iGoDirect Group, trading as MyRewards**) and the "edits in the portal do not update your Tools Australia account" fact are now stated in [/privacy §4.1](src/app/(site)/privacy/page.tsx), so a customer who wants to know who holds their data can find it without opening the portal. Keep that section in lockstep with `buildPartnerSsoSharedFields()`.

**What the customer actually meets in the portal, and what we now tell them first (2026-07-31, LIVE).** The portal went live in production on 2026-07-31 and was walked end-to-end as a real Tradie (50%) member. Three facts about it are now customer-visible and shape our copy:

1. **The portal shows every offer to everyone and marks none of them.** Locked and unlocked offers render identically in every grid, carousel and search result; entitlement is only revealed on the offer page, after a click. For a Tradie that is **68% of the home page** and 3 of the 4 hero slides. The portal also never states the customer's tier — the words "Tradie" and "50%" appear nowhere in it. So the Rewards card carries the tier and the **real unlocked count** ("917 of 1,833 partner offers"). It also carried one expectation line — *"You'll see the whole catalogue in the portal. Offers above your level show an unlock prompt instead of a discount."* — which was **removed on 2026-08-03** once `/my-account/rewards/catalogue` (below) shipped: that page *shows* the customer which offers are theirs, which is a stronger answer than warning them in prose. If that catalogue is ever removed or gated, the sentence has to come back, because an unmarked lock in the portal otherwise reads as Tools Australia having oversold them.
2. **Two partner programmes, one percentage.** Our own 7 direct brands ("Tools Australia partners · Deal direct · no portal") are **not** in the portal catalogue and are now labelled separately, so the access ring is not read as describing only them.
3. **The portal has its own UI that is not ours.** It shows a **points/savings wallet we do not operate** (permanently `0` / `$0.00` for every member) and an **editable profile + password form** that is the vendor's own copy — edits there never reach Tools Australia, and its password is never needed because the portal is always opened already signed-in. Cobber has grounded answers for both (FAQ **75** + **76**) precisely because its nearest matches would otherwise have been our rewards-points and profile entries — a confident wrong answer.

**One destination for "manage my plan" (2026-07-31).** Every hand-off that means *change or
fix my membership* now lands on **`/my-account/membership`** with the right sheet already
open — the rewards-return banner's unlock CTA, the `/membership` tier cards, the header's
package-detail modal, and the payment-failure toast. Previously the `/membership` tier cards
dropped an existing subscriber on the bare dashboard with no plan controls, while the banner's
identical intent opened the manage sheet. Past-due customers tapping a subscription tier now
get the **payment** sheet rather than the dashboard.

**The customer can now browse what their tier opens, on our side (2026-07-31).** New page
**[/my-account/rewards/catalogue](src/app/(site)/my-account/rewards/catalogue/page-client.tsx)**,
reached from the Rewards card ("See what your 50% opens"). It lists the **real 1,833-offer
catalogue** with every offer marked against the customer's own access — open offers ticked,
above-tier offers locked and labelled with the membership that opens them ("Foreman opens
this, plus 458 more offers") — plus search, category filters and an "only show what I can
use" toggle that is **on by default** (it flips **off** at 0% access, so a guest lands on the
full browsable catalogue rather than an empty page). This is the question the portal cannot
answer, and it answers it *before* the customer crosses the boundary. Redemption still happens
in the portal.

**Every card now carries the offer's real artwork (2026-08-03).** Coverage went 52% → **98%**.
The gap was one whole category: all 877 **In-Store Offer** rows showed a letter tile, because
their artwork is keyed by a vendor-internal merchant id that appears nowhere in the data we are
given. Those are now read off the portal itself
([harvest-partner-instore-artwork.ts](scripts/harvest-partner-instore-artwork.ts)). The customer
sees each offer's **own** photo, not the merchant's logo — an early version used the brand mark
and rendered eight tours from one merchant as eight identical tiles, which reads as a broken
page. The designed monogram panel remains for the ~2% with no image; it is a normal state, and
will grow again whenever the vendor adds offers we have not re-harvested.

**Three link behaviours, so no card is a dead end.** An offer the customer **can** use links
straight to it in the portal (`/products/view_smart/{id}`, **new tab**). A **locked** offer goes
to `/membership` carrying its own `offer_id`, so the page can name the offer and preselect the
cheapest plan that opens it — sending someone to a page that will refuse them is the portal's
mistake, not one to copy.

**Tapping an offer opens that offer — even with no portal session (2026-08-03).** Previously
this was the sharpest edge on the whole surface: clicking an offer without a live portal session
bounced the customer `view_smart/{id}` → the vendor's login → ours → `/my-account`, losing the
offer entirely and dropping them on a page they were already past.

The vendor's hand-off cannot carry a destination — `/verifytoken/{token}` silently drops every
return-target form we tested (six) — so signing in and landing on the offer cannot be one
*navigation*. It can be one *tap*: we sign the customer in to the portal invisibly (a hidden
iframe, no page they ever see) and then send the tab they already have open straight to the
offer. What they experience is a tab opening on "Opening your offer…" for a moment, then the
deal.

**Anyone can browse the deals now — `/discount`, no account needed (2026-08-05).** The
catalogue above is the *member's* view and answers "what can I use". A second, **public** page
answers the question a visitor has instead: "what is actually in there?" It lists the same
1,833 offers plus the 7 direct partners, and every offer — name, category, value line, artwork
— reads in full **signed out**. Nothing about a deal is withheld.

What a membership buys is the ability to **redeem**, and the page is built to make exactly that
distinction visible rather than argue it: offers are stacked into bands by the access level each
one needs, and at the customer's own limit a **wall** is drawn across the list — *"Your access
stops at 50% · 916 you cannot redeem yet"*. A signed-out visitor meets that wall at the very
top, reading *"Readable below — a membership is what lets you claim them"*.

**A customer can now browse the catalogue by access level (2026-08-06).** Alongside search,
sort and the category chips, `/discount` carries an **Access level** filter — one chip per rung
of the 11-level ladder, each stating exactly what that rung unlocks (*5% · 92*, *50% · 183*,
*100% · 274*). Chips are **multi-select**: one tap answers "what does 100% specifically get
me?", and tapping several (5 + 10 + … + 50) builds the "everything up to 50%" view. Tapping a
lit chip deselects it; "Any" clears. A signed-out visitor can use it to price up the decision,
and a member can use it to see what a level above or below their own actually contains. It
composes with "only what I can use", so a 50% member who selects the 100% rung correctly sees
nothing. No access rule changed — this is a way to read the same catalogue, not a change to
what anyone can redeem.

Tapping a locked offer opens a popup that names the level it needs and shows the **two cheapest
ways to reach it** — a membership and a one-time pack — so a customer who does not want a
subscription is never left without a route. A redeemable offer hands them to the portal by the
same one-tap flow as the member catalogue. Nothing on the page prices entries, and nothing
frames the draws as anything other than free entries into prize draws (rule 11), which
`npm run test:discount-catalogue` asserts over every generated string.

**Two honesty constraints hold here as well as on the member page.** The footer says *"A slice
of our snapshot. The portal has offers our list does not"* and the empty state says *"Nothing in
our list matches that"* — never that an offer does not exist, because our snapshot is known to
be missing offers the portal carries. And where the vendor's artwork shows a different trading
name than the offer, the popup says so in plain words rather than leaving the customer to
wonder whether they misread it.

- **Normal case** — one tap, lands on the offer, no visible sign-in step at all.
- **If the invisible sign-in cannot run** (the customer's browser blocks it, or we are not on a
  `toolsaustralia.com.au` origin) they land on the portal home instead and the catalogue tells
  them plainly: *"You're signed in to the partner portal. Tap an offer again and it will open
  straight to that deal."* One extra tap, never a lost offer.
- Their catalogue tab is never taken from them — filters, scroll position and place in 1,833
  rows all survive.

The only remaining exception is a customer's **first ever** hand-off, which still shows the
consent screen (§ above) before anything is shared, and uses the same tab. After that they are
on the one-tap path.

*Known limitation:* browsing makes the catalogue's weakness legible — at 50%, 438 of the 917
open offers are single-location in-store deals and the only recognisable national name is
Kogan. That is a merchandising problem to solve with the vendor, not a reason to hide the list.

We also no longer claim **"Australia's top tool brands"** anywhere: the catalogue returns **zero** offers for Milwaukee, DeWalt, Makita and Ryobi, so the four member-facing surfaces sell breadth ("1,800+ Australian brands") or the real count instead. Full audit + the 16 vendor-side asks: [docs/partner/igodirect-portal-ux-audit.md](docs/partner/igodirect-portal-ux-audit.md).

**Partner brand wall (2026-08-04).** The public partner-discounts section on `/membership` and `/promotions/[slug]` is now [PartnerBrandWall](src/components/sections/PartnerBrandWall.tsx): an odometer over three conveyor belts of partner tiles. It reads the same **real count** rule as the member-facing surfaces — the odometer rolls to `PARTNER_CATALOG_TOTAL` (1,833) and is labelled **"partner offers"**, never "partner brands", because the direct brand list behind it is **7**. The belts carry our 7 direct partners plus the 93 artwork-bearing Automotive/Technology offers from the portal catalogue (generated into `partnerWallTiles.ts`) — the slice a tradie recognises; the general-consumer bulk of the catalogue (cafes, beauty, fashion) is deliberately not shown, since a rewards-club conveyor undersells a trade network. Tiles show logo + business name (logo-only under 640px) and are **not** outbound links: tapping one opens the membership flow, the same as the section CTA. Names come from the vendor feed, which on a few offers disagrees with its own artwork or reads as a marketing sentence — accepted knowingly (see [docs/partner/frontend.md](docs/partner/frontend.md)). This is the first place the catalogue's size is stated to a **signed-out visitor**, so it inherits the same honesty constraint as the Rewards card — if the count or the two-programme split changes, this surface changes with it.

**Rewards-return journey (2026-07-24, built; hardened + polished 2026-07-28; LIVE from 2026-07-31 with the SSO flags set — vendor side settled 2026-07-28).** A customer blocked from redeeming a partner-portal offer above their access level is redirected by the portal to `/membership` (`utm_campaign=rewards-return`), where a personalised unlock banner names the offer and the cheapest package that covers it — resolved from our committed catalogue, never from raw URL params; even the `offer_name` fallback is allowlisted against the catalogue, so only real offer names ever render ([portal-return.ts](src/utils/partner-discounts/portal-return.ts) + [MembershipPortalReturnBanner](src/components/sections/membership/MembershipPortalReturnBanner.tsx)). Per lifecycle state: guests get the unlock pitch **plus an "Already a member? Log in" path** — shown only to genuinely signed-out visitors, since a logged-in customer without active benefits would be bounced back to `/my-account`; a **past-due** customer with **no** live access is steered to fix payment, while one whose paid one-time pack is **still running** is told so honestly ("Your pack access is still running") and, when that pack covers the offer they came for, is sent straight back to redeem it rather than being told their discounts are off; **paused** members see their resume date and a Manage-membership link (never an upsell — their access returns on resume); an **active** member whose covered offer just needs redeeming is sent back to the portal (or, while SSO is dark, pointed at their still-open portal tab). A purchase grants the higher access immediately (same webhook path as any purchase), and the portal re-checks live entitlement on return (member-status API / SSO) — so the customer can go straight back and redeem ("Open partner portal" on `/purchase-success`, SSO-flag-gated). Cobber's redemption FAQs (16/72) describe this portal model and ship/launch together with it, in one spelling ("catalogue") across the whole corpus. Every way the hand-off can fail now shows the customer a plain-English reason on **all four** portal buttons — including the Rewards card and dashboard chip, which previously failed silently — from a single set of strings held in `PARTNER_SSO_ERRORS`.

### 7b. Referrals

`User.referral` holds the customer's own code (`referral.code`, unique sparse index) and conversion counters (`successfulConversions`, `totalEntriesAwarded`). `User.affiliateReferral` stamps which affiliate referred this user. For reward amounts, eligibility rules, and conversion mechanics see [BUSINESS.md §13b](BUSINESS.md).

### 7c. Affiliate program

A customer participates passively — visiting via an affiliate link stamps `User.affiliateReferral`. Affiliates are a separate account type (admin-created). For commission model and payout structure see [BUSINESS.md §13a](BUSINESS.md).

### 7d. Rewards / redeemables

**Legacy points balance — paused/deprecated.** `User.rewardsPoints` and `redemptionHistory` still exist on the model; `entryWallet` is explicitly **deprecated — set to 0** ([User.ts:130-131](src/models/User.ts#L130)). The rewards surface is gated by a feature flag that **defaults OFF** (`rewardsEnabled()` returns false unless `REWARDS_ENABLED`/`NEXT_PUBLIC_REWARDS_ENABLED = "true"`, [featureFlags.ts:27-39](src/config/featureFlags.ts#L27)). When off, reward API routes return HTTP **503** with code `REWARDS_PAUSED` ([rewardsGuard.ts:32-38](src/lib/rewardsGuard.ts#L32)).

**Event-based redeemables ledger (current).** An issuance ledger (not a points balance) — each grant is a discrete `RedeemableIssuance` / `MilestoneIssuance` record. Items auto-issue for active campaigns on wallet read; redeemable when `status === "active"` and not past `expiresAt`. For campaign config, milestone types, and `purchaseRequirement` rules see [docs/rewards-redeemables/](docs/rewards-redeemables/).

---

## 8. Marketing & attribution data captured

What marketing/attribution data we capture about a customer, and which of it **leaves to third parties** (Klaviyo, Meta/TikTok/Snapchat). See [docs/tracking/](docs/tracking/).

### 8a. UTM / attribution capture & persistence

On landing with marketing query params, the client persists **`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `campaign_id`, `adset_id`, `ad_id`** ([utm-helpers.ts:79-96](src/utils/tracking/utm-helpers.ts#L79)):

| Storage | Key | Lifetime | Notes |
|---|---|---|---|
| `sessionStorage` | legacy session store | per-tab, max 30 min from capture ([utm-storage.ts:16,59-62](src/utils/tracking/utm-storage.ts#L16)) | "transitional"; expired entry deleted on read |
| First-party cookie | `_ta_attr` | 90 days | **first-touch** (never overwrites a non-expired value), `SameSite=Lax`, `Domain=.toolsaustralia.com.au; Secure` in prod ([attribution-cookie.ts:11,56-69](src/utils/tracking/attribution-cookie.ts#L11)) |
| First-party cookie | `_ta_attr_last` | 7 days | **last-touch** (always overwritten on every UTM landing) — feeds the Tier-2 owned-channel (Klaviyo) resolution in §8b ([attribution-cookie.ts:13-19,71-77](src/utils/tracking/attribution-cookie.ts#L13)) |

The landing URL's **`?packages=one-time`** marker is also captured (as `packages_focus`, only ever `"one-time"`) into the same session store and `_ta_attr` cookie, and stamped onto payments as `PaymentEvent.data.packagesFocus` — a seed for future revenue-by-landing-focus reporting. **Membership is the default and is stored by absence**: ads never carry `?packages=membership`, so organic and pre-feature traffic stores nothing.

Paid **click IDs** are captured into separate cookies on mount: Meta `_fbc`/`_fbc_ts` (synthesized from `?fbclid=` so it survives without the Meta SDK), TikTok `ta_ttclid`/`ta_ttclid_ts`, Snapchat `_sc_click`; the Meta browser-ID `_fbp` is set by the Pixel. A **signup snapshot** is also persisted server-side in `User.signupAttribution` (§2h).

**TikTok click-id capture changed 2026-07-31.** The cookie is now written by **middleware on the
landing request** rather than only by a post-hydration script, it is named `ta_ttclid` (it was the
bare `ttclid`, which collided with a cookie TikTok's own pixel writes), and its **retention on the
visitor's device rose from 7 days to 90 days** — matching the other first-party attribution cookies.
This is the *same* single identifier held for longer, not a new one, and it is TikTok's own click
id, meaningless outside TikTok. Internal attribution windows are unchanged: a TikTok click still
only counts for 7 days ([platformPriority.ts](src/services/attribution/platformPriority.ts)); the
longer cookie exists so the click id can still be *sent* to TikTok's Events API for match quality.

**A browser-readable copy of the anonymous visitor id was added 2026-07-31.** `ta_anon_id` — the
random `anon_<uuidv4>` already minted for every visitor (90 days, no personal data in it) — is
`httpOnly`, so page scripts cannot read it. A mirror cookie **`ta_anon_id_pub`** now carries the
same value in readable form, so the browser conversion pixels can send it as an anonymous
`external_id` (§8d). It is the **same pseudonymous visitor id, not a new one and not an additional
piece of personal information**; `ta_anon_id` stays `httpOnly` and remains the authoritative copy.

**Promo-page build capture changed 2026-07-29.** On `/promotions/*`, the visit row
(`PromoAnalyticsVisit`, keyed on the `ta_anon_id` cookie — not the `User` record) now records
`builtPrizeSlug` for **every** visitor, describing the prize combination that was on screen, rather
than only for visitors who touched the reels. Whether they actually engaged moved to a separate
boolean, `buildInteracted`. No new identifier is captured and nothing extra leaves to a third party —
this is the same anonymous visit row, recorded for more visitors. The reason is that signups already
recorded the page's default build for people who never touched the reels, so counting builders and
signups over different populations let the admin funnel display rates above 100%.

**Promo-page visit attribution changed 2026-07-31 — and one field was dropped.** Two changes to the
anonymous `PromoAnalyticsVisit` row written on `/promotions/*` (keyed on the `ta_anon_id` cookie,
not the `User` record):

- **UTM now comes from the first-touch `_ta_attr` cookie, not the landing URL.** The beacon reads
  the same 90-day cookie signups and conversions already read, server-side, and falls back to the
  URL's own `utm_*` params. **No new identifier is captured and nothing extra leaves to a third
  party** — the same three UTM values are stored, sourced from a cookie this document already
  describes in the table above rather than from the address bar. The reason is internal
  consistency: visits were on a different basis from signups and conversions, so a visitor who
  landed on a tagged page and registered on an untagged one produced a signup with no matching
  visit. A new **`utmBasis`** field (`"first_touch"` / `"landing_url"`) records which source was
  used, purely so an attribution shift after a deploy is auditable.
- **`referrerSlug` is no longer captured.** It recorded which other promo landing page the visitor
  came from via the "Explore other toolsets" carousel; that carousel was replaced on 2026-07-22, so
  nothing had written the field since. The field, its index declaration and the beacon parameter
  were all removed — **strictly less data held about the visitor**.

### 8a-ii. Partner-discount page analytics (2026-08-11) — first-party only, nothing leaves

Browsing either partner-discount catalogue now writes a **first-party** analytics row. It is worth
being precise about what this does and does not mean for the customer:

- **Nothing new leaves to a third party.** No Klaviyo property, no Meta/TikTok/Snapchat event, no
  new pixel. The rows are written to our own `partnerdiscountvisits` collection and read only by
  staff on the admin Page Analytics tab (and by Norm, which receives **aggregate counts only** —
  its projection has no per-person field at all).
- **What is held per visit:** which surface (`/discount` or the members' rewards catalogue), the
  `ta_anon_id` cookie, an opaque `userId` when signed in, whether they were signed in, their
  partner-access % (a display number, absent when their tier had not resolved), referrer, the
  three UTM values already described in the table above, and **behaviour counters** — whether they
  used a filter, how many offers they opened, how many of those were above their access level,
  whether the access seam scrolled into view, whether they clicked an unlock CTA, whether they
  crossed into the partner portal, and whether a search came back empty.
- **What is NOT held:** no email, no name, and **not which offers or brands they looked at** —
  only counts. A member's browsing interests inside the catalogue are deliberately not recorded.
- **Retention: 90 days**, TTL-deleted, matching `PartnerDiscountSsoIssuance`. A visitor's rows
  disappear on their own.
- **Existing customer data reused, not extended:** the funnel joins a visit to the account it
  produced via `signupAttribution.anonymousId`, which §2h already documents. **No new field was
  added to the `User` model** — only a database index on that existing path.

Detail: [docs/partner/analytics.md](docs/partner/analytics.md).

### 8b. The "converting platform" concept

At purchase, `resolveAttributionAtEdge` reads the click cookies + `_ta_attr` + the last-touch `_ta_attr_last` ([resolveAtEdge.ts:19-27](src/services/attribution/resolveAtEdge.ts#L19)) and resolves a **single** converting platform via a priority+recency ladder ([resolveConvertingPlatform.ts:11-76](src/services/attribution/resolveConvertingPlatform.ts#L11)). Window durations are defined in `platformPriority.ts` (`windowDaysFor`) ([platformPriority.ts:25](src/services/attribution/platformPriority.ts#L25)):

- **Recency race — paid clicks (`meta`, `tiktok`, `snapchat`, `google` reserved; 7-day window) AND owned channels (`klaviyo_email`, `klaviyo_sms`; 5-day window) compete together.** As of 2026-07 Klaviyo owned channels compete on **recency at the same level as paid clicks** (previously a lower Tier 2 that any in-window paid click outranked): the most-recent in-window touch wins, so a fresher Klaviyo last-touch beats an older Meta/TikTok paid click — this lets us measure Klaviyo's true last-touch performance. On an exact recency **tie**, the paid click (confidence `click`) outranks the owned utm-only touch. Paid clicks resolve via their click id (`click`); Klaviyo resolves from the last-touch cookie with confidence `utm_only` ([resolveConvertingPlatform.ts](src/services/attribution/resolveConvertingPlatform.ts), [platformPriority.ts](src/services/attribution/platformPriority.ts)).
- **Fallback (first-touch UTM):** normalized `utm_source` (+ `utm_medium`) resolves to the matching platform with confidence `utm_only`, honoring that platform's window ([resolveConvertingPlatform.ts:68-87](src/services/attribution/resolveConvertingPlatform.ts#L68)); a present-but-unrecognized source → `other`, absent or window-expired → `direct` ([resolveConvertingPlatform.ts:89-98](src/services/attribution/resolveConvertingPlatform.ts#L89)).

The result is persisted on the **`PaymentEvent`** record (not `User`): `convertingPlatform`, `attributionConfidence` (`click`/`utm_only`/`inferred_backfill`), and denormalized `attributionAdId/AdsetId/CampaignId` ([PaymentEvent.ts:30-36,126-135](src/models/PaymentEvent.ts#L30)). *Verified: no `convertingPlatform` field on the `User` model.*

Before persisting, the webhook runs a **persisted-UTM reconcile** ([reconcilePersistedAttribution.ts](src/services/attribution/reconcilePersistedAttribution.ts)): when the cookie-only edge resolved `direct`, the customer's stored UTM (this checkout session's, else `User.signupAttribution`) can still win — an owned Klaviyo touch within its 5-day window, or (since 2026-07-19) a **signup-anchored paid-platform** touch when the purchase falls within the platform's 7-day click window of the **captured ad visit** (`signupAttribution.visitedAt`, with `User.createdAt` only as legacy fallback — account age wrongly buried returning members whose signup attribution was refreshed by a recent retargeting-ad visit); session-carried or otherwise undatable/stale paid UTMs stay `direct`. This only changes how the purchase is *classified* internally — no additional customer data is captured or sent to third parties by it.

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

**Note:** UTM / converting-platform values are **not** synced as Klaviyo properties — only `brand_interest` (from signup slug) is. **List/consent:** marketing subscribe happens **once at registration**, gated by `acceptsPromotionalEmail`; SMS marketing + transactional subscribe if a phone exists; later syncs update data only, never re-subscribe ([klaviyo-profile-sync.ts:34-70,150-177](src/utils/integrations/klaviyo/klaviyo-profile-sync.ts#L34)). Exception: `syncKlaviyoEmailMarketingFromAdminPreference` re-subscribes or unsubscribes email + SMS *marketing* (transactional SMS untouched) when an admin toggles `acceptsPromotionalEmail` ([klaviyo-profile-sync.ts:81-146](src/utils/integrations/klaviyo/klaviyo-profile-sync.ts#L81), called from the admin users PATCH route `src/app/api/admin/users/[id]/route.ts`); the cancellation flow's retention unsubscribe reuses the same helper with `false` ([RetentionUnsubscribeService.ts](src/services/subscription/RetentionUnsubscribeService.ts)).

### 8d. Meta / TikTok / Snapchat CAPI customer events

Events sent to Meta (Pixel + server CAPI, deduped by shared `event_id`): `PageView` (pixel only), `Purchase`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `AddPaymentInfo`, `Lead`, `CompleteRegistration`, `Subscribe` (initial), and custom `MembershipUpgrade`/`MembershipDowngrade`. **Renewals are intentionally NOT sent as `Purchase`** ([EVENT_PARAMETER_MATRIX.md:76-85](docs/tracking/EVENT_PARAMETER_MATRIX.md#L76)).

Identity payload (`user_data`, [facebook-helpers.ts:200-275](src/utils/tracking/facebook-helpers.ts#L200)):

| Identifier | Meta key | Sent as |
|---|---|---|
| Email / phone / first / last name | `em` / `ph` / `fn` / `ln` | **SHA-256 hashed** |
| City / state / zip / country / birthdate | `ct` / `st` / `zp` / `country` / `db` | **SHA-256 hashed** |
| User `_id`, **else the anonymous visitor id** | `external_id` | **SHA-256 hashed** |
| Click ID / browser ID | `fbc` / `fbp` | **raw** |
| IP address / user agent | `client_ip_address` / `client_user_agent` | **raw** |

**Guest events now carry an anonymous `external_id` (2026-07-31).** Previously, events fired before
a customer had an account — viewing a package, starting checkout, entering card details — reached
Meta and TikTok with **no** user identifier at all. They now carry the visitor's existing
`ta_anon_id` (`anon_<uuidv4>`, hashed like every other identifier), falling back to it only when
there is no logged-in `User._id`. **What this does and does not mean:** it does not send any new
*personal* information — the value is a random UUID minted on this device, tied to no name, email
or phone, and it is an id the site already held. What it does do is let the ad platforms recognise
that several events came from the same browser, which is the point: without it those events were
unattributable. A visitor's `external_id` switches from the anonymous id to their `User._id` once
they register.

Hashing is plain SHA-256 of lowercased+trimmed input; **phones are first normalized to E.164 digits** (`"0412 345 678"` → `61412345678`) on every Meta surface via the shared `metaPhoneDigits` helper (2026-07 fix — previously Meta hashed the raw digit strip, wasting the `ph` match key), matching how TikTok already normalized. The same identity model applies to TikTok (`email`, `phone`, `external_id` hashed; `ttclid`, `ttp`, IP, UA raw) and Snapchat. As of 2026-07, TikTok's **server-side Events API** receives the same conversion set as Meta's CAPI — including `CompleteRegistration` (fired server-side on all four register branches) and custom `MembershipUpgrade`/`MembershipDowngrade` (dispatched server-side via `tiktokProvider.capiSend`), each sharing the Meta event's `event_id`. Previously TikTok received none of these (registration/upgrade/downgrade were Meta-only).

### 8e. PII flowing to third parties — flags

- **Klaviyo receives raw, unhashed PII** — email, first/last name, mobile (E.164), state, profession, plus the full behavioral/spend profile. **This is the largest clear-text PII export.**
- **Meta/TikTok/Snapchat receive PII only as SHA-256 hashes** (email, phone, name, location, DOB, user `_id`), but **raw** click IDs, browser IDs, IP, and user agent. A SHA-256 email is a stable pseudonymous identifier, **not** anonymization.
- **Public disclosure (2026-07-24, panel F-012):** the privacy policy's Cookies & Tracking section now names **TikTok** alongside Facebook (Marketing Cookies example + third-party providers list) and discloses the **server-side conversion sharing to Meta and TikTok with hashed identifiers** — previously it named Facebook Pixel only, understating the tracking footprint documented in §8d.
- **No consent banner — deliberate (2026-07-24, panel F-019).** Tools Australia does **not** ask for cookie/pixel consent: the pixels load and the CAPIs fire for every visitor. `hasPixelConsent()` hard-returns `true` ("auto-accept mode"). The dead `PixelConsentModal` — unreachable (`isOpen={false}`) and with a Decline button that gated nothing — was deleted rather than left implying a control the visitor never had. Rationale + what a real consent gate would require: [docs/tracking/rules.md R9](docs/tracking/rules.md).
- **`signupAttribution.clickPlatform` (2026-07-24)** records WHICH paid platform a signup came from, derived from a click-id cookie already present on the device. It stores the platform name only, not the click id — no new identifier, no third-party sharing; it is read solely by internal admin analytics.
- **The first-touch `_ta_attr` cookie persists 90 days** and survives login/OAuth; it holds only campaign metadata, no direct PII. It does **not** hold click IDs — each platform's click ID lives in its own cookie (see §8a).
- **Anonymous visitors are now identified to Meta/TikTok by a pseudonymous device id (2026-07-31).** Guest-fired events carry the `ta_anon_id` UUID as a hashed `external_id` (§8d), and the TikTok browser pixel sends it too, read from the `ta_anon_id_pub` mirror. No new personal data leaves — but it does mean pre-signup activity from one browser is now **linkable across events** by those platforms, where before it was not. Combined with the 7→90-day TikTok click-id retention, the honest summary is: **no new categories of customer data are shared, but existing anonymous activity is now more durably linkable.**
- **Contentsquare session-replay capture is env-gated, prod-only** (`NEXT_PUBLIC_CONTENTSQUARE_ID`, blank ⇒ disabled — [docs/tracking/rules.md R8](docs/tracking/rules.md)): dev/e2e/staging never record a session unless the id is explicitly set.
- **Contentsquare records the SCREEN, and until 2026-08-07 recorded it unmasked.** A live audit of the tag config (project 598444) found `replayRecordingRate: 100` with `anonymisationMethod: null`, `textVisibilityEnabled: 0` and `maskMedia: false` — i.e. every session captured, no masking configured, and no mention of Contentsquare anywhere in the privacy policy. Three things were true that softened it: the tag masks `<input>`/`<textarea>`/contenteditable content **by default** (typed text was never collected), its always-on Automatic Personal Data Redaction replaces emails, JWTs, OAuth tokens and card numbers found in the DOM, and card fields live in a cross-origin Stripe iframe. What was genuinely exposed was **PII rendered as page text** — the member's name in the header and account nav, a delivery address on checkout success, a date of birth, free text typed into support chat. Now masked via `setPIISelectors` on a `data-cs-mask` attribute applied at each render site, queued before the tag initializes. `/admin`, `/affiliate` and `/my-account/settings` remain excluded from replay entirely.
- **Contentsquare now receives membership + channel attributes (2026-08-07, channel added 2026-08-10).** `ContentsquareDynamicVariables` pushes `is_member`, `is_authenticated`, `membership_tier`, `has_one_time_pack`, `traffic_source` and `traffic_medium` as Contentsquare dynamic variables, re-sent per pageview, suppressed on `EXCLUDED_TRACKING_PREFIXES`. `traffic_source`/`traffic_medium` are the **last-touch** channel for the current session, read from the sessionStorage UTM copy via `getSessionUTMParams()` — deliberately NOT the 90-day first-touch `_ta_attr` cookie, which would label a returning visitor with whichever campaign originally won them and silently over-credit it. No campaign params this session ⇒ `direct` / `none`. Values are lower-cased so one channel is one segment (production carried both `tiktok` and `TIKTOK`). Only the channel LABEL is sent — never a click id (`fbclid`/`ttclid`) or campaign/adset/ad id. These are **plan metadata, not personal data** — no name, email, entry history or identifier is sent, and `identify`/`addUserProperties` are deliberately unused (they need a Product Analytics configuration this account lacks, so they would silently no-op). Effect: Contentsquare can segment behaviour by tier, which is the point of the licence; it cannot resolve a session to a person from what we send.
- **Public disclosure (2026-08-07):** the privacy policy's Cookies & Tracking section now names **Contentsquare**, adds a "Session Recording" cookie category, and states plainly what replay does and does not capture (no typed input, no card details, page-text PII masked, recording off on settings/staff pages). Before this it named Contentsquare nowhere, while recording 100% of sessions — a gap against [docs/tracking/rules.md R4](docs/tracking/rules.md)'s corollary that every tracking provider must be disclosed.

---

## 9. Account surface & privacy

What a guest/member sees and can do, their PII footprint, retention, and data rights. **Key files:** `src/app/(site)/my-account/**`, `src/app/(site)/privacy/page.tsx`, `src/lib/support-chat/chatStorage.ts`, `src/components/support-chat/SupportChatWidget.tsx`, `src/components/layout/Header.tsx`.

### 9a. The account dashboard (`/my-account`)

All `/my-account/*` routes require a signed-in session; an unauthenticated visitor is redirected to `/login` ([page.tsx:89-94](src/app/(site)/my-account/page.tsx#L89)). A customer is classified as `past_due`, `member`, `one-time`, or `guest` (precedence: past-due > member > one-time > guest); a holder of a still-active one-time pack without an active subscription shows an info-toned **One-time** badge ("a paying customer with an active pack, not a guest"), and only customers with no active subscription or active pack fall back to **Guest** ([settings/page.tsx:66-108](src/app/(site)/my-account/settings/page.tsx#L66)). For the full dashboard surface (ROI cards, entry breakdown, draw stats) see [BUSINESS.md §10h](BUSINESS.md).

> **Fixed 2026-07-20 (latent):** the my-account payload's `insights.totalSpent`, recent-order count, `recentOrders[]`, and active-mini-draw count were **always empty / `0`** because two DB queries matched zero docs (orders queried a phantom `userId` field; the model owner field is `user` — and active draws filtered on a phantom `MiniDraw.endDate`). These derived values (exposed via `useUserStats`) now hold the customer's **real** data. *(No customer-facing surface renders these insights today — this corrects the payload/derived data, not a visible screen.)* Caveat: `insights.totalSpent` sums `totalAmount` over the **10 most recent orders regardless of status** (includes cancelled/pending, capped at 10) — it is **not** true lifetime spend; a future surface must not treat it as accurate LTV. See [dashboard-account/gotchas.md](docs/dashboard-account/gotchas.md).

**How the Membership surface (`/my-account/membership`) frames free entries.** A member's **base** tier rate is the recurring, per-cycle number ("15 / 40 / 100 free entries **/ mo**" for Tradie / Foreman / Boss); on renewal it is **added** to their accumulated total (the Carry-forward rule — [BUSINESS.md §3e](BUSINESS.md)), never reset and **never re-multiplied** by an active promo. So the current-plan card shows the base rate plus an accumulation hint — "*Free entries accumulate each month — {N} land on your renewal, {date}*" (N = the same accumulated renewal grant the Dashboard shows) — and an **ⓘ** that re-opens the one-time `SubscriptionExplainerModal` (the accumulation chart) on demand. A promo **multiplier (e.g. 10×) is a one-time grant applied only at join / resubscribe / upgrade**, so the "Change your tier" list shows upgrade/join targets as "**{boosted}** free entries **to start**" (not "/ mo"), while the member's **current** tier shows its base "/ mo" — matching the upgrade preview's "N to start + base per cycle after".

**Order history (`/my-account/orders`).** A customer's own shop orders, scoped server-side to their session id — the route pins `userId` from the session and never from a query parameter, so it can only ever return their own. Each order leads with a three-step **progress strip** (Being made → On its way → Delivered) because "where is my order" is the question the page exists to answer; `pending` and `cancelled` show no strip, since neither is a position on that journey. Print-to-order turnaround means "Being made" is a real wait, so each status carries a plain-language line saying so. **No delivery date is ever promised** — none is stored, and supplier turnaround is unconfirmed.

A `pending` order stays visible for **one hour** and is then hidden from the customer's own list (`PENDING_GRACE_MS`): a real payment resolves in seconds, so anything still pending was abandoned at the card step and would otherwise sit in their history looking like a second purchase. Staff still see it.

**The money label follows the order's actual state**, on both this page and the checkout success page: `pending` → "Order total", `cancelled` → "Refund issued", otherwise "Total paid". A customer is never told they paid for something that has not been captured, or that money is still theirs after it has been refunded. "Refund issued" rather than "Refunded" is deliberate — the cancel path attempts the refund and swallows a failure, so it is the intent and not a guarantee. GST is shown as **inside** the total (Australian tax-invoice requirement), never added to it.

**Free entries on a shop order are shown only above zero.** Merchandise entries currently ship dark at `includedEntries: 0`; "0 free entries" would state a promise we are not making. What is displayed is `entriesGranted` — what the webhook actually granted — not a recomputation, so a later multiplier change cannot restate a customer's history.
**A refresh at the card step no longer creates a second order (fixed 2026-08-21).** Submitting
the delivery form used to mint a NEW order and a NEW Stripe PaymentIntent every time, so a
customer who refreshed while the card form was open ended up with two orders in their history
for one purchase — and the abandoned attempt sat in Stripe as an Incomplete payment. Nobody was
double-charged (only one intent is ever confirmed), but the customer saw a phantom second
order. A repeat submit of the same cart now RESUMES the existing order and its payment,
including when the customer refreshed specifically to correct their address — the address is
updated on the same order rather than opening another one.

**A declined card now closes the order** rather than leaving it "Awaiting payment" forever. The
failure handler was writing a status the database does not permit, so the write was rejected
and every declined shop payment left a stranded order in the customer's history.

**`insights.totalSpent` and per-user order counts now count PAID orders only.** They previously
summed every order row regardless of status, so an abandoned checkout — or one of the
duplicates above — inflated a customer's own spend figure and consumed one of the ten
`recentOrders` slots. Order HISTORY still shows cancelled and pending orders; it is the
statistics that no longer count attempts as purchases.

**Reaching Cobber (the AI support assistant):** everywhere on the site a customer opens Cobber via the **floating chat bubble** (`SupportChatWidget`, bottom corner). On `/my-account` that bubble is **suppressed** and the dashboard's **"Ask Cobber" support card** ("Start a chat", in the Support sheet / `/my-account/support`) is the single entry point instead — so members see one clear way to start a chat, not two. Both open the same chat panel. **Guest vs member access** is controlled by `CHAT_ALLOW_GUEST_GENERATIVE` (hCaptcha is deferred). **Off (default):** anonymous visitors get free **FAQ answers** + a "sign in to chat" nudge for anything the FAQ can't cover; **signed-in members get the full AI assistant**. **On (chosen launch posture):** anonymous visitors also get **full AI answers** — routed to the cheaper **Gemini** model (members keep the admin-toggled provider), guarded by the per-IP rate limit + daily budget. Either way members get the full bot. See [ai-chatbot/merge-to-main.md § 4g](docs/ai-chatbot/merge-to-main.md).

**Getting from Cobber to a human (fixed 2026-08-10).** Cobber can hand a conversation to human support via its `request_human` tool, which files a **`ContactSubmission`** (priority `high`, with a redacted transcript summary) that staff work from the admin Submissions tab. **This was broken from launch until 2026-08-10:** the tool only files a submission when it has a contact email, and the chat widget never sent one — so no ticket was ever created, while Cobber told customers their case had been passed on. Six customers in the first month were promised a reply within one business day that was never queued. Now a **signed-in member's** email is resolved server-side from their session, so escalation completes without asking them for anything, and Cobber is barred from claiming a handoff that did not happen (a false claim is logged and flagged in the admin transcript view). **Guests are not yet covered** — an anonymous visitor is told honestly that it can't be passed on yet and pointed to [contact us](/contact), which does work; widget-side email capture is the remaining piece. A customer's own always-available route to a human is unchanged: the [contact page](/contact), replied to within one business day.

### 9b. PII footprint

The `User` document (§2) holds the bulk of customer PII — identity (name, email, mobile, birthdate, state, profession), auth secrets, billing (`stripeCustomerId`, `savedPaymentMethods[]` — **only Stripe payment-method IDs, no card numbers**), activity/history, marketing consent, and attribution. The **chat** models also hold customer data, but **PII is redacted at the service layer before storage** and raw tool arguments are never stored ([ChatMessage.ts:6-9](src/models/ChatMessage.ts#L6)). *(Other collections — orders, payment events, draw entries — hold transactional references but were not exhaustively enumerated.)*

### 9c. Data retention

- **Chat data** — `ChatConversation` and `ChatMessage` carry a **MongoDB TTL index of 90 days** (auto-purge), aligned across both collections ([ChatConversation.ts:99-104](src/models/ChatConversation.ts#L99), [ChatMessage.ts:77-82](src/models/ChatMessage.ts#L77)). The in-chat disclosure states chats are "stored securely in Australia and automatically deleted after 90 days".
- **Privacy-policy stated retention** ([privacy/page.tsx:213-227](src/app/(site)/privacy/page.tsx#L213)): account info — while active + 7 years; competition records — min 3 years; transaction records — 7 years; marketing opt-out records — indefinite.
- **Who can read a customer's chat (2026-08-10).** Stored chats are now readable by staff in **Admin → Chatbot → Conversations**, gated by the `submissions.view` permission ([chatbot-conversations route](src/app/api/admin/chatbot-conversations/route.ts), service [chatTranscripts.ts](src/services/admin/chatTranscripts.ts)). This adds no new *stored* data and no new third-party sharing — it is an internal read surface over messages already persisted since Cobber launched (8 Jul 2026). What staff see is the **redacted** content (`redactPII()` masks emails/phones/card numbers at write time, before storage) plus the customer's **firstName and opaque userId only** — never email, full name, or phone. The customer's self-service "Delete my chat history" (§9d) removes it from this view too, since admin reads live data rather than a snapshot.

### 9d. Data rights

| Right | How it works in code | Self-service? |
|---|---|---|
| **Delete chat history** | "Delete my chat history" button (signed-in members only, two-tap confirm) → `DELETE /api/chat/history` → deletes all that member's conversations + messages, scoped by session userId ([deleteMemberChatHistory.ts:32-80](src/services/support-chat/deleteMemberChatHistory.ts#L32)) | **Yes** |
| Access / correction / **account deletion** / opt-out | Email request to support; responded within 30 days; deletion "subject to legal retention requirements" ([privacy/page.tsx:236-264](src/app/(site)/privacy/page.tsx#L236)) | **No** — there is **no customer-facing self-service "delete my account" endpoint** (matching routes are all admin/staff, e.g. `/api/admin/users/[id]/actions`). *(Verified: no `/api/user/delete`-style customer endpoint.)* |
| Marketing opt-out | Email unsubscribe / SMS STOP / contact support | Yes (via email links) |

### 9e. What sign-out clears client-side

Every sign-out trigger — the dashboard Settings page, the site Header, the AdminSidebar, and the 401 / 404+`USER_NOT_FOUND` forced-logout in `lib/queries.ts` (`shouldInvalidateSession()`, [queries.ts:63-65](src/lib/queries.ts#L63) — 403 is deliberately **not** a logout trigger: it's routine for limited-role staff, and treating it as an auth failure force-logged-out every limited-role staff member; regression test `npm run test:session-invalidation`) — clears user-scoped client storage **before** the server `signOut` through one canonical helper, `totalSignOut()` / `clearUserScopedClientStorage()` ([total-sign-out.ts](src/utils/auth/total-sign-out.ts)) (this satisfies the privacy + multi-user-safety rule that user-scoped client storage be cleared at the auth boundary). The helper:

1. Removes auth breadcrumbs (`wasAuthenticated`, `topBarHidden`, `auth-token`), per-user "seen" flags, and in-progress checkout/upsell/setup state from `localStorage` + `sessionStorage`.
2. Clears the per-user chat keys `ta_support_chat_conversation_id` and `ta_support_chat_messages` — delegated to the chat module's own `clearSupportChatStorage()` so chat history can't leak to the next user on a shared device; each removal is independently fault-tolerant ([chatStorage.ts:21-24,108-117](src/lib/support-chat/chatStorage.ts#L21)).
3. Calls `signOut({ callbackUrl: "/" })` (the `queries.ts` forced-logout keeps its own bare `signOut()`).

**Intentionally NOT cleared:** the device-level `ta_support_chat_disclosure_ack` key (the one-time "I've seen the AI notice" flag) — treated as a device pref like cookie-consent, so users aren't re-nagged on every account switch ([chatStorage.ts:65-70](src/lib/support-chat/chatStorage.ts#L65)).

---

## 10. Glossary

Customer-unique terms are defined here. For shared draw/billing terms (Anchor, Major Draw, Mini Draw, Carry-forward, ghost state, Reactivate/Resubscribe, etc.) see [BUSINESS.md §17](BUSINESS.md).

| Term | Meaning |
|---|---|
| **Customer** | A `User` record with `userType: "customer"` / `roleId: null`. Guest or member. The subject of this document. |
| **Guest (registered)** | Signed-in customer with no active subscription and no active packs. Derived, not a field. Shows as "Guest" in the dashboard. |
| **Member / subscriber** | Customer with `subscription.isActive: true` (Stripe `active`/`trialing`). One subscription at a time. |
| **One-time / mini-draw buyer** | Customer holding entries in `oneTimePackages` / `miniDrawPackages` without an active subscription. Can hold many. |
| **`guestUserData`** | Client-side step-1 registration payload that bridges `MembershipModal` step 1 → step 2 **without** a session. Step-1 register does NOT log in or grant membership (§4a). |
| **Passwordless account** | A customer with no `password` field. Logs in via emailed sign-in code or Google, not the `credentials` provider. |
| **`auto-login` provider** | Internal NextAuth bridge that mints a session from a server-verified action (payment proof / verification token). |
| **Attribution cookie (`_ta_attr`)** | First-touch 90-day cookie holding campaign metadata only — no direct PII. Survives login/OAuth (§8a). |
| **Converting platform** | The single resolved acquisition channel at purchase time, stored on `PaymentEvent` (not `User`) (§8b). |
| **`entryWallet`** | Deprecated field on `User`, always 0 (§2e). |

> _2026-07-20 note:_ the sitewide `font-['[Poppins]']` → `font-poppins` codemod touched some
> `/my-account` components (their Poppins-classed text now renders real Poppins). This is a
> presentation-only change — **no customer field, lifecycle state, flow, or captured data changed.**

> Clarifying note (2026-07-22): the `/my-account` dashboard's ManageSheet and Refer-a-Friend
> modals are now lazily mounted — their payment-method and referral-profile fetches fire only
> when the customer opens them, not on every dashboard load. Pure performance refactor; no
> customer-visible behavior, data field, or lifecycle fact changed.

**One name for the perk, everywhere (2026-08-05).** The same benefit was called "partner
discounts" on some surfaces and "the partner catalogue" on others — package tiles said one, the
membership banner, tier cards, rewards card, mini-draw packs and Cobber said the other. A
customer reading both reasonably concludes they are two different products. Customer-facing copy
now says **partner discounts** everywhere, including the chatbot; the `/my-account/rewards/catalogue`
URL and the internal `partnerCatalog*` identifiers are unchanged, since those are engine terms a
customer never sees. Nothing about the entitlement itself changed — same tiers, same percentages,
same stacking rules (§7a above).
