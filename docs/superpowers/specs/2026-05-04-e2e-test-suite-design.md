# Comprehensive Playwright E2E Test Suite — Design Spec

**Date:** 2026-05-04
**Branch:** `claude/shop-setup` (worktree of `claude/ShopFeature`)
**Status:** Draft for user review
**Domain:** `dev-tooling` (manifest already maps `e2e/**` and `playwright.config.ts` here)

## Goal

Stand up a Playwright E2E suite that covers every user-facing flow in the app — guest browsing, auth, draws, mini-draws, membership lifecycle, shop, upsells, rewards, promo, referrals, affiliate, partner, contact/newsletter, consent, and account settings. The suite must be runnable locally (`npm run test:e2e`), debuggable in Playwright's UI mode (`npm run test:e2e:ui`), and accessible from a remote machine when the dev runs the UI server on a tunneled port.

The shop suite already exists (8 specs covering guest/member checkout, cart, 3DS, out-of-stock, my-account orders). This work expands the suite to the full app surface using the same conventions: real test-mode Stripe, real Mongo via `.env.local`, prefix-namespaced fixtures, programmatic seeding.

Admin-panel coverage is **out of scope** here — it's a Phase 2 spec.

## Guiding principles

- **Architecture forward-looking, coverage MVP-broad.** Build the right fixture roster, helpers, and project structure once, then add specs incrementally per domain. Adding a new flow later should be mechanical.
- **Real over mocked, except where impractical.** Real Mongo, real Stripe test mode, real webhooks. Mock only where the alternative is brittle (Apple Pay, Google OAuth, time-traveling renewals).
- **One spec, one flow.** Specs are small, focused, named after the flow they verify. Helpers and fixtures absorb shared setup.
- **Fixtures over walks.** State-dependent tests use pre-seeded users, not register-then-purchase walks. The one exception: each major journey gets one happy-path "walk" test as a smoke check.

## Scope

### In scope (~178 flows across 21 domains — see additional flows section below for the second-pass additions)

| Domain | Specs | Flow examples |
|---|---:|---|
| Auth | 9 | Register, login, OTP, forgot/reset password, email verify, user setup |
| Account | 6 | Profile/email/phone/password update, settings tabs, payment methods |
| Draws (major + mini) | 14 | Entry as guest/member, promo multiplier, declined card, 3DS, cooldown, gate-closed, past draws, winners, mini-draw purchase, stock |
| Membership | 12 | Join, upgrade, downgrade, cancel, cancel-upsell redeem, resume, renewal-failed recovery, update payment method, package detail, special packages, explainer |
| Shop | 11 | (existing 7) + browse/filter, brand page, member discount, order detail |
| Upsells | 5 | Post-membership upsell, decline, success page, cancellation upsell, attribution |
| Rewards | 5 | Widget, catalog, claim redeemable, redeem code, milestone toast |
| Promo | 6 | Banner, welcome modal, page detail, link tracking, multiplier, bonus code |
| Referrals | 4 | Refer modal, copy code/link, signup with `?ref=`, post-setup reward modal |
| Affiliate | 5 | Signup, login (separate auth), dashboard, link generation, commission tracking |
| Partner | 4 | Discounts view, application form, discount applied at checkout, eligibility |
| Contact / newsletter | 3 | Contact form, subscribe, unsubscribe |
| Consent / theme | 2 | Pixel consent accept/decline, theme toggle persistence |
| Navigation | 4 | Homepage, static pages (faq/terms/privacy/competition-terms), header cart icon, footer links |

**Total: ~90 spec files for ~178 flows** (some specs cover multiple variants of one flow).

### Additional flows surfaced in second-pass audit

The first inventory pass focused on user journeys grouped by domain. A second pass focused on URL parameters, modal priority interactions, storage-flag-driven UI, header chrome, and banner widgets surfaced 27 flows that don't fit cleanly under any single user journey. They get their own spec files under new directories to keep them isolated:

```
e2e/url-params/        (~5 specs — affiliate/ref/promo/bonus capture, deep-link tabs, OAuth redirect, 3DS return handling)
e2e/modal-queue/       (~5 specs — priority preemption, sessionStorage restore, post-setup deferred modals, special-packages → gate-closed substitution, renewal-failed auto-open)
e2e/global-ui/         (~5 specs — top-bar dismiss + persistence, header cart drawer, header search overlay, MembershipBadge → PackageDetailModal, affiliate-mode header variant)
e2e/banners-widgets/   (~4 specs — freeze-period banner, FloatingCountdownBanner mode switch, RewardsFloatingWidget spotlight + tabs, FloatingPromoBanner page-aware visibility)
e2e/toasts/            (~3 specs — upgrade success toast, downgrade scheduled toast, entry-reward toast)
```

Specific behaviors locked in scope:

**URL parameters and deep links**
- `?aff=` affiliate code captured from any landing page, persisted via `useAffiliateLink`, re-appended to outbound CTAs
- `?ref=`, `?promo=`, `?bonus=` capture, including `usePromoWelcomeModal` first-view popup
- `/my-account/settings?tab=subscription` deep link from "Resolve payment" CTA on dashboard renewal-failed alert
- `/reset-password` with vs without `?token=` (request mode vs set-password mode)
- `/oauth-redirect` auto-submitting form (assert correct redirect target — popup harness optional)
- `/promotion` and `/promotions` redirect to `/promotions/[DEFAULT_PRIZE_SLUG]`
- `/purchase-success`, `/upsell-success`, `/mini-draw-success` with `?payment_intent_client_secret=` 3DS return → `succeeded` / `processing` / `requires_action` / `failed` branches per page

**Modal priority queue (cross-cutting)**
- Higher-priority modal preempts lower; lower returns when higher closes
- `pendingUpsell` survives tab navigation via sessionStorage hydration in `initializeModalSession`
- `showReferFriendAfterSetup` flag fires `ReferFriendModal` 10s after setup completes
- `subscriptionExplainerSeen_<userId>` localStorage gates `SubscriptionExplainerModal` first-view (2.5s after dashboard mount, only if active sub + no failed renewal + profile complete)
- `requestModal("special-packages")` substitutes `gate-closed` modal when major draw status is not `active`
- `RenewalFailedModal` auto-opens on every `/my-account/*` route when `hasFailedRenewal(userData)` is true

**Storage-flag toasts**
- `UpgradeSuccessToast` reads `localStorage.subscription_upgraded` within 15s, shows 25s toast with "View Benefits" hard-nav action
- Same component's parallel branch shows downgrade-scheduled toast with effective date
- `useEntryRewardToast` fires "+N Major/Mini Draw entries · +N reward points" after redemption / retention upsell accept / cancellation upsell accept

**Header / global UI**
- Top-bar dual promo slider with X dismiss writing `localStorage.topBarHidden=true`; cleared on signout
- In-header cart drawer (slide-in panel with quantity +/-, remove, "go to checkout") — distinct from `/shop/checkout` route
- Header mobile-only search overlay with "Popular searches" auto-submit chips, fires `trackSearch` pixel
- Header `MembershipBadge` click opens `PackageDetailModal` for both subscription and one-time variants
- Affiliate-mode header variant when `affiliate_token` cookie present (different menu — affiliate dashboard + logout only)

**Banners and floating widgets**
- `FreezePeroidBanner` non-dismissible during major draw `frozen` status, with countdown
- `FloatingCountdownBanner` target switches between `currentMajorDraw.drawDate` (open) and `nextDraw.activationDate` (gates closed); hides at top + bottom of `/my-account`
- `RewardsFloatingWidget` claimable/past tab, paginated, `redeemableNow` filter; spotlight first-view via `localStorage.rewardsWidgetSpotlightSeen_<userId>`
- `FloatingPromoBanner` page-aware visibility — hidden on shop/admin/affiliate/login/terms/privacy/competition/my-account; tab-synced via `membershipTabChanged` custom event

**Account / order detail**
- Order detail status timeline (`pending → processing → shipped → delivered`) with AusPost tracking link when `trackingNumber` present — 4 status-state snapshots
- Sign-out via settings explicitly clears `wasAuthenticated` and `topBarHidden` localStorage keys (affects next-visit top-bar visibility)

### Confirmed gaps — features that don't exist in the app, intentionally excluded

The second-pass audit looked specifically for these features and confirmed they're not implemented in the current codebase. Listing them so future contributors don't add tests for non-existent functionality:

- **No GDPR / "Delete my account" UI** — no client component or API route surfaces account deletion. `scripts/remove-user-from-integrations.ts` is admin-side only.
- **No tax-invoice download UI** — `src/app/api/invoice/finalize/route.ts` exists but is not linked from `/my-account/orders/[orderNumber]`. The order confirmation email is the user's invoice; no in-app download.
- **No "cancel pending change" CTA** — `User.subscription.pendingChange` field exists, but only `SubscriptionManagementModal` reads it, and it does not expose an action to cancel a scheduled downgrade/upgrade once committed.
- **`UnifiedModalManager` `pixel-consent` branch is inert** (`isOpen={false}` hardcoded) — the real consent UI lives in `PixelTracker`. Test the latter, not the former.

### Out of scope — exclusions and rationale

| Excluded flow | Reason | Where it's tested instead |
|---|---|---|
| Anchor billing & renewal scheduling | Browser can't time-travel | `npm run test:anchor-billing`, `test:stripe-collection-pause` |
| Cron-driven scheduled promos / partner queue rotation | No browser surface | unit tests, manual |
| Milestone reward eligibility resolution | Triggered server-side from webhooks | `test:redeemables` |
| Apple Pay / Google Pay wallet buttons | Headless Chromium can't render | manual smoke checklist |
| Google OAuth | Google blocks headless flows | manual smoke |
| Email rendering / inbox delivery | SendGrid is a black box | `email-preview` route + manual |
| Stripe webhook server-to-server (full) | Not a UI flow | `scripts/test-shop-webhook.ts` |
| Admin panel | Phase 2 — separate spec | future |
| A/B variant assignment | Production-only behaviour | manual |
| SMS / Twilio OTP delivery | Live SMS in CI is fragile | unit + manual |

These are listed explicitly in `docs/dev-tooling/e2e-testing.md` so future contributors know why they're absent.

## 1. Architecture overview

```
Playwright runner
  ├── globalSetup        → npm run seed:e2e (idempotent, prefix-namespaced)
  │       ├── Mongo: insert 7 Users + 1 Affiliate (test-e2e-* prefix)
  │       └── Stripe: create test-mode customers + subs (metadata.e2e=true)
  │
  ├── projects (per role × per worker)
  │       ├── setup-shared        → log in via /login, save storageState per role
  │       ├── setup-affiliate     → log in via /affiliate/login, save state
  │       ├── chromium-guest      → no storageState
  │       ├── chromium-fresh      → e2e/.auth/fresh.json
  │       ├── chromium-bronze     → e2e/.auth/bronze.json
  │       ├── chromium-silver     → e2e/.auth/silver.json
  │       ├── chromium-gold       → e2e/.auth/gold.json
  │       ├── chromium-cancelling → e2e/.auth/cancelling.json
  │       ├── chromium-pastdue    → e2e/.auth/pastdue.json
  │       └── chromium-affiliate  → e2e/.auth/affiliate.json
  │
  ├── webServer          → npm run dev (reuseExistingServer)
  │
  └── globalTeardown     → npm run cleanup:e2e (cascade delete + Stripe customer del)
```

Tests opt into a project via `playwright.config.ts` `testMatch` patterns. A spec like `e2e/membership/cancel.spec.ts` runs only under `chromium-bronze` (and any other member role configured for it).

## 2. Fixture roster

The roster is the contract between seed and tests. It's defined once in `e2e/fixtures/test-users.ts` and consumed by both the seed script and the auth setup.

| Role key | Email | State |
|---|---|---|
| `guest` | *(no fixture — runs without auth)* | n/a |
| `fresh` | `test-e2e-fresh@example.com` | Verified user, `profileSetupCompleted=true`, no subscription |
| `bronze` | `test-e2e-bronze@example.com` | Active Bronze sub + Stripe customer/sub + referral code + partner queue entry |
| `silver` | `test-e2e-silver@example.com` | Active Silver sub (same shape as bronze) |
| `gold` | `test-e2e-gold@example.com` | Active Gold sub (same shape) |
| `cancelling` | `test-e2e-cancelling@example.com` | Bronze sub with `autoRenew=false`, `cancelledAt=<seed time>` |
| `pastdue` | `test-e2e-pastdue@example.com` | Bronze sub patched to `isActive=false`, `status="past_due"`, `pastDueAt=<seed time>` |
| `affiliate` | `test-e2e-affiliate@example.com` | Affiliate document with bcrypt password, `affiliateCode="AFFE2E"`, `isActive=true` |

**Worker scoping:** when Playwright runs with N workers, the seed creates N copies of each role with suffix `-w0`, `-w1`, … Tests resolve their fixture user via `testUser('bronze')` which reads `process.env.TEST_WORKER_INDEX` and returns the worker-specific email. Helpers in `e2e/fixtures/test-users.ts` encapsulate this so specs never construct emails by hand.

**Resetting:** specs that mutate a fixture (cancel, upgrade) call `await resetUser('bronze')` in `beforeEach`. The reset helper re-applies the baseline `subscription` fields via a single Mongo update — much faster than a full re-seed.

## 3. Seeding contract

Source of truth: `scripts/seed-e2e-fixtures.ts`. Mirrors the existing pattern from `scripts/seed-shop-products.ts` and `scripts/seed-admin-data.ts` (dotenv → `connectDB()` → idempotent upserts → `mongoose.disconnect()`).

### Per-User contract

For an active member (`bronze`/`silver`/`gold`), the seed performs:

1. **Stripe customer** — `stripe.customers.create({ email, metadata: { e2e: 'true', role } })`
2. **Stripe subscription** — attach a confirmed test-card payment method (`pm_card_visa` or one created via `stripe.paymentMethods.create`), set it as the customer's default, then `stripe.subscriptions.create({ customer, items: [{ price: STRIPE_PRICE_BRONZE }], metadata: { e2e: 'true' } })`. The first invoice settles immediately because the customer has a working default payment method, leaving the subscription in `status: 'active'`
3. **User document** — direct insert with the exact field shape the webhook handler writes:
   ```ts
   {
     firstName, lastName, email,
     password: await bcrypt.hash(E2E_TEST_USER_PASSWORD, 12),
     isEmailVerified: true,
     profileSetupCompleted: true,
     stripeCustomerId, stripeSubscriptionId,
     subscription: {
       packageId: 'member-bronze' | 'member-silver' | 'member-gold',
       isActive: true,
       status: 'active',
       autoRenew: true,
       startDate: now,
       endDate: now + 30d,
     },
   }
   ```
4. **Side effects** mirroring the production webhook path (per investigation §11):
   - `getOrCreateReferralProfile(userId)` → mints `TA######` referral code
   - `handleSubscriptionQueueUpdate(user, 'start', { packageId, packageName, endDate })` → seeds `partnerDiscountQueue[0]`

   Skipped: `PaymentEvent`, `MembershipStatusHistory`, `MajorDraw.entries[]`, Klaviyo sync, `AffiliateCommission`. None gate UI behaviour; their absence is invisible to specs.

### Variant states (cancelling, past-due)

Per investigation §7, both transitions only mutate `User.subscription.*` fields. The seed applies them directly as field patches **after** the active-member seed completes:

- **Cancelling:** `{ autoRenew: false, cancelledAt: now }` (matches `CancelSubscriptionService` line 60-199)
- **Past-due:** `{ isActive: false, status: 'past_due', pastDueAt: now }` (matches webhook `handleInvoicePaymentFailed` line 2591-2618)

These are faithful — the production code paths set the exact same fields.

### Affiliate contract

Separate model. Seed inserts:
```ts
{
  name, email,
  username: 'affiliate-e2e',
  password: await bcrypt.hash(E2E_TEST_USER_PASSWORD, 12),
  affiliateCode: 'AFFE2E',
  affiliateLink: `${process.env.NEXTAUTH_URL}/membership?ref=AFFE2E`,
  isActive: true,
}
```

## 4. Auth and storageState

Per investigation §10, NextAuth uses JWT sessions (cookie `next-auth.session-token`). Affiliate uses a separate `affiliate_token` JWT cookie minted by `createAffiliateToken()` in `src/lib/affiliate-auth.ts`.

The existing `e2e/fixtures/auth.setup.ts` already does the right thing for one user: form-submit at `/login` then save the cookie via `page.context().storageState()`. We extend it:

- **`auth.setup.ts`** — runs one setup test per non-affiliate role (fresh, bronze, silver, gold, cancelling, pastdue). Each logs in, saves to `e2e/.auth/<role>.json`. Skips with a clear message if `E2E_TEST_USER_PASSWORD` is not set.
- **`affiliate-auth.setup.ts`** — separate setup project. Logs in via `/affiliate/login`, saves to `e2e/.auth/affiliate.json`.

`e2e/.auth/` is gitignored (already is in the existing setup).

## 5. File layout

```
e2e/
  .auth/                          (gitignored, regenerated each run)
  global-setup.ts                 (calls seed:e2e)
  global-teardown.ts              (calls cleanup:e2e)
  fixtures/
    auth.setup.ts                 (extended)
    affiliate-auth.setup.ts       (new)
    seed-helpers.ts               (resetUser, withFreshMember, helpers)
    test-products.ts              (existing)
    test-users.ts                 (NEW: roster + worker-scoped email helper)
    stripe-webhook-helper.ts      (NEW: POST signed events with test_bypass)
  utils/
    fill-payment-element.ts       (existing)
    stripe-test-cards.ts          (existing)
    selectors.ts                  (NEW: data-testid registry)
    intercept.ts                  (NEW: waitForApi, assertJsonResponse)
  auth/                           (9 specs)
  account/                        (6 specs)
  draws/
    major/                        (~10 specs)
    mini/                         (~5 specs)
  membership/                     (12 specs)
  shop/                           (existing 7 + 4 new)
  upsells/                        (5 specs)
  rewards/                        (5 specs)
  promo/                          (6 specs)
  referrals/                      (4 specs)
  affiliate/                      (5 specs)
  partner/                        (4 specs)
  contact/                        (3 specs)
  consent/                        (2 specs)
  navigation/                     (4 specs)
  url-params/                     (5 specs — affiliate/ref/promo capture, deep-link tabs, OAuth redirect, 3DS return)
  modal-queue/                    (5 specs — priority preemption, pendingUpsell hydrate, post-setup deferred, special-packages substitution, renewal-failed auto-open)
  global-ui/                      (5 specs — top-bar dismiss, cart drawer, search overlay, MembershipBadge, affiliate-mode header)
  banners-widgets/                (4 specs — freeze period, FloatingCountdown, RewardsFloatingWidget, FloatingPromoBanner)
  toasts/                         (3 specs — upgrade success, downgrade scheduled, entry reward)

scripts/
  seed-e2e-fixtures.ts            (NEW)
  cleanup-e2e-fixtures.ts         (NEW)
  e2e-stripe-helpers.ts           (NEW: shared customer/sub factory)
```

The manifest already maps `e2e/**` and `playwright.config.ts` to `dev-tooling`, and `scripts/test-*.ts` and `scripts/seed-*.ts` to `infrastructure`. No manifest changes needed for these paths.

## 6. Webhook test bypass

Per investigation §8, `src/app/api/stripe/webhook/route.ts:4857` accepts unsigned JSON when `NODE_ENV === "development"` AND `stripe-signature: test_bypass`. This is the same bypass `scripts/test-shop-webhook.ts` already uses.

`e2e/fixtures/stripe-webhook-helper.ts` exposes:

```ts
postWebhook(eventType: string, eventData: object): Promise<Response>
```

Used for tests that need to drive backend state via webhook (e.g., asserting upsell triggers after a `payment_intent.succeeded` arrives). Idempotency: each test generates a unique event ID so `ProcessedStripeEvent` doesn't dedupe across tests.

Production-safe: the bypass is gated by `NODE_ENV` so this can never accidentally activate in production.

## 7. Per-test reset and isolation

Three layers:

1. **Per-worker:** seed creates N copies of each role (worker-scoped emails). Two workers running cancel-bronze in parallel touch different users.
2. **Per-test reset:** `beforeEach` in mutating specs calls `resetUser(role)` to re-apply baseline subscription fields. Cheap (single Mongo update).
3. **Per-suite cleanup:** `globalTeardown` runs `cleanup:e2e` after the run finishes, removing all `test-e2e-*` Mongo docs and Stripe customers tagged `metadata.e2e=true`.

For specs that need a *fresh, never-touched* member (e.g., the "first-time membership purchase" walk test), `withFreshMember()` creates an ephemeral user inside the test, runs assertions, deletes them — no shared fixture risk.

## 8. Cleanup contract

`scripts/cleanup-e2e-fixtures.ts` performs cascading deletes (per investigation §13):

1. Capture all User IDs matching `email: /^test-e2e-/`
2. Delete by `userId` from: `MembershipRenewalCycle`, `MembershipStatusHistory`, `PaymentEvent`, `RedeemableIssuance`, `MilestoneIssuance`, `TicketEntry`, `Order`, `ReferralEvent`, `AffiliateCommission`, `AffiliatePayout`, `InvoiceChargeLog`
3. Pull from arrays: `MajorDraw.entries[]`, `MiniDraw` participation refs
4. Delete by event ID prefix from `ProcessedStripeEvent` (events created by `stripe-webhook-helper`)
5. `User.deleteMany({ email: /^test-e2e-/ })`
6. `Affiliate.deleteMany({ email: /^test-e2e-/ })`
7. List Stripe customers `metadata[e2e]=true`, call `stripe.customers.del()` for each (cascade-deletes subscriptions, invoices, payment intents on the Stripe side)

Skipped: `MembershipDailySnapshot` (aggregated by package, not by user — never delete).

Idempotent: safe to run multiple times.

## 9. Selectors and `data-testid` strategy

Brittle selectors are the #1 cause of E2E flake. Convention:

- Critical UI nodes get a `data-testid` attribute. Examples: `cart-icon`, `login-submit`, `package-card-bronze`, `cancel-membership-button`, `payment-element-frame`, `confirmation-modal`, `toast-success`.
- Test IDs are listed in `e2e/utils/selectors.ts` as a typed registry. Specs import from this registry; no inline `data-testid` strings.
- Test IDs are added to `src/components/**` and `src/app/(site)/**/*.tsx` *as needed* during E2E build — minimal surgical edits, no wholesale refactor.
- Domain doc-sync is honoured: every component edit triggers a matching update to its domain doc (`docs/<domain>/frontend.md` or `patterns.md`).

This means **the E2E build will touch component files** in many domains (auth, draws, membership, shop, etc.). The plan will explicitly list every component file expected to receive a `data-testid` so the doc-sync hook is satisfied.

## 10. npm scripts

Added to `package.json`:

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui --ui-host=0.0.0.0 --ui-port=8080",
"test:e2e:headed": "playwright test --headed",
"test:e2e:debug": "playwright test --debug",
"test:e2e:report": "playwright show-report",
"test:e2e:codegen": "playwright codegen http://localhost:3000",
"test:e2e:auth": "playwright test e2e/auth",
"test:e2e:account": "playwright test e2e/account",
"test:e2e:draws": "playwright test e2e/draws",
"test:e2e:membership": "playwright test e2e/membership",
"test:e2e:shop": "playwright test e2e/shop",
"test:e2e:upsells": "playwright test e2e/upsells",
"test:e2e:rewards": "playwright test e2e/rewards",
"test:e2e:promo": "playwright test e2e/promo",
"test:e2e:referrals": "playwright test e2e/referrals",
"test:e2e:affiliate": "playwright test e2e/affiliate",
"test:e2e:partner": "playwright test e2e/partner",
"test:e2e:contact": "playwright test e2e/contact",
"test:e2e:consent": "playwright test e2e/consent",
"test:e2e:navigation": "playwright test e2e/navigation",
"seed:e2e": "tsx scripts/seed-e2e-fixtures.ts",
"seed:e2e:clear": "tsx scripts/seed-e2e-fixtures.ts --clear",
"cleanup:e2e": "tsx scripts/cleanup-e2e-fixtures.ts"
```

## 11. Environment contract

`.env.local` requires (in addition to existing vars):

```
E2E_BASE_URL=http://localhost:3000        # default for the runner
E2E_TEST_USER_PASSWORD=<strong password>  # used by all seeded users
STRIPE_PRICE_BRONZE=price_xxx
STRIPE_PRICE_SILVER=price_xxx
STRIPE_PRICE_GOLD=price_xxx
```

Reused (already in `.env.local`): `MONGODB_URI`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.

`globalSetup` validates required vars and **fails loud** with a helpful message if any are missing — except in CI mode (`CI=true && !STRIPE_PRICE_BRONZE`) where the suite skips with an exit code 0, so PRs from forks don't fail.

## 12. Remote / "click-play" access

Three options documented in `docs/dev-tooling/e2e-testing.md`:

1. **Playwright UI Mode** (recommended) — `npm run test:e2e:ui` opens a browser-based UI on port 8080 with a tree of every spec, click-to-run, watch mode, time-travel debugger, network panel. The `--ui-host=0.0.0.0` flag makes it bind to all interfaces, accessible from another machine via SSH tunnel, Tailscale, ngrok, or VPN.
2. **VS Code Playwright extension** — installs a sidebar with the test tree, "play" gutter icons next to every `test()` block. Works perfectly over Remote-SSH so VS Code on a laptop drives tests on a remote dev box.
3. **HTML report** — `npm run test:e2e:report` after a run. Static HTML, can be published to S3/Vercel/GitHub Pages from CI for after-the-fact viewing.

UI Mode is the best fit for "click play to see the test run."

## 13. Documentation deliverables

Per the doc-sync hook contract, the implementation must update / create:

- `docs/dev-tooling/e2e-testing.md` — *(new)* how to run, UI mode, codegen, debug
- `docs/dev-tooling/e2e-fixtures.md` — *(new)* roster, what each role represents, reset semantics, worker scoping
- `docs/dev-tooling/e2e-writing-tests.md` — *(new)* conventions, data-testid usage, helpers, when to use which fixture
- `docs/dev-tooling/e2e-troubleshooting.md` — *(new)* common failures + fixes
- `docs/dev-tooling/testing.md` — *(update)* add E2E section pointing to the above
- `docs/dev-tooling/architecture.md` — *(update)* add E2E architecture overview

Plus per-domain frontend doc updates wherever a `data-testid` is added to a component (auth, draws, membership, shop, etc.).

## 14. Open questions / risks

- **Stripe API rate limits** in test mode: ~100 req/sec. Seed creates ~7 customers + ~6 subs + payment method attaches + sub updates ≈ 30-40 calls. Well under the limit, but parallel CI runs against the same Stripe test account could push it. Mitigation: serialize seed via `globalSetup`; don't run seed concurrently with the spec phase.
- **Worker-scoped fixtures cost more Stripe customers:** with 4 workers, seed creates 4×6 = 24 customers per run. Cleanup mitigates noise, but if cleanup is interrupted (Ctrl-C, CI timeout) the noise accumulates. The nightly `cleanup:e2e` fixes this; keep an alarm if customer count grows unbounded.
- **NextAuth JWT validation re-checks `dbUser.isActive` every request** (auth.ts:204-212). If cleanup deletes a user mid-run, any in-flight test using their storageState fails. Cleanup runs only in `globalTeardown` (after all specs), so this should not happen — but if a spec under-test accidentally deletes a fixture user, the next test fails confusingly. Documented as a known footgun in `e2e-troubleshooting.md`.
- **The `test_bypass` webhook signature only works in `NODE_ENV=development`.** If we ever switch the Playwright `webServer` to `npm run start` (production build), webhook helper tests will all fail. Keep `webServer.command: "npm run dev"` in `playwright.config.ts`; document this constraint.
- **Time-dependent UI** (countdown banner, draw status transitions): tests that assert on these need to either freeze time at the spec level, mock the clock, or use loose assertions ("countdown is rendering" rather than "countdown shows 13:42:15"). Default to loose assertions.

## 15. Phasing within this PR

The implementation is one bundled PR but ships the components in dependency order so each phase is independently runnable:

1. **Phase 1 — Infra**: seed/cleanup scripts, `globalSetup`/`globalTeardown`, extended `playwright.config.ts`, `auth.setup.ts` extension, `affiliate-auth.setup.ts`, env contract, npm scripts. No new specs yet. Confirm the existing 8 shop specs still pass under the new infra.
2. **Phase 2 — Helpers**: `test-users.ts`, `seed-helpers.ts`, `selectors.ts`, `stripe-webhook-helper.ts`, `intercept.ts`. Smoke-test by writing one spec that exercises every helper.
3. **Phase 3 — Specs by domain**: auth → account → navigation → membership → draws → upsells → rewards → promo → referrals → affiliate → partner → contact → consent → shop additions → url-params → modal-queue → global-ui → banners-widgets → toasts. Each domain ships its specs + the `data-testid`s it needs + the matching domain doc updates. The last five directories (url-params/modal-queue/global-ui/banners-widgets/toasts) are cross-cutting — they may need fixtures from multiple roles, so they ship after the per-domain specs that establish those fixtures.
4. **Phase 4 — Documentation**: `e2e-testing.md`, `e2e-fixtures.md`, `e2e-writing-tests.md`, `e2e-troubleshooting.md`, plus updates to `dev-tooling/testing.md` and `dev-tooling/architecture.md`.

The implementation plan (next document) sequences these phases into individually testable steps with explicit file lists.
