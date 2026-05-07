# Dev Tooling — Testing

## Playwright e2e

Browser-based end-to-end tests live under [`e2e/`](../../e2e/). Config: [`playwright.config.ts`](../../playwright.config.ts).

```bash
# One-time install (browser binary; ~300MB)
npx playwright install chromium

# Guest-only — no login required, fastest path to "is it working"
npm run test:e2e:shop:guest

# Member-only — requires E2E_TEST_USER_* credentials
npm run test:e2e:shop:member

# Both projects
npm run test:e2e:shop

# UI mode for debugging individual specs
npm run test:e2e:ui

# Full suite
npm run test:e2e
```

**Project split** (`playwright.config.ts`):
- `chromium-guest` — runs `guest-checkout`, `cart-persistence`, `out-of-stock`, `three-ds`, `draws/mini/list`, `draws/mini/stock`, `referrals/signup-with-ref`. No auth dependency.
- `chromium-member` — runs `member-checkout` only. Depends on the `setup` project (`auth.setup.ts`).
- `chromium-fresh` — also runs `draws/mini/{purchase,success,promo-applied}` (added 2026-05-05) and `referrals/{refer-modal,copy-code-link,refer-reward-modal}`.
- `chromium-affiliate` — runs `e2e/affiliate/{dashboard,link-generation,commission-track}.spec.ts`. Depends on `setup-affiliate`. The affiliate `login.spec.ts` is matched by `chromium-guest` instead so it can drive a fresh login (no storageState).

If `E2E_TEST_USER_EMAIL`/`E2E_TEST_USER_PASSWORD` are unset, the auth setup **skips gracefully** with a message instead of failing — guest specs continue to run normally.

**Optional env (in `.env.local`):**
- `E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD` — only needed for `member-checkout`
- `STRIPE_PUBLISHABLE_KEY` / `STRIPE_SECRET_KEY` (test mode) — required for any spec that talks to Stripe

**Required side processes:**
- `npm run dev` (Playwright reuses the existing server when port 3000 is up)
- `stripe listen --forward-to localhost:3000/api/stripe/webhook` — so PI succeeded events reach `finalizeShopOrder`

**Specs:**
- `e2e/shop/guest-checkout.spec.ts` — happy path, no auth
- `e2e/shop/member-checkout.spec.ts` — happy path, logged-in
- `e2e/shop/cart-persistence.spec.ts` — localStorage `shop_cart_v1` survives reload + drops after 24h TTL
- `e2e/shop/out-of-stock.spec.ts` — POST `/api/stripe/create-shop-purchase` returns 400 with `insufficient_stock` line item
- `e2e/shop/three-ds.spec.ts` — Stripe 3DS challenge flow (selectors are best-effort; Stripe changes them periodically — use `page.pause()` to inspect)

**Navigation specs** (all `chromium-guest`, no auth):
- `e2e/navigation/homepage.spec.ts` — `/` returns 200, hero h1 visible, at least one primary CTA link present
- `e2e/navigation/static-pages.spec.ts` — `/faq`, `/terms`, `/privacy`, `/competition-term-majordraw` each return 200, no redirect, footer hydrates. Uses footer (not `<main>` or `<h1>`) for the visibility check because terms/privacy/faq don't render either consistently.
- `e2e/navigation/header-cart-icon.spec.ts` — clicking the header cart button (`aria-label="Open cart"`) opens the drawer when empty (heading "Shopping Cart" appears). The badge-count behavior is covered separately by `e2e/shop/cart-icon-badge.spec.ts`.
- `e2e/navigation/footer-links.spec.ts` — every `<a href>` inside `<footer>` has a non-empty href starting with `/`, `https?://`, `mailto:`, `tel:`, or `#`. Does not HTTP-fetch the URLs (avoids flake on external social links).

The `auth.setup.ts` project runs first and persists session state to `e2e/.auth/user.json` (gitignored). Subsequent specs reuse that storageState unless they explicitly run unauthenticated (e.g. `guest-checkout`).

## Scenario scripts

```bash
npx tsx scripts/test-1-draw-ending-60mins.ts
npx tsx scripts/test-dst-transitions.ts
```

Each script mutates the dev DB to set up a specific timing scenario. Restore via reset script or manual cleanup.

## Test pixels page

Visit `http://localhost:3000/test-pixels/` to fire test events for each tracking provider. Verify in:
- Facebook Pixel Helper extension
- GTM debug mode
- Klaviyo activity feed
- TikTok Events Manager

## Force-charge test scripts

```bash
# Dry-run: print eligibility for a user (no writes)
npm run test:force-charge:dry -- --email=user@example.com
npm run test:force-charge:dry -- --customer=cus_xxx

# Live execution (requires an admin user in DB)
npm run test:force-charge:live -- --email=user@example.com --admin-email=admin@example.com
```

Both modes print `=== Target user ===`, `=== Eligibility ===`, and either `=== Plan (dry-run) ===` or `=== LIVE execution ===`. The live flag requires `--admin-email` and errors out if missing.

## Anti-checks

- Set `NODE_ENV=production` locally → all dev routes must 404
- Run a fix script twice → second run must skip

## globalSetup escape hatch (E2E_KEEP_FIXTURES)

`e2e/global-setup.ts` and `e2e/global-teardown.ts` both honour `E2E_KEEP_FIXTURES=true`:

- **globalSetup** — skip the (slow, 60–90s) seed pass. Use this when iterating on a single spec where the seeded fixtures from a previous run are still good.
- **globalTeardown** — skip the cleanup pass. Use the same flag for the same reason.

```bash
# Iterate on one spec without paying the seed cost on every run
E2E_KEEP_FIXTURES=true npx playwright test e2e/auth/login.spec.ts --project=chromium-guest
```

`playwright.config.ts` also explicitly loads `.env.local` (via `dotenv`) so specs see the same env vars the dev server does — without the load, `MONGODB_URI`/`STRIPE_SECRET_KEY` and similar would not propagate from the shell into Playwright workers.

## Auth-domain specs (added 2026-05-05)

`e2e/auth/` covers login, logout, forgot-password, reset-password, user-setup-modal, email-verification, and a placeholder `register.spec.ts` (BLOCKED — no `/register` page exists in the codebase). See [docs/auth/frontend.md](../auth/frontend.md#e2e-test-ids) for the testid → component map.

The `chromium-guest` project regex was tightened to enumerate auth specs explicitly (`login|forgot-password|reset-password|register|email-verification`) instead of matching all `auth/*.spec.ts`, because two specs (`logout`, `user-setup-modal`) need an authenticated session and were promoted to `chromium-fresh`.

## Account-domain specs (added 2026-05-05)

`e2e/account/` (project: `chromium-fresh`) covers the My Account → Settings sub-routes:
- `profile-update.spec.ts` — saves the profession field and asserts DB persistence (firstName/lastName are read-only in ProfileTab; no UI to edit name).
- `change-password.spec.ts` — exercises the change-password API; restores the original bcrypt hash in `afterEach` so subsequent specs continue to log in.
- `update-phone.spec.ts` — submits an AU-format mobile, asserts DB normalises it to `+61...` (User model pre-save hook in `src/models/User.ts:1060`).
- `payment-methods.spec.ts` — narrowed: fresh fixture user has no Stripe customer (`scripts/seed-e2e-fixtures.ts:97-101`), so only the empty-state + add-button visibility are asserted.
- `settings-tabs.spec.ts` — clicks each tab (URL is NOT updated on click) and asserts the deep-link `?tab=password` opens the password section directly.
- `update-email.spec.ts` — BLOCKED: no UI surface to edit email exists on the Settings page (only verify-existing-email).

See [docs/dashboard-account/frontend.md](../dashboard-account/frontend.md#e2e-test-ids) for the testid → component map. **Worker-index gotcha:** specs that mutate the fixture user must use `emailFor("fresh", testInfo.parallelIndex)` (matching the storageState the fixture loaded) — `emailFor("fresh")` alone reads `TEST_WORKER_INDEX` which can drift from `parallelIndex` after worker respawns. Both `e2e/rewards/catalog.spec.ts` and `e2e/rewards/claim-redeemable.spec.ts` were updated 2026-05-05 to pass `parallelIndex` explicitly after the seed-not-run regression.

## URL-params-domain specs (added 2026-05-05)

`e2e/url-params/` (project: `chromium-guest`) covers query-string-driven side effects on landing:
- `affiliate-code-capture.spec.ts` — `?aff=XXX` → sessionStorage `affiliate_code` set (uppercased) by `useAffiliateLink` via `AffiliateTracker` in `providers.tsx`.
- `referral-code-capture.spec.ts` — `?ref=XXX` → sessionStorage `tools-aus:referral-code` set (uppercased) by `useReferralCode` via `ReferralTracker`. URL-params-domain mirror of `e2e/referrals/signup-with-ref.spec.ts`.
- `promo-welcome-popup.spec.ts` — `/promotions/cash-prize?promo=<seeded code>` → `PromoWelcomeModal` opens once on first landing. Seeds + cleans up its own `PromoLink` row. The session-storage gate-suppression case is exercised by the existing `e2e/promo/welcome-modal.spec.ts`.
- `oauth-redirect.spec.ts` — narrowed (per plan amendment) to: `/oauth-redirect?provider=google&csrfToken=…` constructs and submits a form to `/api/auth/signin/google`. The POST is intercepted with `page.route` so we never follow Google's OAuth flow headlessly. Asserts the form body contains `csrfToken` and `callbackUrl`.
- `3ds-return-handling.spec.ts` — **BLOCKED** (`test.skip`): `/purchase-success?payment_intent_client_secret=<cs>` invokes `use3DSRedirectHandler` which calls `stripe.retrievePaymentIntent` against the live Stripe API. Asserting all four status branches requires four real PIs in matching states; we have no deterministic way to drive that from a spec without either a debug route or refactoring the hook to read from `/api/payment-status/[id]` (which we control). See file header for the unblock plan.

## Toasts-domain specs (added 2026-05-05)

`e2e/toasts/` (project: `chromium-fresh`) hosts spec files for global toast notifications. Two toast variants are localStorage-driven and trivially testable; the third (`entry-reward-toast`) is BLOCKED:

| Spec | Status | Notes |
|---|---|---|
| `upgrade-success.spec.ts` | PASS | Seeds `localStorage.subscription_upgraded` and asserts the toast mounts. |
| `downgrade-scheduled.spec.ts` | PASS | Seeds `localStorage.subscription_downgraded` and asserts the toast mounts. |
| `entry-reward.spec.ts` | BLOCKED (skipped) | Toast fires from `useEntryRewardToast()` invoked in client-side TanStack Query `onSuccess` callbacks (mini-draw / major-draw / subscription renewal mutations). Posting a webhook does NOT fire the hook — the mutation must complete in the browser. Deterministic reproduction requires a full purchase walk (Stripe Element + 3DS + webhook) already covered by membership/draws specs. The `useEntryRewardToast` hook now stamps `testId: "entry-reward-toast"` on its toast so future full-flow specs can target it. Mirrors the existing block in `e2e/rewards/milestone-toast.spec.ts`. |

The `chromium-fresh` testMatch regex was extended to include `banners-widgets/rewards-widget-spotlight.spec.ts` (the spotlight spec needs an authenticated session for `/my-account`). The remaining three banners-widgets specs (`freeze-period-banner`, `floating-countdown-mode`, `floating-promo-page-aware`) stay under `chromium-guest` via an explicit enumeration in the guest regex.
